import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";
import type { WithoutSystemFields } from "convex/server";

import type { Doc } from "./_generated/dataModel";

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
  providers: [Anonymous({ profile: anonymousProfile })],
});
