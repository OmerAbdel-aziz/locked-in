import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { APPEND_STEP, orderBetween } from "@/convex/lib/order";
import schema from "@/convex/schema";

/**
 * Task 9 gate: task CRUD, owner enforcement, and fractional reordering.
 *
 * The ordering half is the load-bearing part, and it is asserted from two
 * directions because both are easy to get wrong in ways that only surface
 * weeks later in a live list:
 *
 *   - **Reorder is O(1).** Proven by reading every *other* row's key before
 *     and after a drag and requiring it to be bit-identical. A renumbering
 *     implementation cannot pass that — it rewrites the tail of the list —
 *     so the test fails on the design rather than on an incidental bug.
 *   - **Reorder is stable under concurrent orders.** Two drags issued
 *     together must both survive, in different gaps, with every key still
 *     distinct. They would not if positioning read-and-wrote the whole
 *     list: the second write would carry the first one's intent out with it.
 *
 * The rest of the file is the ordinary contract — who may write what, which
 * fields follow which — written out because `tasks` rows are edited through
 * a UI and there is no downstream repair path waiting to notice a row that
 * completed without a timestamp or an estimate of 90.
 */

const modules = import.meta.glob("../convex/**/*.*s");

function newTest() {
  return convexTest(schema, modules);
}

type Test = ReturnType<typeof newTest>;

/**
 * Two owners sharing one database, each with a caller of their own.
 *
 * Ownership is the only authorization there is, so most of the negative
 * cases need somebody else's row to reach for.
 */
async function world() {
  const base = newTest();
  const ownerId = await base.run((ctx) =>
    ctx.db.insert("users", { createdAt: 1, isAnonymous: true }),
  );
  const strangerId = await base.run((ctx) =>
    ctx.db.insert("users", { createdAt: 2, isAnonymous: true }),
  );

  return {
    base,
    ownerId,
    strangerId,
    /** The owner's session — `resolveOwner` reads the id out of the subject. */
    t: base.withIdentity({ subject: `${ownerId}|s1` }),
    /** Another user entirely, for cross-tenant attempts. */
    stranger: base.withIdentity({ subject: `${strangerId}|s2` }),
  };
}

type Caller = Awaited<ReturnType<typeof world>>["t"];

async function getTask(base: Test, id: Id<"tasks">): Promise<Doc<"tasks">> {
  const task = await base.run((ctx) => ctx.db.get(id));
  if (task === null) {
    throw new Error(`expected task ${id} to exist`);
  }
  return task;
}

/** Ids in the order the dashboard will show them: open rows, then finished. */
async function layout(t: Caller) {
  const { active, completed } = await t.query(api.tasks.list, {});
  return {
    ids: active.map((task) => task._id),
    orders: active.map((task) => task.order),
    finished: completed.map((task) => task._id),
  };
}

function make(t: Caller, title: string, estimate = 2) {
  return t.mutation(api.tasks.create, { title, estimate });
}

async function seedProject(base: Test, ownerId: Id<"users">, name = "Ship") {
  return base.run((ctx) => ctx.db.insert("projects", { ownerId, name }));
}

describe("orderBetween", () => {
  it("extends the list by a wide step at either end", () => {
    expect(orderBetween(0, null)).toBe(APPEND_STEP);
    expect(orderBetween(null, 0)).toBe(-APPEND_STEP);
    // Neither neighbour named — only meaningful when there is no list yet.
    expect(orderBetween(null, null)).toBe(0);
  });

  it("splits a gap in half", () => {
    expect(orderBetween(0, 8)).toBe(4);
    expect(orderBetween(4, 8)).toBe(6);
    expect(orderBetween(4, 6)).toBe(5);
  });

  it("keeps splitting one gap forty times without a duplicate or a tie", () => {
    // The headroom claim in `convex/lib/order.ts`: every generated key lands
    // strictly inside its gap, so forty interleaves into a *single* gap are
    // still strictly ordered. (The limit is ~52 — this shows where the
    // arithmetic is comfortable, and the next case shows where it refuses.)
    let following = APPEND_STEP;
    const preceding = 0;
    const generated: number[] = [];

    for (let i = 0; i < 40; i++) {
      const midpoint = orderBetween(preceding, following);
      expect(midpoint).toBeGreaterThan(preceding);
      expect(midpoint).toBeLessThan(following);
      generated.push(midpoint);
      following = midpoint;
    }

    expect(new Set(generated).size).toBe(generated.length);
    expect(new Set([...generated, preceding]).size).toBe(generated.length + 1);
  });

  it("refuses to invent a key once a gap is exhausted", () => {
    // 1 and 1 + 2^-52 are adjacent IEEE-754 doubles: nothing sorts between
    // them. Emitting a duplicate here would leave two tasks tied on `order`
    // forever, so the arithmetic stops instead.
    expect(() => orderBetween(1, 1 + Number.EPSILON)).toThrow(/exhausted/i);
  });

  it("refuses neighbours that are not in ascending order", () => {
    // A stale view of the list: writing the key this would compute is how a
    // drag scrambles a display it cannot see.
    expect(() => orderBetween(10, 4)).toThrow(/ascending/i);
    expect(() => orderBetween(7, 7)).toThrow(/ascending/i);
  });
});

describe("create", () => {
  it("appends an open task to the end of the owner's list", async () => {
    const { base, ownerId, t } = await world();

    const first = await make(t, "  draft the outline  ", 4);
    const second = await make(t, "review PRs", 0);
    const { ids, orders, finished } = await layout(t);

    expect(ids).toEqual([first, second]);
    expect(orders[1] - orders[0]).toBe(APPEND_STEP);
    expect(finished).toEqual([]);

    const row = await getTask(base, first);
    expect(row.title).toBe("draft the outline");
    expect(row.estimate).toBe(4);
    expect(row.activeFlag).toBe(true);
    expect(row.ownerId).toBe(ownerId);
    // PRD §6: `completedAt` is present when done. A new task simply has no
    // such field — not a null standing in for one.
    expect(row).not.toHaveProperty("completedAt");
  });

  it("gives two simultaneous creates distinct keys", async () => {
    const { t } = await world();

    // Two adds racing for the same tail. If both read `last` and append the
    // same key, the pair ties on `order` — display still resolves it through
    // `_creationTime`, but every later drag *into* that gap has nowhere to
    // put a key, and `orderBetween` would refuse both neighbours as
    // not-ascending. Which add lands first is Convex's to settle; that they
    // are distinct is the contract.
    const [first, second] = await Promise.all([
      make(t, "first add"),
      make(t, "second add"),
    ]);

    const { ids, orders } = await layout(t);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(first);
    expect(ids).toContain(second);
    expect(new Set(orders).size).toBe(2);
  });

  it.each(["", "    "])("rejects the blank title %j", async (title) => {
    const { t } = await world();
    await expect(make(t, title, 2)).rejects.toThrow(/cannot be empty/i);
  });

  it("rejects an absurdly long title", async () => {
    const { t } = await world();
    await expect(make(t, "x".repeat(201), 2)).rejects.toThrow(/limit is 200/);
  });

  // The schema comment on `estimate` promises the range is enforced in the
  // mutation rather than the validator — this is that promise.
  it.each([9, -1, 2.5])("rejects the estimate %s", async (estimate) => {
    const { t } = await world();
    await expect(make(t, "write tests", estimate)).rejects.toThrow(/0 to 8/);
  });

  it("files a task under the owner's project", async () => {
    const { base, ownerId, t } = await world();
    const projectId = await seedProject(base, ownerId);

    const id = await t.mutation(api.tasks.create, {
      title: "ship it",
      estimate: 2,
      projectId,
    });

    expect((await getTask(base, id)).projectId).toBe(projectId);
  });

  it("will not file a task under somebody else's project", async () => {
    const { base, strangerId, t } = await world();
    const theirs = await seedProject(base, strangerId, "Their work");

    await expect(
      t.mutation(api.tasks.create, {
        title: "sneaky",
        estimate: 1,
        projectId: theirs,
      }),
    ).rejects.toThrow(/project not found/);

    const { active } = await t.query(api.tasks.list, {});
    expect(active).toHaveLength(0);
  });
});

describe("update", () => {
  it("edits the fields it is given and leaves the position alone", async () => {
    const { base, t } = await world();
    const id = await make(t, "old name", 2);
    const before = await getTask(base, id);

    await t.mutation(api.tasks.update, {
      taskId: id,
      title: "  new name  ",
      estimate: 6,
    });

    const after = await getTask(base, id);
    expect(after.title).toBe("new name");
    expect(after.estimate).toBe(6);
    expect(after.order).toBe(before.order);
    expect(after.ownerId).toBe(before.ownerId);
    expect(after.activeFlag).toBe(true);
  });

  it("omits fields it was not asked about", async () => {
    const { base, t } = await world();
    const id = await make(t, "title only", 3);

    // No `estimate` in the arguments — it must survive untouched.
    await t.mutation(api.tasks.update, { taskId: id, title: "renamed" });

    expect((await getTask(base, id)).estimate).toBe(3);
  });

  it("binds and unbinds a project", async () => {
    const { base, ownerId, t } = await world();
    const projectId = await seedProject(base, ownerId);
    const id = await make(t, "task", 1);

    await t.mutation(api.tasks.update, { taskId: id, projectId });
    expect((await getTask(base, id)).projectId).toBe(projectId);

    // `null` means "clear it"; omitting the argument means "leave it alone".
    // Pinning the difference: a bug here silently re-files every task.
    await t.mutation(api.tasks.update, { taskId: id, projectId: null });
    expect(await getTask(base, id)).not.toHaveProperty("projectId");

    const untouched = await make(t, "another", 1);
    await t.mutation(api.tasks.update, { taskId: untouched, title: "kept" });
    expect((await getTask(base, untouched))).not.toHaveProperty("projectId");
  });

  it("will not re-file a task under somebody else's project", async () => {
    const { base, strangerId, t } = await world();
    const id = await make(t, "task", 1);
    const theirs = await seedProject(base, strangerId);

    await expect(
      t.mutation(api.tasks.update, { taskId: id, projectId: theirs }),
    ).rejects.toThrow(/project not found/);
    expect((await getTask(base, id))).not.toHaveProperty("projectId");
  });

  it("rejects a blank or over-long replacement title", async () => {
    const { t } = await world();
    const id = await make(t, "task", 1);

    await expect(
      t.mutation(api.tasks.update, { taskId: id, title: "   " }),
    ).rejects.toThrow(/cannot be empty/i);
    await expect(
      t.mutation(api.tasks.update, { taskId: id, title: "x".repeat(201) }),
    ).rejects.toThrow(/limit is 200/);
  });

  it("will not touch a task owned by somebody else", async () => {
    const { stranger, t } = await world();
    const theirs = await make(stranger, "theirs", 2);

    // "Not found" rather than "forbidden": an owner check that says which it
    // was would let these mutations confirm the existence of foreign ids.
    await expect(
      t.mutation(api.tasks.update, { taskId: theirs, title: "mine now" }),
    ).rejects.toThrow(/task not found/);

    const stillTheirs = await stranger.query(api.tasks.list, {});
    expect(stillTheirs.active[0].title).toBe("theirs");
  });
});

describe("remove", () => {
  it("deletes the row and leaves its neighbours in place", async () => {
    const { base, t } = await world();
    const first = await make(t, "keep me", 2);
    const doomed = await make(t, "delete me", 4);
    const last = await make(t, "also keep", 1);

    await t.mutation(api.tasks.remove, { taskId: doomed });

    const { active } = await t.query(api.tasks.list, {});
    expect(active.map((task) => task._id)).toEqual([first, last]);
    // The survivor's fractional key is untouched — deleting renumbers
    // nothing (the same O(1) property `reorder` holds).
    expect(active[0].order).toBeLessThan(active[1].order);
    expect(await base.run((ctx) => ctx.db.get(doomed))).toBeNull();
  });

  it("clears the selection when the deleted task was the active one", async () => {
    const { base, ownerId, t } = await world();
    const id = await make(t, "selected", 2);
    await t.mutation(api.tasks.selectTask, { taskId: id });

    await t.mutation(api.tasks.remove, { taskId: id });

    // The pointer is repaired here, not left to dangle until the next
    // session write notices: a rail that vanished while the timer keeps
    // crediting a ghost is worse than one that clears.
    const owner = await base.run((ctx) => ctx.db.get(ownerId));
    expect(owner?.activeTaskId).toBeUndefined();
  });

  it("leaves the selection alone when the deleted task was not active", async () => {
    const { base, ownerId, t } = await world();
    const selected = await make(t, "selected", 2);
    const other = await make(t, "other", 1);
    await t.mutation(api.tasks.selectTask, { taskId: selected });

    await t.mutation(api.tasks.remove, { taskId: other });

    const owner = await base.run((ctx) => ctx.db.get(ownerId));
    expect(owner?.activeTaskId).toBe(selected);
  });

  it("keeps the session history the deleted task accrued", async () => {
    const { base, t, ownerId } = await world();
    const id = await make(t, "doomed but remembered", 2);
    // One focus session bound to the task, through the real writer.
    // Timestamps must postdate 2020 (the mutation's plausibility floor).
    const start = Date.UTC(2026, 4, 1, 9);
    await t.mutation(api.sessions.logCompleted, {
      startedAt: start,
      completedAt: start + 25 * 60_000,
      phase: "focus",
      tzOffsetAtCompletion: 0,
      taskId: id,
    });

    await t.mutation(api.tasks.remove, { taskId: id });

    // ADR-003: the log is append-only, and CSV import is its only repair
    // path. Deleting the task removes the *label*, never the hours.
    const sessions = await base.run((ctx) =>
      ctx.db
        .query("sessions")
        .withIndex("by_owner_completed", (q) => q.eq("ownerId", ownerId))
        .collect(),
    );
    expect(sessions).toHaveLength(1);
    // The row keeps the id it was bound to (the snapshot, D8) — history
    // renders it unbound-by-deletion rather than rewriting the past.
    expect(sessions[0].taskId).toBe(id);
  });

  it("will not delete a task owned by somebody else", async () => {
    const { stranger, t } = await world();
    const theirs = await make(stranger, "theirs", 2);

    // "not found", never "forbidden" — the same stance every other
    // cross-tenant path takes (see `update` above).
    await expect(
      t.mutation(api.tasks.remove, { taskId: theirs }),
    ).rejects.toThrow(/task not found/);
    expect((await stranger.query(api.tasks.list, {})).active).toHaveLength(1);
  });

  it("refuses an unauthenticated caller", async () => {
    const { base } = await world();
    const id = await base.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        createdAt: 1,
        isAnonymous: true,
      });
      return await ctx.db.insert("tasks", {
        ownerId,
        title: "task",
        estimate: 2,
        order: 1,
        activeFlag: true,
      });
    });

    await expect(
      base.mutation(api.tasks.remove, { taskId: id }),
    ).rejects.toThrow(/unauthenticated/);
  });
});

describe("complete and uncomplete", () => {
  it("stamps completedAt and keeps the row", async () => {
    const { base, t } = await world();
    const id = await make(t, "write it", 2);
    const openOrder = (await getTask(base, id)).order;

    const justBefore = Date.now();
    await t.mutation(api.tasks.complete, { taskId: id });
    const after = Date.now();

    const done = await getTask(base, id);
    expect(done).not.toBeNull();
    expect(done.activeFlag).toBe(false);
    expect(done.completedAt).toBeGreaterThanOrEqual(justBefore);
    expect(done.completedAt).toBeLessThanOrEqual(after);
    // Completing moves the row between buckets; it must not move it in the list.
    expect(done.order).toBe(openOrder);
  });

  it("clears completedAt when the task comes back", async () => {
    const { base, t } = await world();
    const id = await make(t, "write it", 2);

    await t.mutation(api.tasks.complete, { taskId: id });
    await t.mutation(api.tasks.uncomplete, { taskId: id });

    const reopened = await getTask(base, id);
    expect(reopened.activeFlag).toBe(true);
    // The matched pair from PRD §6: present when done, absent when not.
    // Left stale, `completedAt` would answer "when was this last finished?"
    // while every reader asks it "is it finished?".
    expect(reopened).not.toHaveProperty("completedAt");
  });

  it("keeps completedAt through later edits — the acceptance criterion", async () => {
    const { base, t } = await world();
    const id = await make(t, "original", 2);

    await t.mutation(api.tasks.complete, { taskId: id });
    const stamped = (await getTask(base, id)).completedAt;

    await t.mutation(api.tasks.update, { taskId: id, title: "renamed", estimate: 8 });

    const edited = await getTask(base, id);
    expect(edited.completedAt).toBe(stamped);
    expect(edited.activeFlag).toBe(false);
  });

  it("will not complete somebody else's task", async () => {
    const { base, stranger, t } = await world();
    const theirs = await make(stranger, "theirs", 2);

    await expect(
      t.mutation(api.tasks.complete, { taskId: theirs }),
    ).rejects.toThrow(/task not found/);
    expect((await getTask(base, theirs)).activeFlag).toBe(true);
  });

  it("will not uncomplete somebody else's task", async () => {
    const { base, stranger, t } = await world();
    const theirs = await make(stranger, "theirs", 2);
    await stranger.mutation(api.tasks.complete, { taskId: theirs });

    await expect(
      t.mutation(api.tasks.uncomplete, { taskId: theirs }),
    ).rejects.toThrow(/task not found/);
    expect((await getTask(base, theirs)).activeFlag).toBe(false);
  });
});

describe("clearCompleted", () => {
  it("deletes only the caller's finished tasks, and says how many", async () => {
    const { base, stranger, t } = await world();

    const keep = await make(t, "still open", 2);
    const first = await make(t, "done one", 1);
    const second = await make(t, "done two", 1);
    await t.mutation(api.tasks.complete, { taskId: first });
    await t.mutation(api.tasks.complete, { taskId: second });

    const theirs = await make(stranger, "their done task", 1);
    await stranger.mutation(api.tasks.complete, { taskId: theirs });

    await expect(t.mutation(api.tasks.clearCompleted, {})).resolves.toBe(2);

    expect(await layout(t)).toMatchObject({ ids: [keep], finished: [] });
    // Another owner's clearable rows are not collateral.
    const theirList = await stranger.query(api.tasks.list, {});
    expect(theirList.completed.map((task) => task._id)).toEqual([theirs]);
    expect(await base.run((ctx) => ctx.db.get(theirs))).not.toBeNull();
  });

  it("keeps going past a single batch", async () => {
    const { base, ownerId, t } = await world();
    // One more than `CLEAR_BATCH`: a read-then-delete that stops after one
    // round would report success and leave a row behind.
    await base.run(async (ctx) => {
      for (let i = 0; i < 101; i++) {
        await ctx.db.insert("tasks", {
          ownerId,
          title: `done ${i}`,
          estimate: 1,
          order: i,
          activeFlag: false,
          completedAt: 1,
        });
      }
    });

    await expect(t.mutation(api.tasks.clearCompleted, {})).resolves.toBe(101);
    expect((await t.query(api.tasks.list, {})).completed).toHaveLength(0);
  });

  it("is a no-op when nothing is finished", async () => {
    const { t } = await world();
    const keep = await make(t, "open", 2);

    await expect(t.mutation(api.tasks.clearCompleted, {})).resolves.toBe(0);
    expect((await layout(t)).ids).toEqual([keep]);
  });
});

describe("list", () => {
  it("orders each bucket and shows the caller only their own rows", async () => {
    const { t, stranger } = await world();

    const a = await make(stranger, "their a", 1);
    const one = await make(t, "one", 1);
    const two = await make(t, "two", 1);
    const three = await make(t, "three", 1);
    // Finished out of order, so the finished bucket's own ordering is visible.
    await t.mutation(api.tasks.complete, { taskId: three });
    await t.mutation(api.tasks.complete, { taskId: one });

    const { ids, finished, orders } = await layout(t);

    expect(ids).toEqual([two]);
    // Finished rows keep their arrangement — `order` is the list's, not a
    // completion timestamp.
    expect(finished).toEqual([one, three]);
    expect(orders).toHaveLength(1);

    const theirs = await layout(stranger);
    expect(theirs.ids).toEqual([a]);
    expect(theirs.finished).toEqual([]);
  });

  it("rejects a caller with no session", async () => {
    const t = newTest();
    await expect(t.query(api.tasks.list, {})).rejects.toThrow(/unauthenticated/i);
  });
});

describe("reorder", () => {
  it("writes only the moved row — every other key is bit-identical", async () => {
    const { base, t } = await world();
    const a = await make(t, "a");
    const b = await make(t, "b");
    const c = await make(t, "c");
    const d = await make(t, "d");

    const before = [a, b, c].map(async (id) => (await getTask(base, id)).order);
    const untouchedBefore = await Promise.all(before);

    await t.mutation(api.tasks.reorder, { taskId: d, afterId: a, beforeId: b });

    const untouchedAfter = await Promise.all(
      [a, b, c].map(async (id) => (await getTask(base, id)).order),
    );
    expect(untouchedAfter).toEqual(untouchedBefore);

    const moved = await getTask(base, d);
    const first = await getTask(base, a);
    const second = await getTask(base, b);
    expect(moved.order).toBeGreaterThan(first.order);
    expect(moved.order).toBeLessThan(second.order);
    expect(moved.order).not.toBe(first.order);
    expect(moved.order).not.toBe(second.order);
  });

  it("holds after two consecutive reorders", async () => {
    const { t } = await world();
    const a = await make(t, "a");
    const b = await make(t, "b");
    const c = await make(t, "c");
    expect((await layout(t)).ids).toEqual([a, b, c]);

    // 1: c to the front.
    await t.mutation(api.tasks.reorder, { taskId: c, afterId: null, beforeId: a });
    expect((await layout(t)).ids).toEqual([c, a, b]);

    // 2: a past b — a reorder whose predecessors changed underneath it.
    await t.mutation(api.tasks.reorder, { taskId: a, afterId: b, beforeId: null });
    expect((await layout(t)).ids).toEqual([c, b, a]);

    const { orders } = await layout(t);
    expect(new Set(orders).size).toBe(3);
    expect(orders).toEqual([...orders].sort((x, y) => x - y));
  });

  it("keeps both moves when two drags are issued at once", async () => {
    const { t } = await world();
    const a = await make(t, "a");
    const b = await make(t, "b");
    const c = await make(t, "c");
    const d = await make(t, "d");
    const e = await make(t, "e");

    // Different gaps, no shared rows: neither drag's key depends on the
    // other's outcome, so neither may be lost to it. `afterId: e` names the
    // last row *now*, and `beforeId: null` re-anchors past whatever is last
    // at commit time — the two orders of committing settle on the same
    // arrangement rather than on two different key values.
    await Promise.all([
      t.mutation(api.tasks.reorder, { taskId: e, afterId: null, beforeId: a }),
      t.mutation(api.tasks.reorder, { taskId: b, afterId: e, beforeId: null }),
    ]);

    const { ids, orders } = await layout(t);
    expect(ids).toEqual([e, a, c, d, b]);
    expect(new Set(orders).size).toBe(5);
    expect(orders).toEqual([...orders].sort((x, y) => x - y));
  });

  it("is a no-op where the row already sits", async () => {
    const { base, t } = await world();
    const a = await make(t, "a");
    const b = await make(t, "b");
    const c = await make(t, "c");

    const before = (await getTask(base, b)).order;
    await t.mutation(api.tasks.reorder, { taskId: b, afterId: a, beforeId: c });
    expect((await getTask(base, b)).order).toBe(before);
    expect((await layout(t)).ids).toEqual([a, b, c]);
  });

  it("drops a row at either end of the list", async () => {
    const { t } = await world();
    const a = await make(t, "a");
    const b = await make(t, "b");
    const c = await make(t, "c");

    // Nothing precedes it, and `a` is the row it will sit above.
    await t.mutation(api.tasks.reorder, { taskId: c, afterId: null, beforeId: a });
    expect((await layout(t)).ids).toEqual([c, a, b]);

    // `b` is the last row, and nothing follows it.
    await t.mutation(api.tasks.reorder, { taskId: c, afterId: b, beforeId: null });
    expect((await layout(t)).ids).toEqual([a, b, c]);
  });

  it("puts a row past every other row when nothing follows it", async () => {
    const { t } = await world();
    const a = await make(t, "a");
    const b = await make(t, "b");
    const c = await make(t, "c");

    // "After b, and nothing follows it" cannot mean "just past b" — `c` still
    // follows b. The end is whatever is last, so the row lands last even
    // though the neighbour it named was an interior one.
    await t.mutation(api.tasks.reorder, { taskId: a, afterId: b, beforeId: null });
    expect((await layout(t)).ids).toEqual([b, c, a]);
  });

  it("puts a row ahead of every other row when nothing precedes it", async () => {
    const { t } = await world();
    const a = await make(t, "a");
    const b = await make(t, "b");
    const c = await make(t, "c");

    // Symmetric: "nothing precedes it, before c" does not mean "just under
    // c", because `a` precedes c.
    await t.mutation(api.tasks.reorder, { taskId: b, afterId: null, beforeId: c });
    expect((await layout(t)).ids).toEqual([b, a, c]);
  });

  it("does not move a row when the drop names no gap", async () => {
    const { base, t } = await world();
    const a = await make(t, "a");
    const b = await make(t, "b");
    const c = await make(t, "c");
    const ordersBefore = [a, b, c].map(async (id) => (await getTask(base, id)).order);

    // Naming neither neighbour describes no gap between any two rows. Picking
    // an end here would be wrong half the time, and *visibly* wrong only when
    // the caller noticed — so the row stays put.
    await t.mutation(api.tasks.reorder, { taskId: c });
    expect((await layout(t)).ids).toEqual([a, b, c]);
    expect(await Promise.all(ordersBefore)).toEqual(
      await Promise.all([a, b, c].map(async (id) => (await getTask(base, id)).order)),
    );
  });

  it("leaves a lone row where it is", async () => {
    const { base, t } = await world();
    const only = await make(t, "only");
    const before = (await getTask(base, only)).order;

    await t.mutation(api.tasks.reorder, { taskId: only });
    expect((await getTask(base, only)).order).toBe(before);
    expect((await layout(t)).ids).toEqual([only]);
  });

  it("refuses a row asked to position against itself", async () => {
    const { t } = await world();
    const a = await make(t, "a");
    const b = await make(t, "b");

    await expect(
      t.mutation(api.tasks.reorder, { taskId: a, afterId: a, beforeId: b }),
    ).rejects.toThrow(/against itself/);
    expect((await layout(t)).ids).toEqual([a, b]);
  });

  it("refuses a neighbour owned by somebody else", async () => {
    const { stranger, t } = await world();
    const mine = await make(t, "mine", 1);
    const theirs = await make(stranger, "theirs", 1);

    await expect(
      t.mutation(api.tasks.reorder, { taskId: mine, afterId: theirs, beforeId: null }),
    ).rejects.toThrow(/task not found/);
    await expect(
      t.mutation(api.tasks.reorder, { taskId: mine, afterId: null, beforeId: theirs }),
    ).rejects.toThrow(/task not found/);
    await expect(
      t.mutation(api.tasks.reorder, { taskId: theirs, afterId: mine, beforeId: null }),
    ).rejects.toThrow(/task not found/);
  });

  it("refuses to reorder across the open/completed boundary", async () => {
    const { t } = await world();
    const a = await make(t, "a");
    const b = await make(t, "b");
    await t.mutation(api.tasks.complete, { taskId: b });

    // A finished neighbour would give the open row a key that says nothing
    // about where it belongs among open rows.
    await expect(
      t.mutation(api.tasks.reorder, { taskId: a, afterId: b, beforeId: null }),
    ).rejects.toThrow(/open\/completed boundary/);
    expect((await layout(t)).ids).toEqual([a]);
  });

  it("refuses an inverted pair of neighbours", async () => {
    const { t } = await world();
    const a = await make(t, "a");
    const b = await make(t, "b");
    const c = await make(t, "c");

    await expect(
      t.mutation(api.tasks.reorder, { taskId: b, afterId: c, beforeId: a }),
    ).rejects.toThrow(/ascending/);
    expect((await layout(t)).ids).toEqual([a, b, c]);
  });
});

describe("owner enforcement", () => {
  // The acceptance criterion for the whole file, applied uniformly: no
  // function reaches its body without `resolveOwner`.
  it("refuses every function when the caller has no session", async () => {
    const t = newTest();
    const taskId = await baseTask(t);

    await expect(t.mutation(api.tasks.create, { title: "x", estimate: 1 })).rejects.toThrow(/unauthenticated/i);
    await expect(t.mutation(api.tasks.update, { taskId, title: "x" })).rejects.toThrow(/unauthenticated/i);
    await expect(t.mutation(api.tasks.complete, { taskId })).rejects.toThrow(/unauthenticated/i);
    await expect(t.mutation(api.tasks.uncomplete, { taskId })).rejects.toThrow(/unauthenticated/i);
    await expect(t.mutation(api.tasks.clearCompleted, {})).rejects.toThrow(/unauthenticated/i);
    await expect(t.mutation(api.tasks.reorder, { taskId })).rejects.toThrow(/unauthenticated/i);
    await expect(t.query(api.tasks.list, {})).rejects.toThrow(/unauthenticated/i);
  });
});

/** A row inserted directly, so the unauthenticated cases have a valid id. */
async function baseTask(t: Test): Promise<Id<"tasks">> {
  return t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      createdAt: 1,
      isAnonymous: true,
    });
    return ctx.db.insert("tasks", {
      ownerId,
      title: "seed",
      estimate: 2,
      order: 0,
      activeFlag: true,
    });
  });
}
