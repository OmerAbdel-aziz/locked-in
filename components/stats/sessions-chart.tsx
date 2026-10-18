"use client";

/**
 * Completed-sessions bar chart - the focus chart's sibling, the same Arc
 * BarChart component (ADR-006). One focus session is one earned leaf, so
 * the value per day is the leaf-count shape of the same range the focus
 * chart times.
 */

import { BarChart } from "@/components/arc/bar-chart/bar-chart";
import type { DayBucket } from "@/lib/aggregations";

import { dayFull, periodLabel } from "./format";

const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function SessionsChartView({ days }: { days: DayBucket[] }) {
  const data = days.map((day) => ({
    key: day.dayKey,
    label: dayFull(day.dayKey),
    axisLabel: day.dayKey.slice(8, 10),
    value: day.sessions,
  }));

  return (
    <div className="rounded-2xl bg-surface-container-low/30 p-5">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        Focus sessions per day
      </p>
      <BarChart
        data={data}
        label="Focus sessions per day"
        period={periodLabel(days)}
        unit="sessions"
        height={150}
        formatValue={grouped.format}
      />
    </div>
  );
}
