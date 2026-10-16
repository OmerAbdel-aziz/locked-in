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

/**
 * Landscape floor for the viewBox (Phase 9 fix).
 *
 * The SVG sizes from `w-full` + its viewBox aspect, so a *portrait*
 * viewBox scales into a full-screen-tall chart: the 30-day default is
 * 420×138 (fine), but the 7-day range is 98×138 (~850px tall at a 600px
 * column) and a 1-day custom range ~5000px. Capping the viewBox width at
 * 3× its height bounds every range to a ~3:1 card; short ranges pad with
 * empty space and the bars stay centered. 30 days (420) exceeds the floor
 * and renders bit-identical to before.
 */
const MIN_VIEWBOX_WIDTH = 3 * (FOCUS_CHART_HEIGHT + 18);
/** One day occupies a 14-unit slot; the bar is 10 of it. */
const DAY_SLOT = 14;
const BAR_WIDTH = 10;

export function FocusChartView({ days }: { days: DayBucket[] }) {
  const heights = computeBarHeights(
    days.map((day) => day.focusMs),
    FOCUS_CHART_HEIGHT,
  );
  const totalMinutes = days.reduce(
    (sum, day) => sum + day.focusMs / 60_000,
    0,
  );

  const width = Math.max(days.length * DAY_SLOT, MIN_VIEWBOX_WIDTH);
  const barWidth = days.length === 0 ? 0 : BAR_WIDTH;
  // Center the bars in the padded viewBox so a short range doesn't hug one edge.
  const offsetX = (width - days.length * DAY_SLOT) / 2;

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
            {/* `var()` is invalid in presentation attributes, so the stops
                are inline styles; the series follows the active theme's
                accent (--chart-3 over its darker sibling --chart-1). */}
            <stop offset="0%" style={{ stopColor: "var(--chart-3)" }} />
            <stop offset="100%" style={{ stopColor: "var(--chart-1)" }} />
          </linearGradient>
        </defs>
        {days.map((day, index) => {
          const height = heights[index];
          const x = offsetX + index * DAY_SLOT + (DAY_SLOT - barWidth) / 2;
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
                  x={offsetX + index * DAY_SLOT + DAY_SLOT / 2}
                  y={FOCUS_CHART_HEIGHT + 14}
                  textAnchor="middle"
                  fontSize="9"
                  style={{ fill: "var(--muted)" }}
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
