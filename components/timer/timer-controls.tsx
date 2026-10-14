/**
 * Timer controls — Task 7.
 *
 * A primary gradient CTA over two ghost buttons. Presentational: the engine
 * container owns the store, so this stays a pure function of its props.
 *
 * The design's paused screen ships only the Start CTA, but PRD §4.1 requires
 * all three controls (Start/Pause, Reset, Skip), so Reset and Skip are added
 * here in the design's ghost style rather than inventing a new one.
 */

import type { Phase, TimerStatus } from "@/lib/pomodoro";

export interface TimerControlsProps {
  phase: Phase;
  status: TimerStatus;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onSkip: () => void;
}

const PHASE_LABEL: Record<Phase, string> = {
  focus: "Focus Session",
  short: "Short Break",
  long: "Long Break",
};

/**
 * The primary CTA's label.
 *
 * Idle names the phase you are about to start; running offers the way out;
 * paused offers the way back in.
 */
export function primaryLabel(phase: Phase, status: TimerStatus): string {
  switch (status) {
    case "running":
      return "Pause";
    case "paused":
      return "Resume";
    case "idle":
      return `Start ${PHASE_LABEL[phase]}`;
  }
}

export function TimerControls({
  phase,
  status,
  onStart,
  onPause,
  onResume,
  onReset,
  onSkip,
}: TimerControlsProps) {
  const activatePrimary =
    status === "running" ? onPause : status === "paused" ? onResume : onStart;

  return (
    <div className="mt-12 w-full max-w-md space-y-4">
      {/* Primary CTA — signature 145° gradient, never a flat fill. */}
      <button
        type="button"
        onClick={activatePrimary}
        className="cta-gradient w-full rounded-xl py-5 text-lg font-bold tracking-tight text-on-primary shadow-[0_20px_50px_-12px_rgba(75,226,119,0.2)] transition-all duration-150 ease-sanctuary active:scale-95"
      >
        {primaryLabel(phase, status)}
      </button>

      {/* Ghost controls: no background until hovered (DESIGN.md §5). */}
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-xl px-6 py-3 text-sm font-semibold text-on-surface/70 transition-colors duration-150 ease-sanctuary hover:bg-surface-container-high hover:text-on-surface"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-xl px-6 py-3 text-sm font-semibold text-on-surface/70 transition-colors duration-150 ease-sanctuary hover:bg-surface-container-high hover:text-on-surface"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
