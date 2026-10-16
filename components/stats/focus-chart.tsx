/**
 * Focus-time bar chart — Task 20, hand-rolled SVG (PRD §11.5).
 *
 * DESIGN.md tonal style: primary-gradient bars, no axes chrome, no lines —
 * the only text is micro day labels and a total, both muted. Heights come
 * from `computeBarHeights` in `lib/aggregations.ts`, so the "correct
 * relative heights from fixture data" criterion is a pure-function oracle
 * plus a markup assertion on `data-bar-height`, never a screenshot.
 *
 * Pure view: props in, SVG out, no hooks — which is also what keeps it
 * renderable on the server without touching the clock.
 */

import { computeBarHeights } from "@/lib/aggregations";
import type { DayBucket } from "@/lib/aggregations";

export const FOCUS_CHART_HEIGHT = 120;

export function FocusChartView({ days }: { days: DayBucket[] }) {
  const heights = computeBarHeights(
    days.map((day) => day.focusMs),
    FOCUS_CHART_HEIGHT,
  );
  const totalMinutes = days.reduce(
    (sum, day) => sum + day.focusMs / 60_000,
    0,
  );

  const width = Math.max(days.length * 14, 1);
  const barWidth = days.length === 0 ? 0 : Math.min(10, width / days.length - 4);

  return (
    <div className="rounded-2xl bg-surface-container-low/30 p-5">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        Focus time
      </p>
      <p className="mb-3 font-mono text-2xl font-bold tracking-tight text-on-surface">
        {(totalMinutes / 60).toFixed(1)}
        <span className="ml-1 text-sm font-normal text-on-surface-variant">
          hrs
        </span>
      </p>
      <svg
        viewBox={`0 0 ${width} ${FOCUS_CHART_HEIGHT + 18}`}
        className="w-full"
        role="img"
        aria-label={`Focus time per day, total ${(totalMinutes / 60).toFixed(1)} hours`}
      >
        <defs>
          <linearGradient id="stats-focus-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4be277" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        {days.map((day, index) => {
          const height = heights[index];
          const x = index * 14 + (14 - barWidth) / 2;
          const labelEvery = Math.max(1, Math.ceil(days.length / 8));
          return (
            <g key={day.dayKey}>
              <title>{`${day.dayKey}: ${(day.focusMs / 60_000).toFixed(0)} min`}</title>
              <rect
                x={x}
                y={FOCUS_CHART_HEIGHT - height}
                width={barWidth}
                height={Math.max(height, 0)}
                rx={Math.min(3, barWidth / 2)}
                fill="url(#stats-focus-gradient)"
                opacity={height === 0 ? 0.15 : 1}
                data-day={day.dayKey}
                data-bar-height={height}
              />
              {index % labelEvery === 0 && (
                <text
                  x={index * 14 + 7}
                  y={FOCUS_CHART_HEIGHT + 14}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#bccbb9"
                >
                  {day.dayKey.slice(8, 10)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
