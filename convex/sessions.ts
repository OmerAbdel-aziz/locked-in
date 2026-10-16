import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { currentStreak } from "../lib/streak";
import { requireOwnedProject, resolveOwner, taskIfYours } from "./lib/owner";
import { mutation, query } from "./_generated/server";

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

/**
 * The longest run of consecutive earned days ending today (or yesterday,
 * when today has nothing yet) — Task 15, PRD §4.1's "Streak: 5".
 *
 * Derived on every read from the log (ADR-003): nothing is stored, so a
 * merge or a CSV import recomputes honestly the next time this runs. The
 * per-session day math lives in `lib/streak.ts`, shared with the unit
 * fixtures — this query only bounds the read.
 *
 * Bounded by recency, not by day window: the 1,000 most recent rows are
 * more than enough to find the first gap (a streak breaks at the first
 * unearned day, and 1,000 sessions span years for a personal log). A log
 * longer than that still answers correctly unless its *unbroken* streak
 * alone exceeds 1,000 sessions without a gap — at which point the number
 * is a lower bound, and the app has a nicer problem than this cap.
 */
export const streak = query({
  args: {
    /**
     * The device's UTC offset in minutes, as `-new Date().getTimezoneOffset()`
     * reports it. Only "today" is derived from it — every historical day
     * comes from its own session's recorded offset (PRD §6).
     */
    tzOffsetMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);

    const recent = await ctx.db
      .query("sessions")
      .withIndex("by_owner_completed", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(STREAK_SCAN_LIMIT);

    // `Date.now()` in a query is normally suspect (determinism across
    // subscribers), but "today" is inherently about now, and `todaySummary`
    // in `convex/tasks.ts` already reads the clock the same way for the
    // same reason.
    return currentStreak(recent, Date.now(), args.tzOffsetMinutes);
  },
});

/** Enough history to find the first gap; see `streak` above. */
const STREAK_SCAN_LIMIT = 1000;

/**
 * History export for CSV (Task 25).
 *
 * Returns the caller's sessions with task/project display names resolved, so
 * the client can serialize with `lib/csv.ts` (6 cols, Q7b). Bounded like
 * every other list query; sessions are already in completedAt order from the
 * index. Dangling bindings read as "" (unbound) rather than throwing —
 * export must never fail over a cleared task.
 */
export const exportLog = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await resolveOwner(ctx);
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_owner_completed", (q) => q.eq("ownerId", ownerId))
      .take(5000);
    const out: Array<{
      startedAt: number;
      completedAt: number;
      phase: "focus" | "short" | "long";
      task: string;
      project: string;
      tzOffsetAtCompletion: number;
    }> = [];
    for (const s of sessions) {
      let task = "";
      if (s.taskId !== undefined) {
        const t = await ctx.db.get(s.taskId);
        if (t && t.ownerId === ownerId) task = t.title;
      }
      let project = "";
      if (s.projectId !== undefined) {
        const p = await ctx.db.get(s.projectId);
        if (p && p.ownerId === ownerId) project = p.name;
      }
      out.push({
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        phase: s.phase,
        task,
        project,
        tzOffsetAtCompletion: s.tzOffsetAtCompletion,
      });
    }
    return out;
  },
});

/**
 * CSV import (Task 25, Q8b).
 *
 * The client parses text with `lib/csv.ts` (row-level errors there) and sends
 * only the VALID rows here. This mutation re-validates every row with the
 * same rules as `logCompleted` (same path, per PRD §6), resolves task/project
 * NAMES case-insensitively, and dedupes full-row matches (Q3).
 *
 * Q8: unknown task/project names REJECT the row (no auto-create — that would
 * let a typo pollute the 100-active project cap). Archived projects resolve
 * like open ones (history keeps attribution, PRD §6).
 *
 * Returns per-row results aligned with the input order: `{ ok: true, id }`
 * for writes AND for idempotent repeats, `{ ok: false, error }` for rejects.
 */
export const importRows = mutation({
  args: {
    rows: v.array(
      v.object({
        startedAt: v.number(),
        completedAt: v.number(),
        phase: v.union(
          v.literal("focus"),
          v.literal("short"),
          v.literal("long"),
        ),
        task: v.string(),
        project: v.string(),
        tzOffsetAtCompletion: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    if (args.rows.length > 500) {
      throw new Error("sessions: import capped at 500 rows per call");
    }

    // Name resolution maps (case-insensitive, Q8): unknown names reject.
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(1000);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(1000);
    const taskByName = new Map<string, typeof tasks[number]>();
    for (const t of tasks) {
      const k = t.title.trim().toLowerCase();
      if (!taskByName.has(k)) taskByName.set(k, t);
    }
    const projectByName = new Map<string, typeof projects[number]>();
    for (const p of projects) {
      const k = p.name.trim().toLowerCase();
      if (!projectByName.has(k)) projectByName.set(k, p);
    }

    const results: Array<
      | { ok: true; id: string; duplicate: boolean }
      | { ok: false; error: string }
    > = [];
    for (const row of args.rows) {
      if (
        !Number.isFinite(row.startedAt) ||
        row.startedAt < MIN_TIMESTAMP_MS ||
        !Number.isFinite(row.completedAt) ||
        row.completedAt < row.startedAt ||
        !Number.isInteger(row.tzOffsetAtCompletion) ||
        row.tzOffsetAtCompletion < MIN_UTC_OFFSET ||
        row.tzOffsetAtCompletion > MAX_UTC_OFFSET
      ) {
        results.push({ ok: false, error: "invalid timestamps or tz offset" });
        continue;
      }
      let taskId: Id<"tasks"> | undefined = undefined;
      if (row.task.trim() !== "") {
        const found = taskByName.get(row.task.trim().toLowerCase());
        if (!found) {
          results.push({
            ok: false,
            error: `unknown task "${row.task}" (no auto-create; create it first)`,
          });
          continue;
        }
        taskId = found._id;
      }
      let projectId: Id<"projects"> | undefined = undefined;
      if (row.project.trim() !== "") {
        const found = projectByName.get(row.project.trim().toLowerCase());
        if (!found) {
          results.push({
            ok: false,
            error: `unknown project "${row.project}" (no auto-create; create it first)`,
          });
          continue;
        }
        projectId = found._id;
      }
      // Full-row dedupe (Q3): same completion instant + same binding + tz.
      const existing = await ctx.db
        .query("sessions")
        .withIndex("by_owner_completed", (q) =>
          q.eq("ownerId", ownerId).eq("completedAt", row.completedAt),
        )
        .first();
      if (
        existing &&
        existing.startedAt === row.startedAt &&
        existing.phase === row.phase &&
        (existing.taskId ?? undefined) === (taskId ?? undefined) &&
        (existing.projectId ?? undefined) === (projectId ?? undefined) &&
        existing.tzOffsetAtCompletion === row.tzOffsetAtCompletion
      ) {
        results.push({
          ok: true,
          id: existing._id,
          duplicate: true,
        });
        continue;
      }
      const id = await ctx.db.insert("sessions", {
        ownerId,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        phase: row.phase,
        taskId,
        projectId,
        tzOffsetAtCompletion: row.tzOffsetAtCompletion,
      });
      results.push({
        ok: true,
        id,
        duplicate: false,
      });
    }
    return results;
  },
});
