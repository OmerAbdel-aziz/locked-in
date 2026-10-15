import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import schema from "@/convex/schema";
import { DEFAULT_SETTINGS, initialTimerState } from "@/lib/pomodoro";
import {
  useTimerStore,
  type CompletedPhase,
  type SessionLogger,
} from "@/lib/store/timer";

/**
 * Task 11 gate: active task ↔ session binding.
 *
 * The acceptance criterion is one line — *start with task A active, complete
 * → A +1 leaf and the session row carries A's id* — but it rests on two
 * claims that fail in opposite directions, so each is pinned on its own.
 *
 * **Binding happens at start** (D8: "assigned to `activeTaskId` at start,
 * immutable thereafter"). That is a claim about a *duration*: the selection
 * freezes when the phase begins and stays frozen however it changes
 * mid-session. It belongs to the timer store, so it is driven through the
 * store's own actions with the clock pinned — never by assigning `state`
 * directly, which would build the answer in by construction.
 *
 * **Binding is proven server-side**, because the id arrives from the client
 * after a round trip it had no way to check. `logCompleted` may not write a
 * row attributed to somebody else's task, and it may not throw a row away
 * because its target was deleted underneath it — `sessions` is append-only
 * (ADR-003), so a refusal costs a session permanently.
 *
 * **Leaf counts are derived** — asserted as coming back recomputed off the
 * log, with nothing in the schema that could have stored them (ADR-003).
 *
 * Every id here is a real row's, so no test needs to cast a made-up string
 * into `Id<"tasks">`: a fake id would let the store and the server disagree
 * without anything failing.
 */

const modules = import.meta.glob("../convex/**/*.*s");

const MIN = 60_000;
/** 2023-11-14 — past `logCompleted`'s 2020 floor, far behind `Date.now()`. */
const T0 = 1_700_000_000_000;
const FOCUS_MS = 25 * MIN;

type Base = Awaited<ReturnType<typeof identity>>["base"];
type Client = Awaited<ReturnType<typeof identity>>["client"];

/**
 * One anonymous owner.
 *
 * `resolveOwner` reads the owner out of the session's subject, so the id in
 * the subject must name a real `users` row. Handing this an existing `base`
 * gives a second owner *in the same database*, which is what every ownership
 * refusal below has to prove anything at all.
 */
async function identity(base = convexTest(schema, modules)) {
  const ownerId = await base.run((ctx) =>
    ctx.db.insert("users", { createdAt: 1, isAnonymous: true }),
  );
  return { base, ownerId, client: base.withIdentity({ subject: `${ownerId}|s1` }) };
}

/** A project, inserted directly: Task 13 builds the API for these. */
async function makeProject(
  base: Base,
  ownerId: Id<"users">,
  name = "Work",
): Promise<Id<"projects">> {
  return base.run((ctx) => ctx.db.insert("projects", { ownerId, name }));
}

/** One focus session's worth of plausible timestamps. */
const FOCUS_SPAN = {
  phase: "focus",
  startedAt: T0,
  completedAt: T0 + FOCUS_MS,
  tzOffsetAtCompletion: 0,
} as const;

/** A logger that records entries *and* actually sends them to Convex. */
function wiring(client: Client) {
  const entries: CompletedPhase[] = [];
  const writes: Promise<unknown>[] = [];

  const logger: SessionLogger = (entry) => {
    entries.push(entry);
    writes.push(client.mutation(api.sessions.logCompleted, entry));
  };

  const flush = async () => {
    await Promise.all(writes);
    return entries;
  };

  return { entries, flush, logger };
}

/**
 * Runs one focus phase from `start` to its boundary, through the store's own
 * actions.
 *
 * Only `Date.now` is pinned — not the whole clock, as `vi.useFakeTimers`
 * would — so `convex-test` keeps whatever real scheduling it does. The two
 * positions are the point: the phase *begins* at `T0` and is observed running
 * out 25 minutes later, which is exactly the gap in which a user can click a
 * different task.
 */
function runFocusPhase(): boolean {
  const clock = vi.spyOn(Date, "now").mockReturnValue(T0);
  useTimerStore.getState().start();
  clock.mockReturnValue(T0 + FOCUS_MS);
  return useTimerStore.getState().completeIfDue();
}

function sessionsOf(base: Base) {
  return base.run((ctx) => ctx.db.query("sessions").collect());
}

beforeEach(() => {
  useTimerStore.setState({
    state: initialTimerState(),
    settings: DEFAULT_SETTINGS,
    activeTask: null,
    boundTask: null,
    sessionLogger: null,
  });
});

afterEach(() => {
  useTimerStore.setState({
    sessionLogger: null,
    activeTask: null,
    boundTask: null,
  });
  vi.restoreAllMocks();
});

describe("selection is persisted per owner (PRD 4.1)", () => {
  it("starts unselected, then reads back exactly what was chosen", async () => {
    const { client: t } = await identity();

    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });
    expect(await t.query(api.tasks.activeTask, {})).toBeNull();

    await t.mutation(api.tasks.selectTask, { taskId: a });
    expect(await t.query(api.tasks.activeTask, {})).toBe(a);
  });

  it("refuses another owner's task and leaves every selection untouched", async () => {
    const { base, client: alice } = await identity();
    const { client: bob } = await identity(base);

    const hers = await alice.mutation(api.tasks.create, {
      title: "Alice's",
      estimate: 2,
    });
    await alice.mutation(api.tasks.selectTask, { taskId: hers });

    await expect(
      bob.mutation(api.tasks.selectTask, { taskId: hers }),
    ).rejects.toThrow(/task not found/);

    // The refusal changed nothing for either party: no shadow selection for
    // Bob, and Alice's still points where she left it.
    expect(await bob.query(api.tasks.activeTask, {})).toBeNull();
    expect(await alice.query(api.tasks.activeTask, {})).toBe(hers);
  });

  it("clears back to nothing when null is selected", async () => {
    const { client: t } = await identity();

    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });
    await t.mutation(api.tasks.selectTask, { taskId: a });
    await t.mutation(api.tasks.selectTask, { taskId: null });

    expect(await t.query(api.tasks.activeTask, {})).toBeNull();
  });

  it("keeps a task selected after it is completed", async () => {
    const { client: t } = await identity();

    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });
    await t.mutation(api.tasks.selectTask, { taskId: a });
    await t.mutation(api.tasks.complete, { taskId: a });

    // Task 11: "completed tasks keep their binding" — ticking a box is not a
    // deselection, so the finished task goes on receiving sessions.
    expect(await t.query(api.tasks.activeTask, {})).toBe(a);
  });

  it("allows selecting a task that is already finished", async () => {
    const { client: t } = await identity();

    const done = await t.mutation(api.tasks.create, { title: "Done", estimate: 2 });
    await t.mutation(api.tasks.complete, { taskId: done });
    await t.mutation(api.tasks.selectTask, { taskId: done });

    expect(await t.query(api.tasks.activeTask, {})).toBe(done);
  });

  it("is dropped by clearCompleted, the one mutation that deletes its target", async () => {
    const { client: t } = await identity();

    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });
    await t.mutation(api.tasks.selectTask, { taskId: a });
    await t.mutation(api.tasks.complete, { taskId: a });
    await t.mutation(api.tasks.clearCompleted, {});

    // A pointer aimed at nothing, still reading as a selection, would be
    // worse than none at all: the row is gone, so the honest answer is
    // "unselected".
    expect(await t.query(api.tasks.activeTask, {})).toBeNull();
  });
});

describe("logCompleted records a binding it has proved", () => {
  it("writes the task and the project it was bound to", async () => {
    const { base, ownerId, client: t } = await identity();

    const project = await makeProject(base, ownerId);
    const a = await t.mutation(api.tasks.create, {
      title: "A",
      estimate: 2,
      projectId: project,
    });

    await t.mutation(api.sessions.logCompleted, {
      ...FOCUS_SPAN,
      taskId: a,
      projectId: project,
    });

    const rows = await sessionsOf(base);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ taskId: a, projectId: project });
  });

  it("refuses a task belonging to someone else, and writes no row", async () => {
    const { base, client: alice } = await identity();
    const { client: bob } = await identity(base);

    const hers = await alice.mutation(api.tasks.create, {
      title: "Alice's",
      estimate: 2,
    });

    await expect(
      bob.mutation(api.sessions.logCompleted, { ...FOCUS_SPAN, taskId: hers }),
    ).rejects.toThrow(/task not found/);

    // A refusal that still inserted would be half a defence: the row is the
    // thing that must not exist.
    expect(await sessionsOf(base)).toHaveLength(0);
  });

  it("refuses a project belonging to someone else, and writes no row", async () => {
    const { base, ownerId } = await identity();
    const { client: bob } = await identity(base);

    const hers = await makeProject(base, ownerId, "Alice's");
    const mine = await bob.mutation(api.tasks.create, {
      title: "Bob's",
      estimate: 2,
    });

    await expect(
      bob.mutation(api.sessions.logCompleted, {
        ...FOCUS_SPAN,
        taskId: mine,
        projectId: hers,
      }),
    ).rejects.toThrow(/project not found/);

    expect(await sessionsOf(base)).toHaveLength(0);
  });

  it("still writes the row when its task was deleted underneath it", async () => {
    const { base, client: t } = await identity();

    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });
    await t.mutation(api.tasks.selectTask, { taskId: a });
    await t.mutation(api.tasks.complete, { taskId: a });

    // The plausible sequence: a session runs while its task is cleared away.
    await t.mutation(api.tasks.clearCompleted, {});

    await t.mutation(api.sessions.logCompleted, { ...FOCUS_SPAN, taskId: a });

    const rows = await sessionsOf(base);
    // The session survives — losing it would be permanent (append-only,
    // ADR-003) — and it is recorded *unbound*, because an id that can no
    // longer be proved is never stored.
    expect(rows).toHaveLength(1);
    expect(rows[0].taskId).toBeUndefined();
    expect(await t.query(api.tasks.activeTask, {})).toBeNull();
  });

  it("never rebinds a row on a repeat", async () => {
    const { base, client: t } = await identity();

    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });
    const b = await t.mutation(api.tasks.create, { title: "B", estimate: 2 });

    const first = await t.mutation(api.sessions.logCompleted, {
      ...FOCUS_SPAN,
      taskId: a,
    });
    const again = await t.mutation(api.sessions.logCompleted, {
      ...FOCUS_SPAN,
      taskId: b,
    });

    expect(again).toBe(first);
    const rows = await sessionsOf(base);
    expect(rows).toHaveLength(1);
    // The first write decides what the session was bound to; a replay cannot
    // re-attribute recorded history.
    expect(rows[0].taskId).toBe(a);
  });
});

describe("the timer binds at start, not at completion (D8)", () => {
  it("captures the selection the moment a phase begins", async () => {
    const { client: t } = await identity();
    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });
    useTimerStore.setState({ activeTask: { taskId: a } });

    const clock = vi.spyOn(Date, "now").mockReturnValue(T0);
    useTimerStore.getState().start();

    expect(useTimerStore.getState().boundTask).toEqual({ taskId: a });
    // The pairing the rest of this suite leans on: a phase that has begun
    // has a binding, recorded against the instant it began.
    expect(useTimerStore.getState().state.startedAt).toBe(T0);
    clock.mockReturnValue(T0 + FOCUS_MS);
  });

  it("does not re-target the running session when another task is picked", async () => {
    const { client: t } = await identity();
    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });
    const b = await t.mutation(api.tasks.create, { title: "B", estimate: 2 });

    const { entries, flush, logger } = wiring(t);
    useTimerStore.setState({ activeTask: { taskId: a }, sessionLogger: logger });

    const clock = vi.spyOn(Date, "now").mockReturnValue(T0);
    useTimerStore.getState().start();

    // Mid-session the user clicks B. The session running now must keep A —
    // this is precisely the re-targeting the acceptance criterion forbids.
    useTimerStore.setState({ activeTask: { taskId: b } });

    clock.mockReturnValue(T0 + FOCUS_MS);
    expect(useTimerStore.getState().completeIfDue()).toBe(true);
    await flush();

    expect(entries[0].taskId).toBe(a);
    // ...while the phase auto-started by that completion is a *new* session,
    // and so binds whatever is selected now.
    expect(useTimerStore.getState().boundTask).toEqual({ taskId: b });
  });

  it("keeps the binding through a pause and a resume", async () => {
    const { client: t } = await identity();
    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });
    const b = await t.mutation(api.tasks.create, { title: "B", estimate: 2 });

    useTimerStore.setState({ activeTask: { taskId: a } });
    const clock = vi.spyOn(Date, "now").mockReturnValue(T0);
    useTimerStore.getState().start();

    // Switching selection during an interruption must not reach the session
    // the interruption belongs to.
    useTimerStore.setState({ activeTask: { taskId: b } });
    useTimerStore.getState().pause();
    expect(useTimerStore.getState().boundTask).toEqual({ taskId: a });

    useTimerStore.getState().resume();
    expect(useTimerStore.getState().boundTask).toEqual({ taskId: a });
    clock.mockReturnValue(T0 + FOCUS_MS);
  });

  it("releases the binding when the phase goes idle", async () => {
    const { client: t } = await identity();
    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });
    useTimerStore.setState({ activeTask: { taskId: a } });

    const clock = vi.spyOn(Date, "now").mockReturnValue(T0);
    useTimerStore.getState().start();
    expect(useTimerStore.getState().boundTask).toEqual({ taskId: a });

    useTimerStore.getState().reset();
    expect(useTimerStore.getState().boundTask).toBeNull();
    expect(useTimerStore.getState().state.startedAt).toBeNull();
    clock.mockReturnValue(T0 + FOCUS_MS);
  });

  it("pairs a binding with a running phase and nothing with an idle one", async () => {
    // The invariant `logCompleted` leans on: no start, no binding — which is
    // what stops an idle timer from attributing time nobody spent.
    const { client: t } = await identity();
    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });

    expect(useTimerStore.getState().boundTask).toBeNull();
    expect(useTimerStore.getState().state.startedAt).toBeNull();

    useTimerStore.setState({ activeTask: { taskId: a } });
    const clock = vi.spyOn(Date, "now").mockReturnValue(T0);
    useTimerStore.getState().start();
    expect(useTimerStore.getState().boundTask).toEqual({ taskId: a });

    useTimerStore.getState().pause();
    expect(useTimerStore.getState().boundTask).toEqual({ taskId: a });
    clock.mockReturnValue(T0 + FOCUS_MS);
  });

  it("logs no task for a phase that began with nothing selected", async () => {
    const { base, client: t } = await identity();

    const { entries, flush, logger } = wiring(t);
    useTimerStore.setState({ sessionLogger: logger });

    runFocusPhase();
    await flush();

    expect(entries).toHaveLength(1);
    expect(entries[0].taskId).toBeUndefined();

    const rows = await sessionsOf(base);
    expect(rows).toHaveLength(1);
    expect(rows[0].taskId).toBeUndefined();
  });
});

describe("leaf progress is derived, never stored (ADR-003)", () => {
  it("counts focus sessions against a task and nothing else", async () => {
    const { client: t } = await identity();

    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 4 });
    await t.mutation(api.sessions.logCompleted, { ...FOCUS_SPAN, taskId: a });
    await t.mutation(api.sessions.logCompleted, {
      ...FOCUS_SPAN,
      phase: "short",
      startedAt: T0 + FOCUS_MS,
      completedAt: T0 + FOCUS_MS + 5 * MIN,
      taskId: a,
    });

    // Two sessions, one leaf: breaks are sessions too, but no task is made
    // of them.
    expect(await t.query(api.tasks.leafCounts, {})).toEqual({ [a]: 1 });
  });

  it("counts per task rather than in total", async () => {
    const { client: t } = await identity();

    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 4 });
    const b = await t.mutation(api.tasks.create, { title: "B", estimate: 4 });

    await t.mutation(api.sessions.logCompleted, { ...FOCUS_SPAN, taskId: a });
    await t.mutation(api.sessions.logCompleted, {
      ...FOCUS_SPAN,
      startedAt: T0 + FOCUS_MS,
      completedAt: T0 + 2 * FOCUS_MS,
      taskId: a,
    });
    await t.mutation(api.sessions.logCompleted, {
      ...FOCUS_SPAN,
      startedAt: T0 + 2 * FOCUS_MS,
      completedAt: T0 + 3 * FOCUS_MS,
      taskId: b,
    });

    expect(await t.query(api.tasks.leafCounts, {})).toEqual({ [a]: 2, [b]: 1 });
  });

  it("counts zero for a task the log has never seen", async () => {
    const { client: t } = await identity();

    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });
    expect(await t.query(api.tasks.leafCounts, {})).toEqual({ [a]: 0 });
  });

  /**
   * The task's own verification: *start with task A active → complete → A
   * +1 leaf, and the session row has A's id.* Driven end to end — selection,
   * store, mutation, and the count read back out of the log.
   */
  it("credits exactly the task that was active when the session began", async () => {
    const { base, client: t } = await identity();

    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });
    const b = await t.mutation(api.tasks.create, { title: "B", estimate: 2 });
    await t.mutation(api.tasks.selectTask, { taskId: a });

    const { flush, logger } = wiring(t);
    useTimerStore.setState({ activeTask: { taskId: a }, sessionLogger: logger });

    runFocusPhase();
    await flush();

    const rows = await sessionsOf(base);
    expect(rows).toHaveLength(1);
    expect(rows[0].taskId).toBe(a);

    expect(await t.query(api.tasks.leafCounts, {})).toEqual({ [a]: 1, [b]: 0 });
  });
});
