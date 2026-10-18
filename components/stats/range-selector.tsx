"use client";

/**
 * Range selector - Arc's SegmentedControl for the four presets (ADR-006),
 * the custom `<input type="date">` pair unchanged.
 *
 * The native date inputs stay the one deliberate non-Arc control here:
 * they name *local* days, the panel converts them with the device offset
 * (`customDayStart`), and Arc's pickers would reformat calendar days by
 * the runtime's zone - the same reason the timer page keeps native
 * inputs for anything timezone-shaped.
 */

import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import type { RangePreset } from "@/lib/aggregations";

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "custom", label: "Custom" },
];

export interface RangeSelectorValue {
  preset: RangePreset;
  customStart: string;
  customEnd: string;
}

export function RangeSelectorView({
  value,
  onChange,
}: {
  value: RangeSelectorValue;
  onChange: (next: RangeSelectorValue) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        options={PRESETS}
        value={value.preset}
        onValueChange={(preset) =>
          onChange({ ...value, preset: preset as RangePreset })
        }
        label="Stats range"
      />

      {value.preset === "custom" && (
        <div className="flex items-center gap-2 text-xs text-on-surface-variant">
          <label className="flex items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest">
              From
            </span>
            <input
              type="date"
              value={value.customStart}
              onChange={(event) =>
                onChange({ ...value, customStart: event.target.value })
              }
              className="rounded-lg bg-surface-container-low/60 px-2 py-1 font-mono text-on-surface"
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest">
              To
            </span>
            <input
              type="date"
              value={value.customEnd}
              onChange={(event) =>
                onChange({ ...value, customEnd: event.target.value })
              }
              className="rounded-lg bg-surface-container-low/60 px-2 py-1 font-mono text-on-surface"
            />
          </label>
        </div>
      )}
    </div>
  );
}
