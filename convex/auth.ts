import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Email } from "@convex-dev/auth/providers/Email";
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import type {
  GenericMutationCtx,
  WithoutSystemFields,
} from "convex/server";
import type { GenericId } from "convex/values";

import type { DataModel, Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";

/**
 * Convex Auth configuration — Task 4.
 *
 * Anonymous-first (ADR-002): the `Anonymous` provider needs no
 * user-provided information, so a first-time visitor gets an identity with
 * zero prompts — PRD's "<60s to focus" criterion is never blocked by a
 * signup wall.
 *
 * The magic-link provider for Task 23 is added here later; nothing else in
 * the app changes when it is, because every function resolves its owner
 * through `convex/lib/owner.ts` rather than knowing how the identity was
 * created.
 *
 * `store` must be exported: it is the internal mutation Convex Auth uses to
 * read and write during sign-in/sign-out. `signIn`/`signOut` are the
 * client-callable actions, `isAuthenticated` the probe query.
 */

/**
 * The document written for a brand-new anonymous identity.
 *
 * PRD §6 makes `users.createdAt` required, but the provider's *default*
 * profile writes only `{ isAnonymous: true }` — which made first-load
 * sign-in fail against the live deployment with a schema violation before
 * any session existed. `profile` is the provider's own extension point, and
 * its return type is a complete `users` document, so the compiler holds this
 * to the schema instead of it surfacing as a runtime failure on a visitor's
 * first page load.
 *
 * Exported so the test gate can assert it satisfies every required field of
 * the real `users` validator, rather than restating them by hand.
 */
export function anonymousProfile(): WithoutSystemFields<Doc<"users">> & {
  isAnonymous: true;
} {
  return { isAnonymous: true, createdAt: Date.now() };
}

/**
 * The shape `@convex-dev/auth` hands `callbacks.createOrUpdateUser`
 * (mirrors its `CreateOrUpdateUserArgs`; only the fields used here).
 */
export interface CreateOrUpdateUserArgs {
  /** Non-null when signing back into an existing account. */
  existingUserId: GenericId<"users"> | null;
  /** "verification" after a magic-link click; provider id otherwise. */
  type: "oauth" | "credentials" | "email" | "phone" | "verification";
  profile: Record<string, unknown> & {
    email?: string;
    name?: string;
    image?: string;
    isAnonymous?: boolean;
    createdAt?: number;
    emailVerified?: boolean;
    phoneVerified?: boolean;
  };
}

/**
 * User creation with `createdAt` — the magic-link crash fix.
 *
 * The library's default writer inserts the verification profile verbatim
 * (`{ email }`), but PRD §6 requires `users.createdAt`, so every magic-link
 * verification died with a schema violation. `Anonymous` is unaffected (its
 * `profile` above already stamps `createdAt`), yet this callback intercepts
 * ALL providers, so it must preserve the anonymous shape too.
 *
 * It mirrors the default's two behaviors and adds the stamp:
 *   1. `existingUserId` set → patch profile fields (+ backfill `createdAt`
 *      on pre-fix rows that lack it) and return it.
 *   2. Otherwise, when `profile.email` is present, link to the existing
 *      verified-email user if one exists (same as the default's
 *      should-link-via-email); else insert with `createdAt: Date.now()`.
 *
 * `undefined` values are stripped before every write: `patch` deletes a
 * field given `undefined`, so passing one through would erase data.
 */
export async function createOrUpdateUserWithCreatedAt(
  ctx: GenericMutationCtx<DataModel>,
  args: CreateOrUpdateUserArgs,
): Promise<GenericId<"users">> {
  const { existingUserId, profile } = args;
  const fields: Record<string, string | number | boolean> = {};
  if (typeof profile.email === "string") fields.email = profile.email;
  if (typeof profile.name === "string") fields.name = profile.name;
  if (typeof profile.image === "string") fields.image = profile.image;
  if (profile.isAnonymous === true) fields.isAnonymous = true;
  if (profile.emailVerified === true) {
    fields.emailVerificationTime = Date.now();
  }
  if (profile.phoneVerified === true) {
    fields.phoneVerificationTime = Date.now();
  }

  if (existingUserId !== null) {
    const existing = await ctx.db.get(existingUserId);
    const patch: Record<string, string | number | boolean> = { ...fields };
    if (
      existing !== null &&
      (existing as Record<string, unknown>).createdAt === undefined
    ) {
      patch.createdAt = Date.now();
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existingUserId, patch);
    }
    return existingUserId;
  }

  if (typeof profile.email === "string") {
    const linked = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", profile.email as string))
      .unique();
    if (
      linked !== null &&
      (linked as Record<string, unknown>).emailVerificationTime !== undefined
    ) {
      if (Object.keys(fields).length > 0) {
        await ctx.db.patch(linked._id, fields);
      }
      return linked._id;
    }
  }

  // The provider's own stamp wins when present (anonymous `profile`
  // carries one); otherwise the write itself is the creation moment.
  const createdAt =
    typeof profile.createdAt === "number" ? profile.createdAt : Date.now();
  return await ctx.db.insert("users", { ...fields, createdAt });
}
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Anonymous({ profile: anonymousProfile }),
    // Task 23: email magic link ("Sync your data", ADR-002 optional upgrade).
    // Q9 ruling: Resend. No `resend` npm package — a plain `fetch` to the
    // API avoids a new dependency (PRD §9 ask-first) for one POST.
    // `authorize: undefined` is the provider's own "magic link behavior":
    // the token alone signs in, no matching `email` param required at verify.
    // Keys live in deployment env (`AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM`),
    // never in the repo. Free tier (3,000/mo) covers magic-link volume.
    Email({
      authorize: undefined,
      from: process.env.AUTH_EMAIL_FROM ?? "Locked In <onboarding@resend.dev>",
      async sendVerificationRequest({ identifier: email, url }) {
        const key = process.env.AUTH_RESEND_KEY;
        if (!key) {
          throw new Error(
            "auth: AUTH_RESEND_KEY is not configured in the deployment env",
          );
        }
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from:
              process.env.AUTH_EMAIL_FROM ?? "Locked In <onboarding@resend.dev>",
            to: [email],
            subject: "Sign in to Locked In",
            html: `<p>Click <a href="${url}">here</a> to sign in to Locked In. This link expires in 60 minutes.</p>`,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`auth: Resend send failed (${res.status}): ${body}`);
        }
      },
    }),
  ],
  callbacks: {
    // Every provider (anonymous included) flows through here; the default
    // writer cannot satisfy the required `createdAt` (see above).
    createOrUpdateUser: createOrUpdateUserWithCreatedAt,
  },
});

/**
 * Task 23: who the caller is — lets the client distinguish anonymous from
 * account sessions and remember the pre-sign-in device owner for the merge
 * prompt. Returns null only pre-identity (same window Task 10 gates with
 * "skip"); never throws, so header chrome can call it unconditionally.
 */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      id: user._id,
      isAnonymous: user.isAnonymous ?? false,
      email: user.email ?? null,
    };
  },
});
