import { v } from "convex/values";

import { requireOwnedProject, resolveOwner, taskIfYours } from "./lib/owner";
import { mutation } from "./_generated/server";

/**
 * Session log writes — Task 8.
 *
 * `sessions` is the canonical data (ADR-003): append-only, never updated
 * after insert, and CSV import is the only repair path. Two consequences
 * shape this file.
 *
 * **The owner is never an argument.** Every row goes through
 * `resolveOwner(ctx)`, so a caller cannot attach a session to anyone else,
 * and cannot forge a row by passing an `ownerId`.
 *
 * **Write twice, get one row.** The timestamps are the row's entire
 * identity, so an identical repeat is recognised and ignored rather than
 * appended. The client already guards completion with `isPhaseComplete`,
 * which makes a double write impossible in one tab — this is what covers
 * the cases that guard cannot see: a replayed message, or two tabs that
 * each ran the same session to its end. A duplicate would corrupt every
 * derived number permanently, so the one indexed read is cheap insurance.
 *
 * `taskId`/`projectId` arrive already **bound at start** by the client (D8:
 * "assigned to `activeTaskId` at start, immutable thereafter"), so this file
 * validates them rather than re-deriving them — re-reading the selection now
 * would credit whatever was clicked after the session began, which is the
 * re-targeting the acceptance criterion exists to prevent. Ownership is the
 * caller-supplied id's first question (`lib/owner.ts`), and a reference that
 * can no longer be proved is recorded as *unbound* rather than either trusted
 * or allowed to cost the row: see `taskIfYours`.
 */

/**
 * UTC offset in minutes at `when`, in ISO-8601 sign convention: east of
 * Greenwich is positive, so UTC+3 is `+180`.
 *
 * `Date.getTimezoneOffset()` is the negation of that, which is why it is
 * flipped here. Day grouping adds this to the UTC instant to recover the
 * local calendar day (PRD §6): a session completing at 01:00 local counts
 * for that day, not the one it started in.
 */
export function utcOffsetMinutesAt(when: number): number {
  return -new Date(when).getTimezoneOffset();
}

/** Plausible bounds: the full range of real offsets is -720..+840. */
const MIN_UTC_OFFSET = -720;
const MAX_UTC_OFFSET = 840;

/** Two hours of clock skew before a client timestamp is considered a lie. */
const FUTURE_TOLERANCE_MS = 2 * 60 * 60 * 1000;

/** Timestamps must be after the app plausibly existed. */
const MIN_TIMESTAMP_MS = Date.UTC(2020, 0, 1);

export const logCompleted = mutation({
  args: {
    phase: v.union(
      v.literal("focus"),
      v.literal("short"),
      v.literal("long"),
    ),
    startedAt: v.number(),
    completedAt: v.number(),
    tzOffsetAtCompletion: v.number(),
    /**
     * The selection as it stood when this phase *began*, snapshotted by the
     * client — D8 binds at start, so it is never read back from the server
     * at completion. `undefined` means the phase began with nothing selected.
     */
    taskId: v.optional(v.id("tasks")),
    /** The same snapshot's project, denormalized at start (PRD §6). */
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);

    // The timestamps come from the client's clock, which is the clock the
    // timer ran against — a server clock would disagree with `phaseEndsAt`.
    // They are therefore validated rather than trusted.
    const { startedAt, completedAt, tzOffsetAtCompletion } = args;

    if (!Number.isFinite(startedAt) || startedAt < MIN_TIMESTAMP_MS) {
      throw new Error("logCompleted: startedAt is not a plausible instant");
    }
    if (!Number.isFinite(completedAt) || completedAt < startedAt) {
      throw new Error("logCompleted: completedAt must not precede startedAt");
    }

    const now = Date.now();
    if (completedAt > now + FUTURE_TOLERANCE_MS) {
      throw new Error("logCompleted: completedAt is implausibly far in the future");
    }
    if (
      !Number.isInteger(tzOffsetAtCompletion) ||
      tzOffsetAtCompletion < MIN_UTC_OFFSET ||
      tzOffsetAtCompletion > MAX_UTC_OFFSET
    ) {
      throw new Error("logCompleted: tzOffsetAtCompletion is not a valid UTC offset");
    }

    // Validated *before* anything is read for idempotency, so a caller whose
    // id is not theirs is refused regardless of whether a row for these
    // timestamps already exists.
    const taskId =
      args.taskId === undefined
        ? undefined
        : ((await taskIfYours(ctx, ownerId, args.taskId)) ?? undefined);

    const projectId = args.projectId;
    if (projectId !== undefined) {
      await requireOwnedProject(ctx, ownerId, projectId);
    }

    // Idempotency: `by_owner_completed` narrows to this exact completion
    // instant, which the client can only produce once per session.
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_owner_completed", (q) =>
        q.eq("ownerId", ownerId).eq("completedAt", completedAt),
      )
      .first();

    if (
      existing &&
      existing.startedAt === startedAt &&
      existing.phase === args.phase
    ) {
      // Returned, never rewritten: a repeat must not rebind a row that has
      // already been recorded. The first write decides what it was bound to.
      return existing._id;
    }

    // Both are the client's snapshot from phase start (D8). `undefined` —
    // not `null` — is how an unbound session is written, matching PRD §6's
    // "present when…" optionality and `tasks.create`'s own `projectId`.
    return await ctx.db.insert("sessions", {
      ownerId,
      startedAt,
      completedAt,
      phase: args.phase,
      taskId,
      projectId,
      tzOffsetAtCompletion,
    });
  },
});
