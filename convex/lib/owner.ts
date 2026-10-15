import { getAuthUserId } from "@convex-dev/auth/server";

import type { Doc, Id } from "../_generated/dataModel";
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

/**
 * Fetches a task and proves it belongs to `ownerId`.
 *
 * A row owned by someone else takes the same path as a row that does not
 * exist — an attacker probing ids learns nothing either way, which is why
 * the message names the table rather than the reason.
 *
 * It lived in `tasks.ts` until Task 11, when `logCompleted` had to answer a
 * second, subtly different ownership question about the `taskId` a client
 * hands over at completion. Two files each with their own idea of what
 * "yours" means is how the two quietly stop agreeing — one of them is
 * written in a hurry and neither gets revisited — so every version of the
 * question lives here, in the module that already owns ownership.
 *
 * Typed against `OwnerCtx` rather than `MutationCtx`: the read *is* the
 * whole check, so a query can use it as readily as a mutation.
 */
export async function requireOwnedTask(
  ctx: OwnerCtx,
  ownerId: Id<"users">,
  taskId: Id<"tasks">,
): Promise<Doc<"tasks">> {
  const task = await ctx.db.get(taskId);
  if (task === null || task.ownerId !== ownerId) {
    throw new Error("tasks: task not found");
  }
  return task;
}

/** Same contract as `requireOwnedTask`, for a project a task is filed under. */
export async function requireOwnedProject(
  ctx: OwnerCtx,
  ownerId: Id<"users">,
  projectId: Id<"projects">,
): Promise<Doc<"projects">> {
  const project = await ctx.db.get(projectId);
  if (project === null || project.ownerId !== ownerId) {
    throw new Error("tasks: project not found");
  }
  return project;
}

/**
 * The reference to record *about* a session, or `null` when it can no longer
 * be proved.
 *
 * `requireOwnedTask` is the wrong shape for a historical binding, because it
 * insists the row still exists — and a task can be deleted while its focus
 * session is still running (`clearCompleted` is one click away). `sessions`
 * is append-only with CSV import as its only repair path (ADR-003), so
 * refusing the write would lose the session itself over a missing footnote.
 *
 * Three outcomes, each deliberate:
 *
 *   - **exists and ours** → the id, recorded as it was bound at start (D8);
 *   - **no longer exists** → `null`, so the row is written *without* an id
 *     that can no longer be proved. Nothing dangling is ever stored, which
 *     also means a foreign id whose target has since been deleted takes
 *     this path and lands as "unbound" rather than as a claim;
 *   - **exists and somebody else's** → throws. The one case worth refusing:
 *     an attempt to attribute a session to a row the caller has no claim on.
 *
 * Projects have no equivalent here: `archivedAt` hides a project without
 * deleting it (PRD §6), so `requireOwnedProject` cannot race the same way
 * and remains exactly right for `sessions.projectId`.
 */
export async function taskIfYours(
  ctx: OwnerCtx,
  ownerId: Id<"users">,
  taskId: Id<"tasks">,
): Promise<Id<"tasks"> | null> {
  const task = await ctx.db.get(taskId);
  if (task === null) {
    return null;
  }
  if (task.ownerId !== ownerId) {
    throw new Error("tasks: task not found");
  }
  return taskId;
}
