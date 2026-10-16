"use client";

/**
 * The mounted `/stats` panel — Tasks 20–22.
 *
 * Owns the range state (preset + custom dates), converts it to a UTC window
 * with the device offset, and issues the two bounded queries from
 * `convex/stats.ts`. Everything rendered below is a pure view over the
 * answers, so the page settles into the same calm empty state a new account
 * sees whenever the range holds no sessions.
 *
 * Two clock rules, both inherited:
 *   - `now` arrives via `useSyncExternalStore` (server snapshot `0`, never
 *     used for a query) because Next 16's `blocking-prerender-current-time`
 *     rejects clock reads during client render — the same rule that shaped
 *     `useCountdown` (Task 7) and `useTzOffsetMinutes` (Task 12).
 *   - The auth gate mirrors `task-panel.tsx`: `useConvexAuth` from
 *     `@convex-dev/auth/react` (not `convex/react`), and Convex's `"skip"`
 *     literal until the anonymous session exists.
 */

import { useMemo, useState, useSyncExternalStore } from "react";
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
import { useTzOffsetMinutes } from "@/lib/use-tz-offset";

import { PerProjectView, TopTasksView } from "./breakdown";
import { EmptyStateView } from "./empty-state";
import { FocusChartView } from "./focus-chart";
import { RangeSelectorView } from "./range-selector";
import { SessionHistoryView } from "./session-history";
import { SessionsChartView } from "./sessions-chart";
import { TimeOfDayView } from "./time-of-day";
import { TrendsView } from "./trends";

function useNow(): number {
  return useSyncExternalStore(
    () => () => {},
    () => Date.now(),
    () => 0,
  );
}

export function StatsPanel() {
  const { isAuthenticated } = useConvexAuth();
  const tzOffsetMinutes = useTzOffsetMinutes();
  const now = useNow();

  const [preset, setPreset] = useState<RangePreset>("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Untouched custom inputs default to the last 7 local days — derived from
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

  const settled = stats !== undefined && history !== undefined;
  const isEmpty =
    settled &&
    stats.totals.focusSessions === 0 &&
    stats.totals.breakSessions === 0;

  const completion =
    stats === undefined || stats.completion.ratio === null
      ? "—"
      : `${Math.round(stats.completion.ratio * 100)}%`;

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
      ) : isEmpty ? (
        <EmptyStateView />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl bg-surface-container-low/30 p-5">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Focus time
              </p>
              <p className="font-mono text-2xl font-bold tracking-tight text-on-surface">
                {(stats.totals.focusMs / 3_600_000).toFixed(1)}
                <span className="ml-1 text-sm font-normal text-on-surface-variant">
                  hrs
                </span>
              </p>
            </div>
            <div className="rounded-2xl bg-surface-container-low/30 p-5">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Sessions
              </p>
              <p className="font-mono text-2xl font-bold tracking-tight text-on-surface">
                {stats.totals.focusSessions}
              </p>
            </div>
            <div className="rounded-2xl bg-surface-container-low/30 p-5">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Break time
              </p>
              <p className="font-mono text-2xl font-bold tracking-tight text-on-surface">
                {(stats.totals.breakMs / 3_600_000).toFixed(1)}
                <span className="ml-1 text-sm font-normal text-on-surface-variant">
                  hrs
                </span>
              </p>
            </div>
            <div className="rounded-2xl bg-surface-container-low/30 p-5">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Completion
              </p>
              {/* Passive readout at every value — the bento's rule (Task 12). */}
              <p className="text-2xl font-bold tracking-tight text-primary">
                {completion}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FocusChartView days={stats.perDay} />
            <SessionsChartView days={stats.perDay} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TrendsView deltas={stats.deltas} />
            <TimeOfDayView hours={stats.timeOfDay} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PerProjectView slices={stats.perProject} />
            <TopTasksView slices={stats.topTasks} />
          </div>

          <div>
            <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              History
            </h2>
            <SessionHistoryView rows={history.sessions} />
          </div>
        </>
      )}
    </div>
  );
}
