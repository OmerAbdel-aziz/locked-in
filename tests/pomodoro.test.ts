import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  completePhase,
  durationMs,
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
 * Task 5 gate: the pomodoro engine.
 *
 * Two properties carry the weight, and both come straight from the PRD:
 *
 *   1. Cycle math — only *completing* focus N grants the long break.
 *      Skipping N does not, because nothing was done.
 *   2. Time is anchored to a wall-clock instant, never decremented, so an
 *      arbitrary jump in `now` yields the right answer (PRD §10.2).
 *
 * `now` is always injected, so "ten minutes in a backgrounded tab" is one
 * addition rather than a sleep.
 */

const MIN = 60_000;
const T0 = 1_700_000_000_000; // arbitrary fixed epoch; the engine never reads the clock

/** Focus phase, session `position`, freshly started at `T0`. */
function runningFocus(
  settings: TimerSettings = DEFAULT_SETTINGS,
  position = 1,
): TimerState {
  return startPhase(
    { phase: "focus", cyclePosition: position, status: "idle", phaseEndsAt: null, pausedAt: null, startedAt: null },
    settings,
    T0,
  );
}

describe("defaults (PRD 4.1)", () => {
  it("matches the classic pomodoro defaults the PRD fixes", () => {
    // §9 lists "changing timer transition defaults" as an ask-first item, so
    // pin them here: any drift fails this test instead of silently changing
    // the product.
    expect(DEFAULT_SETTINGS).toEqual({
      focusMin: 25,
      shortMin: 5,
      longMin: 15,
      sessionCount: 4,
      autoStartBreak: true,
      autoStartFocus: false,
    });
  });

  it("opens on focus, session 1, idle and unstarted", () => {
    expect(initialTimerState()).toEqual({
      phase: "focus",
      cyclePosition: 1,
      status: "idle",
      phaseEndsAt: null,
      pausedAt: null,
      startedAt: null,
    });
  });

  it("derives each phase duration from settings", () => {
    expect(durationMs("focus", DEFAULT_SETTINGS)).toBe(25 * MIN);
    expect(durationMs("short", DEFAULT_SETTINGS)).toBe(5 * MIN);
    expect(durationMs("long", DEFAULT_SETTINGS)).toBe(15 * MIN);
  });
});

describe("cycle math — completing advances the cycle", () => {
  it("completing focus 1 of 4 moves to a short break, session 2", () => {
    const next = completePhase(runningFocus(DEFAULT_SETTINGS, 1), DEFAULT_SETTINGS, T0);
    expect(next.phase).toBe("short");
    expect(next.cyclePosition).toBe(2);
  });

  it("completing focus 3 of 4 moves to a short break, session 4", () => {
    const next = completePhase(runningFocus(DEFAULT_SETTINGS, 3), DEFAULT_SETTINGS, T0);
    expect(next.phase).toBe("short");
    expect(next.cyclePosition).toBe(4);
  });

  it("completing focus 4 of 4 grants the long break and resets the counter", () => {
    const next = completePhase(runningFocus(DEFAULT_SETTINGS, 4), DEFAULT_SETTINGS, T0);
    expect(next.phase).toBe("long");
    expect(next.cyclePosition).toBe(1);
  });

  it("completing a short break returns to focus without moving the counter", () => {
    const onBreak: TimerState = {
      phase: "short", cyclePosition: 3, status: "running", phaseEndsAt: T0, pausedAt: null, startedAt: T0,
    };
    const next = completePhase(onBreak, DEFAULT_SETTINGS, T0);
    expect(next.phase).toBe("focus");
    expect(next.cyclePosition).toBe(3);
  });

  it("completing a long break returns to focus at session 1", () => {
    const onBreak: TimerState = {
      phase: "long", cyclePosition: 1, status: "running", phaseEndsAt: T0, pausedAt: null, startedAt: T0,
    };
    const next = completePhase(onBreak, DEFAULT_SETTINGS, T0);
    expect(next.phase).toBe("focus");
    expect(next.cyclePosition).toBe(1);
  });

  it("walks a full cycle of four back to the long break", () => {
    let state = runningFocus(DEFAULT_SETTINGS, 1);
    for (let session = 1; session <= 4; session++) {
      state = completePhase(state, DEFAULT_SETTINGS, T0); // focus done -> break
      const expectedPhase: Phase = session === 4 ? "long" : "short";
      expect(state.phase, `after focus ${session}`).toBe(expectedPhase);
      state = completePhase(state, DEFAULT_SETTINGS, T0); // break done -> focus
      expect(state.phase).toBe("focus");
    }
    expect(state.cyclePosition).toBe(1);
  });

  it("honours a custom session count", () => {
    const settings: TimerSettings = { ...DEFAULT_SETTINGS, sessionCount: 2 };
    let state = runningFocus(settings, 1);

    state = completePhase(state, settings, T0); // focus 1 -> short
    expect(state.phase).toBe("short");
    state = completePhase(state, settings, T0); // short -> focus 2
    expect(state.phase).toBe("focus");
    state = completePhase(state, settings, T0); // focus 2 of 2 -> long
    expect(state.phase).toBe("long");
    expect(state.cyclePosition).toBe(1);
  });
});

describe("skip advances phase only — it never grants an early long break", () => {
  it("skipping focus 1 of 4 leaves the counter at 1", () => {
    const next = skipPhase(runningFocus(DEFAULT_SETTINGS, 1), DEFAULT_SETTINGS, T0);
    expect(next.phase).toBe("short");
    expect(next.cyclePosition).toBe(1);
  });

  it("skipping focus 4 of 4 gives a SHORT break, not the long one", () => {
    const next = skipPhase(runningFocus(DEFAULT_SETTINGS, 4), DEFAULT_SETTINGS, T0);
    expect(next.phase).toBe("short");
    expect(next.cyclePosition).toBe(4);
  });

  it("skipping a short break returns to focus, counter untouched", () => {
    const onBreak: TimerState = {
      phase: "short", cyclePosition: 2, status: "idle", phaseEndsAt: null, pausedAt: null, startedAt: null,
    };
    const next = skipPhase(onBreak, DEFAULT_SETTINGS, T0);
    expect(next.phase).toBe("focus");
    expect(next.cyclePosition).toBe(2);
  });

  it("skipping a long break returns to focus", () => {
    const onBreak: TimerState = {
      phase: "long", cyclePosition: 1, status: "idle", phaseEndsAt: null, pausedAt: null, startedAt: null,
    };
    expect(skipPhase(onBreak, DEFAULT_SETTINGS, T0).phase).toBe("focus");
  });

  it("the long break is still owed after a skip — completing later earns it", () => {
    // Skip focus 4 (no long break), work through the break, then actually
    // complete focus 4. Only now is the long break granted.
    let state = runningFocus(DEFAULT_SETTINGS, 4);
    state = skipPhase(state, DEFAULT_SETTINGS, T0);
    expect(state.phase).toBe("short");
    state = completePhase(state, DEFAULT_SETTINGS, T0);
    expect(state.phase).toBe("focus");
    expect(state.cyclePosition).toBe(4);
    state = completePhase(state, DEFAULT_SETTINGS, T0);
    expect(state.phase).toBe("long");
    expect(state.cyclePosition).toBe(1);
  });

  it("a skip mid-cycle does not consume the session", () => {
    let state = runningFocus(DEFAULT_SETTINGS, 3);
    state = skipPhase(state, DEFAULT_SETTINGS, T0); // abandoned, not completed
    state = completePhase(state, DEFAULT_SETTINGS, T0); // finish the break
    expect(state.phase).toBe("focus");
    expect(state.cyclePosition).toBe(3);
    state = completePhase(state, DEFAULT_SETTINGS, T0); // now actually do it
    expect(state.phase).toBe("short");
    expect(state.cyclePosition).toBe(4);
  });
});

describe("auto-start policy applies to both completing and skipping", () => {
  const off: TimerSettings = { ...DEFAULT_SETTINGS, autoStartBreak: false };
  const focusOn: TimerSettings = { ...DEFAULT_SETTINGS, autoStartFocus: true };

  it("focus ending auto-starts the break by default", () => {
    const next = completePhase(runningFocus(), DEFAULT_SETTINGS, T0);
    expect(next.status).toBe("running");
  });

  it("focus ending waits for the user when auto-start break is off", () => {
    const next = completePhase(runningFocus(off), off, T0);
    expect(next.status).toBe("idle");
    expect(next.phaseEndsAt).toBeNull();
  });

  it("break ending waits for the user by default", () => {
    const onBreak: TimerState = {
      phase: "short", cyclePosition: 2, status: "running", phaseEndsAt: T0, pausedAt: null, startedAt: T0,
    };
    const next = completePhase(onBreak, DEFAULT_SETTINGS, T0);
    expect(next.phase).toBe("focus");
    expect(next.status).toBe("idle");
  });

  it("break ending auto-starts focus when that toggle is on", () => {
    const onBreak: TimerState = {
      phase: "short", cyclePosition: 2, status: "running", phaseEndsAt: T0, pausedAt: null, startedAt: T0,
    };
    expect(completePhase(onBreak, focusOn, T0).status).toBe("running");
  });

  it("skipping obeys the same auto-start policy as completing", () => {
    expect(skipPhase(runningFocus(), DEFAULT_SETTINGS, T0).status).toBe("running");
    expect(skipPhase(runningFocus(off), off, T0).status).toBe("idle");
  });
});

describe("time-anchoring — remaining is derived, never decremented", () => {
  it("starts at the full duration", () => {
    expect(remainingMs(runningFocus(), DEFAULT_SETTINGS, T0)).toBe(25 * MIN);
  });

  it("counts down from the instant, not from tick count", () => {
    const state = runningFocus();
    // Three reads with wildly different gaps between them — the value depends
    // only on `now`, so a throttled tab cannot drift.
    expect(remainingMs(state, DEFAULT_SETTINGS, T0 + 1 * MIN)).toBe(24 * MIN);
    expect(remainingMs(state, DEFAULT_SETTINGS, T0 + 10 * MIN)).toBe(15 * MIN);
    expect(remainingMs(state, DEFAULT_SETTINGS, T0 + 10 * MIN + 1)).toBe(15 * MIN - 1);
  });

  it("survives a ten-minute background gap with no drift", () => {
    // PRD 10.2: after 10 minutes backgrounded the reading must be exact.
    const state = runningFocus();
    expect(remainingMs(state, DEFAULT_SETTINGS, T0 + 10 * MIN)).toBe(15 * MIN);
  });

  it("reaches zero once the phase has run out", () => {
    const state = runningFocus();
    expect(remainingMs(state, DEFAULT_SETTINGS, T0 + 25 * MIN)).toBe(0);
    expect(remainingMs(state, DEFAULT_SETTINGS, T0 + 90 * MIN)).toBe(0);
  });

  it("clamps to the duration when the clock jumps backwards", () => {
    // A clock that jumps back must not stretch a phase beyond its length.
    const state = runningFocus();
    expect(remainingMs(state, DEFAULT_SETTINGS, T0 - 60 * MIN)).toBe(25 * MIN);
  });

  it("reports phase completion at the boundary", () => {
    const state = runningFocus();
    expect(isPhaseComplete(state, T0 + 25 * MIN - 1)).toBe(false);
    expect(isPhaseComplete(state, T0 + 25 * MIN)).toBe(true);
    expect(isPhaseComplete(state, T0 + 40 * MIN)).toBe(true);
  });

  it("does not report completion while idle or paused", () => {
    const idle = initialTimerState();
    expect(isPhaseComplete(idle, T0 + 60 * MIN)).toBe(false);
    const paused = pauseTimer(runningFocus(), T0 + 5 * MIN);
    expect(isPhaseComplete(paused, T0 + 60 * MIN)).toBe(false);
  });
});

describe("pause and resume — paused time is not charged to the phase", () => {
  it("freezes the remaining time at the pause instant", () => {
    const paused = pauseTimer(runningFocus(), T0 + 10 * MIN);
    expect(paused.status).toBe("paused");
    expect(remainingMs(paused, DEFAULT_SETTINGS, T0 + 10 * MIN)).toBe(15 * MIN);
  });

  it("keeps the frozen value while paused, however long the gap", () => {
    const paused = pauseTimer(runningFocus(), T0 + 10 * MIN);
    expect(remainingMs(paused, DEFAULT_SETTINGS, T0 + 10 * MIN)).toBe(15 * MIN);
    expect(remainingMs(paused, DEFAULT_SETTINGS, T0 + 40 * MIN)).toBe(15 * MIN);
    expect(remainingMs(paused, DEFAULT_SETTINGS, T0 + 1000 * MIN)).toBe(15 * MIN);
  });

  it("resuming after a ten-minute gap keeps exactly what was left", () => {
    const paused = pauseTimer(runningFocus(), T0 + 10 * MIN);
    // Ten minutes pass while the tab is in the background...
    const resumed = resumeTimer(paused, DEFAULT_SETTINGS, T0 + 20 * MIN);
    // ...and the phase still has the 15 minutes it had when paused.
    expect(remainingMs(resumed, DEFAULT_SETTINGS, T0 + 20 * MIN)).toBe(15 * MIN);
    expect(remainingMs(resumed, DEFAULT_SETTINGS, T0 + 30 * MIN)).toBe(5 * MIN);
  });

  it("re-anchors the end instant from the resume moment", () => {
    const paused = pauseTimer(runningFocus(), T0 + 10 * MIN);
    const resumed = resumeTimer(paused, DEFAULT_SETTINGS, T0 + 20 * MIN);
    expect(resumed.phaseEndsAt).toBe(T0 + 35 * MIN);
    expect(isPhaseComplete(resumed, T0 + 35 * MIN)).toBe(true);
  });

  it("treats pause, start and resume as no-ops in the wrong state", () => {
    const idle = initialTimerState();
    expect(pauseTimer(idle, T0)).toBe(idle);

    const running = runningFocus();
    expect(startPhase(running, DEFAULT_SETTINGS, T0)).toBe(running);
    expect(resumeTimer(running, DEFAULT_SETTINGS, T0)).toBe(running);
  });
});

describe("reset returns the current phase to idle, full length", () => {
  it("stops a running phase and restores the full duration", () => {
    const paused = pauseTimer(runningFocus(), T0 + 10 * MIN);
    const reset = resetTimer(paused);
    expect(reset.status).toBe("idle");
    expect(reset.phase).toBe("focus");
    expect(reset.cyclePosition).toBe(1);
    expect(remainingMs(reset, DEFAULT_SETTINGS, T0 + 10 * MIN)).toBe(25 * MIN);
  });

  it("keeps the cycle position — progress lives in the session log, not here", () => {
    const reset = resetTimer(runningFocus(DEFAULT_SETTINGS, 3));
    expect(reset.cyclePosition).toBe(3);
    expect(reset.phase).toBe("focus");
  });
});

describe("selectPhase repositions without touching the cycle", () => {
  it("switches to a chosen phase at full length, waiting", () => {
    const next = selectPhase(runningFocus(DEFAULT_SETTINGS, 3), "long", DEFAULT_SETTINGS);
    expect(next).toEqual({
      phase: "long",
      cyclePosition: 3,
      status: "idle",
      phaseEndsAt: null,
      pausedAt: null,
      startedAt: null,
    });
  });

  it("is a no-op for the phase already selected", () => {
    const running = runningFocus();
    expect(selectPhase(running, "focus", DEFAULT_SETTINGS)).toBe(running);
  });
});

describe("normalizeState re-clamps after settings change", () => {
  const at3: TimerState = {
    phase: "focus", cyclePosition: 3, status: "idle", phaseEndsAt: null, pausedAt: null,
    startedAt: null,
  };

  it("pulls a cycle position back inside a smaller session count", () => {
    // Otherwise the UI would read "Session 3 of 2".
    const next = normalizeState(at3, { ...DEFAULT_SETTINGS, sessionCount: 2 });
    expect(next.cyclePosition).toBe(2);
  });

  it("leaves a valid position and the rest of the state untouched", () => {
    const next = normalizeState(at3, DEFAULT_SETTINGS);
    expect(next).toBe(at3);
  });

  it("recovers from a non-finite position", () => {
    const broken: TimerState = { ...at3, cyclePosition: Number.NaN };
    expect(normalizeState(broken, DEFAULT_SETTINGS).cyclePosition).toBe(1);
  });
});

/**
 * `startedAt` semantics — Task 8.
 *
 * The session log is append-only (ADR-003), so what this field means is
 * frozen into every row forever; these tests are the decision's record.
 *
 * The property under test is the one the stats surface depends on:
 * `completedAt - startedAt` must equal the focus time *actually* spent,
 * not the wall-clock time between Start and Finish.
 */
describe("startedAt spans focus time, not wall-clock time", () => {
  it("is stamped when the phase starts", () => {
    expect(startPhase(initialTimerState(), DEFAULT_SETTINGS, T0).startedAt).toBe(T0);
  });

  it("is left alone while paused — a pause is not a new session", () => {
    const running = startPhase(initialTimerState(), DEFAULT_SETTINGS, T0);
    expect(pauseTimer(running, T0 + 5 * MIN).startedAt).toBe(T0);
  });

  it("shifts forward by exactly the pause on resume", () => {
    let s = startPhase(initialTimerState(), DEFAULT_SETTINGS, T0);
    s = pauseTimer(s, T0 + 5 * MIN);
    // Away fifteen minutes, resuming at T0+20.
    s = resumeTimer(s, DEFAULT_SETTINGS, T0 + 20 * MIN);

    expect(s.startedAt).toBe(T0 + 15 * MIN);
    // …and the twenty minutes still owed are unaffected.
    expect(s.phaseEndsAt).toBe(T0 + 40 * MIN);
  });

  it("accumulates every pause across one session", () => {
    let s = startPhase(initialTimerState(), DEFAULT_SETTINGS, T0);
    s = pauseTimer(s, T0 + 5 * MIN);
    s = resumeTimer(s, DEFAULT_SETTINGS, T0 + 10 * MIN); // paused 5
    s = pauseTimer(s, T0 + 20 * MIN);
    s = resumeTimer(s, DEFAULT_SETTINGS, T0 + 30 * MIN); // paused 10

    expect(s.startedAt).toBe(T0 + 15 * MIN);
  });

  it("makes completedAt - startedAt the focus time, not the elapsed time", () => {
    // The headline. Five minutes worked, a one-hour interruption, twenty
    // more minutes: 25 minutes of focus inside 80 minutes of wall clock.
    let s = startPhase(initialTimerState(), DEFAULT_SETTINGS, T0);
    s = pauseTimer(s, T0 + 5 * MIN);
    s = resumeTimer(s, DEFAULT_SETTINGS, T0 + 60 * MIN);

    const completedAt = s.phaseEndsAt!;
    const focusTime = completedAt - s.startedAt!;
    const wallClock = completedAt - T0;

    expect(focusTime).toBe(25 * MIN);
    expect(focusTime).toBe(durationMs("focus", DEFAULT_SETTINGS));
    // Without the shift these two would be equal, which is the bug.
    expect(wallClock).toBe(80 * MIN);
  });

  it("is cleared by reset", () => {
    const running = startPhase(initialTimerState(), DEFAULT_SETTINGS, T0);
    expect(resetTimer(running).startedAt).toBeNull();
  });

  it("is cleared when a phase is picked by hand", () => {
    const running = startPhase(initialTimerState(), DEFAULT_SETTINGS, T0);
    expect(selectPhase(running, "short", DEFAULT_SETTINGS).startedAt).toBeNull();
  });

  it("is stamped when the next phase auto-starts", () => {
    const running = startPhase(initialTimerState(), DEFAULT_SETTINGS, T0);
    // `autoStartBreak` is on, so the break begins at the completion instant.
    const next = completePhase(running, DEFAULT_SETTINGS, T0 + 25 * MIN);
    expect(next.status).toBe("running");
    expect(next.startedAt).toBe(T0 + 25 * MIN);
  });

  it("stays null when the next phase waits instead of starting", () => {
    const running = startPhase(initialTimerState(), DEFAULT_SETTINGS, T0);
    const settings = { ...DEFAULT_SETTINGS, autoStartBreak: false };
    const next = completePhase(running, settings, T0 + 25 * MIN);
    expect(next.status).toBe("idle");
    expect(next.startedAt).toBeNull();
  });
});
