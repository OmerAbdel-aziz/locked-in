/**
 * Focus / Short Break / Long Break selector — Task 7, relocated above the
 * ring in the Phase 9 polish, re-drawn as hand-rolled pills.
 *
 * These look like navigation but behave as a mode switch: selecting one
 * repositions the engine through `setPhase` — it is neither a completion
 * nor a skip, so it never advances the cycle. It lives with the timer it
 * drives (centered above the ring) rather than in the header.
 *
 * Pills, not tabs: HeroUI `Tabs`' underline indicator is a thin rule (the
 * one marker this design does not draw), and its indicator geometry breaks
 * with the longer labels ("Short Break") at compact type sizes. The switch
 * therefore uses the segmented-language the rest of the app already draws —
 * a pill track (`bg-surface-container p-1`) with the selected option taking
 * the strongest tonal step (`bg-surface-container-highest`), never a line.
 * Tab semantics (role=tablist / role=tab + aria-selected) stay, and the
 * segments are native buttons, so keyboard focus and Enter/Space work.
 *
 * Disabled while the timer runs: `selectPhase` abandons whatever is running
 * with no session logged (lib/pomodoro.ts), so a tap mid-run — now directly
 * above the digits being stared at — would silently kill the session. Pause
 * or wait for idle to switch modes.
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
  const status = useTimerStore((s) => s.state.status);
  const setPhase = useTimerStore((s) => s.setPhase);

  return (
    <div className="mb-6 flex w-full justify-center">
      <div
        role="tablist"
        aria-label="Timer mode"
        className="flex items-center gap-1 rounded-full bg-surface-container p-1"
      >
        {PHASES.map((candidate) => {
          const selected = phase === candidate;
          return (
            <button
              key={candidate}
              id={candidate}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-disabled={status === "running" ? true : undefined}
              // `aria-disabled` guards semantics; the guarded branch guards
              // behaviour — a click on a disabled tab abandons nothing.
              onClick={() => {
                if (status !== "running") {
                  setPhase(candidate);
                }
              }}
              className={`rounded-full px-4 py-1 text-xs font-semibold tracking-tight transition-colors duration-150 ${
                selected
                  ? "bg-surface-container-highest text-on-surface"
                  : "text-on-surface-variant hover:text-on-surface"
              }${status === "running" ? " cursor-not-allowed opacity-50" : ""}`}
            >
              {PHASE_LABEL[candidate]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
