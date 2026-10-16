"use client";

/**
 * The Timer Engine — Task 7.
 *
 * The left column of the canonical two-column composition (ADR-004): ring,
 * readout, controls. It owns the store binding; everything beneath it is
 * presentational.
 *
 * The ring's progress is derived from the same `remainingMs` the digits
 * show, so the two can never disagree — there is no second source of truth
 * for elapsed time anywhere in the UI.
 */

import {
  durationMs,
  type TimerStatus,
} from "@/lib/pomodoro";
import { useCountdown, usePhaseCompletion, useTimerStore } from "@/lib/store/timer";

import { ProgressRing, type RingVariant } from "./progress-ring";
import { TimerControls } from "./timer-controls";
import { TimerReadout } from "./timer-readout";

/** The ring reads the store's status directly; it is already this shape. */
const RING_VARIANT: Record<TimerStatus, RingVariant> = {
  idle: "idle",
  running: "running",
  paused: "paused",
};

export function TimerEngine() {
  const state = useTimerStore((s) => s.state);
  const settings = useTimerStore((s) => s.settings);
  const start = useTimerStore((s) => s.start);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const reset = useTimerStore((s) => s.reset);
  const skip = useTimerStore((s) => s.skip);
  const remaining = useCountdown();
  // Watches the same `remaining` this component renders with, so the
  // moment the face reaches zero is the moment the phase is finished and
  // logged — no second clock, no second source of truth (Task 8).
  usePhaseCompletion(remaining);

  const total = durationMs(state.phase, settings);
  const progress = total > 0 ? 1 - remaining / total : 0;

  return (
    <section
      aria-label="Timer engine"
      className="flex w-full max-w-xs min-w-0 flex-col items-center justify-center"
    >
      {/* `@container` so the readout can size itself to the ring rather than
          to the viewport — the digits nest inside the circle at every width
          instead of overflowing it on a narrow one. */}
      <div className="relative flex aspect-square w-full @container items-center justify-center">
        <ProgressRing variant={RING_VARIANT[state.status]} progress={progress} />
        <TimerReadout
          remaining={remaining}
          cyclePosition={state.cyclePosition}
          sessionCount={settings.sessionCount}
        />
      </div>

      <TimerControls
        phase={state.phase}
        status={state.status}
        onStart={start}
        onPause={pause}
        onResume={resume}
        onReset={reset}
        onSkip={skip}
      />
    </section>
  );
}
