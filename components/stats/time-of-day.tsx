"use client";

/**
 * Time-of-day distribution - Arc's BarChart over the 24 hour buckets
 * (ADR-006). Sessions land in the hour each one *started* in, converted
 * with its own recorded offset (never the runtime's) - the bucketing is
 * still `timeOfDayHistogram` in `lib/aggregations.ts`, untouched.
 *
 * The peak-hour readout above the chart survives verbatim: it is the
 * card's own answer, not a decoration. Axis labels thin to every third
 * hour (Arc counts back from the latest slot, so the newest hour always
 * has a label).
 */

import { BarChart } from "@/components/arc/bar-chart/bar-chart";

const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function TimeOfDayView({ hours }: { hours: number[] }) {
  const peak = Math.max(0, ...hours);
  const peakHour = hours.indexOf(peak);

  return (
    <div className="rounded-2xl bg-surface-container-low/30 p-5">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        Time of day
      </p>
      <p className="mb-3 text-sm text-on-surface-variant">
        {peak === 0 ? (
          "No focus yet in this range"
        ) : (
          <>
            Peak hour{" "}
            <span className="font-mono font-bold text-on-surface">
              {String(peakHour).padStart(2, "0")}:00
            </span>
          </>
        )}
      </p>
      <BarChart
        data={hours.map((count, hour) => ({
          key: String(hour),
          label: `${String(hour).padStart(2, "0")}:00`,
          axisLabel: hour % 3 === 0 ? String(hour).padStart(2, "0") : undefined,
          value: count,
        }))}
        label="Focus sessions by hour of day"
        period="24h"
        unit="sessions"
        height={130}
        showAverage={peak > 0}
        averageLabel="Per-hour average"
        valueLabel="Sessions"
        formatValue={grouped.format}
      />
    </div>
  );
}
