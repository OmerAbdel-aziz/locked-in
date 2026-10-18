import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render } from "@testing-library/react";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import schema from "@/convex/schema";
import { useNow } from "@/lib/use-now";
import {
  aggregateRange,
  computeBarHeights,
  completionRatio,
  customDayStart,
  dayKeyAt,
  groupSessionsByDay,
  hourAt,
  perDayBuckets,
  perProjectBreakdown,
  presetRange,
  previousRange,
  rangeDayKeys,
  startOfLocalDay,
  summarizeSessions,
  timeOfDayHistogram,
  topTasksByFocus,
  trendDeltas,
  type SessionLike,
} from "@/lib/aggregations";
import { EmptyStateView } from "@/components/stats/empty-state";
import { FocusChartView } from "@/components/stats/focus-chart";
import { FocusHeatmapView } from "@/components/stats/focus-heatmap";
import { HeadlinesView } from "@/components/stats/headlines";
import { ProjectDonutView } from "@/components/stats/project-donut";
import { RangeSelectorView } from "@/components/stats/range-selector";
import {
  SessionHistoryView,
  type HistoryRow,
} from "@/components/stats/session-history";
import {
  formatDayKey,
  formatLocalTime,
} from "@/components/stats/format";
import { SessionsChartView } from "@/components/stats/sessions-chart";
import { TimeOfDayView } from "@/components/stats/time-of-day";
import { TopTasksView } from "@/components/stats/top-tasks-table";
import { TrendsView } from "@/components/stats/trends";

/**
 * Tasks 19â€“22 gate: the Checkpoint F oracle.
 *
 * One deterministic 30-day fixture, hand-computed below, asserted down two
 * independent paths: the pure helpers in `lib/aggregations.ts` and the
 * bounded Convex queries in `convex/stats.ts` (same numbers through
 * `logCompleted` + real task rows). If either path drifts, this file fails â€”
 * that is the whole point of an oracle.
 *
 * The fixture (all durations exact, every `completedAt` unique because
 * `logCompleted` refuses a repeat as the duplicate it is):
 *
 *   Board: A "Outline" est 4 (P1 "Work"), B "Review PRs" est 2 (P1),
 *          C "Study plan" est 2 (P2 "Study", archived). Board total: 8.
 *   Window [Jun 1, Jul 1) 2024, device offset 0 unless noted:
 *     s1  Jun  1 09:00â€“09:25Z  focus A/P1
 *     s2  Jun  1 10:00â€“10:25Z  focus A/P1
 *     s3  Jun  1 10:30â€“10:35Z  short A/P1 (break â€” must not leak anywhere)
 *     s4  Jun  2 14:00â€“14:25Z  focus B/P1
 *     s5  Jun  6 09:00â€“09:25Z  focus C/P2
 *     s6  Jun  6 09:30â€“09:45Z  long, unbound (15m break)
 *     s7  Jun  9 21:45â€“22:10Z  focus A/P1, offset +120 â†’ *Jun 10* locally
 *     s8  Jun 13 04:30â€“04:55Z  focus B/P1, offset âˆ’300 â†’ *Jun 12* locally
 *     s9  Jun 30 20:00â€“20:25Z  focus, unbound
 *     pre May 31 12:00â€“12:25Z  focus A/P1 â†’ previous window only
 *     post Jul 1 01:00â€“01:25Z  focus A/P1 â†’ excluded everywhere
 *     ancient 2021-03-04       focus A/P1 â†’ excluded everywhere
 *
 * Hand-computed current window:
 *   focus 7 Ã— 25m = 175m (10,500,000ms), 7 sessions; breaks 5m + 15m.
 *   per-day: Jun1 50m/2, Jun2 25m/1, Jun6 25m/1, Jun10 25m/1, Jun12 25m/1,
 *     Jun30 25m/1; the other 24 days zero.
 *   per-project: P1 125m/5, P2 25m/1 (archived), none 25m/1.
 *   top tasks: A 75m/3, B 50m/2, C 25m/1 (the unbound session credits none).
 *   completion: 7 / 8 = 0.875.
 *   time-of-day (start hour at recorded offset): 9â†’2, 10â†’1, 14â†’1, 20â†’1,
 *     23â†’2 (s7 21:45Z+2h, s8 04:30Zâˆ’5h).
 *   previous window [May 2, Jun 1): 25m/1, no breaks.
 *   deltas: focus +150m, sessions +6, break +20m.
 */

const modules = import.meta.glob("../convex/**/*.*s");

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const START = Date.UTC(2024, 5, 1); // Jun 1 2024 00:00Z
const END = START + 30 * DAY; // Jul 1 2024 00:00Z
const FOCUS_25 = 25 * MIN;

function at(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  return Date.UTC(year, month - 1, day, hour, minute);
}

/** The oracle sessions as pure shapes (task/project ids are stand-ins). */
function oracleSessions(): SessionLike[] {
  const focus = (
    completedAt: number,
    taskId: string | null,
    projectId: string | null,
    tzOffsetAtCompletion = 0,
  ): SessionLike => ({
    startedAt: completedAt - FOCUS_25,
    completedAt,
    phase: "focus",
    taskId,
    projectId,
    tzOffsetAtCompletion,
  });
  return [
    focus(at(2024, 6, 1, 9, 25), "taskA", "projP1"),
    focus(at(2024, 6, 1, 10, 25), "taskA", "projP1"),
    {
      startedAt: at(2024, 6, 1, 10, 30),
      completedAt: at(2024, 6, 1, 10, 35),
      phase: "short",
      taskId: "taskA",
      projectId: "projP1",
      tzOffsetAtCompletion: 0,
    },
    focus(at(2024, 6, 2, 14, 25), "taskB", "projP1"),
    focus(at(2024, 6, 6, 9, 25), "taskC", "projP2"),
    {
      startedAt: at(2024, 6, 6, 9, 30),
      completedAt: at(2024, 6, 6, 9, 45),
      phase: "long",
      taskId: null,
      projectId: null,
      tzOffsetAtCompletion: 0,
    },
    // 22:10Z at +120 is 00:10 local on Jun 10 â€” the day that just began.
    focus(at(2024, 6, 9, 22, 10), "taskA", "projP1", 120),
    // 04:55Z at âˆ’300 is 23:55 local on Jun 12 â€” still the old day.
    focus(at(2024, 6, 13, 4, 55), "taskB", "projP1", -300),
    focus(at(2024, 6, 30, 20, 25), null, null),
    focus(at(2024, 5, 31, 12, 25), "taskA", "projP1"),
    focus(at(2024, 7, 1, 1, 25), "taskA", "projP1"),
    focus(at(2021, 3, 4, 12, 25), "taskA", "projP1"),
  ];
}

const ORACLE_TASKS = [
  { _id: "taskA", title: "Outline", estimate: 4 },
  { _id: "taskB", title: "Review PRs", estimate: 2 },
  { _id: "taskC", title: "Study plan", estimate: 2 },
];

const ORACLE_PROJECTS = [
  { _id: "projP1", name: "Work" },
  { _id: "projP2", name: "Study", archivedAt: at(2024, 6, 20, 12, 0) },
];

const IN_RANGE = oracleSessions().filter(
  (s) => s.completedAt >= START && s.completedAt < END,
);

describe("day and hour attribution (PRD Â§6)", () => {
  it("credits 00:01 to the new day and 23:59 to the old one", () => {
    expect(dayKeyAt(at(2024, 6, 1, 23, 59), 0)).toBe("2024-06-01");
    expect(dayKeyAt(at(2024, 6, 2, 0, 1), 0)).toBe("2024-06-02");
  });

  it("shifts attribution by each session's own recorded offset", () => {
    // 22:10Z is Jun 9 in UTC and Jun 10 at +120.
    expect(dayKeyAt(at(2024, 6, 9, 22, 10), 0)).toBe("2024-06-09");
    expect(dayKeyAt(at(2024, 6, 9, 22, 10), 120)).toBe("2024-06-10");
    // 04:55Z Jun 13 is Jun 13 in UTC and still Jun 12 at âˆ’300.
    expect(dayKeyAt(at(2024, 6, 13, 4, 55), 0)).toBe("2024-06-13");
    expect(dayKeyAt(at(2024, 6, 13, 4, 55), -300)).toBe("2024-06-12");
  });

  it("converts start hours with the recorded offset, never UTC alone", () => {
    // Naive UTC would scatter these across 21, 4 and 7; the recorded
    // offsets land all three at 09:00 local.
    expect(hourAt(at(2024, 6, 6, 9, 0), 0)).toBe(9);
    expect(hourAt(at(2024, 6, 6, 7, 0), 120)).toBe(9);
    expect(hourAt(at(2024, 6, 6, 14, 0), -300)).toBe(9);
    expect(hourAt(at(2024, 6, 9, 21, 45), 120)).toBe(23);
    expect(hourAt(at(2024, 6, 13, 4, 30), -300)).toBe(23);
  });

  it("scaffolds every device-local day overlapping the window", () => {
    expect(rangeDayKeys(START, END, 0)).toHaveLength(30);
    expect(rangeDayKeys(START, END, 0)[0]).toBe("2024-06-01");
    expect(rangeDayKeys(START, END, 0)[29]).toBe("2024-06-30");
    // At âˆ’300 the window opens mid-evening May 31 local time.
    expect(rangeDayKeys(START, END, -300)[0]).toBe("2024-05-31");
  });

  it("startOfLocalDay floors after shifting, not before", () => {
    // 01:00Z is still yesterday evening at âˆ’300.
    expect(startOfLocalDay(at(2024, 6, 15, 1, 0), -300)).toBe(
      at(2024, 6, 14, 5, 0),
    );
  });
});

describe("the 30-day oracle through the pure helpers", () => {
  it("splits break vs. focus without letting breaks leak into work", () => {
    expect(summarizeSessions(IN_RANGE)).toEqual({
      focusMs: 7 * FOCUS_25,
      focusSessions: 7,
      breakMs: 5 * MIN + 15 * MIN,
      breakSessions: 2,
    });
  });

  it("buckets per-day focus at each session's own offset, zeros included", () => {
    const perDay = perDayBuckets(IN_RANGE, START, END, 0);
    expect(perDay).toHaveLength(30);
    const byDay = Object.fromEntries(
      perDay.map((d) => [d.dayKey, { focusMs: d.focusMs, sessions: d.sessions }]),
    );
    expect(byDay["2024-06-01"]).toEqual({ focusMs: 50 * MIN, sessions: 2 });
    expect(byDay["2024-06-02"]).toEqual({ focusMs: 25 * MIN, sessions: 1 });
    expect(byDay["2024-06-06"]).toEqual({ focusMs: 25 * MIN, sessions: 1 });
    // The two timezone edges land on their *local* days, not their UTC ones.
    expect(byDay["2024-06-09"]).toEqual({ focusMs: 0, sessions: 0 });
    expect(byDay["2024-06-10"]).toEqual({ focusMs: 25 * MIN, sessions: 1 });
    expect(byDay["2024-06-12"]).toEqual({ focusMs: 25 * MIN, sessions: 1 });
    expect(byDay["2024-06-13"]).toEqual({ focusMs: 0, sessions: 0 });
    expect(byDay["2024-06-30"]).toEqual({ focusMs: 25 * MIN, sessions: 1 });
    // The out-of-window rows never appear, whichever side they fall on.
    expect(byDay["2024-05-31"]).toBeUndefined();
    expect(byDay["2024-07-01"]).toBeUndefined();
    const total = perDay.reduce((sum, d) => sum + d.focusMs, 0);
    expect(total).toBe(7 * FOCUS_25);
  });

  it("attributes per-project focus time, archived and unbound included", () => {
    const slices = perProjectBreakdown(IN_RANGE, ORACLE_PROJECTS);
    expect(slices).toHaveLength(3);
    // Sorted by focus time, descending.
    expect(slices[0]).toMatchObject({
      name: "Work",
      archived: false,
      focusMs: 125 * MIN,
      sessions: 5,
    });
    const study = slices.find((s) => s.name === "Study");
    expect(study).toMatchObject({
      projectId: "projP2",
      archived: true,
      focusMs: 25 * MIN,
      sessions: 1,
    });
    const none = slices.find((s) => s.projectId === null);
    expect(none).toMatchObject({
      name: "No project",
      focusMs: 25 * MIN,
      sessions: 1,
    });
  });

  it("ranks top tasks by focus time and skips unbound sessions", () => {
    expect(topTasksByFocus(IN_RANGE, ORACLE_TASKS)).toEqual([
      { taskId: "taskA", title: "Outline", focusMs: 75 * MIN, sessions: 3 },
      { taskId: "taskB", title: "Review PRs", focusMs: 50 * MIN, sessions: 2 },
      { taskId: "taskC", title: "Study plan", focusMs: 25 * MIN, sessions: 1 },
    ]);
  });

  it("keeps a cleared task's time under a fallback title", () => {
    const slices = topTasksByFocus(IN_RANGE, [ORACLE_TASKS[0]]);
    expect(slices.find((s) => s.taskId === "taskB")?.title).toBe(
      "Deleted task",
    );
  });

  it("divides completed leaves by the current board", () => {
    expect(completionRatio(IN_RANGE, ORACLE_TASKS)).toEqual({
      completedLeaves: 7,
      estimatedLeaves: 8,
      ratio: 7 / 8,
    });
  });

  it("reports no ratio â€” not 0% â€” on an empty board", () => {
    expect(completionRatio(IN_RANGE, []).ratio).toBeNull();
  });

  it("histograms start hours at recorded offsets", () => {
    const hours = timeOfDayHistogram(IN_RANGE);
    expect(hours).toHaveLength(24);
    expect(hours[9]).toBe(2);
    expect(hours[10]).toBe(1);
    expect(hours[14]).toBe(1);
    expect(hours[20]).toBe(1);
    expect(hours[23]).toBe(2);
    expect(hours.reduce((a, b) => a + b, 0)).toBe(7);
  });

  it("aggregates the whole range in one call", () => {
    const full = aggregateRange(IN_RANGE, ORACLE_TASKS, ORACLE_PROJECTS, {
      start: START,
      end: END,
      tzOffsetMinutes: 0,
    });
    expect(full.totals.focusSessions).toBe(7);
    expect(full.perDay).toHaveLength(30);
    expect(full.perProject).toHaveLength(3);
    expect(full.topTasks[0].taskId).toBe("taskA");
    expect(full.completion.ratio).toBe(7 / 8);
    expect(full.timeOfDay[23]).toBe(2);
  });

  it("scopes the range itself â€” out-of-window rows never enter", () => {
    const full = aggregateRange(
      oracleSessions(),
      ORACLE_TASKS,
      ORACLE_PROJECTS,
      { start: START, end: END, tzOffsetMinutes: 0 },
    );
    expect(full.totals).toEqual({
      focusMs: 7 * FOCUS_25,
      focusSessions: 7,
      breakMs: 20 * MIN,
      breakSessions: 2,
    });
  });
});

describe("trends and ranges", () => {
  it("compares against the immediately preceding equal-length period", () => {
    const prev = previousRange(START, END);
    expect(prev).toEqual({ start: START - 30 * DAY, end: START });
    const prevSessions = oracleSessions().filter(
      (s) => s.completedAt >= prev.start && s.completedAt < prev.end,
    );
    // Only the May 31 row: the ancient and post rows belong to neither.
    expect(summarizeSessions(prevSessions)).toEqual({
      focusMs: FOCUS_25,
      focusSessions: 1,
      breakMs: 0,
      breakSessions: 0,
    });
    expect(trendDeltas(summarizeSessions(IN_RANGE), summarizeSessions(prevSessions))).toEqual({
      focusMs: 150 * MIN,
      focusSessions: 6,
      breakMs: 20 * MIN,
    });
  });

  it("holds for a partial custom range starting mid-day", () => {
    const start = at(2024, 6, 20, 12, 0);
    const end = at(2024, 6, 25, 12, 0);
    const prev = previousRange(start, end);
    expect(prev).toEqual({ start: at(2024, 6, 15, 12, 0), end: start });
    const sessions: SessionLike[] = [
      {
        startedAt: at(2024, 6, 16, 9, 0),
        completedAt: at(2024, 6, 16, 9, 25),
        phase: "focus",
        tzOffsetAtCompletion: 0,
      },
      {
        startedAt: at(2024, 6, 21, 9, 0),
        completedAt: at(2024, 6, 21, 9, 25),
        phase: "focus",
        tzOffsetAtCompletion: 0,
      },
      {
        startedAt: at(2024, 6, 23, 9, 0),
        completedAt: at(2024, 6, 23, 9, 25),
        phase: "focus",
        tzOffsetAtCompletion: 0,
      },
      {
        startedAt: at(2024, 6, 22, 9, 0),
        completedAt: at(2024, 6, 22, 9, 5),
        phase: "short",
        tzOffsetAtCompletion: 0,
      },
    ];
    const current = sessions.filter(
      (s) => s.completedAt >= start && s.completedAt < end,
    );
    const before = sessions.filter(
      (s) => s.completedAt >= prev.start && s.completedAt < prev.end,
    );
    expect(trendDeltas(summarizeSessions(current), summarizeSessions(before))).toEqual({
      focusMs: FOCUS_25,
      focusSessions: 1,
      breakMs: 5 * MIN,
    });
  });

  it("derives presets from the device's local midnight", () => {
    const now = at(2024, 6, 15, 13, 0);
    expect(presetRange("today", now, 0)).toEqual({
      start: at(2024, 6, 15, 0, 0),
      end: at(2024, 6, 16, 0, 0),
    });
    const seven = presetRange("7d", now, 0);
    expect(seven.end - seven.start).toBe(7 * DAY);
    expect(seven.end).toBe(at(2024, 6, 16, 0, 0));
    const thirty = presetRange("30d", now, 0);
    expect(thirty.end - thirty.start).toBe(30 * DAY);
  });

  it("converts custom dates as local midnights", () => {
    expect(customDayStart("2024-06-15", 0)).toBe(at(2024, 6, 15, 0, 0));
    // Midnight local at +120 is 22:00Z the evening before.
    expect(customDayStart("2024-06-15", 120)).toBe(at(2024, 6, 14, 22, 0));
    expect(() => customDayStart("06/15/2024", 0)).toThrow(/YYYY-MM-DD/);
  });
});

describe("chart scaling", () => {
  it("fills the tallest bar and scales the rest linearly", () => {
    expect(computeBarHeights([0, 25, 50], 100)).toEqual([0, 50, 100]);
    expect(computeBarHeights([5], 96)).toEqual([96]);
    expect(computeBarHeights([], 100)).toEqual([]);
  });

  it("renders an all-zero series flat instead of dividing by zero", () => {
    expect(computeBarHeights([0, 0, 0], 100)).toEqual([0, 0, 0]);
  });
});

describe("useNow stability (Task 20 hotfix)", () => {
  it("returns a clock snapshot that is stable across renders", () => {
    // A clock advancing 1ms per read: an unquantised snapshot would hand
    // React a new value on every render, and each render would schedule
    // another â€” the "Maximum update depth exceeded" spiral seen live on
    // `/stats`. Flooring to the minute keeps thousands of reads on one
    // value, so re-renders settle instead of looping.
    let tick = at(2024, 6, 15, 13, 0);
    const clock = vi.spyOn(Date, "now").mockImplementation(() => tick++);
    try {
      function Probe() {
        return h("span", null, String(useNow()));
      }
      const { container, rerender } = render(h(Probe, {}));
      const first = container.textContent;
      rerender(h(Probe, {}));
      expect(container.textContent).toBe(first);
      expect(first).toBe(String(at(2024, 6, 15, 13, 0)));
    } finally {
      clock.mockRestore();
    }
  });
});

describe("history grouping", () => {
  it("groups by completion day, newest day first", () => {
    const groups = groupSessionsByDay(IN_RANGE);
    expect(groups.map((g) => g.dayKey)).toEqual([
      "2024-06-30",
      "2024-06-12",
      "2024-06-10",
      "2024-06-06",
      "2024-06-02",
      "2024-06-01",
    ]);
    const june1 = groups.find((g) => g.dayKey === "2024-06-01");
    expect(june1?.sessions).toHaveLength(3);
    // Newest completion first within the day.
    expect(june1?.sessions[0].completedAt).toBe(at(2024, 6, 1, 10, 35));
  });

  it("formats day labels and local times without the runtime locale", () => {
    expect(formatDayKey("2024-06-01")).toBe("Sat, Jun 1");    // 21:45Z at +120 is 23:45 local.
    expect(formatLocalTime(at(2024, 6, 9, 21, 45), 120)).toBe("23:45");
  });
});

type Base = ReturnType<typeof convexTest>;
type Client = ReturnType<Base["withIdentity"]>;

/** One anonymous owner, as `tests/binding.test.ts` builds them. */
async function identity(base = convexTest(schema, modules)) {
  const ownerId = await base.run((ctx) =>
    ctx.db.insert("users", { createdAt: 1, isAnonymous: true }),
  );
  return { base, ownerId, client: base.withIdentity({ subject: `${ownerId}|s1` }) };
}

async function makeProject(
  base: Base,
  ownerId: Id<"users">,
  name: string,
  archivedAt?: number,
): Promise<Id<"projects">> {
  return base.run((ctx) =>
    archivedAt === undefined
      ? ctx.db.insert("projects", { ownerId, name })
      : ctx.db.insert("projects", { ownerId, name, archivedAt }),
  );
}

/**
 * The oracle fixture through the real mutations: tasks via `tasks.create`,
 * projects inserted directly (Task 13 builds their API), sessions via
 * `logCompleted` â€” so a change to what any of those actually writes breaks
 * this gate rather than being papered over by a direct insert.
 */
async function seedOracle(client: Client, p1: Id<"projects">, p2: Id<"projects">) {
  const a = await client.mutation(api.tasks.create, {
    title: "Outline",
    estimate: 4,
    projectId: p1,
  });
  const b = await client.mutation(api.tasks.create, {
    title: "Review PRs",
    estimate: 2,
    projectId: p1,
  });
  const c = await client.mutation(api.tasks.create, {
    title: "Study plan",
    estimate: 2,
    projectId: p2,
  });

  const log = (
    completedAt: number,
    fields: {
      phase?: "focus" | "short" | "long";
      durationMs?: number;
      taskId?: Id<"tasks">;
      projectId?: Id<"projects">;
      tzOffsetAtCompletion?: number;
    } = {},
  ) =>
    client.mutation(api.sessions.logCompleted, {
      phase: "focus",
      startedAt: completedAt - (fields.durationMs ?? FOCUS_25),
      completedAt,
      tzOffsetAtCompletion: 0,
      ...(fields.taskId !== undefined ? { taskId: fields.taskId } : {}),
      ...(fields.projectId !== undefined ? { projectId: fields.projectId } : {}),
      ...(fields.phase !== undefined ? { phase: fields.phase } : {}),
      ...(fields.tzOffsetAtCompletion !== undefined
        ? { tzOffsetAtCompletion: fields.tzOffsetAtCompletion }
        : {}),
    });

  await log(at(2024, 6, 1, 9, 25), { taskId: a, projectId: p1 });
  await log(at(2024, 6, 1, 10, 25), { taskId: a, projectId: p1 });
  await log(at(2024, 6, 1, 10, 35), {
    phase: "short",
    durationMs: 5 * MIN,
    taskId: a,
    projectId: p1,
  });
  await log(at(2024, 6, 2, 14, 25), { taskId: b, projectId: p1 });
  await log(at(2024, 6, 6, 9, 25), { taskId: c, projectId: p2 });
  await log(at(2024, 6, 6, 9, 45), { phase: "long", durationMs: 15 * MIN });
  await log(at(2024, 6, 9, 22, 10), {
    taskId: a,
    projectId: p1,
    tzOffsetAtCompletion: 120,
  });
  await log(at(2024, 6, 13, 4, 55), {
    taskId: b,
    projectId: p1,
    tzOffsetAtCompletion: -300,
  });
  await log(at(2024, 6, 30, 20, 25), {});
  await log(at(2024, 5, 31, 12, 25), { taskId: a, projectId: p1 });
  await log(at(2024, 7, 1, 1, 25), { taskId: a, projectId: p1 });
  await log(at(2021, 3, 4, 12, 25), { taskId: a, projectId: p1 });

  return { a, b, c };
}

describe("the 30-day oracle through the Convex queries", () => {
  it("returns the hand-computed range: totals, per-day, projects, tasks, ratio", async () => {
    const { ownerId, base, client: t } = await identity();
    const p1 = await makeProject(base, ownerId, "Work");
    const p2 = await makeProject(base, ownerId, "Study", at(2024, 6, 20, 12, 0));
    await seedOracle(t, p1, p2);

    const stats = await t.query(api.stats.rangeStats, {
      start: START,
      end: END,
      tzOffsetMinutes: 0,
    });

    expect(stats.totals).toEqual({
      focusMs: 7 * FOCUS_25,
      focusSessions: 7,
      breakMs: 20 * MIN,
      breakSessions: 2,
    });
    expect(stats.perDay).toHaveLength(30);
    const byDay = Object.fromEntries(
      stats.perDay.map((d) => [d.dayKey, d]),
    );
    expect(byDay["2024-06-01"]).toMatchObject({ focusMs: 50 * MIN, sessions: 2 });
    expect(byDay["2024-06-10"]).toMatchObject({ focusMs: 25 * MIN, sessions: 1 });
    expect(byDay["2024-06-12"]).toMatchObject({ focusMs: 25 * MIN, sessions: 1 });
    expect(byDay["2024-06-09"]).toMatchObject({ focusMs: 0, sessions: 0 });

    expect(stats.perProject).toHaveLength(3);
    expect(stats.perProject[0]).toMatchObject({
      name: "Work",
      archived: false,
      focusMs: 125 * MIN,
      sessions: 5,
    });
    const study = stats.perProject.find((s) => s.name === "Study");
    expect(study).toMatchObject({
      projectId: p2,
      archived: true,
      focusMs: 25 * MIN,
      sessions: 1,
    });

    expect(stats.topTasks.map((s) => [s.title, s.focusMs, s.sessions])).toEqual([
      ["Outline", 75 * MIN, 3],
      ["Review PRs", 50 * MIN, 2],
      ["Study plan", 25 * MIN, 1],
    ]);
    expect(stats.completion).toEqual({
      completedLeaves: 7,
      estimatedLeaves: 8,
      ratio: 7 / 8,
    });

    // Trends: the May 31 row is the entire previous window.
    expect(stats.previous).toEqual({
      focusMs: FOCUS_25,
      focusSessions: 1,
      breakMs: 0,
      breakSessions: 0,
    });
    expect(stats.deltas).toEqual({
      focusMs: 150 * MIN,
      focusSessions: 6,
      breakMs: 20 * MIN,
    });

    expect(stats.timeOfDay).toHaveLength(24);
    expect(stats.timeOfDay[9]).toBe(2);
    expect(stats.timeOfDay[23]).toBe(2);
  });

  it("scopes reads to the window â€” nothing outside leaks in", async () => {
    const { ownerId, base, client: t } = await identity();
    const p1 = await makeProject(base, ownerId, "Work");
    const p2 = await makeProject(base, ownerId, "Study");
    await seedOracle(t, p1, p2);

    // A one-day window deep inside the fixture sees exactly one session.
    const day = await t.query(api.stats.rangeStats, {
      start: at(2024, 6, 2, 0, 0),
      end: at(2024, 6, 3, 0, 0),
      tzOffsetMinutes: 0,
    });
    expect(day.totals).toEqual({
      focusMs: FOCUS_25,
      focusSessions: 1,
      breakMs: 0,
      breakSessions: 0,
    });
    expect(day.perDay.filter((d) => d.sessions > 0).map((d) => d.dayKey)).toEqual([
      "2024-06-02",
    ]);
  });

  it("lists history newest-first with names resolved, archived included", async () => {
    const { ownerId, base, client: t } = await identity();
    const p1 = await makeProject(base, ownerId, "Work");
    const p2 = await makeProject(base, ownerId, "Study", at(2024, 6, 20, 12, 0));
    await seedOracle(t, p1, p2);

    const { sessions } = await t.query(api.stats.history, {
      start: START,
      end: END,
      limit: 50,
    });
    expect(sessions).toHaveLength(9);
    // Reverse-chronological by completion.
    expect(sessions[0].completedAt).toBe(at(2024, 6, 30, 20, 25));
    expect(sessions[8].completedAt).toBe(at(2024, 6, 1, 9, 25));
    for (let i = 1; i < sessions.length; i++) {
      expect(sessions[i].completedAt).toBeLessThan(sessions[i - 1].completedAt);
    }

    const study = sessions.find((s) => s.taskTitle === "Study plan");
    expect(study).toMatchObject({
      projectName: "Study",
      projectArchived: true,
    });
    const unbound = sessions.find((s) => s.completedAt === at(2024, 6, 30, 20, 25));
    expect(unbound).toMatchObject({
      taskTitle: null,
      projectName: null,
      projectArchived: false,
    });
    // A deleted task keeps its row but loses its title â€” never the row.
    await base.run(async (ctx) => {
      const tasks = await ctx.db.query("tasks").collect();
      const target = tasks.find((task) => task.title === "Outline");
      if (target !== undefined) {
        await ctx.db.delete(target._id);
      }
    });
    const after = await t.query(api.stats.history, {
      start: START,
      end: END,
      limit: 50,
    });
    expect(after.sessions).toHaveLength(9);
    expect(
      after.sessions.filter((s) => s.taskTitle === "Outline"),
    ).toHaveLength(0);
  });

  it("keeps owners apart", async () => {
    const { ownerId, base, client: alice } = await identity();
    const p1 = await makeProject(base, ownerId, "Work");
    const p2 = await makeProject(base, ownerId, "Study");
    await seedOracle(alice, p1, p2);

    const strangerId = await base.run((ctx) =>
      ctx.db.insert("users", { createdAt: 2, isAnonymous: true }),
    );
    const stranger = base.withIdentity({ subject: `${strangerId}|s9` });
    const other = await stranger.mutation(api.tasks.create, {
      title: "Theirs",
      estimate: 2,
    });
    await stranger.mutation(api.sessions.logCompleted, {
      phase: "focus",
      startedAt: at(2024, 6, 2, 10, 0),
      completedAt: at(2024, 6, 2, 10, 25),
      tzOffsetAtCompletion: 0,
      taskId: other,
    });

    const hers = await stranger.query(api.stats.rangeStats, {
      start: START,
      end: END,
      tzOffsetMinutes: 0,
    });
    expect(hers.totals.focusSessions).toBe(1);
    const mine = await alice.query(api.stats.rangeStats, {
      start: START,
      end: END,
      tzOffsetMinutes: 0,
    });
    expect(mine.totals.focusSessions).toBe(7);
    const myHistory = await alice.query(api.stats.history, {
      start: START,
      end: END,
    });
    expect(myHistory.sessions).toHaveLength(9);
  });

  it("refuses callers with no session through the shared helper", async () => {
    const base = convexTest(schema, modules);
    await expect(
      base.query(api.stats.rangeStats, { start: START, end: END, tzOffsetMinutes: 0 }),
    ).rejects.toThrow(/unauthenticated/i);
    await expect(
      base.query(api.stats.history, { start: START, end: END }),
    ).rejects.toThrow(/unauthenticated/i);
  });

  it("validates ranges, offsets and limits", async () => {
    const { client: t } = await identity();
    await expect(
      t.query(api.stats.rangeStats, { start: END, end: START, tzOffsetMinutes: 0 }),
    ).rejects.toThrow(/\[start, end\)/);
    await expect(
      t.query(api.stats.rangeStats, {
        start: START,
        end: START + 400 * DAY,
        tzOffsetMinutes: 0,
      }),
    ).rejects.toThrow(/wider than a year/);
    await expect(
      t.query(api.stats.rangeStats, { start: START, end: END, tzOffsetMinutes: 9999 }),
    ).rejects.toThrow(/UTC offset/);
    await expect(
      t.query(api.stats.history, { start: START, end: END, limit: 500 }),
    ).rejects.toThrow(/limit/);
  });
});

/**
 * ADR-006 gate: the Arc views over the same oracle fixture.
 *
 * The hand-rolled SVGs used to be verified by drawing rectangles; Arc owns
 * the pixels now, so what is pinned is Arc's accessibility *contract* —
 * the sr-only captions, the hidden data tables, the legend rows, the
 * sortable columns, the read-only history — rendered through the same
 * fixture the pure helpers and the Convex queries were verified against.
 * Static markup (`renderToStaticMarkup`) is the oracle medium: it is
 * exactly what server-render emits, locale-free, and the same strings the
 * client hydration must reconstruct.
 */
describe("the Arc views over the oracle fixture", () => {
  function stats() {
    return aggregateRange(IN_RANGE, ORACLE_TASKS, ORACLE_PROJECTS, {
      start: START,
      end: END,
      tzOffsetMinutes: 0,
    });
  }

  it("outputs the focus bar chart's scrub-to-read surface", () => {
    const markup = renderToStaticMarkup(h(FocusChartView, { days: stats().perDay }));

    // The rotating caption: "{label}, {period}".
    expect(markup).toContain("Focus time per day, Jun 1 - Jun 30");
    // The scrub summary names the range's best day; the hidden data table
    // carries every row, zero days included, as `<th>{day}</th><td>{value}</td>` pairs.
    expect(markup).toContain("Sat, Jun 1, 50 min");
    expect(markup).toContain('<th scope="row">Wed, Jun 5</th><td>0 min</td>');
    // Arc's gridlines are part of its plot — the old "no <line> hand-rolled
    // SVG" gate is retired with the hand-rolled SVG.
    expect(markup).toContain("<line");
  });

  it("outputs the sessions bar chart's surface in session units", () => {
    const markup = renderToStaticMarkup(h(SessionsChartView, { days: stats().perDay }));

    expect(markup).toContain("Focus sessions per day, Jun 1 - Jun 30");
    expect(markup).toContain("Sat, Jun 1, 2 sessions");
  });

  it("outputs the time-of-day histogram with the peak readout", () => {
    const markup = renderToStaticMarkup(h(TimeOfDayView, { hours: stats().timeOfDay }));

    // Start hours at the *recorded* offset: 9â†’2 (not UTC's scatter).
    expect(markup).toContain("09:00");
    expect(markup).toContain("Peak hour");
    expect(markup).toContain("Focus sessions by hour of day");
  });

  it("outputs trends as three muted muted rows and a quiet sparkline", () => {
    const markup = renderToStaticMarkup(
      h(TrendsView, { deltas: { focusMs: 150 * MIN, focusSessions: 6, breakMs: 20 * MIN }, days: stats().perDay }),
    );

    expect(markup).toContain("Trends vs. previous period");
    expect(markup).toContain("+150m");
    expect(markup).toContain("+6 sessions");
    expect(markup).toContain("+20m");
    expect(markup).toContain("Focus minutes per day this period");
  });

  it("outputs headline counters from the aggregation", () => {
    const markup = renderToStaticMarkup(
      h(HeadlinesView, { stats: stats(), days: stats().perDay }),
    );

    for (const label of ["Focus time", "Sessions", "Break time", "Completion"]) {
      expect(markup).toContain(label);
    }
    // 7 focus leaves / 8 estimated = 87.5 → the counter reads 88%.
    expect(markup).toContain("%");
  });

  it("outputs the per-project donut with named legends, archived muted, none counted", () => {
    const markup = renderToStaticMarkup(h(ProjectDonutView, { slices: stats().perProject }));

    // Legend rows: "{label}, {value} {unit}, {percent}%".
    expect(markup).toContain("aria-label");
    expect(markup).toContain("Work, 125 min");
    expect(markup).toContain(">Study<");
    expect(markup).toContain(">No project<");
  });

  it("outputs the top tasks table sortable by focus time, descending", () => {
    const markup = renderToStaticMarkup(h(TopTasksView, { slices: stats().topTasks }));

    expect(markup).toContain("Top tasks by focus time");
    expect(markup).toContain("aria-sort=\"descending\"");
    expect(markup).toContain("Outline");
    expect(markup).toContain("Review PRs");
  });

  it("outputs the trailing-year heatmap with full day-name cells and pick-through", () => {
    const days = stats().perDay.map((day) => ({
      date: day.dayKey,
      count: Math.round(day.focusMs / 60_000),
    }));
    const markup = renderToStaticMarkup(
      h(FocusHeatmapView, {
        days,
        selectedDate: null,
        onPickDay: () => {},
      }),
    );

    expect(markup).toContain("Focus minutes per day, 2024");
    // The grid speaks a full, locale-free day name per cell — with the count
    // and with an explicit zero.
    expect(markup).toContain("50 minutes, Saturday, June 1, 2024");
    expect(markup).toContain("No minutes, Monday, June 3, 2024");
  });

  it("outputs session history as a read-only timeline, day-grouped", () => {
    const rows: HistoryRow[] = IN_RANGE.map((session) => ({
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      phase: session.phase,
      tzOffsetAtCompletion: session.tzOffsetAtCompletion,
      taskTitle:
        session.taskId === "taskA"
          ? "Outline"
          : session.taskId === "taskB"
            ? "Review PRs"
            : session.taskId === "taskC"
              ? "Study plan"
              : null,
      projectName:
        session.projectId === "projP1"
          ? "Work"
          : session.projectId === "projP2"
            ? "Study"
            : null,
      projectArchived: session.projectId === "projP2",
    }));
    const markup = renderToStaticMarkup(
      // now far outside the fixture: no group may claim "Today"/"Yesterday",
      // so every group is a named local day and the assertion is airtight.
      h(SessionHistoryView, { rows, now: at(2024, 7, 15, 12, 0) }),
    );

    expect(markup).toContain("Session history");
    expect(markup).toContain("June 30");
    expect(markup).toContain("Outline");
    expect(markup).toContain("25 min");
    expect(markup).toContain("23:45"); // s7 at its +120 wall time.
    // Read-only records: no trigger, no button, no edit affordance anywhere.
    expect(markup).not.toContain("<button");
    expect(markup).toContain("Study plan"); // archived project row, by name.
  });

  it("outputs the range selector as four pressed-toggle presets", () => {
    const today = renderToStaticMarkup(
      h(RangeSelectorView, {
        value: { preset: "today", customStart: "", customEnd: "" },
        onChange: () => {},
      }),
    );
    // SegmentedControl: role=group, one aria-pressed button per preset.
    expect(today).toContain("Today");
    expect(today.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(today.match(/aria-pressed="false"/g)).toHaveLength(3);
    // No custom inputs until Custom is chosen.
    expect(today).not.toContain('type="date"');

    const custom = renderToStaticMarkup(
      h(RangeSelectorView, {
        value: {
          preset: "custom",
          customStart: "2024-06-15",
          customEnd: "2024-06-20",
        },
        onChange: () => {},
      }),
    );
    expect((custom.match(/type="date"/g) ?? []).length).toBe(2);
    expect(custom).toContain("2024-06-15");
  });

  it("outputs the calm empty state", () => {
    const markup = renderToStaticMarkup(h(EmptyStateView, {}));

    expect(markup).toContain("No sessions yet");
    expect(markup).toContain("Complete a focus session");
  });
});

