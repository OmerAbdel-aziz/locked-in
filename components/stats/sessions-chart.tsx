/**
 * Completed-sessions chart — Task 20, the focus chart's sibling.
 *
 * Same hand-rolled SVG contract (gradient bars, no axes chrome, no lines,
 * heights from `computeBarHeights`): one focus session is one earned leaf,
 * so this is the leaf-count shape of the same range the focus chart times.
 * Pure view, no hooks.
 */

import { computeBarHeights } from "@/lib/aggregations";
import type { DayBucket } from "@/lib/aggregations";

export const SESSIONS_CHART_HEIGHT = 96;

/**
 * Landscape floor for the viewBox (Phase 9 fix) — same reasoning as
 * `focus-chart.tsx`: a portrait viewBox × `w-full` scaled the 7-day range
 * to ~700px tall and a 1-day custom range to thousands. 30 days (420)
 * exceeds the 342-unit floor and renders bit-identical.
 */
const MIN_VIEWBOX_WIDTH = 3 * (SESSIONS_CHART_HEIGHT + 18);
const DAY_SLOT = 14;
const BAR_WIDTH = 10;

export function SessionsChartView({ days }: { days: DayBucket[] }) {
  const heights = computeBarHeights(
    days.map((day) => day.sessions),
    SESSIONS_CHART_HEIGHT,
  );
  const total = days.reduce((sum, day) => sum + day.sessions, 0);

  const width = Math.max(days.length * DAY_SLOT, MIN_VIEWBOX_WIDTH);
  const barWidth = days.length === 0 ? 0 : BAR_WIDTH;
  const offsetX = (width - days.length * DAY_SLOT) / 2;

  return (
    <div className="rounded-2xl bg-surface-container-low/30 p-5">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        Focus sessions
      </p>
      <p className="mb-3 font-mono text-2xl font-bold tracking-tight text-on-surface">
        {total}
        <span className="ml-1 text-sm font-normal text-on-surface-variant">
          {total === 1 ? "session" : "sessions"}
        </span>
      </p>
      <svg
        viewBox={`0 0 ${width} ${SESSIONS_CHART_HEIGHT + 18}`}
        className="w-full"
        role="img"
        aria-label={`Completed focus sessions per day, total ${total}`}
      >
        <defs>
          <linearGradient
            id="stats-sessions-gradient"
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
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
              <title>{`${day.dayKey}: ${day.sessions} sessions`}</title>
              <rect
                x={x}
                y={SESSIONS_CHART_HEIGHT - height}
                width={barWidth}
                height={Math.max(height, 0)}
                rx={Math.min(3, barWidth / 2)}
                fill="url(#stats-sessions-gradient)"
                opacity={height === 0 ? 0.15 : 1}
                data-day={day.dayKey}
                data-bar-height={height}
              />
              {index % labelEvery === 0 && (
                <text
                  x={offsetX + index * DAY_SLOT + DAY_SLOT / 2}
                  y={SESSIONS_CHART_HEIGHT + 14}
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
