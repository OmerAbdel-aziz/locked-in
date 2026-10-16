/**
 * Stats aggregation helpers — Task 19 (PRD §4.1 "Stats & History surface").
 *
 * Framework-free, dependency-free pure functions over plain session / task /
 * project shapes. Both the `/stats` UI and the Convex query wrappers in
 * `convex/stats.ts` read through this module, so the browser and the server
 * cannot disagree about what a number means — the oracle test pins one
 * fixture and asserts both paths against it (Checkpoint F).
 *
 * Everything is derived from the session log at read time; nothing here is
 * stored anywhere (ADR-003). The conventions, copied from `convex/tasks.ts`
 * rather than reinvented:
 *
 *   - A "day" is the calendar date at the session's *recorded*
 *     `tzOffsetAtCompletion` (PRD §6). A session completing at 00:10 local
 *     belongs to the day that has just begun, not to the one it started in.
 *   - Only `phase: "focus"` rows are *work*. Breaks are sessions too, and
 *     they appear in the break-vs-focus split, but they never count as focus
 *     time, leaves, per-project attribution, or top-task credit.
 *   - `completedLeaves` is a count of focus sessions; `estimatedLeaves` is
 *     the sum of estimates over the *current board* (open and finished) —
 *     the same reading `todaySummary` uses. A session row snapshots a task's
 *     identity, never its estimate, so any other denominator lets a cleared
 *     task take its estimate with it and raise the score by deletion.
 *   - Time-of-day buckets convert `startedAt` with the session's recorded
 *     `tzOffsetAtCompletion` — the only offset a row carries. There is no
 *     `tzOffsetAtStart` column (adding one would be a PRD §9 ask-first schema
 *     change), so a session spanning a DST transition is bucketed by the
 *     offset in force when it completed. Documented here so the approximation
 *     is a decision, not an accident.
 *
 * This file deliberately imports nothing — `convex/stats.ts` imports it with
 * a relative path, and the Convex bundler only follows dependency-free
 * modules safely.
 */

export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

/** Focus sessions shown per task at most; the rest still count in totals. */
export const TOP_TASKS_LIMIT = 10;

/** Range presets offered by the `/stats` selector (PRD §4.1). */
export type RangePreset = "today" | "7d" | "30d" | "custom";

/** The smallest shape a session row needs for every aggregation below. */
export interface SessionLike {
  startedAt: number;
  completedAt: number;
  phase: "focus" | "short" | "long";
  taskId?: string | null;
  projectId?: string | null;
  tzOffsetAtCompletion: number;
}

/** The smallest shape a task row needs (names, estimates). */
export interface TaskLike {
  _id: string;
  title: string;
  estimate: number;
}

/** The smallest shape a project row needs (names, incl. archived). */
export interface ProjectLike {
  _id: string;
  name: string;
  archivedAt?: number | null;
}

/**
 * The UTC instant at which the given local calendar day began.
 *
 * Same arithmetic as `startOfLocalDay` in `convex/tasks.ts`: the shift
 * happens *before* the floor, so a device at UTC-5 reading 01:00Z is still
 * living in yesterday's evening. Copied rather than imported — this module
 * must stay dependency-free for the Convex bundler (see header).
 */
export function startOfLocalDay(now: number, offsetMinutes: number): number {
  const offsetMs = offsetMinutes * MS_PER_MINUTE;
  const localNow = now + offsetMs;
  return Math.floor(localNow / MS_PER_DAY) * MS_PER_DAY - offsetMs;
}

/**
 * Calendar date (`YYYY-MM-DD`) of an instant seen from the given UTC offset.
 *
 * Floors the *shifted* instant, so it agrees with `startOfLocalDay` about
 * which day an instant belongs to — the 23:59 vs 00:01 edge the schema's
 * `tzOffsetAtCompletion` comment exists to protect.
 */
export function dayKeyAt(instant: number, tzOffsetMinutes: number): string {
  return new Date(instant + tzOffsetMinutes * MS_PER_MINUTE)
    .toISOString()
    .slice(0, 10);
}

/** Local hour (0–23) of an instant seen from the given UTC offset. */
export function hourAt(instant: number, tzOffsetMinutes: number): number {
  return new Date(instant + tzOffsetMinutes * MS_PER_MINUTE).getUTCHours();
}

/**
 * Every device-local day overlapping `[start, end)`, as `YYYY-MM-DD` keys.
 *
 * The scaffold guarantees the chart shows a zero for an empty day rather
 * than silently skipping it. Sessions whose *own* recorded offset lands them
 * outside this scaffold (a device that travelled mid-range) get their own
 * bucket appended in `perDayBuckets` rather than being dropped.
 */
export function rangeDayKeys(
  start: number,
  end: number,
  tzOffsetMinutes: number,
): string[] {
  const keys: string[] = [];
  for (
    let cursor = startOfLocalDay(start, tzOffsetMinutes);
    cursor < end;
    cursor += MS_PER_DAY
  ) {
    keys.push(dayKeyAt(cursor, tzOffsetMinutes));
  }
  return keys;
}

export interface DayBucket {
  dayKey: string;
  /** Focus time completing on this day, in milliseconds. */
  focusMs: number;
  /** Focus sessions completing on this day — one session is one leaf. */
  sessions: number;
}

/**
 * Focus time and focus sessions per day over `[start, end)`.
 *
 * Each session is placed by its *own* recorded offset (PRD §6), not by the
 * range's offset: the scaffold is only the zero-filled shape. A session
 * outside the scaffold (travel edge) appends its own bucket, sorted with the
 * rest, so no completed work ever disappears from the chart.
 */
export function perDayBuckets(
  sessions: readonly SessionLike[],
  start: number,
  end: number,
  tzOffsetMinutes: number,
): DayBucket[] {
  const buckets = new Map<string, DayBucket>();
  for (const key of rangeDayKeys(start, end, tzOffsetMinutes)) {
    buckets.set(key, { dayKey: key, focusMs: 0, sessions: 0 });
  }
  for (const session of sessions) {
    if (session.phase !== "focus") {
      continue;
    }
    if (session.completedAt < start || session.completedAt >= end) {
      continue;
    }
    const key = dayKeyAt(session.completedAt, session.tzOffsetAtCompletion);
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = { dayKey: key, focusMs: 0, sessions: 0 };
      buckets.set(key, bucket);
    }
    bucket.focusMs += session.completedAt - session.startedAt;
    bucket.sessions += 1;
  }
  return [...buckets.values()].sort((a, b) =>
    a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0,
  );
}

export interface HeadlineTotals {
  focusMs: number;
  focusSessions: number;
  breakMs: number;
  breakSessions: number;
}

/** The break-vs-focus split over a session set — both sides, no judgement. */
export function summarizeSessions(
  sessions: readonly SessionLike[],
): HeadlineTotals {
  let focusMs = 0;
  let focusSessions = 0;
  let breakMs = 0;
  let breakSessions = 0;
  for (const session of sessions) {
    const duration = session.completedAt - session.startedAt;
    if (session.phase === "focus") {
      focusMs += duration;
      focusSessions += 1;
    } else {
      breakMs += duration;
      breakSessions += 1;
    }
  }
  return { focusMs, focusSessions, breakMs, breakSessions };
}

export interface ProjectSlice {
  /** `null` when the session was recorded with no project snapshot. */
  projectId: string | null;
  /** Archived projects keep their name here — history is never rewritten. */
  name: string;
  archived: boolean;
  focusMs: number;
  sessions: number;
}

export const NO_PROJECT_LABEL = "No project";
export const DELETED_TASK_LABEL = "Deleted task";

/**
 * Per-project focus time over a session set, focus phases only.
 *
 * Names resolve through the given projects; a snapshot pointing at a
 * project that no longer exists (or never did) renders under its stored id
 * with `archived: false` rather than vanishing — the time was still spent.
 * Unbound sessions share the "No project" bucket. Sorted by focus time,
 * descending.
 */
export function perProjectBreakdown(
  sessions: readonly SessionLike[],
  projects: readonly ProjectLike[],
): ProjectSlice[] {
  const names = new Map<string, ProjectLike>();
  for (const project of projects) {
    names.set(project._id, project);
  }
  const slices = new Map<string | null, ProjectSlice>();
  for (const session of sessions) {
    if (session.phase !== "focus") {
      continue;
    }
    const key = session.projectId ?? null;
    let slice = slices.get(key);
    if (slice === undefined) {
      const project = key === null ? undefined : names.get(key);
      slice = {
        projectId: key,
        name: project?.name ?? (key === null ? NO_PROJECT_LABEL : key),
        archived:
          project?.archivedAt !== undefined && project?.archivedAt !== null,
        focusMs: 0,
        sessions: 0,
      };
      slices.set(key, slice);
    }
    slice.focusMs += session.completedAt - session.startedAt;
    slice.sessions += 1;
  }
  return [...slices.values()].sort((a, b) => b.focusMs - a.focusMs);
}

export interface TaskSlice {
  taskId: string;
  /** Falls back when the task was cleared after its sessions landed. */
  title: string;
  focusMs: number;
  sessions: number;
}

/**
 * Top tasks by focus time, focus phases only, capped at `TOP_TASKS_LIMIT`.
 *
 * Unbound sessions credit no task and are excluded here (they still count in
 * totals and per-day). A task that has since been cleared keeps its time
 * under a fallback title — deleting a task must never delete the history of
 * having done it.
 */
export function topTasksByFocus(
  sessions: readonly SessionLike[],
  tasks: readonly TaskLike[],
  limit: number = TOP_TASKS_LIMIT,
): TaskSlice[] {
  const titles = new Map<string, string>();
  for (const task of tasks) {
    titles.set(task._id, task.title);
  }
  const slices = new Map<string, TaskSlice>();
  for (const session of sessions) {
    if (session.phase !== "focus") {
      continue;
    }
    const taskId = session.taskId ?? null;
    if (taskId === null) {
      continue;
    }
    let slice = slices.get(taskId);
    if (slice === undefined) {
      slice = {
        taskId,
        title: titles.get(taskId) ?? DELETED_TASK_LABEL,
        focusMs: 0,
        sessions: 0,
      };
      slices.set(taskId, slice);
    }
    slice.focusMs += session.completedAt - session.startedAt;
    slice.sessions += 1;
  }
  return [...slices.values()]
    .sort((a, b) => b.focusMs - a.focusMs)
    .slice(0, Math.max(0, limit));
}

export interface CompletionRatio {
  /** Focus sessions in the range — one session is one earned leaf. */
  completedLeaves: number;
  /** Estimates of the tasks currently on the board (see header). */
  estimatedLeaves: number;
  /** `null` on an empty board: no denominator is no score, not 0%. */
  ratio: number | null;
}

/** Completion ratio over a range: focus sessions vs. the current board. */
export function completionRatio(
  sessions: readonly SessionLike[],
  tasks: readonly TaskLike[],
): CompletionRatio {
  let completedLeaves = 0;
  for (const session of sessions) {
    if (session.phase === "focus") {
      completedLeaves += 1;
    }
  }
  let estimatedLeaves = 0;
  for (const task of tasks) {
    estimatedLeaves += task.estimate;
  }
  return {
    completedLeaves,
    estimatedLeaves,
    ratio: estimatedLeaves === 0 ? null : completedLeaves / estimatedLeaves,
  };
}

export interface TrendDeltas {
  focusMs: number;
  focusSessions: number;
  breakMs: number;
}

/**
 * Headline-metric deltas vs. the immediately preceding equal-length period.
 *
 * Signed numbers, nothing more: the UI renders them muted (PRD §4.1
 * "insight without judgment" — no color-coded pass/fail, no thresholds).
 */
export function trendDeltas(
  current: HeadlineTotals,
  previous: HeadlineTotals,
): TrendDeltas {
  return {
    focusMs: current.focusMs - previous.focusMs,
    focusSessions: current.focusSessions - previous.focusSessions,
    breakMs: current.breakMs - previous.breakMs,
  };
}

/** The window immediately preceding `[start, end)`, of equal length. */
export function previousRange(start: number, end: number): {
  start: number;
  end: number;
} {
  return { start: 2 * start - end, end: start };
}

/**
 * The UTC window for a preset, derived from the device's local midnight
 * (PRD D5). `now` arrives as an argument because the server has no clock
 * worth reading in a query — and the client reads its own through the
 * established `useSyncExternalStore` pattern, never during render.
 */
export function presetRange(
  preset: Exclude<RangePreset, "custom">,
  now: number,
  tzOffsetMinutes: number,
): { start: number; end: number } {
  const todayStart = startOfLocalDay(now, tzOffsetMinutes);
  const end = todayStart + MS_PER_DAY;
  if (preset === "today") {
    return { start: todayStart, end };
  }
  const days = preset === "7d" ? 7 : 30;
  return { start: end - days * MS_PER_DAY, end };
}

/**
 * UTC instant of a device-local calendar date's midnight (`YYYY-MM-DD`).
 *
 * The custom-range counterpart to `startOfLocalDay`: a date picked in the
 * selector names a *local* day, so midnight is midnight where the device is.
 */
export function customDayStart(
  dateStr: string,
  tzOffsetMinutes: number,
): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(
      `aggregations: custom range date must be YYYY-MM-DD, got ${dateStr}`,
    );
  }
  const [year, month, day] = dateStr.split("-").map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(utcMidnight)) {
    throw new Error(`aggregations: invalid custom range date ${dateStr}`);
  }
  return utcMidnight - tzOffsetMinutes * MS_PER_MINUTE;
}

/** Device-local calendar date (`YYYY-MM-DD`) of an instant. */
export function localDateStr(instant: number, tzOffsetMinutes: number): string {
  return dayKeyAt(instant, tzOffsetMinutes);
}

/**
 * The 24-hour distribution of *focus starts*: which hours the user focuses
 * most, each placed by the session's recorded offset (PRD §4.1 — no timezone
 * guessing). Index is the local hour; value is focus sessions started there.
 */
export function timeOfDayHistogram(
  sessions: readonly SessionLike[],
): number[] {
  const hours = new Array<number>(24).fill(0);
  for (const session of sessions) {
    if (session.phase !== "focus") {
      continue;
    }
    hours[hourAt(session.startedAt, session.tzOffsetAtCompletion)] += 1;
  }
  return hours;
}

export interface HistoryGroup {
  dayKey: string;
  sessions: SessionLike[];
}

/**
 * Reverse-chronological day groups for the session history list.
 *
 * Grouping is by completion day at each session's recorded offset (PRD §6),
 * newest day first; sessions within a day run newest completion first. The
 * query already returns that order — the sort here is defensive, so a caller
 * handing rows in any order still renders the same list.
 */
export function groupSessionsByDay(
  sessions: readonly SessionLike[],
): HistoryGroup[] {
  const groups = new Map<string, SessionLike[]>();
  for (const session of sessions) {
    const key = dayKeyAt(session.completedAt, session.tzOffsetAtCompletion);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [session]);
    } else {
      group.push(session);
    }
  }
  return [...groups.entries()]
    .map(([dayKey, rows]) => ({
      dayKey,
      sessions: [...rows].sort((a, b) => b.completedAt - a.completedAt),
    }))
    .sort((a, b) => (a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0));
}

export interface RangeAggregation {
  totals: HeadlineTotals;
  perDay: DayBucket[];
  perProject: ProjectSlice[];
  topTasks: TaskSlice[];
  completion: CompletionRatio;
  timeOfDay: number[];
}

/**
 * The whole range in one call: every panel on `/stats` reads off this shape.
 * `sessions` must already be scoped to `[start, end)` — the Convex wrapper
 * does that with a bounded `by_owner_completed` scan, and never hands over
 * the full log.
 */
export function aggregateRange(
  sessions: readonly SessionLike[],
  tasks: readonly TaskLike[],
  projects: readonly ProjectLike[],
  range: { start: number; end: number; tzOffsetMinutes: number },
): RangeAggregation {
  const inRange = sessions.filter(
    (session) =>
      session.completedAt >= range.start && session.completedAt < range.end,
  );
  return {
    totals: summarizeSessions(inRange),
    perDay: perDayBuckets(inRange, range.start, range.end, range.tzOffsetMinutes),
    perProject: perProjectBreakdown(inRange, projects),
    topTasks: topTasksByFocus(inRange, tasks),
    completion: completionRatio(inRange, tasks),
    timeOfDay: timeOfDayHistogram(inRange),
  };
}

/**
 * Linear bar heights for the hand-rolled SVG charts (PRD §11.5: no charting
 * library — full design control, DESIGN.md-compatible).
 *
 * Pure and separately tested so the "charts render correct relative heights
 * from fixture data" criterion is an oracle assertion, not a screenshot:
 * the tallest value fills `height`, everything else scales linearly, and an
 * all-zero series renders flat rather than dividing by zero.
 */
export function computeBarHeights(
  values: readonly number[],
  height: number,
): number[] {
  const max = Math.max(0, ...values);
  if (max <= 0 || height <= 0) {
    return values.map(() => 0);
  }
  return values.map(
    (value) => Math.round((Math.max(0, value) / max) * height * 100) / 100,
  );
}
