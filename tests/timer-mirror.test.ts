import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/convex/_generated/api";
import schema from "@/convex/schema";
import {
  DEFAULT_SETTINGS,
  initialTimerState,
  type TimerState,
} from "@/lib/pomodoro";
import {
  useTimerStore,
  type PersistedTimerState,
  type TimerStatePersister,
} from "@/lib/store/timer";

/**
 * ADR-005 gate: the in-flight timer's server mirror.
 *
 * Two halves, mirroring the two ends of the seam. The store half proves
 * that every boundary event reaches exactly one mirror call and that
 * `hydrate` restores without echoing back to the server. The Convex half
 * drives the real functions against an in-memory database: the row is
 * replaced rather than appended, `pausedAt` really disappears on the way
 * back to running, ownership of the bound task is re-proved here, and idle
 * leaves nothing behind.
 */

const MIN = 60_000;
const T0 = 1_700_000_000_000;

function running(overrides: Partial<TimerState> = {}): TimerState {
  return {
    phase: "focus",
    cyclePosition: 1,
    status: "running",
    phaseEndsAt: T0 + 25 * MIN,
    pausedAt: null,
    startedAt: T0,
    ...overrides,
  };
}

/**
 * A persister that records every call without doing anything network-like —
 * the same shape the real injection produces, minus Convex.
 */
function fakePersister() {
  const saves: PersistedTimerState[] = [];
  const clears: number[] = [];
  const persister: TimerStatePersister = {
    save: (anchor) => saves.push(anchor),
    clear: () => clears.push(1),
  };
  return { clears, persister, saves };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  useTimerStore.setState({ state: initialTimerState() });
});

afterEach(() => {
  // The persister is injected by whichever test set it; leaving it behind
  // would let the next test's transitions write somewhere unexpected.
  useTimerStore.setState({ timerStatePersister: null });
  vi.useRealTimers();
});

describe("boundary events reach the mirror", () => {
  it("start saves a running anchor carrying the D8 binding", () => {
    const { persister, saves } = fakePersister();
    useTimerStore.setState({
      timerStatePersister: persister,
      activeTask: { taskId: "task_a" as never, projectId: "proj_a" as never },
    });

    useTimerStore.getState().start();

    expect(saves).toHaveLength(1);
    expect(saves[0]).toEqual({
      phase: "focus",
      cyclePosition: 1,
      status: "running",
      phaseEndsAt: T0 + 25 * MIN,
      startedAt: T0,
      pausedAt: null,
      taskId: "task_a",
      projectId: "proj_a",
    });
  });

  it("pause saves the frozen instant; resume saves past it", () => {
    const { persister, saves } = fakePersister();
    useTimerStore.setState({ timerStatePersister: persister });
    useTimerStore.getState().start();

    vi.setSystemTime(T0 + 10 * MIN);
    useTimerStore.getState().pause();
    expect(saves[1].status).toBe("paused");
    expect(saves[1].pausedAt).toBe(T0 + 10 * MIN);

    vi.setSystemTime(T0 + 20 * MIN);
    useTimerStore.getState().resume();
    expect(saves[2].status).toBe("running");
    expect(saves[2].pausedAt).toBeNull();
  });

  it("an idle transition clears the row instead of saving one", () => {
    const { clears, persister, saves } = fakePersister();
    useTimerStore.setState({ timerStatePersister: persister });
    useTimerStore.getState().start();
    expect(saves).toHaveLength(1);

    useTimerStore.getState().reset();
    expect(clears).toHaveLength(1);
  });

  it("a completed phase without autostart clears; auto-started saves anew", () => {
    const { clears, persister, saves } = fakePersister();

    // Running-overdue focus, autostart off: completion parks the next phase.
    useTimerStore.setState({
      timerStatePersister: persister,
      settings: { ...DEFAULT_SETTINGS, autoStartBreak: false },
      state: running({ phaseEndsAt: T0, startedAt: T0 }),
    });
    useTimerStore.getState().complete();
    expect(clears).toHaveLength(1);
    expect(saves).toHaveLength(0);

    // Same setup, autostart on: the break began, so a new anchor replaces.
    const chain = fakePersister();
    useTimerStore.setState({
      timerStatePersister: chain.persister,
      settings: DEFAULT_SETTINGS,
      state: running({ phaseEndsAt: T0, startedAt: T0 }),
    });
    useTimerStore.getState().complete();
    expect(chain.saves).toHaveLength(1);
    expect(chain.saves[0].phase).toBe("short");
  });

  it("switching a running phase by tab abandons the session to idle", () => {
    const { clears, persister, saves } = fakePersister();
    useTimerStore.setState({ timerStatePersister: persister });
    useTimerStore.getState().start();

    useTimerStore.getState().setPhase("long");

    expect(clears).toHaveLength(1);
    expect(saves).toHaveLength(1); // only start's — the new state is idle
  });

  it("a persister that throws never strands the transition", () => {
    useTimerStore.setState({
      timerStatePersister: {
        save: () => {
          throw new Error("network down");
        },
        clear: () => {},
      },
    });

    expect(() => useTimerStore.getState().start()).not.toThrow();
    expect(useTimerStore.getState().state.status).toBe("running");
  });
});

describe("hydrate restores without echoing", () => {
  it("restores state and binding into an idle store", () => {
    useTimerStore.setState({ state: initialTimerState() });

    useTimerStore.getState().hydrate(
      running({ cyclePosition: 2 }),
      { taskId: "task_a" as never, projectId: "proj_a" as never },
    );

    const { state, boundTask } = useTimerStore.getState();
    expect(state.status).toBe("running");
    expect(state.cyclePosition).toBe(2);
    expect(boundTask).toEqual({ taskId: "task_a", projectId: "proj_a" });
  });

  it("refuses to overwrite a phase this tab has already started", () => {
    useTimerStore.getState().start();
    const live = useTimerStore.getState().state;

    useTimerStore.getState().hydrate(
      running({ cyclePosition: 4, pausedAt: T0 }),
      null,
    );

    // The user beat the mirror row: this tab's session is the truth.
    expect(useTimerStore.getState().state).toEqual(live);
  });

  it("does not write to the mirror on the way in", () => {
    const { clears, persister, saves } = fakePersister();
    useTimerStore.setState({ timerStatePersister: persister });

    useTimerStore.getState().hydrate(running(), null);

    expect(saves).toHaveLength(0);
    expect(clears).toHaveLength(0);
  });
});

describe("the mirror functions (convex)", () => {
  /** One anonymous owner, the shape every Convex test here starts from. */
  async function signedIn() {
    const base = convexTest(schema, import.meta.glob("../convex/**/*.*s"));
    const ownerId = await base.run((ctx) =>
      ctx.db.insert("users", { createdAt: 1, isAnonymous: true }),
    );
    return { base, ownerId, t: base.withIdentity({ subject: `${ownerId}|s1` }) };
  }

  /** A plausible anchor as of `now` — within every validator's window. */
  function anchor(
    overrides: Partial<PersistedTimerState> = {},
    now = Date.now(),
  ): PersistedTimerState {
    return {
      phase: "focus",
      cyclePosition: 1,
      status: "running",
      phaseEndsAt: now + 20 * MIN,
      startedAt: now - 5 * MIN,
      pausedAt: null,
      ...overrides,
    };
  }

  /** Save through the real mutation, then read through the real query. */
  async function saved(
    t: Awaited<ReturnType<typeof signedIn>>["t"],
    mut: PersistedTimerState,
  ) {
    await t.mutation(api.timer_state.save, {
      phase: mut.phase,
      cyclePosition: mut.cyclePosition,
      status: mut.status,
      phaseEndsAt: mut.phaseEndsAt,
      startedAt: mut.startedAt,
      pausedAt: mut.pausedAt ?? undefined,
      boundTaskId: mut.taskId,
      boundProjectId: mut.projectId,
    });
    return await t.query(api.timer_state.get, {});
  }

  it("saves, replaces, and leaves nothing on clear", async () => {
    const { t } = await signedIn();
    const now = Date.now();

    let row = await saved(t, anchor({}, now));
    expect(row).not.toBeNull();
    expect(row).toMatchObject({ phase: "focus", status: "running" });

    // Pause: second boundary from the same owner. It must replace, not
    // append — there is one timer, so there is one row.
    row = await saved(
      t,
      anchor({ status: "paused", pausedAt: now - MIN }, now),
    );
    expect(row).toMatchObject({ status: "paused" });

    // Back to running: the pause instant must be *gone*, not just null.
    row = await saved(t, anchor({}, now));
    expect(row?.status).toBe("running");
    expect(row?.pausedAt).toBeUndefined();
    const rows = await t.run((ctx) => ctx.db.query("timerState").collect());
    expect(rows).toHaveLength(1);

    await t.mutation(api.timer_state.clear, {});
    expect(await t.query(api.timer_state.get, {})).toBeNull();
  });

  it("rejects timestamps a lie would produce", async () => {
    const { t } = await signedIn();
    const now = Date.now();

    await expect(
      t.mutation(api.timer_state.save, {
        phase: anchor().phase,
        cyclePosition: anchor().cyclePosition,
        status: anchor().status,
        phaseEndsAt: now + 3 * 60 * MIN, // beyond the 2h skew tolerance
        startedAt: anchor().startedAt,
        pausedAt: undefined,
        boundTaskId: undefined,
        boundProjectId: undefined,
      }),
    ).rejects.toThrow(/future/);

    await expect(
      t.mutation(api.timer_state.save, {
        phase: anchor().phase,
        cyclePosition: anchor().cyclePosition,
        status: anchor().status,
        phaseEndsAt: now - 10 * MIN, // past startedAt — not this phase's end
        startedAt: anchor().startedAt,
        pausedAt: undefined,
        boundTaskId: undefined,
        boundProjectId: undefined,
      }),
    ).rejects.toThrow(/follow startedAt/);
  });

  it("records an unbound phase when the bound task was deleted, refuses a foreign one", async () => {
    const { base, ownerId, t } = await signedIn();
    const now = Date.now();

    // Their own task, deleted after the phase was bound to it: the D8
    // binding is historical, so losing the target must not lose the mirror
    // — the same rule `logCompleted` applies to sessions.
    const mine = await base.run((ctx) =>
      ctx.db.insert("tasks", {
        ownerId,
        title: "mine",
        estimate: 2,
        order: 1,
        activeFlag: true,
      }),
    );
    await base.run((ctx) => ctx.db.delete(mine));
    const row = await saved(
      t,
      anchor({ taskId: mine, projectId: undefined }, now),
    );
    expect(row?.boundTaskId).toBeUndefined();

    // Somebody else's task is the one refusal worth making.
    const otherOwner = await base.run((ctx) =>
      ctx.db.insert("users", { createdAt: 1 }),
    );
    const theirs = await base.run((ctx) =>
      ctx.db.insert("tasks", {
        ownerId: otherOwner,
        title: "theirs",
        estimate: 2,
        order: 1,
        activeFlag: true,
      }),
    );
    await expect(
      t.mutation(api.timer_state.save, {
        phase: anchor().phase,
        cyclePosition: anchor().cyclePosition,
        status: anchor().status,
        phaseEndsAt: anchor().phaseEndsAt,
        startedAt: anchor().startedAt,
        pausedAt: undefined,
        boundTaskId: theirs,
        boundProjectId: undefined,
      }),
    ).rejects.toThrow(/not found/);
  });

  it("every mirror read is owner-scoped", async () => {
    const { base, t } = await signedIn();
    await saved(t, anchor());

    // A second identity must not see — or ever rewrite — the first's row.
    const otherOwner = await base.run((ctx) =>
      ctx.db.insert("users", { createdAt: 1 }),
    );
    const other = base.withIdentity({ subject: `${otherOwner}|s1` });
    expect(await other.query(api.timer_state.get, {})).toBeNull();
  });
});
