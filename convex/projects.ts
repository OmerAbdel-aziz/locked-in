/**
 * Project CRUD + overview — Tasks 13 + 14 (PRD §4.1 "Projects", §6).
 *
 * Projects are first-class rows with CRUD, not string tags: tasks point at
 * them through `projectId`, and sessions snapshot that id at start (D8) so a
 * rename or an archive never rewrites recorded history. Archiving only stamps
 * `archivedAt` — it deletes nothing and rewrites no task or session row, so
 * past stats keep their attribution and a task of an archived project simply
 * renders its tag muted.
 *
 * Every function resolves its caller through `resolveOwner`; no argument ever
 * names an owner. A document that belongs to somebody else is reported as
 * "not found" rather than "forbidden", so these functions cannot be used to
 * probe for the existence of another user's rows.
 *
 * Nothing here renumbers or re-files anything: positions live in `tasks.ts`,
 * and the merge-time project dedupe lives in Task 24. This file owns the
 * project rows and the per-project derivation, and nothing else.
 */
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

import { mutation, query } from "./_generated/server";
import { requireOwnedProject, resolveOwner } from "./lib/owner";

/** PRD §4.1 caps the board at 100 *active* projects — archived ones don't count. */
const MAX_ACTIVE_PROJECTS = 100;

/** A project name is a tag, not a document — short by construction. */
const MAX_NAME_LENGTH = 100;

/**
 * Upper bound on one `list` call, per the Convex guideline that a query
 * returns a bounded collection. Sized past any plausible personal project
 * list; `.take()` stops when the index range is exhausted, so the cap costs
 * nothing below it.
 */
const LIST_LIMIT = 1000;

/**
 * Upper bound on the session scan behind `overview`. There is no
 * `by_owner_project` index on `sessions` (adding one is a §9 ask-first schema
 * change), so the overview reads the owner's log oldest-first and filters by
 * `projectId` in memory. Past this many rows the newest sessions fall off the
 * overview — the log itself is untouched, and Task 19 revisits bounded
 * per-project reads with the stats surface.
 */
const SESSION_LIMIT = 5000;

const MS_PER_MINUTE = 60_000;

function validName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0) {
    throw new Error("projects: name cannot be empty");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(
      `projects: name is ${name.length} characters; the limit is ${MAX_NAME_LENGTH}`,
    );
  }
  return name;
}

/**
 * How many unarchived projects the owner currently holds — the denominator
 * the cap is enforced against. Archived rows are history, not board, so they
 * never count.
 */
async function activeCount(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">,
): Promise<number> {
  const all = await ctx.db
    .query("projects")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .take(LIST_LIMIT);
  let count = 0;
  for (const project of all) {
    if (project.archivedAt === undefined) {
      count += 1;
    }
  }
  return count;
}

/**
 * Creates a project at the end of the owner's active board.
 *
 * Names are not deduped here: two projects may share a name, and the merge
 * path (Task 24) is what unions them case-insensitively. Refusing a duplicate
 * at creation would make the merge's job ambiguous — which of the two was
 * "the" duplicate — while allowing it keeps creation total and merge
 * responsible.
 */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const name = validName(args.name);

    if ((await activeCount(ctx, ownerId)) >= MAX_ACTIVE_PROJECTS) {
      throw new Error(
        "projects: you already have 100 active projects — " +
          "archive one to make room",
      );
    }

    return await ctx.db.insert("projects", { ownerId, name });
  },
});

/**
 * Renames a project. The rename touches the project row only: sessions carry
 * the `projectId` snapshot, never the name, so history keeps its attribution
 * whatever the project is later called. `overview` proves it.
 */
export const rename = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const project = await requireOwnedProject(ctx, ownerId, args.projectId);

    await ctx.db.patch(project._id, { name: validName(args.name) });
    return project._id;
  },
});

/**
 * Archives a project: stamps `archivedAt` and nothing else. No task is
 * re-filed and no session is rewritten — that is the acceptance criterion,
 * and the test pins it by reading a task and a session back after the
 * archive. Idempotent: archiving twice keeps the first stamp, so a repeated
 * message cannot move history between days.
 */
export const archive = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const project = await requireOwnedProject(ctx, ownerId, args.projectId);

    if (project.archivedAt === undefined) {
      await ctx.db.patch(project._id, { archivedAt: Date.now() });
    }
    return project._id;
  },
});

/**
 * Returns an archived project to the active board. Not in the task's file
 * list, but archiving without a way back is a one-way trap: a mis-tapped
 * archive would orphan the project's tasks from every picker with no repair
 * but CSV. The cap applies on the way back in, for the same reason it
 * applies on creation.
 */
export const unarchive = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const project = await requireOwnedProject(ctx, ownerId, args.projectId);

    if (project.archivedAt !== undefined) {
      if ((await activeCount(ctx, ownerId)) >= MAX_ACTIVE_PROJECTS) {
        throw new Error(
          "projects: you already have 100 active projects — " +
            "archive one to make room",
        );
      }
      await ctx.db.patch(project._id, { archivedAt: undefined });
    }
    return project._id;
  },
});

/**
 * The owner's projects in two buckets: active first, then archived. Both come
 * from `by_owner` in index order; splitting rather than returning one array
 * is the grouping the UI needs — the picker reads `active` only (archived
 * projects are hidden from it per the acceptance criterion), while the
 * filter and the tag read both.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await resolveOwner(ctx);

    const all = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(LIST_LIMIT);

    return {
      active: all.filter((project) => project.archivedAt === undefined),
      archived: all.filter((project) => project.archivedAt !== undefined),
    };
  },
});

/**
 * The per-project overview — Task 14, PRD §4.1. Everything is derived at
 * read time and stored nowhere (ADR-003):
 *
 *   - task counts and estimates from the tasks currently filed under the
 *     project (`by_owner_task_project` — the index that exists for exactly
 *     this question);
 *   - completed leaves and focus time from the session log filtered by the
 *     `projectId` *snapshot*, so renames and archives cannot move history.
 *
 * The task list itself is returned so the attribution the view draws is the
 * attribution the server read — no client-side join to drift from it.
 */
export const overview = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const project = await requireOwnedProject(ctx, ownerId, args.projectId);

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner_task_project", (q) =>
        q.eq("ownerId", ownerId).eq("projectId", project._id),
      )
      .take(LIST_LIMIT);

    let openCount = 0;
    let estimatedLeaves = 0;
    for (const task of tasks) {
      if (task.activeFlag) {
        openCount += 1;
      }
      estimatedLeaves += task.estimate;
    }

    // Focus phases only: a break is a session, and no project is made of
    // them — the same reading `todaySummary` uses, so the two can never
    // disagree about what "focus time" means.
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_owner_completed", (q) => q.eq("ownerId", ownerId))
      .take(SESSION_LIMIT);
    let focusMs = 0;
    let completedLeaves = 0;
    for (const session of sessions) {
      if (session.projectId !== project._id || session.phase !== "focus") {
        continue;
      }
      focusMs += session.completedAt - session.startedAt;
      completedLeaves += 1;
    }

    return {
      project: {
        _id: project._id,
        name: project.name,
        archivedAt: project.archivedAt,
      },
      openCount,
      doneCount: tasks.length - openCount,
      estimatedLeaves,
      completedLeaves,
      focusMinutes: focusMs / MS_PER_MINUTE,
      focusSessions: completedLeaves,
      tasks: tasks.map((task) => ({
        _id: task._id,
        title: task.title,
        estimate: task.estimate,
        activeFlag: task.activeFlag,
      })),
    };
  },
});

export const setPlan = mutation({
  args: {
    projectId: v.id("projects"),
    hours: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const project = await requireOwnedProject(ctx, ownerId, args.projectId);
    await ctx.db.patch(project._id, {
      planWeeklyFocusHours:
        args.hours === null ? undefined : args.hours,
    });
  },
});

export const pace = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const project = await requireOwnedProject(ctx, ownerId, args.projectId);

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_owner_completed", (q) => q.eq("ownerId", ownerId))
      .take(SESSION_LIMIT);

    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    let actualMs = 0;
    let lastBoundMs: number | null = null;
    for (const s of sessions) {
      if (s.projectId !== project._id || s.phase !== "focus") continue;
      if (s.completedAt >= weekAgo) {
        actualMs += s.completedAt - s.startedAt;
      }
      if (lastBoundMs === null || s.completedAt > lastBoundMs) {
        lastBoundMs = s.completedAt;
      }
    }

    return {
      planHours: project.planWeeklyFocusHours ?? null,
      actualMinutes: Math.round(actualMs / 60000),
      lastBoundMs,
      nowMs: now,
    };
  },
});
