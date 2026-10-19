"use client";

/**
 * Per-project donut - the analysis view (ADR-006).
 *
 * Arc's DonutChart: one slice per project ("No project" for unbound
 * work), stable color per key (hash-ordered through the `--series-*`
 * palette, not data order - a project keeps its hue when the
 * distribution re-sorts), automatic "Other" grouping past six segments,
 * and a synced legend whose rows toggle segments. Values are whole
 * focus minutes; the whole is "Focus".
 *
 * `groupBelow` groups slivers below a 2% share, so the ring never
 * renders a wedge thinner than its gap.
 */

import { DonutChart } from "@/components/arc/donut-chart/donut-chart";
import { NO_PROJECT_LABEL, type ProjectSlice } from "@/lib/aggregations";

import { seriesColorFor } from "./format";

const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function ProjectDonutView({ slices }: { slices: ProjectSlice[] }) {
  return (
    <div className="rounded-2xl bg-surface-container-low/30 p-5">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        Focus by project
      </p>
      <DonutChart
        data={slices.map((slice) => ({
          key: slice.projectId ?? NO_PROJECT_LABEL,
          label: slice.name,
          value: Number((slice.focusMs / 3_600_000).toFixed(1)),
          color: seriesColorFor(slice.projectId ?? NO_PROJECT_LABEL),
        }))}
        label="Focus time by project"
        unit="hrs"
        totalLabel="Focus"
        size={168}
        thickness={16}
        groupBelow={0.02}
        maxSegments={6}
        otherLabel="Other"
        emptyLabel="No focus yet"
        formatValue={grouped.format}
      />
    </div>
  );
}
