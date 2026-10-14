import { getAuthUserId } from "@convex-dev/auth/server";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Every Convex function resolves its owner through this module — Task 4.
 *
 * ADR-002: anonymous-first with merge-on-sign-in means an identity can end
 * up pointing at a different, canonical user. If authorization derived the
 * owner from a client-supplied argument instead of this helper, a caller
 * could read another owner's data; deriving it server-side from the session
 * is what makes that impossible.
 *
 * The rule for every other file in `convex/`: no raw `getAuthUserId`, no
 * trusted `ownerId` argument — call `resolveOwner`.
 *
 * Scoped to `QueryCtx | MutationCtx` because those are the two contexts
 * where ownership is actually enforced, and both carry `ctx.db`. An
 * `ActionCtx` has no database handle by design — an action that needs the
 * owner must resolve it by calling a query/mutation (added when an action
 * first needs it, rather than inventing that plumbing now).
 */
export type OwnerCtx = QueryCtx | MutationCtx;

/**
 * Resolve the caller's owner id from their session.
 *
 * Resolution order, per ADR-002's two identity paths:
 *   1. The caller must hold a valid session — otherwise throw. There is no
 *      "unauthenticated owner"; callers never fall through to a default.
 *   2. If this identity was linked into an account during merge-on-sign-in,
 *      the account is the owner: data recorded under the anonymous identity
 *      now belongs to it.
 *   3. Otherwise the caller is their own owner (the anonymous case).
 *
 * @returns the canonical owner id to scope every read and write by
 * @throws when the caller has no session — Task 4's "every subsequent
 *         function rejects unauthenticated calls through the same helper"
 */
export async function resolveOwner(ctx: OwnerCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);

  // `!userId`, not `userId === null`: `getAuthUserId` splits the JWT `sub`
  // claim, so a malformed or empty subject yields "" rather than null. An
  // empty string must never become an owner id.
  if (!userId) {
    throw new Error(
      "resolveOwner: unauthenticated callers have no owner. " +
        "Sign in (anonymously or otherwise) before calling this function.",
    );
  }

  const identity = await ctx.db
    .query("identities")
    .withIndex("by_anonymousId", (q) => q.eq("anonymousId", userId))
    .unique();

  // Linked into an account: the account is canonical, not the anonymous id.
  if (identity?.userId !== undefined && identity.userId !== userId) {
    return identity.userId;
  }

  return userId;
}
