import { create } from "zustand";
import { useCallback, useEffect, useSyncExternalStore } from "react";

// `import type` only: erased at build, so the store still imports no client,
// no env var and no server code — the seam that keeps it unit-testable stays
// intact. What this buys is the *type* `Id<"tasks">`, so the binding handed
// to `logCompleted` is the same nominal id the mutation's validator expects
// instead of a bare `string` that would need a cast (and could be cast
// wrongly) at the network boundary.
import type { Id } from "@/convex/_generated/dataModel";

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
import { ensurePermissionOnFirstStart, notifyPhaseEnd } from "@/lib/notify";

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
 * The selected task, and the project it was filed under when it was read —
 * Task 11 (PRD §4.1).
 *
 * `projectId` is carried alongside so the session's snapshot can be taken in
 * the same instant as the binding, rather than looked up later from a task
 * that may since have been re-filed.
 */
export interface ActiveTask {
  taskId: Id<"tasks">;
  projectId?: Id<"projects">;
}

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
  /**
   * The selection **as it stood when this phase began** — D8 binds at start
   * and the binding is immutable afterwards, so this is a snapshot taken by
   * `start`/`complete`, never a live read of `activeTask` at completion.
   * Absent when the phase began with nothing selected.
   */
  taskId?: Id<"tasks">;
  /** The same instant's project snapshot (PRD §6). */
  projectId?: Id<"projects">;
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

/**
 * The in-app phase-end signal — Task 17.
 *
 * Set on *every* completion, whether or not a browser notification was
 * shown: when permission is denied (or the API is missing) this is the
 * signal the user still sees, and when a notification did fire it is the
 * same fact in a second place. `at` is the completion instant, data rather
 * than a clock read, so rendering it never consults `Date.now()`.
 */
export interface PhaseNotice {
  phase: Phase;
  at: number;
}

export interface TimerStore {
  state: TimerState;
  settings: TimerSettings;

  /**
   * The notifications toggle from `settings` (Task 16). Kept beside — not
   * inside — `TimerSettings` because the engine never reads it: it is not
   * a duration or a transition policy, and `completePhase` must stay a pure
   * function of phase + settings + now for the equivalence test to mean
   * anything. The sync component (`components/settings/settings-sync.tsx`)
   * keeps this level with the server row.
   */
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;

  /** The latest phase-end signal; cleared by `start`, dismissed by the UI. */
  phaseNotice: PhaseNotice | null;
  dismissNotice: () => void;

  /**
   * The Focus Shroud toggle — Task 18.
   *
   * Display-only, like `notificationsEnabled`: the engine never reads it, so
   * it lives beside the state rather than inside it and the equivalence test
   * is unaffected. Default ON; the veil itself is still gated on a running
   * focus phase (see `shouldShroudActive`), so this is a preference, not a
   * second source of truth for whether a session is running.
   */
  shroudEnabled: boolean;
  setShroudEnabled: (enabled: boolean) => void;

  /**
   * The selection — which task the *next* phase to begin will bind to
   * (PRD §4.1). Fed by the panel, the one place that knows both the id and
   * the project the task is filed under.
   *
   * Changing it never disturbs `boundTask`, and that is deliberate: D8 says
   * a session is assigned at start and immutable thereafter, so clicking
   * another task mid-session must not be able to re-target the one running.
   */
  activeTask: ActiveTask | null;
  setActiveTask: (task: ActiveTask | null) => void;

  /**
   * The binding of the phase that is currently running, snapshotted the
   * moment it began. It is `null` exactly while `state.startedAt` is — the
   * invariant that makes "was this session bound?" answerable without a
   * second flag: a running phase has a binding, an idle one has none.
   */
  boundTask: ActiveTask | null;

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

/**
 * The binding the phase described by `next` should hold — Task 11's one rule.
 *
 * D8: a session is assigned to `activeTaskId` **at start**, immutable
 * thereafter. Stated as a function of two adjacent states rather than as a
 * flag set inside each action, because there are four distinct ways a phase
 * can begin or end and a rule applied in one place cannot be forgotten in
 * another.
 *
 *   - **`next` is idle** → nothing is running, so nothing is bound. Reset,
 *     switching tabs, and a skip whose next phase does not auto-start all
 *     land here.
 *   - **same phase with its clock still live** → pause, resume, and `start()`
 *     called on a phase already running. These are interruptions of *this*
 *     session, so the binding it began with stands no matter how often the
 *     selection changed while they happened.
 *   - **otherwise** a new phase began — `start` from idle, or `enterPhase`
 *     auto-starting the next one after a completion or skip — so it binds
 *     the selection *as it is now*.
 *
 * That last branch is why a task picked during a break receives the focus
 * session that follows, while a task picked during that focus session does
 * not receive it.
 */
function nextBinding(
  previous: TimerState,
  next: TimerState,
  selection: ActiveTask | null,
  bound: ActiveTask | null,
): ActiveTask | null {
  if (next.startedAt === null) {
    return null;
  }
  if (previous.startedAt !== null && previous.phase === next.phase) {
    return bound;
  }
  return selection;
}

export const useTimerStore = create<TimerStore>((set, get) => {
  /**
   * Applies an engine transition *and* re-derives the in-flight binding.
   *
   * Every state change funnels through here — including ones that look
   * incapable of affecting a binding, such as pause — so the invariant "a
   * running phase has a binding, an idle one has none" holds by
   * construction rather than by every action remembering it. `extra` exists
   * for the one caller that changes something alongside the state
   * (`setSettings`); the derived fields are written last and always win.
   */
  const transition = (next: TimerState, extra?: Partial<TimerStore>): void => {
    const { state: previous, activeTask, boundTask } = get();
    set({
      ...extra,
      state: next,
      boundTask: nextBinding(previous, next, activeTask, boundTask),
    });
  };

  return {
    state: initialTimerState(),
    settings: DEFAULT_SETTINGS,
    notificationsEnabled: true,
    shroudEnabled: true,

    phaseNotice: null,
    dismissNotice: () => set({ phaseNotice: null }),

    activeTask: null,
    boundTask: null,

    // Selection only: `boundTask` is deliberately untouched here, which is
    // precisely D8's requirement. A session running right now keeps the
    // binding it began with, whatever is clicked in the meantime.
    setActiveTask: (activeTask) => set({ activeTask }),

    sessionLogger: null,
    setSessionLogger: (sessionLogger) => set({ sessionLogger }),

    setNotificationsEnabled: (notificationsEnabled) =>
      set({ notificationsEnabled }),

    setShroudEnabled: (shroudEnabled) => set({ shroudEnabled }),

    start: () => {
      // Task 17: the one and only permission prompt. It runs from the Start
      // handler — never on load, never during render — and `notify.ts`
      // guarantees it can only ever prompt once per page lifetime. The
      // timer itself never waits on it: fire-and-forget by construction.
      void ensurePermissionOnFirstStart(get().notificationsEnabled).catch(
        () => {},
      );
      transition(startPhase(get().state, get().settings, Date.now()), {
        phaseNotice: null,
      });
    },

    pause: () => transition(pauseTimer(get().state, Date.now())),

    resume: () =>
      transition(resumeTimer(get().state, get().settings, Date.now())),

    reset: () => transition(resetTimer(get().state)),

    skip: () => transition(skipPhase(get().state, get().settings, Date.now())),

    complete: () => {
      const now = Date.now();
      // Read *before* the transition: `boundTask` here is the binding of the
      // phase that is about to end, not whatever the next one picks up.
      const { state, settings, sessionLogger, boundTask } = get();

      // Transition first, and unconditionally. PRD §9 is explicit that the
      // timer never waits on a network round-trip, so a writer that throws
      // must not be able to leave the face frozen at 00:00 — the cycle moves
      // whether or not the row gets away.
      transition(completePhase(state, settings, now));

      // Task 17: the phase-end signal. The browser notification is attempted
      // — silently skipped when off, unsupported, or not permitted — and the
      // in-app notice is recorded either way, so a denied permission still
      // leaves something visible. Neither can throw into the transition
      // above: it already happened.
      notifyPhaseEnd(state.phase, get().notificationsEnabled);
      set({ phaseNotice: { phase: state.phase, at: now } });

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
          // Absent, not null, when the phase began with nothing selected —
          // so `logCompleted` sees no argument at all rather than a pointer
          // to nothing. Both fields are snapshots from *this* phase's start.
          taskId: boundTask?.taskId,
          projectId: boundTask?.projectId,
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
      transition(selectPhase(get().state, phase, get().settings)),

    setSettings: (patch) => {
      const settings = { ...get().settings, ...patch };
      transition(normalizeState(get().state, settings), { settings });
    },
  };
});

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

  // Deliberately **not** dependency-gated, and that is the whole point.
  //
  // `remaining` is computed from `ceil(now / 250) * 250` — an instant up to
  // 250ms *ahead* of the clock, so the face reads a smooth second-by-second
  // countdown. It therefore latches at its clamped zero slightly before
  // `phaseEndsAt` is actually reached. That first zero fires this effect
  // once, `completeIfDue` reads the real clock and rightly declines — and
  // with a dependency array nothing could ever ask again: `remaining`
  // cannot change away from 0, and `status` stays "running". The phase then
  // sits at 00:00 forever and no session is ever written, which is precisely
  // what the live run reproduced.
  //
  // Re-checking after every render is safe because `completeIfDue` re-reads
  // the clock and is idempotent by construction (Task 8), and this component
  // only re-renders on the countdown's own tick while a phase is running.
  useEffect(() => {
    if (status === "running" && remaining === 0) {
      completeIfDue();
    }
  });
}
