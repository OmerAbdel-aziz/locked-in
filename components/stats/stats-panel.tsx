"use client";

/**
 * The mounted `/stats` panel - Tasks 20-22, re-rendered over Arc UI
 * (ADR-006).
 *
 * State and data feeding are unchanged: the range (preset + custom dates)
 * converts to a UTC window with the device offset and drives the two
 * bounded queries from `convex/stats.ts` - plus a third, fixed trailing
 * year for the heatmap (a second bounded scan of the same index; the
 * heatmap deliberately ignores the range selector).
 *
 * Everything rendered is still a pure view over the answers, and every
 * view is now Arc content in the app's tonal shells - charts (scrub-to-
 * read bars, the per-project donut, the year heatmap, the period
 * sparkline), counters, the sortable top-tasks table, the timeline, and
 * the empty state.
 *
 * Clock rules, both inherited:
 *   - `now` arrives via the shared `useNow` hook (`lib/use-now.ts`):
 *     `useSyncExternalStore` with a minute-quantised snapshot (server
 *     `0`), because Next 16's `blocking-prerender-current-time` rejects
 *     clock reads during client render. The quantisation is load-bearing:
 *     an unquantised snapshot re-renders forever.
 *   - The auth gate mirrors `task-panel.tsx`: `useConvexAuth` from
 *     `@convex-dev/auth/react` (not `convex/react`), and Convex's "skip"
 *     literal until the anonymous session exists.
 */

import { useMemo, useState } from "react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import {
  customDayStart,
  localDateStr,
  MS_PER_DAY,
  presetRange,
  type RangePreset,
} from "@/lib/aggregations";
import { useNow } from "@/lib/use-now";
import { useTzOffsetMinutes } from "@/lib/use-tz-offset";

import { EmptyStateView } from "./empty-state";
import { FocusChartView } from "./focus-chart";
import { FocusHeatmapView } from "./focus-heatmap";
import { HeadlinesView } from "./headlines";
import { ProjectDonutView } from "./project-donut";
import { RangeSelectorView } from "./range-selector";
import { SessionHistoryView } from "./session-history";
import { SessionsChartView } from "./sessions-chart";
import { TimeOfDayView } from "./time-of-day";
import { TopTasksView } from "./top-tasks-table";
import { TrendsView } from "./trends";

/** The heatmap's window: the trailing 365 local days, always. */
const HEATMAP_DAYS = 365;

export function StatsPanel() {
  const { isAuthenticated } = useConvexAuth();
  const tzOffsetMinutes = useTzOffsetMinutes();
  const now = useNow();

  const [preset, setPreset] = useState<RangePreset>("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Untouched custom inputs default to the last 7 local days - derived from
  // the store snapshot, never read fresh from the clock during render.
  const defaultStart =
    now === 0 ? "" : localDateStr(now - 6 * MS_PER_DAY, tzOffsetMinutes);
  const defaultEnd = now === 0 ? "" : localDateStr(now, tzOffsetMinutes);

  const range = useMemo(() => {
    if (now === 0) {
      return null;
    }
    if (preset !== "custom") {
      return presetRange(preset, now, tzOffsetMinutes);
    }
    try {
      const start = customDayStart(customStart || defaultStart, tzOffsetMinutes);
      const end =
        customDayStart(customEnd || defaultEnd, tzOffsetMinutes) + MS_PER_DAY;
      return start < end ? { start, end } : null;
    } catch {
      return null;
    }
  }, [now, preset, customStart, customEnd, defaultStart, defaultEnd, tzOffsetMinutes]);

  const ready = isAuthenticated && range !== null;
  const stats = useQuery(
    api.stats.rangeStats,
    ready
      ? {
          start: range.start,
          end: range.end,
          tzOffsetMinutes,
        }
      : "skip",
  );
  const history = useQuery(
    api.stats.history,
    ready ? { start: range.start, end: range.end, limit: 100 } : "skip",
  );

  // The heatmap's own query - a fixed trailing year, settled separately so
  // it can render even while the main range is empty.
  const heatmapWindow = useMemo(() => {
    if (now === 0 || !isAuthenticated) {
      return null;
    }
    try {
      const end = customDayStart(localDateStr(now, tzOffsetMinutes), tzOffsetMinutes) + MS_PER_DAY;
      return { start: end - HEATMAP_DAYS * MS_PER_DAY, end };
    } catch {
      return null;
    }
  }, [now, isAuthenticated, tzOffsetMinutes]);
  const heatmapStats = useQuery(
    api.stats.rangeStats,
    heatmapWindow
      ? { ...heatmapWindow, tzOffsetMinutes }
      : "skip",
  );

  const settled = stats !== undefined && history !== undefined;
  const isEmpty =
    settled &&
    stats.totals.focusSessions === 0 &&
    stats.totals.breakSessions === 0;

  // The heatmap is the analysis page's calendar picker: clicking a day
  // switches to that day's custom range; the ring mirrors the custom day.
  const pickDay = (dayKey: string) => {
    setPreset("custom");
    setCustomStart(dayKey);
    setCustomEnd(dayKey);
  };
  const selectedDay =
    preset === "custom" &&
    customStart !== "" &&
    customStart === (customEnd || defaultEnd)
      ? customStart
      : null;

  return (
    <div className="space-y-8">
      <RangeSelectorView
        value={{ preset, customStart: customStart || defaultStart, customEnd: customEnd || defaultEnd }}
        onChange={(next) => {
          setPreset(next.preset);
          setCustomStart(next.customStart);
          setCustomEnd(next.customEnd);
        }}
      />

      {!settled || range === null ? (
        <EmptyStateView />
      ) : (
        <>
          <HeadlinesView stats={stats} days={stats.perDay} />

          {heatmapStats !== undefined && heatmapStats !== null && (
            <FocusHeatmapView
              days={heatmapStats.perDay.map((day) => ({
                date: day.dayKey,
                count: Math.round(day.focusMs / 60_000),
              }))}
              selectedDate={selectedDay}
              onPickDay={pickDay}
            />
          )}

          {!isEmpty ? (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <FocusChartView days={stats.perDay} />
                <SessionsChartView days={stats.perDay} />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TrendsView deltas={stats.deltas} days={stats.perDay} />
                <TimeOfDayView hours={stats.timeOfDay} />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ProjectDonutView slices={stats.perProject} />
                <TopTasksView slices={stats.topTasks} />
              </div>

              <div>
                <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  History
                </h2>
                <SessionHistoryView rows={history.sessions} now={now === 0 ? 0 : now} />
              </div>
            </>
          ) : (
            <EmptyStateView />
          )}
        </>
      )}
    </div>
  );
}
