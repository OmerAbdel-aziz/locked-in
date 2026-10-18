"use client";

/**
 * Trends vs. the previous period (ADR-006).
 *
 * The old rule stands, written down twice: *every* delta paints the same
 * muted tone - `formatMinutes`/`formatCount` text is never colored by its
 * sign (PRD A4.1). Only the arrow glyph carries direction; the color
 * carries nothing.
 *
 * The addition is Arc's Sparkline: a quiet neutral-filled trace of the
 * per-day focus minutes so the shape of the period is visible without a
 * second chart. Non-interactive on purpose - the scrubbing lives in the
 * two per-day bar cards where exact comparison is the point; here rhythm
 * is. `change` stays unset so the sparkline never grows a colored badge.
 */

import { Sparkline } from "@/components/arc/sparkline/sparkline";
import type { DayBucket, TrendDeltas } from "@/lib/aggregations";

function formatMinutes(deltaMs: number): string {
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes === 0) {
    return "±0m";
  }
  return `${minutes > 0 ? "+" : "\u2212"}${Math.abs(minutes)}m`;
}

function formatCount(delta: number, unit: string): string {
  if (delta === 0) {
    return `±0 ${unit}`;
  }
  return `${delta > 0 ? "+" : "\u2212"}${Math.abs(delta)} ${unit}`;
}

export function TrendsView({
  deltas,
  days,
}: {
  deltas: TrendDeltas;
  days: DayBucket[];
}) {
  const rows = [
    {
      label: "Focus time",
      value: formatMinutes(deltas.focusMs),
    },
    {
      label: "Sessions",
      value: formatCount(deltas.focusSessions, "sessions"),
    },
    {
      label: "Break time",
      value: formatMinutes(deltas.breakMs),
    },
  ];

  return (
    <div className="flex h-full flex-col rounded-2xl bg-surface-container-low/30 p-5">
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
            {/* One muted tone at every value - see this file's header. */}
            <span className="font-mono text-on-surface-variant">
              <span aria-hidden="true">
                {row.value.startsWith("+")
                  ? "\u2191 "
                  : row.value.startsWith("\u2212")
                    ? "\u2193 "
                    : "\u2194 "}
              </span>
              {row.value}
            </span>
          </li>
        ))}
      </ul>
      {days.length > 1 && (
        // The period's shape: per-day focus minutes, quiet, no scrub.
        <div className="mt-4">
          <Sparkline
            data={days.map((day) => Math.round(day.focusMs / 60_000))}
            label="Focus minutes per day this period"
            area
            interactive={false}
            height={36}
          />
        </div>
      )}
    </div>
  );
}
