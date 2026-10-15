import { v } from "convex/values";

import { resolveOwner } from "./lib/owner";
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
 * `taskId`/`projectId` are **not** accepted here, though the schema has
 * them and Task 11 will bind them. Accepting an id today would mean
 * inserting it without having checked that it belongs to this owner — an
 * ownership hole handed straight to Task 11. They arrive when their
 * validation arrives.
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
      return existing._id;
    }

    // `taskId`/`projectId` are simply absent until Task 11 - the schema
    // types them optional, so an unbound session is a row without them.
    return await ctx.db.insert("sessions", {
      ownerId,
      startedAt,
      completedAt,
      phase: args.phase,
      tzOffsetAtCompletion,
    });
  },
});
