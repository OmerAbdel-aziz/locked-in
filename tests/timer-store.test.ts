import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SETTINGS,
  completePhase,
  initialTimerState,
  pauseTimer,
  remainingMs,
  resetTimer,
  resumeTimer,
  skipPhase,
  startPhase,
  type TimerState,
} from "@/lib/pomodoro";
import {
  COUNTDOWN_TICK_MS,
  useCountdown,
  useTimerStore,
} from "@/lib/store/timer";

/**
 * Task 6 gate: the timer store and its countdown selector.
 *
 * The store's job is to hold state and *nothing else* — every transition
 * belongs to the engine. The equivalence test below is what proves that:
 * the same action sequence is replayed against the pure functions and
 * against the store, and the two must produce identical states. If someone
 * ever re-implements a cycle rule inside the store, the results diverge.
 */

const MIN = 60_000;
const T0 = 1_700_000_000_000;

type ActionName = "start" | "pause" | "resume" | "reset" | "skip" | "complete";

function applyEngine(
  action: ActionName,
  state: TimerState,
  at: number,
): TimerState {
  switch (action) {
    case "start":
      return startPhase(state, DEFAULT_SETTINGS, at);
    case "pause":
      return pauseTimer(state, at);
    case "resume":
      return resumeTimer(state, DEFAULT_SETTINGS, at);
    case "reset":
      return resetTimer(state);
    case "skip":
      return skipPhase(state, DEFAULT_SETTINGS, at);
    case "complete":
      return completePhase(state, DEFAULT_SETTINGS, at);
  }
}

/** Replay a timed action sequence through the pure engine. */
function engineReplay(steps: { action: ActionName; at: number }[]): TimerState {
  return steps.reduce(
    (state, step) => applyEngine(step.action, state, step.at),
    initialTimerState(),
  );
}

function resetStore() {
  useTimerStore.setState({
    state: initialTimerState(),
    settings: DEFAULT_SETTINGS,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  resetStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("actions hand every transition to the engine", () => {
  it("starts the phase anchored to the wall clock", () => {
    act(() => useTimerStore.getState().start());

    expect(useTimerStore.getState().state).toEqual({
      phase: "focus",
      cyclePosition: 1,
      status: "running",
      phaseEndsAt: T0 + 25 * MIN,
      pausedAt: null,
      startedAt: T0,
    });
  });

  it("pauses and resumes without losing the remaining time", () => {
    act(() => useTimerStore.getState().start());

    vi.setSystemTime(T0 + 10 * MIN);
    act(() => useTimerStore.getState().pause());

    // Ten more minutes pass while paused...
    vi.setSystemTime(T0 + 20 * MIN);
    act(() => useTimerStore.getState().resume());

    const { state } = useTimerStore.getState();
    expect(state.status).toBe("running");
    expect(state.phaseEndsAt).toBe(T0 + 35 * MIN);
    expect(remainingMs(state, DEFAULT_SETTINGS, T0 + 20 * MIN)).toBe(15 * MIN);
  });

  it("skips to the next phase without the session counting", () => {
    act(() => useTimerStore.getState().start());
    act(() => useTimerStore.getState().skip());

    const { phase, cyclePosition } = useTimerStore.getState().state;
    expect(phase).toBe("short");
    expect(cyclePosition).toBe(1);
  });

  it("completes focus 4 of 4 into the long break, counter reset", () => {
    useTimerStore.setState({
      state: {
        phase: "focus", cyclePosition: 4, status: "running",
        phaseEndsAt: T0, pausedAt: null, startedAt: T0,
      },
    });

    act(() => useTimerStore.getState().complete());

    const { phase, cyclePosition } = useTimerStore.getState().state;
    expect(phase).toBe("long");
    expect(cyclePosition).toBe(1);
  });

  it("resets to idle without disturbing the cycle position", () => {
    useTimerStore.setState({
      state: {
        phase: "focus", cyclePosition: 3, status: "running",
        phaseEndsAt: T0, pausedAt: null, startedAt: T0,
      },
    });

    act(() => useTimerStore.getState().reset());

    const { state } = useTimerStore.getState();
    expect(state.status).toBe("idle");
    expect(state.cyclePosition).toBe(3);
  });

  it("selects a mode tab without advancing the cycle", () => {
    useTimerStore.setState({
      state: {
        phase: "focus", cyclePosition: 3, status: "running",
        phaseEndsAt: T0, pausedAt: null, startedAt: T0,
      },
    });

    act(() => useTimerStore.getState().setPhase("long"));

    const { state } = useTimerStore.getState();
    expect(state.phase).toBe("long");
    expect(state.cyclePosition).toBe(3);
    expect(state.status).toBe("idle");
  });

  it("re-clamps the cycle when settings shrink it", () => {
    useTimerStore.setState({
      state: {
        phase: "focus", cyclePosition: 3, status: "idle",
        phaseEndsAt: null, pausedAt: null, startedAt: null,
      },
    });

    act(() => useTimerStore.getState().setSettings({ sessionCount: 2 }));

    // Otherwise the UI would read "Session 3 of 2".
    expect(useTimerStore.getState().state.cyclePosition).toBe(2);
  });

  it("merges settings rather than replacing them", () => {
    act(() => useTimerStore.getState().setSettings({ focusMin: 50 }));

    const { settings } = useTimerStore.getState();
    expect(settings.focusMin).toBe(50);
    expect(settings.shortMin).toBe(5);
    expect(settings.sessionCount).toBe(4);
  });
});

describe("equivalence with the pure engine", () => {
  // This is the acceptance criterion made executable: identical inputs must
  // yield identical states, so no rule can quietly live in two places.
  const sequences: { name: string; steps: { action: ActionName; at: number }[] }[] = [
    {
      name: "start, run, complete, complete",
      steps: [
        { action: "start", at: T0 },
        { action: "complete", at: T0 + 25 * MIN },
        { action: "complete", at: T0 + 30 * MIN },
      ],
    },
    {
      name: "skip focus 4 — must not grant the long break",
      steps: [
        { action: "start", at: T0 },
        { action: "skip", at: T0 + 3 * MIN },
        { action: "complete", at: T0 + 8 * MIN },
        { action: "complete", at: T0 + 33 * MIN },
      ],
    },
    {
      name: "pause across a ten-minute gap, then resume",
      steps: [
        { action: "start", at: T0 },
        { action: "pause", at: T0 + 10 * MIN },
        { action: "resume", at: T0 + 20 * MIN },
        { action: "complete", at: T0 + 35 * MIN },
      ],
    },
    {
      name: "reset mid-cycle keeps the position",
      steps: [
        { action: "start", at: T0 },
        { action: "complete", at: T0 + 25 * MIN },
        { action: "complete", at: T0 + 28 * MIN },
        { action: "reset", at: T0 + 30 * MIN },
      ],
    },
  ];

  it.each(sequences)("$name", ({ steps }) => {
    for (const step of steps) {
      vi.setSystemTime(step.at);
      const store = useTimerStore.getState();
      act(() => store[step.action]());
    }

    expect(useTimerStore.getState().state).toEqual(engineReplay(steps));
  });
});

describe("useCountdown is derived from the wall clock", () => {
  function startTimer() {
    act(() => useTimerStore.getState().start());
  }

  /**
   * Move the fake clock to exactly `at` and let one countdown tick fire.
   *
   * The clock has to be stepped back by one tick first: `advanceTimersByTime`
   * moves time forward before invoking the callback, so setting the target
   * directly would land the reading 250ms past it.
   */
  function tickTo(at: number) {
    act(() => {
      vi.setSystemTime(at - COUNTDOWN_TICK_MS);
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS);
    });
  }

  it("shows the full duration before anything runs", () => {
    const { result } = renderHook(() => useCountdown());
    expect(result.current).toBe(25 * MIN);
  });

  it("ticks down as the wall clock advances", () => {
    startTimer();
    const { result } = renderHook(() => useCountdown());
    expect(result.current).toBe(25 * MIN);

    tickTo(T0 + 1 * MIN);
    expect(result.current).toBe(24 * MIN);
  });

  it("survives a ten-minute background gap with no drift", () => {
    // PRD 10.2. No intermediate ticks fire while backgrounded, and the
    // reading is still exact — because it is derived, not accumulated.
    startTimer();
    const { result } = renderHook(() => useCountdown());

    tickTo(T0 + 10 * MIN);
    expect(result.current).toBe(15 * MIN);
  });

  it("does not accumulate across missed ticks", () => {
    startTimer();
    const { result } = renderHook(() => useCountdown());

    // One tick per ten minutes of wall clock — the opposite of a busy loop.
    for (const minutes of [10, 20, 30]) {
      tickTo(T0 + minutes * MIN);
    }
    expect(result.current).toBe(0);
  });

  it("stops ticking while paused", () => {
    startTimer();
    const { result } = renderHook(() => useCountdown());

    tickTo(T0 + 10 * MIN);
    expect(result.current).toBe(15 * MIN);

    act(() => useTimerStore.getState().pause());

    // The clock keeps moving; the reading must not.
    tickTo(T0 + 40 * MIN);
    expect(result.current).toBe(15 * MIN);
  });

  it("picks up the new duration when settings change", () => {
    const { result } = renderHook(() => useCountdown());
    expect(result.current).toBe(25 * MIN);

    act(() => useTimerStore.getState().setSettings({ focusMin: 50 }));
    expect(result.current).toBe(50 * MIN);
  });

  it("never consults the clock during a server render", () => {
    // Regression gate for a real build failure found in Task 7. The focus
    // route is statically prerendered, and Next.js 16 refuses to build when
    // a client component calls `Date.now()` while rendering — the value
    // would be frozen at build time instead of recomputed per visit
    // (`blocking-prerender-current-time`). The countdown therefore
    // subscribes to the clock as an external store, whose server snapshot is
    // a constant.
    //
    // What a server render actually sees is worth stating: zustand's own
    // `useSyncExternalStore` snapshot is the store's *initial* state, so the
    // prerendered HTML is always the idle timer at full duration — the shell
    // a first-time visitor gets before hydration. That is exactly why the
    // assertion is about the *call* rather than the value: `now` would be
    // unused either way, and a call is the one thing Next's guard rejects.
    act(() => useTimerStore.getState().start());
    vi.setSystemTime(T0 + 10 * MIN);

    const nowSpy = vi.spyOn(Date, "now");
    const html = renderToString(createElement(CountdownProbe));
    const callsDuringRender = nowSpy.mock.calls.length;
    nowSpy.mockRestore();

    expect(html).toContain(String(25 * MIN));
    expect(callsDuringRender).toBe(0);
  });
});

/** Minimal client component that renders the live countdown. */
function CountdownProbe() {
  return createElement("span", null, String(useCountdown()));
}
