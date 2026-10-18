"use client";

/**
 * The headline grid - four stat cards over the range (ADR-006).
 *
 * Arc content, app shell: the tonal cards stay (`rounded-2xl
 * bg-surface-container-low/30`, the surface every other tile renders),
 * while the *numbers* are Arc's AnimatedCounter - digit wheels that roll
 * on view and on change, reduced-motion aware. MetricCard itself is not
 * used: it ships a 1px box border and a sign-colored change badge, both
 * of which violate DESIGN.md on this page (no-lines, muted deltas).
 *
 * The focus card carries an extra Arc Sparkline - the shape of the
 * period under the headline (see `trends.tsx` for the reasoning).
 */

import { AnimatedCounter } from "@/components/arc/animated-counter/animated-counter";
import { Sparkline } from "@/components/arc/sparkline/sparkline";
import type { DayBucket, RangeAggregation } from "@/lib/aggregations";

export function HeadlinesView({
  stats,
  days,
}: {
  stats: RangeAggregation;
  days: DayBucket[];
}) {
  const completion =
    stats.completion.ratio === null
      ? null
      : Math.round(stats.completion.ratio * 100);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div className="rounded-2xl bg-surface-container-low/30 p-5">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Focus time
        </p>
        <div className="font-mono text-2xl font-bold tracking-tight text-on-surface">
          <AnimatedCounter
            value={Number((stats.totals.focusMs / 3_600_000).toFixed(1))}
            decimals={1}
            suffix=" hrs"
            animateOnView
          />
        </div>
        <Sparkline
          data={days.map((day) => Math.round(day.focusMs / 60_000))}
          label="Focus minutes per day"
          area
          interactive={false}
          height={36}
          width={200}
        />
      </div>

      <div className="rounded-2xl bg-surface-container-low/30 p-5">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Sessions
        </p>
        <div className="font-mono text-2xl font-bold tracking-tight text-on-surface">
          <AnimatedCounter
            value={stats.totals.focusSessions}
            suffix=""
            animateOnView
          />
        </div>
      </div>

      <div className="rounded-2xl bg-surface-container-low/30 p-5">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Break time
        </p>
        <div className="font-mono text-2xl font-bold tracking-tight text-on-surface">
          <AnimatedCounter
            value={Number((stats.totals.breakMs / 3_600_000).toFixed(1))}
            decimals={1}
            suffix=" hrs"
            animateOnView
          />
        </div>
      </div>

      <div className="rounded-2xl bg-surface-container-low/30 p-5">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Completion
        </p>
        <p className="text-2xl font-bold tracking-tight text-primary">
          {completion === null ? (
            "\u2014"
          ) : (
            <span className="font-mono">
              {/* Passive readout at every value - the bento's rule. */}
              <AnimatedCounter value={completion} suffix="%" animateOnView />
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
