import { create } from "zustand";
import { useEffect, useState } from "react";

import {
  DEFAULT_SETTINGS,
  completePhase,
  initialTimerState,
  normalizeState,
  pauseTimer,
  remainingMs,
  resetTimer,
  resumeTimer,
  selectPhase,
  skipPhase,
  startPhase,
  type Phase,
  type TimerSettings,
  type TimerState,
} from "@/lib/pomodoro";

/**
 * The timer store — Task 6.
 *
 * This module holds state and hands every transition to the engine in
 * `lib/pomodoro.ts`. That is deliberate and is the acceptance criterion:
 * an action body is a call to the engine, never an arithmetic expression.
 * Cycle rules live in exactly one place, so the UI and the tests cannot
 * disagree about them.
 *
 * Nothing here reads the clock except the action wrappers, which pass
 * `Date.now()` in as the engine's injected `now`.
 */

export interface TimerStore {
  state: TimerState;
  settings: TimerSettings;

  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  /** Advance without the current focus session counting. */
  skip: () => void;
  /** The current phase ran out — this is the one that counts. */
  complete: () => void;
  /** Focus / Short / Long tabs. */
  setPhase: (phase: Phase) => void;
  setSettings: (patch: Partial<TimerSettings>) => void;
}

export const useTimerStore = create<TimerStore>((set, get) => ({
  state: initialTimerState(),
  settings: DEFAULT_SETTINGS,

  start: () =>
    set({ state: startPhase(get().state, get().settings, Date.now()) }),

  pause: () => set({ state: pauseTimer(get().state, Date.now()) }),

  resume: () =>
    set({ state: resumeTimer(get().state, get().settings, Date.now()) }),

  reset: () => set({ state: resetTimer(get().state) }),

  skip: () =>
    set({ state: skipPhase(get().state, get().settings, Date.now()) }),

  complete: () =>
    set({ state: completePhase(get().state, get().settings, Date.now()) }),

  setPhase: (phase) =>
    set({ state: selectPhase(get().state, phase, get().settings) }),

  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings, state: normalizeState(get().state, settings) });
  },
}));

/**
 * How often the countdown re-renders, in ms.
 *
 * A pomodoro face reads at second granularity, so four updates a second is
 * visually indistinguishable from a per-frame one and costs far less.
 *
 * This is a *display cadence, not a correctness mechanism*. The value is
 * recomputed from `phaseEndsAt - now` on every tick, so throttled or missed
 * ticks cannot drift it — a backgrounded tab that fires once a second, or
 * not at all, still shows the right time when it is looked at again.
 */
export const COUNTDOWN_TICK_MS = 250;

/**
 * Remaining ms for the current phase, re-rendered on a short interval.
 *
 * There is no accumulator here on purpose: the number is derived from the
 * wall clock each tick, which is what lets the app survive tab
 * backgrounding and device sleep (PRD §10.2).
 */
export function useCountdown(): number {
  const state = useTimerStore((s) => s.state);
  const settings = useTimerStore((s) => s.settings);
  // `now` lags by at most one tick after a phase transition. That is
  // harmless: `remainingMs` clamps to [0, duration] and the face reads at
  // mm:ss, so a sub-second lag can never surface as a wrong value.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state.status !== "running") {
      // Idle and paused need no ticks: idle reads the full duration and
      // paused is frozen at `pausedAt`, neither of which depends on `now`.
      return;
    }

    const id = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(id);
  }, [state.status, state.phaseEndsAt]);

  return remainingMs(state, settings, now);
}
