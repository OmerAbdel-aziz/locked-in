"use client";

/**
 * The year heatmap - Arc's ActivityHeatmap (ADR-006).
 *
 * Fixed period: always the trailing 365 device-local days, independent of
 * the range selector (Today/Week presets would render slivers a grid
 * cannot speak). One square per day; the count is focus *minutes*, so the
 * level thresholds auto-scale to your busiest day the way the Arc
 * component intends.
 *
 * Click-through: selecting a day hands the page its custom single-day
 * range - the heatmap is also the calendar picker for the whole analysis,
 * and the selection ring (`selectedDate`) mirrors whatever day the custom
 * controls name.
 */

import { ActivityHeatmap } from "@/components/arc/activity-heatmap/activity-heatmap";

export interface HeatmapDay {
  /** `YYYY-MM-DD`, oldest first. */
  date: string;
  /** Focus minutes completing that day. */
  count: number;
}

export function FocusHeatmapView({
  days,
  selectedDate,
  onPickDay,
}: {
  days: HeatmapDay[];
  selectedDate: string | null;
  onPickDay: (dayKey: string) => void;
}) {
  const period = days.at(-1)?.date.slice(0, 4) ?? "";

  return (
    <div className="rounded-2xl bg-surface-container-low/30 p-5">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        Focus rhythm, last year
      </p>
      <ActivityHeatmap
        days={days}
        label={`Focus minutes per day, ${period}`}
        period={period}
        unit={{ one: "minute", other: "minutes" }}
        weekStartsOn={1}
        selectedDate={selectedDate}
        onSelectDate={onPickDay}
      />
    </div>
  );
}
