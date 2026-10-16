"use client";

/**
 * Range selector — Task 20, PRD §4.1 "Range selector: Today / 7 days /
 * 30 days / custom".
 *
 * Pure view over a preset + two `YYYY-MM-DD` strings; the UTC-window math
 * lives in `lib/aggregations.ts` (`presetRange`, `customDayStart`) so the
 * selector itself owns no dates. The custom date inputs are plain
 * `<input type="date">` — the one native control whose affordance needs no
 * invention — naming *local* days, which the panel converts with the
 * device offset.
 */

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
      <div
        className="flex items-center gap-1 rounded-full bg-surface-container-low/60 p-1"
        role="tablist"
        aria-label="Stats range"
      >
        {PRESETS.map((preset) => {
          const selected = value.preset === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange({ ...value, preset: preset.value })}
              className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide transition-colors duration-500 ease-sanctuary ${
                selected
                  ? "bg-surface-container-highest text-on-surface"
                  : "text-on-surface-variant"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

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
