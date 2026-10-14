/**
 * Focus / Short Break / Long Break selector — Task 7.
 *
 * These look like navigation but behave as a mode switch, so they are
 * buttons with `aria-pressed` rather than links to routes that do not exist.
 * Selecting one repositions the engine through `setPhase` — it is neither a
 * completion nor a skip, so it never advances the cycle.
 *
 * The active underline is a control affordance present in the design
 * itself; it is not a section divider, so it does not touch DESIGN.md's
 * no-line rule.
 */

"use client";

import { PHASES, type Phase } from "@/lib/pomodoro";
import { useTimerStore } from "@/lib/store/timer";

const PHASE_LABEL: Record<Phase, string> = {
  focus: "Focus",
  short: "Short Break",
  long: "Long Break",
};

export function ModeTabs() {
  const phase = useTimerStore((s) => s.state.phase);
  const setPhase = useTimerStore((s) => s.setPhase);

  return (
    <nav aria-label="Timer mode" className="flex h-full items-center gap-8">
      {PHASES.map((candidate) => {
        const isActive = candidate === phase;
        return (
          <button
            key={candidate}
            type="button"
            aria-pressed={isActive}
            onClick={() => setPhase(candidate)}
            className={`flex h-full items-center border-b-2 pb-1 transition-colors duration-150 ease-sanctuary ${
              isActive
                ? "border-primary font-bold text-primary"
                : "border-transparent font-medium text-on-surface/60 hover:text-on-surface"
            }`}
          >
            {PHASE_LABEL[candidate]}
          </button>
        );
      })}
    </nav>
  );
}
