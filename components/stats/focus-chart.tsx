"use client";

/**
 * Focus-time bar chart - now Arc's BarChart (ADR-006), replacing the
 * hand-rolled SVG the PRD's A11.5 originally specified.
 *
 * What Arc adds: a scrub-to-read headline (hover, drag, or arrow keys),
 * a spring-eased average rule, morphing bars when the range changes, and a
 * screen-reader data table under the plot. What the app keeps: the tonal
 * card shell and the fixed-format data mapping - one bar per device-local
 * day, minutes, oldest first - so server and client print identical text.
 *
 * Heights are no longer ours to pin (`data-bar-height` is gone with the
 * hand-rolled rectangles); the rendered-view tests read Arc's exposed
 * surface - the hidden data table and the labeled scrubber - instead.
 */

import { BarChart } from "@/components/arc/bar-chart/bar-chart";
import type { DayBucket } from "@/lib/aggregations";

import { dayFull, periodLabel } from "./format";

const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function FocusChartView({ days }: { days: DayBucket[] }) {
  const data = days.map((day) => ({
    key: day.dayKey,
    label: dayFull(day.dayKey),
    axisLabel: day.dayKey.slice(8, 10),
    value: Math.round(day.focusMs / 60_000),
  }));

  return (
    <div className="rounded-2xl bg-surface-container-low/30 p-5">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        Focus time per day
      </p>
      <BarChart
        data={data}
        label="Focus time per day"
        period={periodLabel(days)}
        unit="min"
        height={150}
        formatValue={grouped.format}
      />
    </div>
  );
}
