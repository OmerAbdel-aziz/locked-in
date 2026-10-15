import { cleanup, renderHook } from "@testing-library/react";
import { convexTest } from "convex-test";
import { StrictMode, createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { api } from "@/convex/_generated/api";
import schema from "@/convex/schema";
import { DEFAULT_SETTINGS, type TimerState } from "@/lib/pomodoro";
import {
  useTimerStore,
  usePhaseCompletion,
  type CompletedPhase,
  type SessionLogger,
} from "@/lib/store/timer";

/**
 * Task 8 gate: the session log write.
 *
 * Two things are proven here, and the second is the one that matters
 * long-term. The first is the acceptance criterion — a focus session that
 * runs out produces exactly one `sessions` row, and a session abandoned by
 * Reset or Skip produces none. The second is *how long that row is
 * expected to last*: `sessions` is append-only (ADR-003) and CSV import is
 * its only repair path, so a duplicated, mis-stamped or mis-owned row can
 * never be cleaned up afterwards. Every test below that sounds fussy is
 * guarding against a permanent one.
 *
 * The end-to-end cases drive the real path rather than the pieces: the
 * store detects the boundary, hands the span to whatever logger is
 * installed, and the installed logger is the actual Convex mutation
 * writing into a real (in-memory) database.
 */

const modules = import.meta.glob("../convex/**/*.*s");

const MIN = 60_000;
/** 2023-11-14 — far enough past the 2020 floor, far enough behind `Date.now()`. */
const T0 = 1_700_000_000_000;
const FOCUS_MS = 25 * MIN;

/** A focus phase whose twenty-five minutes ran out at `T0 + 25min`. */
function ranOut(startedAt = T0, phaseEndsAt = T0 + FOCUS_MS): TimerState {
  return {
    phase: "focus",
    cyclePosition: 1,
    status: "running",
    phaseEndsAt,
    pausedAt: null,
    startedAt,
  };
}

/**
 * One anonymous owner with a session on them.
 *
 * `resolveOwner` reads the owner out of the subject itself, so the id in
 * the subject must name a real `users` row — otherwise the insert would be
 * writing an owner that never existed.
 */
async function signedIn() {
  const base = convexTest(schema, modules);
  const ownerId = await base.run((ctx) =>
    ctx.db.insert("users", { createdAt: 1, isAnonymous: true }),
  );
  return { base, ownerId, t: base.withIdentity({ subject: `${ownerId}|s1` }) };
}

/** A logger that records entries *and* actually sends them to Convex. */
function wiring(t: Awaited<ReturnType<typeof signedIn>>["t"]) {
  const entries: CompletedPhase[] = [];
  const writes: Promise<unknown>[] = [];

  const logger: SessionLogger = (entry) => {
    entries.push(entry);
    writes.push(t.mutation(api.sessions.logCompleted, entry));
  };

  const flush = async () => {
    await Promise.all(writes);
    return entries;
  };

  return { entries, flush, logger };
}

beforeEach(() => {
  useTimerStore.setState({
    state: {
      phase: "focus",
      cyclePosition: 1,
      status: "idle",
      phaseEndsAt: null,
      pausedAt: null,
      startedAt: null,
    },
    settings: DEFAULT_SETTINGS,
    sessionLogger: null,
  });
});

afterEach(() => {
  useTimerStore.setState({ sessionLogger: null });
  cleanup();
});

describe("a completed session", () => {
  it("creates exactly one row, and only ever one", async () => {
    const { ownerId, t } = await signedIn();
    const { logger, flush } = wiring(t);

    useTimerStore.setState({ state: ranOut(), sessionLogger: logger });

    // Twice on purpose: React invokes effects twice in development, and a
    // countdown that crosses the boundary will be observed more than once.
    const first = useTimerStore.getState().completeIfDue();
    const second = useTimerStore.getState().completeIfDue();

    expect(first).toBe(true);
    expect(second).toBe(false);

    await flush();

    const rows = await t.run((ctx) => ctx.db.query("sessions").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ownerId,
      startedAt: T0,
      completedAt: T0 + FOCUS_MS,
      phase: "focus",
      tzOffsetAtCompletion: -new Date(T0 + FOCUS_MS).getTimezoneOffset(),
    });
  });

  it("records the instant the phase ended, not the tick that noticed", async () => {
    const { t } = await signedIn();
    const { logger, entries } = wiring(t);

    // A backgrounded tab: the boundary passed long before anyone looked.
    useTimerStore.setState({ state: ranOut(), sessionLogger: logger });

    expect(useTimerStore.getState().completeIfDue()).toBe(true);

    expect(entries).toHaveLength(1);
    expect(entries[0].completedAt).toBe(T0 + FOCUS_MS);
    expect(entries[0].completedAt).toBeLessThan(Date.now());
    // The span is the focus time, never the years the row sat unobserved.
    expect(entries[0].completedAt - entries[0].startedAt).toBe(FOCUS_MS);
  });

  it("leaves no row behind when the session is reset by hand", async () => {
    const { t } = await signedIn();
    const { logger, flush } = wiring(t);

    useTimerStore.setState({ state: ranOut(), sessionLogger: logger });

    useTimerStore.getState().reset();
    await flush();

    const rows = await t.run((ctx) => ctx.db.query("sessions").collect());
    expect(rows).toHaveLength(0);
  });

  it("leaves no row behind when the session is skipped by hand", async () => {
    const { t } = await signedIn();
    const { logger, flush } = wiring(t);

    useTimerStore.setState({ state: ranOut(), sessionLogger: logger });

    useTimerStore.getState().skip();
    await flush();

    const rows = await t.run((ctx) => ctx.db.query("sessions").collect());
    expect(rows).toHaveLength(0);
    // Skipping still advances — it simply does not count.
    expect(useTimerStore.getState().state.phase).toBe("short");
  });

  it("finishing a phase that never started moves the cycle and writes nothing", () => {
    const entries: CompletedPhase[] = [];
    useTimerStore.setState({
      state: {
        phase: "focus",
        cyclePosition: 1,
        status: "idle",
        phaseEndsAt: null,
        pausedAt: null,
        startedAt: null,
      },
      sessionLogger: (entry) => entries.push(entry),
    });

    useTimerStore.getState().complete();

    // No `startedAt` means no focus time was ever spent, so a row built
    // from the phase's nominal length would be invented data.
    expect(entries).toHaveLength(0);
    expect(useTimerStore.getState().state.phase).toBe("short");
  });

  it("is recorded even when the writer throws", () => {
    useTimerStore.setState({
      state: ranOut(),
      sessionLogger: () => {
        throw new Error("network down");
      },
    });

    // PRD §9: the timer never depends on a round-trip. The write failing
    // must not leave the face stuck at 00:00 — the cycle advances anyway.
    expect(() => useTimerStore.getState().completeIfDue()).not.toThrow();
    const after = useTimerStore.getState().state;
    expect(after.phase).toBe("short");
    expect(after.phaseEndsAt).not.toBe(T0 + FOCUS_MS);
  });

  it("is omitted silently when no writer has been injected", () => {
    useTimerStore.setState({ state: ranOut(), sessionLogger: null });

    expect(useTimerStore.getState().completeIfDue()).toBe(true);
  });
});

describe("logCompleted", () => {
  it("rejects a caller with no session", async () => {
    const { base } = await signedIn();

    await expect(
      base.mutation(api.sessions.logCompleted, {
        phase: "focus",
        startedAt: T0,
        completedAt: T0 + FOCUS_MS,
        tzOffsetAtCompletion: 0,
      }),
    ).rejects.toThrow(/unauthenticated/i);
  });

  it("cannot be aimed at another owner's log", async () => {
    const { ownerId, t } = await signedIn();
    const someoneElse = await t.run((ctx) =>
      ctx.db.insert("users", { createdAt: 99, isAnonymous: true }),
    );

    await t.mutation(api.sessions.logCompleted, {
      phase: "focus",
      startedAt: T0,
      completedAt: T0 + FOCUS_MS,
      tzOffsetAtCompletion: 0,
    });

    const rows = await t.run((ctx) => ctx.db.query("sessions").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].ownerId).toBe(ownerId);

    // There is no `ownerId` argument to pass. Supplying one anyway must be
    // refused as an unknown field rather than honoured - a mutation that
    // silently accepted it would let any caller write sessions into any
    // owner's log, which is exactly what `resolveOwner` exists to prevent.
    await expect(
      t.mutation(api.sessions.logCompleted, {
        phase: "focus",
        startedAt: T0 + 50 * MIN,
        completedAt: T0 + 75 * MIN,
        tzOffsetAtCompletion: 0,
        ownerId: someoneElse,
      } as never),
    ).rejects.toThrow(/ownerId|field/i);

    expect(
      await t.run((ctx) => ctx.db.query("sessions").collect()),
    ).toHaveLength(1);
  });

  it("keeps two owners' logs apart", async () => {
    const base = convexTest(schema, modules);
    const alice = await base.run((ctx) =>
      ctx.db.insert("users", { createdAt: 1, isAnonymous: true }),
    );
    const bob = await base.run((ctx) =>
      ctx.db.insert("users", { createdAt: 2, isAnonymous: true }),
    );

    const asAlice = base.withIdentity({ subject: `${alice}|s1` });
    const asBob = base.withIdentity({ subject: `${bob}|s1` });

    await asAlice.mutation(api.sessions.logCompleted, {
      phase: "focus",
      startedAt: T0,
      completedAt: T0 + FOCUS_MS,
      tzOffsetAtCompletion: 0,
    });
    await asBob.mutation(api.sessions.logCompleted, {
      phase: "focus",
      startedAt: T0 + FOCUS_MS,
      completedAt: T0 + 50 * MIN,
      tzOffsetAtCompletion: 0,
    });

    const rows = await base.run((ctx) => ctx.db.query("sessions").collect());
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.ownerId).sort()).toEqual([alice, bob].sort());

    // Each owner's log holds the session *they* wrote, so any later read
    // scoped by `ownerId` can never surface the other's history.
    expect(rows.find((r) => r.ownerId === alice)?.startedAt).toBe(T0);
    expect(rows.find((r) => r.ownerId === bob)?.startedAt).toBe(T0 + FOCUS_MS);
  });

  it("appends nothing for an identical repeat write", async () => {
    const { t } = await signedIn();
    const args: CompletedPhase = {
      phase: "focus",
      startedAt: T0,
      completedAt: T0 + FOCUS_MS,
      tzOffsetAtCompletion: 0,
    };

    const first = await t.mutation(api.sessions.logCompleted, args);
    const second = await t.mutation(api.sessions.logCompleted, args);

    expect(second).toBe(first);
    expect(
      await t.run((ctx) => ctx.db.query("sessions").collect()),
    ).toHaveLength(1);
  });

  it("does not mistake a different session with the same end instant for a repeat", async () => {
    const { t } = await signedIn();

    await t.mutation(api.sessions.logCompleted, {
      phase: "focus",
      startedAt: T0,
      completedAt: T0 + FOCUS_MS,
      tzOffsetAtCompletion: 0,
    });
    await t.mutation(api.sessions.logCompleted, {
      phase: "short",
      startedAt: T0 + FOCUS_MS,
      completedAt: T0 + FOCUS_MS,
      tzOffsetAtCompletion: 0,
    });

    expect(
      await t.run((ctx) => ctx.db.query("sessions").collect()),
    ).toHaveLength(2);
  });

  it("leaves task and project unset until Task 11 binds them", async () => {
    const { t } = await signedIn();

    await t.mutation(api.sessions.logCompleted, {
      phase: "focus",
      startedAt: T0,
      completedAt: T0 + FOCUS_MS,
      tzOffsetAtCompletion: 0,
    });

    const [row] = await t.run((ctx) => ctx.db.query("sessions").collect());
    expect(row.taskId).toBeUndefined();
    expect(row.projectId).toBeUndefined();
  });

  it("rejects a completion that precedes its own start", async () => {
    const { t } = await signedIn();

    await expect(
      t.mutation(api.sessions.logCompleted, {
        phase: "focus",
        startedAt: T0 + FOCUS_MS,
        completedAt: T0,
        tzOffsetAtCompletion: 0,
      }),
    ).rejects.toThrow(/precede/i);
  });

  it("rejects a completion far in the future", async () => {
    const { t } = await signedIn();

    await expect(
      t.mutation(api.sessions.logCompleted, {
        phase: "focus",
        startedAt: Date.now(),
        completedAt: Date.now() + 24 * 60 * MIN,
        tzOffsetAtCompletion: 0,
      }),
    ).rejects.toThrow(/future/i);
  });

  it("rejects a UTC offset that no timezone has", async () => {
    const { t } = await signedIn();

    await expect(
      t.mutation(api.sessions.logCompleted, {
        phase: "focus",
        startedAt: T0,
        completedAt: T0 + FOCUS_MS,
        tzOffsetAtCompletion: 48 * 60,
      }),
    ).rejects.toThrow(/offset/i);
  });

  it("rejects a timestamp from before the app could exist", async () => {
    const { t } = await signedIn();

    await expect(
      t.mutation(api.sessions.logCompleted, {
        phase: "focus",
        startedAt: 0,
        completedAt: 1,
        tzOffsetAtCompletion: 0,
      }),
    ).rejects.toThrow(/plausible/i);
  });
});

/** Wrapper for the hook tests; built without JSX so this file stays `.ts`. */
const Strict = ({ children }: { children: ReactNode }) =>
  createElement(StrictMode, null, children);

describe("usePhaseCompletion", () => {
  it("finishes the phase the moment the readout reaches zero", () => {
    const entries: CompletedPhase[] = [];
    useTimerStore.setState({
      state: ranOut(),
      sessionLogger: (entry) => entries.push(entry),
    });

    const { rerender } = renderHook(
      ({ remaining }: { remaining: number }) => usePhaseCompletion(remaining),
      { initialProps: { remaining: 1_000 } },
    );
    expect(entries).toHaveLength(0);

    rerender({ remaining: 0 });

    expect(entries).toHaveLength(1);
    expect(entries[0].phase).toBe("focus");
  });

  it("leaves a boundary that has not passed alone", () => {
    const entries: CompletedPhase[] = [];
    useTimerStore.setState({
      // Running, but five minutes short of the boundary.
      state: ranOut(T0, Date.now() + 5 * MIN),
      sessionLogger: (entry) => entries.push(entry),
    });

    const { unmount } = renderHook(() => usePhaseCompletion(0));

    // `remaining === 0` is only a claim about the readout; the phase's own
    // boundary is what decides. Nothing has finished, so nothing recorded.
    expect(entries).toHaveLength(0);
    expect(useTimerStore.getState().state.status).toBe("running");
    unmount();
  });

  it("records exactly one entry even under StrictMode's double effect", () => {
    const entries: CompletedPhase[] = [];
    useTimerStore.setState({
      state: ranOut(),
      sessionLogger: (entry) => entries.push(entry),
    });

    renderHook(() => usePhaseCompletion(0), { wrapper: Strict });

    expect(entries).toHaveLength(1);
  });

  it("does not complete a paused timer that sits at zero", () => {
    const entries: CompletedPhase[] = [];
    useTimerStore.setState({
      state: { ...ranOut(), status: "paused", pausedAt: T0 + FOCUS_MS },
      sessionLogger: (entry) => entries.push(entry),
    });

    renderHook(() => usePhaseCompletion(0), { wrapper: Strict });

    expect(entries).toHaveLength(0);
  });
});
