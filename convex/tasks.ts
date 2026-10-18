/**
 * Task CRUD + fractional reordering — Task 9 (PRD §4.2, §6).
 *
 * Every function resolves its caller through `resolveOwner`; no argument ever
 * names an owner. A document that belongs to somebody else is reported as
 * "not found" rather than "forbidden", so these mutations cannot be used to
 * probe for the existence of another user's rows.
 *
 * Nothing here renumbers a list. Positions come from `lib/order.ts`, so a
 * drag writes exactly one document — see that file for why.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { orderBetween } from "./lib/order";
import {
  requireOwnedProject,
  requireOwnedTask,
  resolveOwner,
} from "./lib/owner";
import { perProjectBreakdown } from "../lib/aggregations";

/** Upper bound for the bento donut's project-name reads (ADR-006). */
const PROJECTS_CAP = 500;

/** PRD §4.2 lets a title be edited inline; this bounds a single row. */
const MAX_TITLE_LENGTH = 200;

/**
 * Upper bound on one `list` call, per the Convex guideline that a query
 * returns a bounded collection unless asked for everything. Sized past any
 * plausible personal task list: `.take()` stops when the index range is
 * exhausted, so the cap costs nothing for a list below it and never silently
 * truncates one that is merely long.
 */
const LIST_LIMIT = 1000;

/** `clearCompleted` deletes in batches, so one call stays inside a transaction. */
const CLEAR_BATCH = 100;
const MAX_CLEAR_ROUNDS = 50;

function validTitle(raw: string): string {
  const title = raw.trim();
  if (title.length === 0) {
    throw new Error("tasks: title cannot be empty");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(
      `tasks: title is ${title.length} characters; the limit is ${MAX_TITLE_LENGTH}`,
    );
  }
  return title;
}

/**
 * PRD §4.2 range is 0-8 with a default of 2, and the schema comment on
 * `estimate` says explicitly that the range is enforced *in the mutation, not
 * the validator* — so the argument is a plain `v.number()` and the bounds
 * live here.
 */
function validEstimate(raw: number): number {
  if (!Number.isInteger(raw) || raw < 0 || raw > 8) {
    throw new Error(`tasks: estimate must be a whole number from 0 to 8, got ${raw}`);
  }
  return raw;
}

/**
 * Ownership of a referenced row is proved by `requireOwnedTask` /
 * `requireOwnedProject` in `lib/owner.ts`, which `logCompleted` needs too —
 * see that module for why the check has one home rather than one copy here.
 */

/**
 * The bucket a task's `order` is compared within.
 *
 * `activeFlag` means "is it open?" (the schema comment calls it the fast path
 * for that question), and `by_owner_active` indexes `(ownerId, activeFlag,
 * order)` — so ordering is meaningful *within* one bucket, not across both.
 * Reordering an open task between two finished ones would hand it a key that
 * says nothing about where it sits among the open tasks, so the neighbours
 * must share the row's flag and we reject a mix rather than write a key whose
 * meaning is ambiguous.
 */
function bucketTasks(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">,
  activeFlag: boolean,
) {
  return ctx.db
    .query("tasks")
    .withIndex("by_owner_active", (q) =>
      q.eq("ownerId", ownerId).eq("activeFlag", activeFlag),
    );
}

/** Last open task in display order — the anchor an append writes after. */
async function lastOpenTask(
  ctx: MutationCtx,
  ownerId: Id<"users">,
): Promise<Doc<"tasks"> | null> {
  return await bucketTasks(ctx, ownerId, true).order("desc").first();
}

/**
 * Creates a task at the end of the owner's open list.
 *
 * `completedAt` is omitted rather than written as `null`: PRD §6 says it is
 * "present when done", so a freshly created task has no such field at all.
 */
export const create = mutation({
  args: {
    title: v.string(),
    estimate: v.number(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const title = validTitle(args.title);
    const estimate = validEstimate(args.estimate);
    if (args.projectId !== undefined) {
      await requireOwnedProject(ctx, ownerId, args.projectId);
    }

    const last = await lastOpenTask(ctx, ownerId);

    return await ctx.db.insert("tasks", {
      ownerId,
      title,
      estimate,
      projectId: args.projectId,
      // Appending has no right-hand neighbour, so it extends the list rather
      // than splitting a gap — the reason `APPEND_STEP` is wide.
      order: orderBetween(last === null ? null : last.order, null),
      activeFlag: true,
    });
  },
});

/**
 * Edits title, estimate, or project binding. Passing `projectId: null` unbinds
 * it (`undefined` would mean "leave it alone", which is why the validator
 * admits `null` alongside the id).
 *
 * `order` is never touched here: that is `reorder`'s job, so an edit cannot
 * move a row and a drag cannot rewrite its text.
 */
export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    estimate: v.optional(v.number()),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const task = await requireOwnedTask(ctx, ownerId, args.taskId);

    const patch: Partial<Doc<"tasks">> = {};
    if (args.title !== undefined) {
      patch.title = validTitle(args.title);
    }
    if (args.estimate !== undefined) {
      patch.estimate = validEstimate(args.estimate);
    }
    if (args.projectId !== undefined) {
      if (args.projectId === null) {
        // `patch` deletes a field given `undefined`, and the key is present
        // here with an undefined value precisely so the unbind is a change
        // rather than an omission.
        patch.projectId = undefined;
      } else {
        await requireOwnedProject(ctx, ownerId, args.projectId);
        patch.projectId = args.projectId;
      }
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(task._id, patch);
    }
    return task._id;
  },
});

/**
 * Deletes one owned task.
 *
 * Added in the Phase 9 polish (human-directed): PRD §4.2 listed
 * create/complete/reorder only, but a list with no way back from a typo is
 * a trap — the add pill takes a title in one field with no undo.
 *
 * What survives the delete, and why that is safe:
 *   - **Sessions keep their rows.** `sessions` is append-only (ADR-003) and
 *     `logCompleted`'s `taskIfYours` already tolerates a task deleted
 *     mid-flight (Task 11 deviation 3): the row is written *unbound* rather
 *     than refused, and history renders it without a title. Deleting a task
 *     therefore never destroys focus history — only its label.
 *   - **The selection pointer is repaired here, not lazily.** `activeTask`
 *     tolerates a dangling pointer, but a rail that vanished while the
 *     timer keeps crediting a ghost is worse than one that clears: the same
 *     patch `selectTask` writes for an explicit clear.
 */
export const remove = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const task = await requireOwnedTask(ctx, ownerId, args.taskId);

    await ctx.db.delete(task._id);

    const owner = await ctx.db.get(ownerId);
    if (owner?.activeTaskId === task._id) {
      // `undefined` deletes the field — the clear `selectTask` performs.
      await ctx.db.patch(ownerId, { activeTaskId: undefined });
    }
    return task._id;
  },
});

/**
 * Marks a task done: flips the fast-path flag and stamps `completedAt` so the
 * two never disagree.
 *
 * `Date.now()` is legal in a mutation (the ban on wall-clock reads applies to
 * queries, which must be deterministic across their subscribers).
 */
export const complete = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const task = await requireOwnedTask(ctx, ownerId, args.taskId);

    await ctx.db.patch(task._id, {
      activeFlag: false,
      completedAt: Date.now(),
    });
  },
});

/**
 * Returns a task to the open list, clearing `completedAt`.
 *
 * The two fields are deliberately a matched pair — `completedAt` exists when
 * `activeFlag` is false and not otherwise (PRD §6: "present when done").
 * Leaving a stale timestamp on an open task would make `completedAt`'s
 * presence answer "when was this last finished?" while every reader uses it
 * to mean "is it finished?", and the two would drift apart the first time
 * someone uncompleted a task from last week.
 */
export const uncomplete = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const task = await requireOwnedTask(ctx, ownerId, args.taskId);

    await ctx.db.patch(task._id, {
      activeFlag: true,
      completedAt: undefined,
    });
  },
});

/**
 * Deletes every finished task the caller owns, returning how many went.
 *
 * Reads happen in batches rather than one `.collect()`, per the Convex
 * guideline on large mutations: each round queries the index afresh, so rows
 * deleted in an earlier round simply stop appearing. `MAX_CLEAR_ROUNDS` caps
 * a single call at 5,000 rows; an owner past that calls again, which is
 * friendlier to the transaction than one enormous write.
 */
export const clearCompleted = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await resolveOwner(ctx);

    let deleted = 0;
    for (let round = 0; round < MAX_CLEAR_ROUNDS; round++) {
      const batch = await bucketTasks(ctx, ownerId, false).take(CLEAR_BATCH);
      if (batch.length === 0) {
        break;
      }
      for (const task of batch) {
        await ctx.db.delete(task._id);
      }
      deleted += batch.length;
      if (batch.length < CLEAR_BATCH) {
        break;
      }
    }

    // The selection must not outlive the row it points at. This is the only
    // mutation that deletes tasks, so it is the only place a stored pointer
    // can be left dangling — and the reader below hides a dead id rather
    // than reporting one, which is right for the UI but the wrong shape to
    // leave on the document. One point read, and only when something is
    // selected at all.
    //
    // Note this clears a pointer to a *deleted* task, never one to a merely
    // completed task: ticking a box leaves the selection in place (Task 11),
    // and only removing the row outright takes it away.
    const owner = await ctx.db.get(ownerId);
    if (owner?.activeTaskId !== undefined) {
      const target = await ctx.db.get(owner.activeTaskId);
      if (target === null) {
        await ctx.db.patch(ownerId, { activeTaskId: undefined });
      }
    }

    return deleted;
  },
});

/**
 * Moves `taskId` to sit after `afterId` and before `beforeId`, each neighbour
 * naming the row on that side of the drop's gap.
 *
 * Either side may be absent, and the absence says something stronger than
 * "the caller forgot": `afterId: null` means *no row precedes it*, and
 * `beforeId: null` means *no row follows it*. Both are resolved against the
 * bucket rather than against the neighbour, for two reasons.
 *
 *   - **The client's view can be stale.** Deriving "the end of the list" as
 *     `afterId.order + step` puts the row a fixed distance past its
 *     predecessor — and if anything lies beyond that predecessor, somewhere
 *     in the middle of the list, quite possibly exactly on top of an
 *     existing key. Taking the bucket's last row instead lands it past every
 *     row by construction, whatever `afterId` was.
 *   - **Two drags in flight must not read each other's outcome.** The bucket's
 *     extreme is the one fact a "send it to the front" drag and a "send it to
 *     the end" drag can each use without either invalidating the other: they
 *     settle in the same arrangement whichever order they commit in, because
 *     they land in opposite parts of the list. `tests/tasks.test.ts` asserts
 *     the result without assuming an interleaving.
 *
 * Naming *neither* neighbour describes no gap in the list, so nothing moves.
 * That is also the right answer for the one real case that reaches it —
 * dragging the only row present, whose neighbours, excluding itself, are
 * nothing.
 *
 * The write itself is a `patch` on `taskId` and no other row's `order`
 * changes, so two drags cannot renumber each other out of existence. That is
 * the "O(1) neighbour insert, stable under concurrent orders" criterion, and
 * the test pins it by requiring every other row's key to be bit-identical
 * afterwards.
 *
 * Convex runs each mutation as a serializable transaction, so two drags into
 * the *same* gap do not both read the pre-move state and agree on a midpoint:
 * one commits and the other retries against the new list. A tie would be
 * broken by `_creationTime` regardless, but it should not come to that.
 */
export const reorder = mutation({
  args: {
    taskId: v.id("tasks"),
    afterId: v.optional(v.union(v.id("tasks"), v.null())),
    beforeId: v.optional(v.union(v.id("tasks"), v.null())),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const task = await requireOwnedTask(ctx, ownerId, args.taskId);

    const afterId = args.afterId ?? null;
    const beforeId = args.beforeId ?? null;

    // A row is never its own neighbour. A caller that hands back the dragged
    // row's own id has computed its gaps wrong, and the key that would follow
    // (itself as predecessor, nothing as successor) quietly sends the row to
    // the end of the list — visible as a drag that "works" by landing in the
    // wrong place. Better to fail while the client is still being written.
    if (afterId === task._id || beforeId === task._id) {
      throw new Error(
        "tasks: a task cannot be positioned against itself; a drop's " +
          "neighbours are the rows around it, excluding it",
      );
    }

    if (afterId === null && beforeId === null) {
      // No gap named — see the header. Deliberately not guessed at: a drop
      // that says nothing about where the row goes moves nothing.
      return;
    }

    let preceding: number | null = null;
    let following: number | null = null;

    // Both neighbours are checked before any anchor is read, so a stale or
    // foreign id is reported while it is still the only thing wrong.
    if (afterId !== null) {
      const after = await requireOwnedTask(ctx, ownerId, afterId);
      assertSameBucket(task, after);
      preceding = after.order;
    }
    if (beforeId !== null) {
      const before = await requireOwnedTask(ctx, ownerId, beforeId);
      assertSameBucket(task, before);
      following = before.order;
    }

    if (beforeId === null) {
      const leader = await extremeOrder(ctx, ownerId, task, "desc");
      if (leader === null) {
        return;
      }
      preceding = leader;
    }
    if (afterId === null) {
      const trailer = await extremeOrder(ctx, ownerId, task, "asc");
      if (trailer === null) {
        return;
      }
      following = trailer;
    }

    await writePosition(ctx, task, preceding, following);
  },
});

/**
 * The bucket's leading or trailing key, ignoring the row being moved — the
 * anchor for a drop that names only the far side.
 *
 * `.take(2)` rather than `.first()` because the dragged row may *be* the
 * extreme, in which case the row just past it is what bounds the drop.
 * `null` means nothing else is in the bucket, so there is nothing to position
 * against and nothing to move.
 */
async function extremeOrder(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  task: Doc<"tasks">,
  direction: "asc" | "desc",
): Promise<number | null> {
  const rows = await bucketTasks(ctx, ownerId, task.activeFlag)
    .order(direction)
    .take(2);
  const other = rows.find((row) => row._id !== task._id);
  return other === undefined ? null : other.order;
}

/** Neighbours in the other bucket would give the row a key with no meaning. */
function assertSameBucket(task: Doc<"tasks">, neighbour: Doc<"tasks">): void {
  if (task.activeFlag !== neighbour.activeFlag) {
    throw new Error(
      "tasks: cannot reorder across the open/completed boundary",
    );
  }
}

async function writePosition(
  ctx: MutationCtx,
  task: Doc<"tasks">,
  preceding: number | null,
  following: number | null,
): Promise<void> {
  const order = orderBetween(preceding, following);
  if (order === task.order) {
    return; // dropped where it already sat — idempotent, nothing to write
  }
  await ctx.db.patch(task._id, { order });
}

/**
 * The owner's tasks, in two ordered buckets: open rows in their arranged
 * order, then finished rows behind them.
 *
 * Both come from `by_owner_active` in declared index order, so neither needs
 * a sort and neither is a client-side scan. Splitting by flag rather than
 * returning one array keeps the grouping the dashboard needs (completed tasks
 * recede beneath the open ones, PRD §4.2) and lets each bucket be bounded
 * independently.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await resolveOwner(ctx);

    const active = await bucketTasks(ctx, ownerId, true).take(LIST_LIMIT);
    const completed = await bucketTasks(ctx, ownerId, false).take(LIST_LIMIT);

    return { active, completed };
  },
});

/**
 * The owner's current selection — PRD §4.1 — or `null` when there is none.
 *
 * A pointer whose target has been deleted reads as `null` rather than as a
 * dead id: no caller wants an id that names no row, and `clearCompleted`
 * (the only thing that deletes tasks) repairs the stored value anyway. The
 * ownership check on the way back out is free beside the read it follows,
 * and stored state is precisely what must not be trusted on its way out.
 */
export const activeTask = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await resolveOwner(ctx);
    const owner = await ctx.db.get(ownerId);
    const taskId = owner?.activeTaskId;

    if (taskId === undefined) {
      return null;
    }

    const task = await ctx.db.get(taskId);
    return task === null || task.ownerId !== ownerId ? null : taskId;
  },
});

/**
 * Selects the task that receives focus sessions — PRD §4.1.
 *
 * `taskId: null` clears it. `undefined` would mean "leave it alone", which
 * is why the validator admits `null` alongside the id — the same shape
 * `update` uses to unbind a project.
 *
 * A *completed* task may be selected, and once selected stays selected until
 * another is chosen (Task 11: "completed tasks keep their binding"), so
 * there is no `activeFlag` test here. The binding a running session already
 * captured is deliberately untouched: `logCompleted` carries the snapshot
 * the client took at start (D8), so re-pointing the selection mid-session
 * cannot re-target a session that is under way.
 */
export const selectTask = mutation({
  args: { taskId: v.union(v.id("tasks"), v.null()) },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);

    if (args.taskId === null) {
      // `patch` deletes a field given `undefined`, so the key is present
      // here with an undefined value precisely so the clear is a change
      // rather than an omission.
      await ctx.db.patch(ownerId, { activeTaskId: undefined });
      return null;
    }

    // Proved before it is stored: the pointer is only ever as trustworthy as
    // the check that wrote it, and `activeTask` re-checks on the way out.
    await requireOwnedTask(ctx, ownerId, args.taskId);
    await ctx.db.patch(ownerId, { activeTaskId: args.taskId });
    return args.taskId;
  },
});

/**
 * Focus sessions per task — PRD §4.1's leaf progress, derived and never
 * stored (ADR-003).
 *
 * Only `phase: "focus"` counts: breaks are sessions too, but no task is
 * made of them. The division the row draws (`3 / 2`) happens past this, in
 * the component, and may legitimately exceed the estimate — a finished task
 * keeps receiving focus time until another is selected.
 *
 * Cost is one index range per task, each bounded by *that task's own*
 * history rather than by the log's: `by_owner_task` starts at
 * `(ownerId, taskId)`, so a task with four sessions reads four rows however
 * many thousands exist elsewhere. That is what keeps this off the full-log
 * pull the schema header warns about. The loop is bounded by `LIST_LIMIT`
 * tasks; a list long enough to make it hurt is long enough to revisit this.
 *
 * `by_owner_task` does not carry `phase`, so break rows are read and
 * discarded. Adding phase to the index would be a second schema change that
 * nobody asked for, to avoid reading the same handful of break rows.
 *
 * A key is absent only for a task the log has never seen — the component
 * reads a missing key as `0`.
 */
export const leafCounts = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await resolveOwner(ctx);

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(LIST_LIMIT);

    const counts: Record<string, number> = {};
    for (const task of tasks) {
      counts[task._id] = await focusLeafCount(ctx, ownerId, task._id);
    }

    return counts;
  },
});

/**
 * How many focus sessions the log has credited to one task — the single
 * definition of "leaf" the panel and the active-task card both read, so the
 * two can never disagree about the same number.
 *
 * Hoisted rather than shared through a module const because both callers
 * above and below need it; see `leafCounts` for why the index looks like
 * this and why break rows are discarded in memory.
 */
async function focusLeafCount(
  ctx: QueryCtx,
  ownerId: Id<"users">,
  taskId: Id<"tasks">,
): Promise<number> {
  const focus = await ctx.db
    .query("sessions")
    .withIndex("by_owner_task", (q) =>
      q.eq("ownerId", ownerId).eq("taskId", taskId),
    )
    .filter((q) => q.eq(q.field("phase"), "focus"))
    .collect();

  return focus.length;
}

/**
 * The active-task card's readout — Task 12, PRD §4.1's "Session progress".
 *
 * One query for one card: title, estimate and leaf count for whatever the
 * user has selected. It hides a dead pointer exactly as `activeTask` does —
 * a task deleted from another tab answers "nothing selected" rather than
 * drawing a card for a row that no longer exists — and refuses a foreign
 * task through the same ownership question everything else asks.
 */
export const progressCard = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await resolveOwner(ctx);

    const user = await ctx.db.get(ownerId);
    const taskId = user?.activeTaskId;
    if (taskId === undefined) {
      return null;
    }

    const task = await ctx.db.get(taskId);
    if (task === null || task.ownerId !== ownerId) {
      return null;
    }

    return {
      taskId,
      title: task.title,
      estimate: task.estimate,
      leaves: await focusLeafCount(ctx, ownerId, taskId),
    };
  },
});

/** Minutes in a day, and milliseconds in a minute — the two units here. */
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

/**
 * The UTC instant at which the given local calendar day began.
 *
 * `offsetMinutes` is `-new Date().getTimezoneOffset()` from the device —
 * positive east of Greenwich. PRD D5 fixes "day" to the *device's* local
 * midnight, and the server has no idea where the device is, so the offset
 * arrives as an argument. It is data about a clock, not an assertion of
 * identity: the only thing a wrong value can distort is which of the user's
 * own days one of their own rows lands in, and the next load corrects it.
 *
 * The shift happens **before** the floor, not after: a device at UTC-5
 * reading 01:00Z is living in *yesterday's* evening, so its day began at
 * the previous UTC midnight — flooring the raw UTC instant first would
 * name tomorrow's local midnight and put the window's whole start four
 * hours in the future. (That version passes every afternoon case and fails
 * every morning one, which is exactly what the boundary test pins.)
 *
 * A session ending 00:01 local therefore belongs to the day that is
 * beginning, not to the one that is ending — the edge the schema's
 * `tzOffsetAtCompletion` comment exists to protect.
 */
export function startOfLocalDay(now: number, offsetMinutes: number): number {
  const offsetMs = offsetMinutes * MS_PER_MINUTE;
  const localNow = now + offsetMs;
  return Math.floor(localNow / MS_PER_DAY) * MS_PER_DAY - offsetMs;
}

/**
 * The Summary bento's two passive readouts — Task 12, PRD §4.1.
 *
 * Both are derived here and stored nowhere (ADR-003): today's focus time
 * from the log's focus rows, today's estimate from the board the user can
 * actually see. Scoping the denominator to the *current* board rather than
 * to "tasks with a session today" is the only durable reading — a session
 * row snapshots the task's identity, never its estimate, so a cleared task
 * would otherwise take its denominator with it and silently raise the score.
 *
 * The range scan is the one the schema was built around: `by_owner_completed`
 * from the day's start, so the query reads *today's* rows and nothing else.
 */
export const todaySummary = query({
  args: {
    /**
     * The device's UTC offset in minutes, as `-new Date().getTimezoneOffset()`
     * reports it. See `startOfLocalDay`.
     */
    tzOffsetMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);

    const dayStart = startOfLocalDay(Date.now(), args.tzOffsetMinutes);

    const focus = await ctx.db
      .query("sessions")
      .withIndex("by_owner_completed", (q) =>
        q.eq("ownerId", ownerId).gte("completedAt", dayStart),
      )
      .filter((q) => q.eq(q.field("phase"), "focus"))
      .collect();

    let focusMs = 0;
    for (const session of focus) {
      focusMs += session.completedAt - session.startedAt;
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(LIST_LIMIT);

    let estimatedLeaves = 0;
    for (const task of tasks) {
      estimatedLeaves += task.estimate;
    }

    // The bento's donut (ADR-006): the same today scan split by project.
    // Names resolve through the projects table (bounded, name-only reads);
    // the derivation itself stays in the dependency-free aggregations.
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(PROJECTS_CAP);

    return {
      focusMinutes: focusMs / MS_PER_MINUTE,
      completedLeaves: focus.length,
      estimatedLeaves,
      perProject: perProjectBreakdown(
        focus,
        projects.map((project) => ({
          _id: project._id,
          name: project.name,
          archivedAt: project.archivedAt,
        })),
      ),
    };
  },
});
