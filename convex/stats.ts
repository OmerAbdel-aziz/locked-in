/**
 * Stats range queries — Task 19 (PRD §4.1 "Stats & History surface").
 *
 * Two read-only queries over the session log, both resolving their caller
 * through the shared `resolveOwner` helper like every other function in
 * `convex/` (no raw `getAuthUserId`, no trusted `ownerId` argument — see
 * `convex/lib/owner.ts` for why that rule exists).
 *
 * Both queries are range-bounded server-side on `by_owner_completed`, the
 * index Task 3 built for exactly this: `[start, end)` narrows to the window
 * before anything is read, so there is never a client-side full-log scan
 * (the PRD's "Stats page slow" mitigation). The previous-period window for
 * trends is a second bounded scan in the same query, not a second round
 * trip. Tasks and projects ride along bounded too (`take`, never `collect`
 * unbounded) purely to resolve names and estimates — the numbers themselves
 * come from the log (ADR-003).
 *
 * The arithmetic lives in `lib/aggregations.ts`, imported here by relative
 * path so server and client literally share it: the same fixture asserted
 * against the pure helpers must come back identical through these queries
 * (Checkpoint F oracle). `Date.now()` never appears in a query — `now` is
 * not needed at all, because the client computes `[start, end)` from its
 * own local midnight and passes both as arguments (PRD D5).
 */

import { v } from "convex/values";

import { resolveOwner } from "./lib/owner";
import { query } from "./_generated/server";
import {
  aggregateRange,
  MS_PER_DAY,
  previousRange,
  summarizeSessions,
  trendDeltas,
} from "../lib/aggregations";

/**
 * Sessions read per window. Personal use keeps a 30-day window in the low
 * hundreds; the cap is headroom, not a target — past it the query reports
 * what it saw rather than silently truncating into a wrong chart.
 */
const SESSIONS_CAP = 5000;
/** Mirrors `LIST_LIMIT` in `tasks.ts`: the whole board, never a page. */
const TASKS_CAP = 1000;
/** Past the 100-active cap (PRD §4.1) with room for archived history. */
const PROJECTS_CAP = 500;
/** A range wider than a year is a mistake, not a report — refuse it. */
const MAX_RANGE_MS = 366 * MS_PER_DAY;
/** History rows per call: a list, not a dump. */
const HISTORY_DEFAULT_LIMIT = 100;
const HISTORY_MAX_LIMIT = 200;

const MIN_UTC_OFFSET = -720;
const MAX_UTC_OFFSET = 840;

function validRange(start: number, end: number, what: string): void {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new Error(`stats: ${what} range must be [start, end), got ${start}..${end}`);
  }
  if (end - start > MAX_RANGE_MS) {
    throw new Error("stats: range is wider than a year; narrow it");
  }
}

function validOffset(tzOffsetMinutes: number): void {
  if (
    !Number.isInteger(tzOffsetMinutes) ||
    tzOffsetMinutes < MIN_UTC_OFFSET ||
    tzOffsetMinutes > MAX_UTC_OFFSET
  ) {
    throw new Error("stats: tzOffsetMinutes is not a valid UTC offset");
  }
}

/**
 * The full `/stats` range in one call: per-day focus, break-vs-focus split,
 * per-project breakdown, top tasks, completion ratio, trends vs. the
 * preceding equal-length period, and the time-of-day histogram.
 */
export const rangeStats = query({
  args: {
    /** UTC instant, inclusive. Computed client-side from local midnight. */
    start: v.number(),
    /** UTC instant, exclusive. */
    end: v.number(),
    /** Device offset for scaffolding the per-day buckets (PRD D5). */
    tzOffsetMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    validRange(args.start, args.end, "stats");
    validOffset(args.tzOffsetMinutes);

    const current = await ctx.db
      .query("sessions")
      .withIndex("by_owner_completed", (q) =>
        q
          .eq("ownerId", ownerId)
          .gte("completedAt", args.start)
          .lt("completedAt", args.end),
      )
      .take(SESSIONS_CAP);

    // Trends compare against the immediately preceding equal-length period
    // (PRD §4.1) — a second bounded scan, same index, same cap.
    const previousWindow = previousRange(args.start, args.end);
    const previous = await ctx.db
      .query("sessions")
      .withIndex("by_owner_completed", (q) =>
        q
          .eq("ownerId", ownerId)
          .gte("completedAt", previousWindow.start)
          .lt("completedAt", previousWindow.end),
      )
      .take(SESSIONS_CAP);

    // Names and estimates only — bounded reads, never the derivation itself.
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(TASKS_CAP);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(PROJECTS_CAP);

    const taskShapes = tasks.map((task) => ({
      _id: task._id,
      title: task.title,
      estimate: task.estimate,
    }));
    const projectShapes = projects.map((project) => ({
      _id: project._id,
      name: project.name,
      archivedAt: project.archivedAt,
    }));

    const aggregation = aggregateRange(current, taskShapes, projectShapes, {
      start: args.start,
      end: args.end,
      tzOffsetMinutes: args.tzOffsetMinutes,
    });
    const previousTotals = summarizeSessions(previous);

    return {
      range: { start: args.start, end: args.end },
      totals: aggregation.totals,
      perDay: aggregation.perDay,
      perProject: aggregation.perProject,
      topTasks: aggregation.topTasks,
      completion: aggregation.completion,
      previous: previousTotals,
      deltas: trendDeltas(aggregation.totals, previousTotals),
      timeOfDay: aggregation.timeOfDay,
    };
  },
});

export const historyDefaultLimit = HISTORY_DEFAULT_LIMIT;

/**
 * Reverse-chronological session rows with task/project names resolved.
 *
 * Read-only records (PRD §4.1): the shape carries no affordance for editing
 * or deleting — CSV import is the repair path, so there is deliberately no
 * mutation next to this query. Archived projects still render by name (with
 * their archived flag, so the UI can mute the tag); deleted tasks render
 * their time under no title rather than dropping the row.
 */
export const history = query({
  args: {
    start: v.number(),
    end: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    validRange(args.start, args.end, "history");

    const limit = args.limit ?? HISTORY_DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit <= 0 || limit > HISTORY_MAX_LIMIT) {
      throw new Error(
        `stats: history limit must be 1..${HISTORY_MAX_LIMIT}, got ${args.limit}`,
      );
    }

    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_owner_completed", (q) =>
        q
          .eq("ownerId", ownerId)
          .gte("completedAt", args.start)
          .lt("completedAt", args.end),
      )
      .order("desc")
      .take(limit);

    return {
      sessions: await Promise.all(
        rows.map(async (row) => {
          const task =
            row.taskId === undefined ? null : await ctx.db.get(row.taskId);
          const project =
            row.projectId === undefined
              ? null
              : await ctx.db.get(row.projectId);
          return {
            _id: row._id,
            startedAt: row.startedAt,
            completedAt: row.completedAt,
            phase: row.phase,
            tzOffsetAtCompletion: row.tzOffsetAtCompletion,
            taskTitle:
              task === null || task.ownerId !== ownerId ? null : task.title,
            projectName:
              project === null || project.ownerId !== ownerId
                ? null
                : project.name,
            projectArchived:
              project !== null &&
              project.ownerId === ownerId &&
              project.archivedAt !== undefined,
          };
        }),
      ),
    };
  },
});
