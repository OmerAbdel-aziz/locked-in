"use client";

/**
 * The Summary bento — Task 12, PRD §4.1 "Summary bento".
 *
 * Two passive readouts under the task list: today's total focus time, and
 * the completion ratio (completed leaves ÷ estimated leaves — the same
 * metric `/stats` will surface over a range, scoped here to today, which is
 * what the panel above it is scoped to).
 *
 * "Passive" is a requirement, not a mood (PRD §4.1): no gate, no
 * celebration, no threshold state, and no color-coded pass/fail. The Focus
 * Score is painted `primary` at every value by the design's own markup — a
 * constant brand accent, not a judgement. The invariant worth testing is
 * precisely that the color never *varies* with the number.
 *
 * The auth split mirrors `task-panel.tsx`, which documents why at length:
 * `useConvexAuth` comes from `@convex-dev/auth/react`, not `convex/react`,
 * because only the former agrees with `ConvexAuthProvider`.
 */

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { useTzOffsetMinutes } from "@/lib/use-tz-offset";
import { Card } from "@heroui/react";

export interface SummaryData {
  /** Today's total focus time, in minutes. Breaks are not work and never count. */
  focusMinutes: number;
  /** Focus sessions completed today — one session is one earned leaf. */
  completedLeaves: number;
  /** The estimates of the tasks currently on the board. */
  estimatedLeaves: number;
}

/** The bento's markup, pure, so the formatting is testable without Convex.
 *
 * HeroUI mapping (PRD D6a, Phase 3.5d): each tile is a Card. The ghost
 * border and tonal fill stay as classes — the tiles' surfaces are DESIGN.md
 * tonal treatments, not prominence levels a variant prop could name.
 */
export function SummaryBentoView({ summary }: { summary: SummaryData }) {
  const hours = summary.focusMinutes / 60;
  // No denominator means no ratio — showing "0%" would report a failure for
  // a question nobody asked (an empty board, on a new account's first hour).
  const score =
    summary.estimatedLeaves === 0
      ? null
      : Math.round((summary.completedLeaves / summary.estimatedLeaves) * 100);

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card className="rounded-2xl border border-outline-variant/5 bg-surface-container-low/30 p-5">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Today&apos;s Output
        </p>
        <p className="text-2xl font-bold tracking-tight text-on-surface">
          {hours.toFixed(1)}
          <span className="ml-1 text-sm font-normal text-on-surface-variant">
            hrs
          </span>
        </p>
      </Card>

      <Card className="rounded-2xl border border-outline-variant/5 bg-surface-container-low/30 p-5">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Focus Score
        </p>
        {/* `text-primary` at every value — see this file's header. */}
        <p className="text-2xl font-bold tracking-tight text-primary">
          {score === null ? "—" : `${score}%`}
        </p>
      </Card>
    </div>
  );
}

/**
 * The mounted bento. The tz offset is an argument because the server cannot
 * know the device's midnight (PRD D5) — see `lib/use-tz-offset.ts` for why
 * reading it is done that way.
 */
export function SummaryBento() {
  const { isAuthenticated } = useConvexAuth();
  const tzOffsetMinutes = useTzOffsetMinutes();
  const summary = useQuery(
    api.tasks.todaySummary,
    isAuthenticated ? { tzOffsetMinutes } : "skip",
  );

  return (
    // While the query settles, the honest default is the same one a brand-new
    // account sees — nothing done yet — rather than a spinner or a
    // placeholder number on its way from somewhere.
    <SummaryBentoView
      summary={summary ?? { focusMinutes: 0, completedLeaves: 0, estimatedLeaves: 0 }}
    />
  );
}
