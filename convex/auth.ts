import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Email } from "@convex-dev/auth/providers/Email";
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import type { WithoutSystemFields } from "convex/server";

import type { Doc } from "./_generated/dataModel";
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
