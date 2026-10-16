/**
 * Trends panel — Task 21, PRD §4.1 "compare each metric to the immediately
 * preceding period of equal length (▲/▼ deltas, muted styling — insight
 * without judgment)".
 *
 * "Muted" is load-bearing: every delta paints the same
 * `text-on-surface-variant`, whichever direction it points. A delta that
 * turned green for up and coral for down would be the threshold state PRD
 * §4.1 forbids on the home screen, smuggled into `/stats`. The arrow carries
 * the direction; the color carries nothing. Pure view, no hooks.
 */

import type { TrendDeltas } from "@/lib/aggregations";

function formatMinutes(deltaMs: number): string {
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes === 0) {
    return "±0m";
  }
  return `${minutes > 0 ? "+" : "−"}${Math.abs(minutes)}m`;
}

function formatCount(delta: number, unit: string): string {
  if (delta === 0) {
    return `±0 ${unit}`;
  }
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)} ${unit}`;
}

export function TrendsView({ deltas }: { deltas: TrendDeltas }) {
  const rows = [
    {
      label: "Focus time",
      value: formatMinutes(deltas.focusMs),
      direction: Math.sign(deltas.focusMs),
    },
    {
      label: "Sessions",
      value: formatCount(deltas.focusSessions, "sessions"),
      direction: Math.sign(deltas.focusSessions),
    },
    {
      label: "Break time",
      value: formatMinutes(deltas.breakMs),
      direction: Math.sign(deltas.breakMs),
    },
  ];

  return (
    <div className="rounded-2xl bg-surface-container-low/30 p-5">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        Trends vs. previous period
      </p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-on-surface-variant">{row.label}</span>
            {/* One muted tone at every value — see this file's header. */}
            <span className="font-mono text-on-surface-variant">
              <span aria-hidden="true">
                {row.direction > 0 ? "▲ " : row.direction < 0 ? "▼ " : "— "}
              </span>
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
