"use client";

/**
 * The active-task card — Task 12, PRD §4.1 "Session progress".
 *
 * Left column, under the timer controls: the design's glassmorphism card
 * (`code.html`'s "Active Task Card"), reading which task currently receives
 * sessions and how far into its estimate the log has carried it. The
 * pulsing dot is the design's own signal that something is live.
 *
 * It is a readout and nothing more (PRD §4.1 "Goal is a readout only",
 * ADR-004): no gate, no celebration, no threshold state. One element of the
 * design is deliberately absent — its `more_horiz` overflow button. Nothing
 * in MVP is configurable from it, and a button that does nothing is worse
 * than no button; it returns when there is a menu to open.
 *
 * The auth split mirrors `task-panel.tsx`, which documents why at length:
 * `useConvexAuth` comes from `@convex-dev/auth/react`, not `convex/react`,
 * because only the former agrees with `ConvexAuthProvider`.
 */

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { Card } from "@heroui/react";

import { api } from "@/convex/_generated/api";

export interface ProgressCardData {
  taskId: string;
  title: string;
  estimate: number;
  leaves: number;
}

/**
 * The card's markup, pure. `data` is `null` for "nothing selected" and is
 * never `undefined`: the bound component collapses the settling query into
 * `null`, so there is one empty case, not two.
 *
 * HeroUI mapping (PRD D6a, Phase 3.5d): Card carries the design's
 * glassmorphism (`glass-panel`) and its ghost border
 * (`border-outline-variant` at 10%) — the surface tokens stay theme-aware
 * through the classes, not through a variant prop, because the ghost border
 * is a DESIGN.md invention no variant expresses.
 */
export function ProgressCardView({ data }: { data: ProgressCardData | null }) {
  // A task may exceed its estimate — a finished task keeps receiving focus
  // time until another is selected — and the bar's own extent may not.
  const width =
    data === null || data.estimate === 0
      ? 0
      : Math.min(100, (data.leaves / data.estimate) * 100);

  return (
    <Card className="glass-panel w-full max-w-xs space-y-4 rounded-xl border border-outline-variant/10 p-6">
      <div className="flex items-center gap-3">
        {/* The dot pulses only while something is actually selected: a live
            pulse over "nothing selected" would claim activity that is not
            there. */}
        <span
          className={`h-2 w-2 rounded-full ${
            data === null
              ? "bg-on-surface-variant"
              : "animate-pulse bg-primary"
          }`}
          aria-hidden="true"
        />
        <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          Currently Active
        </span>
      </div>

      {data === null ? (
        // Calm and specific: no fabricated title, no "0 / 0 Pomodoros"
        // pretending to be a measurement (PRD §4.1, and the same stance the
        // stats surface takes for new users).
        <p className="text-sm text-on-surface-variant">
          Nothing selected yet
        </p>
      ) : (
        <Card.Content className="space-y-2">
          <p className="text-xl font-semibold tracking-tight text-on-surface">
            {data.title}
          </p>
          <div className="space-y-2">
            <div className="flex justify-between font-mono text-[10px] text-on-surface-variant">
              <span>Progress</span>
              <span>
                {data.leaves} / {data.estimate} Pomodoros
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-sanctuary"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        </Card.Content>
      )}
    </Card>
  );
}

/**
 * The mounted card. Sits in the left column beside the timer, so it owns
 * the placement (`mt-6` — the design's `space-y-6` between the controls and
 * this card — and the timer's own `max-w-md` measure) while the view above
 * stays ignorant of where it lives.
 */
export function ProgressCard() {
  const { isAuthenticated } = useConvexAuth();
  const card = useQuery(
    api.tasks.progressCard,
    // Gated exactly as the panel gates its queries: a call that resolves an
    // owner cannot be issued before there is a session to resolve one from.
    isAuthenticated ? {} : "skip",
  );

  return (
    <div className="mt-6 w-full max-w-xs">
      <ProgressCardView data={card ?? null} />
    </div>
  );
}
