import { create } from "zustand";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  DEFAULT_SETTINGS,
  completePhase,
  initialTimerState,
  isPhaseComplete,
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

/**
 * One phase that ran to its own end — Task 8's hand-off to the session log.
 *
 * `startedAt`/`completedAt` are ms since epoch from the *client's* clock,
 * because that is the clock `phaseEndsAt` was anchored to; a server clock
 * would disagree with it. `tzOffsetAtCompletion` is the ISO-8601 UTC offset
 * (east positive) at `completedAt`, recorded at completion rather than
 * queried later, so a session is bucketed into the local day it actually
 * ended in even if the user's timezone changes afterwards (PRD §6).
 */
export interface CompletedPhase {
  phase: Phase;
  startedAt: number;
  completedAt: number;
  tzOffsetAtCompletion: number;
}

/**
 * How a completed phase becomes a `sessions` row.
 *
 * Injected rather than imported: the store is a plain module, so it cannot
 * reach a `useMutation` hook, and making it reach a Convex client directly
 * would mean unit tests imported a client built from an env var they don't
 * have. The same seam the engine offers for `now`, for persistence.
 */
export type SessionLogger = (entry: CompletedPhase) => void;

export interface TimerStore {
  state: TimerState;
  settings: TimerSettings;

  /**
   * Where a completed phase is recorded. `null` until the app injects one,
   * and `null` in every test that doesn't care — completion still happens,
   * it simply leaves no row behind.
   */
  sessionLogger: SessionLogger | null;
  setSessionLogger: (logger: SessionLogger | null) => void;

  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  /** Advance without the current focus session counting. */
  skip: () => void;
  /**
   * The current phase ran out — advance the cycle and, if the phase had
   * actually begun, hand the finished span to `sessionLogger`. The write
   * lives here rather than in `completeIfDue` so there is exactly one
   * place a session row can be produced, and no future caller of
   * `complete()` can forget to log what it finished.
   */
  complete: () => void;
  /**
   * The countdown hit zero on its own: finish the phase, but only if the
   * phase really is due. Returns whether this call was the one that
   * completed it, so callers and tests can tell a real completion from a
   * repeated tick.
   */
  completeIfDue: () => boolean;
  /** Focus / Short / Long tabs. */
  setPhase: (phase: Phase) => void;
  setSettings: (patch: Partial<TimerSettings>) => void;
}

export const useTimerStore = create<TimerStore>((set, get) => ({
  state: initialTimerState(),
  settings: DEFAULT_SETTINGS,

  sessionLogger: null,
  setSessionLogger: (sessionLogger) => set({ sessionLogger }),

  start: () =>
    set({ state: startPhase(get().state, get().settings, Date.now()) }),

  pause: () => set({ state: pauseTimer(get().state, Date.now()) }),

  resume: () =>
    set({ state: resumeTimer(get().state, get().settings, Date.now()) }),

  reset: () => set({ state: resetTimer(get().state) }),

  skip: () =>
    set({ state: skipPhase(get().state, get().settings, Date.now()) }),

  complete: () => {
    const now = Date.now();
    const { state, settings, sessionLogger } = get();

    // Transition first, and unconditionally. PRD §9 is explicit that the
    // timer never waits on a network round-trip, so a writer that throws
    // must not be able to leave the face frozen at 00:00 — the cycle moves
    // whether or not the row gets away.
    set({ state: completePhase(state, settings, now) });

    // A phase that never began has no span to record. `startedAt` is null
    // exactly while idle, so calling `complete()` on a waiting phase moves
    // the cycle and writes nothing — fabricating a start from the phase's
    // nominal duration would invent focus time that was never spent.
    if (state.startedAt === null || sessionLogger === null) {
      return;
    }

    // `phaseEndsAt` is when the phase *actually* ended, which matters when
    // a backgrounded tab only notices the boundary minutes late; `now` is
    // earlier than it whenever the phase was finished ahead of schedule.
    // Taking the earlier of the two is correct in both directions.
    const completedAt = Math.min(state.phaseEndsAt ?? now, now);

    try {
      sessionLogger({
        phase: state.phase,
        startedAt: state.startedAt,
        completedAt,
        tzOffsetAtCompletion: -new Date(completedAt).getTimezoneOffset(),
      });
    } catch (error) {
      // Logged, not rethrown: losing a row is bad, stranding the timer is
      // worse, and this write is fire-and-forget by design.
      console.error("locked-in: could not record the completed session", error);
    }
  },

  completeIfDue: () => {
    // The exactly-once gate. It reads the phase's own boundary rather than
    // a flag the caller sets, and the first completion *moves* that
    // boundary: the next phase either starts in the future or goes idle, so
    // a second entry returns false instead of appending a twin row. React
    // running an effect twice in development is the case this exists for —
    // without it, "exactly one session row" fails on the first StrictMode
    // render.
    if (!isPhaseComplete(get().state, Date.now())) {
      return false;
    }
    get().complete();
    return true;
  },

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
 *
 * The clock is treated as an **external store we subscribe to**, rather than
 * a value read during render. That is not a stylistic preference: this route
 * is statically prerendered, and Next.js fails the build when a client
 * component reads `Date.now()` while rendering — the value would be frozen
 * at build time instead of recomputed per visit (`blocking-prerender-current-time`).
 * `useSyncExternalStore` keeps the read out of render entirely: the server
 * snapshot is a constant, so the prerendered HTML needs no clock at all.
 *
 * The snapshot is quantised to the tick so two reads within the same tick
 * are identical. React treats a snapshot that changes between reads as an
 * unstable store and re-renders until it settles, so a raw `Date.now()`
 * here would spin. The cost is a `now` that trails reality by at most one
 * tick — the same 250ms the face already refreshes on, and it can never
 * surface as a wrong value because the readout rounds up to whole seconds.
 */
export const SERVER_TICK = 0;

export function useCountdown(): number {
  const state = useTimerStore((s) => s.state);
  const settings = useTimerStore((s) => s.settings);

  // Identity changes with `status`, so React re-subscribes on each phase
  // transition. Idle and paused subscribe to nothing: idle reads the full
  // duration and paused is frozen at `pausedAt`, so neither needs ticks.
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (state.status !== "running") {
        return () => {};
      }
      const id = setInterval(onChange, COUNTDOWN_TICK_MS);
      return () => clearInterval(id);
    },
    [state.status],
  );

  const tick = useSyncExternalStore(
    subscribe,
    () => Math.ceil(Date.now() / COUNTDOWN_TICK_MS),
    () => SERVER_TICK,
  );

  return remainingMs(state, settings, tick * COUNTDOWN_TICK_MS);
}

/**
 * Notices the phase running out and finishes it — Task 8.
 *
 * It takes `remaining` from the caller rather than subscribing itself, so
 * it rides the countdown's existing tick instead of adding a second
 * interval, and re-renders only when the face it is watching re-renders.
 *
 * This is an `useEffect` deliberately: completion is a *reaction* to the
 * observed value, and reacting during render would write to a store while
 * React is deciding what to draw. The work itself is a plain store action,
 * not a React state setter, so nothing here re-enters rendering.
 *
 * `remaining === 0` is a necessary but not sufficient condition — it only
 * says the boundary was crossed. `completeIfDue` decides whether the phase
 * is genuinely still due, which is what makes a second call a no-op.
 */
export function usePhaseCompletion(remaining: number): void {
  const status = useTimerStore((s) => s.state.status);
  const completeIfDue = useTimerStore((s) => s.completeIfDue);

  useEffect(() => {
    if (status === "running" && remaining === 0) {
      completeIfDue();
    }
  }, [remaining, status, completeIfDue]);
}
