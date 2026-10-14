/**
 * The pomodoro engine — Task 5.
 *
 * Framework-free and pure: every function takes the current state plus an
 * injected `now` and returns new state. No `Date.now()` inside, no timers, no
 * side effects. That is what makes the "survives a 10-minute background gap"
 * guarantee testable rather than hopeful.
 *
 * The one rule that shapes the whole module: **`phaseEndsAt` is a wall-clock
 * instant, and remaining time is always derived as `phaseEndsAt - now`.**
 * There is deliberately no decrementing counter anywhere — a counter drifts
 * by however long the tab was throttled, an instant does not (PRD §10.2:
 * ≤ 1s drift after 10 minutes backgrounded).
 *
 * Cycle rule (PRD §4.1), the part worth stating twice: only *completing* a
 * focus session advances the cycle. Skipping it advances to the next phase
 * without counting, so skipping focus N hands you a short break, never the
 * long one.
 *
 * Cycle position is therefore "the focus session that will start next", 1..N.
 * After focus N completes, the long break is granted and the counter resets
 * to 1 in the same step.
 */

const MS_PER_MINUTE = 60_000;

export const PHASES = ["focus", "short", "long"] as const;

export type Phase = (typeof PHASES)[number];

/** The user's tunable durations and transition policy. */
export interface TimerSettings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  /** Focus sessions per cycle — the "of N" in "Session 3 of 4". */
  sessionCount: number;
  /** A focus phase ending starts the break automatically. */
  autoStartBreak: boolean;
  /** A break phase ending starts the next focus automatically. */
  autoStartFocus: boolean;
}

/**
 * Classic pomodoro defaults (PRD §4.1, decision D4).
 *
 * Frozen by the PRD: changing these transition defaults is an "ask first"
 * item (§9), so they live here as data rather than being scattered across
 * the store or the UI.
 */
export const DEFAULT_SETTINGS: TimerSettings = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  sessionCount: 4,
  autoStartBreak: true,
  autoStartFocus: false,
};

export type TimerStatus = "idle" | "running" | "paused";

export interface TimerState {
  phase: Phase;
  /** The focus session that will start next, clamped to 1..sessionCount. */
  cyclePosition: number;
  status: TimerStatus;
  /** Wall-clock ms when the running phase ends. Null unless running. */
  phaseEndsAt: number | null;
  /** Wall-clock ms the timer was paused at. Null unless paused. */
  pausedAt: number | null;
}

/** Duration of a phase in ms, from the user's settings. */
export function durationMs(phase: Phase, settings: TimerSettings): number {
  switch (phase) {
    case "focus":
      return settings.focusMin * MS_PER_MINUTE;
    case "short":
      return settings.shortMin * MS_PER_MINUTE;
    case "long":
      return settings.longMin * MS_PER_MINUTE;
  }
}

/** Guard against a `sessionCount` of 0 or less producing nonsense. */
function safeSessionCount(settings: TimerSettings): number {
  return Math.max(1, Math.floor(settings.sessionCount));
}

/** Cycle position clamped into 1..sessionCount, e.g. after settings change. */
function clampPosition(position: number, settings: TimerSettings): number {
  const count = safeSessionCount(settings);
  if (!Number.isFinite(position)) {
    return 1;
  }
  return Math.min(Math.max(1, Math.floor(position)), count);
}

/**
 * The resting state: focus, session 1, full duration waiting to be started.
 *
 * Takes no settings — the opening state is the same for every configuration.
 */
export function initialTimerState(): TimerState {
  return {
    phase: "focus",
    cyclePosition: 1,
    status: "idle",
    phaseEndsAt: null,
    pausedAt: null,
  };
}

/**
 * How much of the current phase is left, in ms.
 *
 * Derived — never decremented — so an arbitrary jump in `now` (backgrounded
 * tab, suspended laptop, user changing the clock) simply produces the right
 * answer. Clamped to [0, duration]: a backwards clock jump must not make a
 * phase longer than it is.
 */
export function remainingMs(
  state: TimerState,
  settings: TimerSettings,
  now: number,
): number {
  const total = durationMs(state.phase, settings);

  if (state.status === "paused") {
    // Frozen at the pause instant: pausing must not consume the phase.
    if (state.phaseEndsAt === null || state.pausedAt === null) {
      return total;
    }
    return clamp(state.phaseEndsAt - state.pausedAt, total);
  }

  if (state.status === "running") {
    if (state.phaseEndsAt === null) {
      return total;
    }
    return clamp(state.phaseEndsAt - now, total);
  }

  return total;
}

function clamp(value: number, total: number): number {
  if (!Number.isFinite(value)) {
    return total;
  }
  return Math.min(Math.max(0, value), total);
}

/** True once a running phase has reached (or passed) its end instant. */
export function isPhaseComplete(state: TimerState, now: number): boolean {
  return (
    state.status === "running" &&
    state.phaseEndsAt !== null &&
    now >= state.phaseEndsAt
  );
}

/**
 * Where a focus phase leaves us.
 *
 * `counted` is the whole difference between completing and skipping:
 * completing focus N grants the long break and resets the counter, while
 * skipping it hands over a short break and leaves the counter alone.
 */
function afterFocus(
  sessionNumber: number,
  settings: TimerSettings,
  counted: boolean,
): { phase: Phase; cyclePosition: number } {
  const count = safeSessionCount(settings);

  if (counted && sessionNumber >= count) {
    return { phase: "long", cyclePosition: 1 };
  }
  if (counted) {
    return { phase: "short", cyclePosition: sessionNumber + 1 };
  }
  return { phase: "short", cyclePosition: sessionNumber };
}

/**
 * Decide the next phase from the current one.
 *
 * @param counted whether the current focus phase counts as completed. Breaks
 *        always "count" — only focus phases are ever skipped past.
 */
function nextPhase(
  state: TimerState,
  settings: TimerSettings,
  counted: boolean,
): { phase: Phase; cyclePosition: number } {
  if (state.phase === "focus") {
    return afterFocus(state.cyclePosition, settings, counted);
  }
  // A break of either length always leads back to focus, and never moves the
  // cycle: skipping a break just gets you to work sooner.
  return { phase: "focus", cyclePosition: state.cyclePosition };
}

/**
 * Place the next phase into the returned state.
 *
 * Auto-start is applied uniformly here — whether the phase ended by running
 * out or was skipped — so the policy lives in one place and behaves the same
 * for both. Idle means "waiting for the user"; running means it began at `now`.
 */
function enterPhase(
  next: { phase: Phase; cyclePosition: number },
  settings: TimerSettings,
  now: number,
  autoStart: boolean,
): TimerState {
  const position = clampPosition(next.cyclePosition, settings);

  if (!autoStart) {
    return {
      phase: next.phase,
      cyclePosition: position,
      status: "idle",
      phaseEndsAt: null,
      pausedAt: null,
    };
  }

  return {
    phase: next.phase,
    cyclePosition: position,
    status: "running",
    phaseEndsAt: now + durationMs(next.phase, settings),
    pausedAt: null,
  };
}

/** Begin the current phase from idle. Running or paused, it is a no-op —
 * use `resumeTimer` to continue a paused phase without losing time. */
export function startPhase(
  state: TimerState,
  settings: TimerSettings,
  now: number,
): TimerState {
  if (state.status !== "idle") {
    return state;
  }
  return {
    ...state,
    status: "running",
    phaseEndsAt: now + durationMs(state.phase, settings),
    pausedAt: null,
  };
}

/** Freeze the phase at its current remaining time. No-op when not running. */
export function pauseTimer(state: TimerState, now: number): TimerState {
  if (state.status !== "running") {
    return state;
  }
  return {
    ...state,
    status: "paused",
    pausedAt: now,
  };
}

/**
 * Continue a paused phase.
 *
 * The end instant is recomputed from *now* plus what was left, so the time
 * spent paused is not charged to the phase — pause for ten minutes, resume,
 * and ten minutes remain.
 */
export function resumeTimer(
  state: TimerState,
  settings: TimerSettings,
  now: number,
): TimerState {
  if (state.status !== "paused") {
    return state;
  }
  return {
    ...state,
    status: "running",
    phaseEndsAt: now + remainingMs(state, settings, now),
    pausedAt: null,
  };
}

/**
 * Stop the current phase and return it to idle at full duration.
 *
 * The phase and cycle position are kept: resetting is about *this* timer, and
 * the cycle's real progress lives in the session log (ADR-003), not in client
 * state, so there is nothing here worth rewinding.
 */
export function resetTimer(state: TimerState): TimerState {
  return {
    ...state,
    status: "idle",
    phaseEndsAt: null,
    pausedAt: null,
  };
}

/**
 * A focus phase ran out. Counts: the cycle advances, and the long break is
 * granted on the last session of the cycle.
 */
export function completePhase(
  state: TimerState,
  settings: TimerSettings,
  now: number,
): TimerState {
  const next = nextPhase(state, settings, true);
  const autoStart =
    next.phase === "focus" ? settings.autoStartFocus : settings.autoStartBreak;
  return enterPhase(next, settings, now, autoStart);
}

/**
 * Abandon the current phase without it counting.
 *
 * This is the rule the acceptance criteria single out: skipping focus N does
 * *not* grant the long break, because nothing was completed. The counter
 * stays where it was, so the long break is still owed to an actual completed
 * session later.
 */
export function skipPhase(
  state: TimerState,
  settings: TimerSettings,
  now: number,
): TimerState {
  const next = nextPhase(state, settings, false);
  const autoStart =
    next.phase === "focus" ? settings.autoStartFocus : settings.autoStartBreak;
  return enterPhase(next, settings, now, autoStart);
}

/**
 * Re-clamp a state after the settings changed underneath it.
 *
 * Dropping `sessionCount` from 4 to 2 while sitting on session 3 would
 * otherwise leave "Session 3 of 2" on screen. Normalising keeps the state
 * coherent without pretending the change was a phase transition.
 */
export function normalizeState(
  state: TimerState,
  settings: TimerSettings,
): TimerState {
  const position = clampPosition(state.cyclePosition, settings);
  if (position === state.cyclePosition) {
    return state;
  }
  return { ...state, cyclePosition: position };
}

/**
 * Jump directly to a phase — the Focus / Short / Long tabs (Task 6).
 *
 * Choosing a phase by hand is not completion and not a skip, so it moves
 * neither the cycle nor the timer: it repositions the engine and waits.
 */
export function selectPhase(
  state: TimerState,
  phase: Phase,
  settings: TimerSettings,
): TimerState {
  if (state.phase === phase) {
    return state;
  }
  return {
    phase,
    cyclePosition: clampPosition(state.cyclePosition, settings),
    status: "idle",
    phaseEndsAt: null,
    pausedAt: null,
  };
}
