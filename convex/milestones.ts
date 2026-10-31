import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { orderBetween } from "./lib/order";
import {
  requireOwnedMilestone,
  requireOwnedProject,
  requireOwnedTask,
  resolveOwner,
} from "./lib/owner";

/**
 * Milestones (v2 roadmap spine, issue 02) group Units inside a Roadmap
 * (`projects`). Units are `tasks` rows carrying the optional `milestoneId`;
 * the existing flat task APIs keep working unchanged, which is the point of
 * the expand-then-migrate split.
 *
 * Ordering reuses the exact fractional-key machinery proven by tasks:
 * neighbours are resolved against the milestone bucket (not trusted from the
 * client), reordering writes one document, and an exhausted gap throws rather
 * than silently sharing a key.
 */

const MAX_TITLE_LENGTH = 200;
const LIST_LIMIT = 1000;

function validTitle(raw: string): string {
  const title = raw.trim();
  if (title.length === 0) throw new Error("milestones: title cannot be empty");
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(
      `milestones: title is ${title.length} characters; the limit is ${MAX_TITLE_LENGTH}`,
    );
  }
  return title;
}

function bucketMilestones(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">,
  projectId: Id<"projects">,
) {
  return ctx.db
    .query("milestones")
    .withIndex("by_owner_project_order", (q) =>
      q.eq("ownerId", ownerId).eq("projectId", projectId),
    );
}

async function extremeOrder(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  projectId: Id<"projects">,
  milestone: Doc<"milestones">,
  direction: "asc" | "desc",
): Promise<number | null> {
  const rows = await bucketMilestones(ctx, ownerId, projectId)
    .order(direction)
    .take(2);
  const other = rows.find((row) => row._id !== milestone._id);
  return other === undefined ? null : other.order;
}

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    await requireOwnedProject(ctx, ownerId, args.projectId);
    const milestones = await bucketMilestones(
      ctx,
      ownerId,
      args.projectId,
    ).take(LIST_LIMIT);
    return milestones.filter((m) => m.archivedAt === undefined);
  },
});

/**
 * Every milestone with its units and derived counts, for the home panel.
 *
 * Percent complete counts *units finished* (completion), while percent known
 * counts units the learner marked as already known. Known units are excluded
 * from the denominator of completion only when they were also completed —
 * matching the PRD's distinction that known affects "percent known", not
 * "percent complete".
 */
/**
 * The advisory "Next up" pointer for a roadmap: the first incomplete,
 * non-known unit in roadmap order (milestones first, then their units; units
 * with no milestone trail at the end). Derived at read time only — nothing
 * is stored, per ADR-003.
 */
export const nextUp = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    await requireOwnedProject(ctx, ownerId, args.projectId);

    const milestones = await bucketMilestones(ctx, ownerId, args.projectId)
      .take(LIST_LIMIT);
    const activeMilestones = milestones
      .filter((m) => m.archivedAt === undefined)
      .sort((a, b) => a.order - b.order);

    // Units without a milestone trail at the very end, in their own order.
    const unassigned = await ctx.db
      .query("tasks")
      .withIndex("by_owner_task_project", (q) =>
        q.eq("ownerId", ownerId).eq("projectId", args.projectId),
      )
      .take(LIST_LIMIT);
    const unassignedUnits = unassigned
      .filter((u) => u.milestoneId === undefined && u.activeFlag && u.known !== true)
      .sort((a, b) => a.order - b.order);

    for (const milestone of activeMilestones) {
      const units = await ctx.db
        .query("tasks")
        .withIndex("by_owner_milestone", (q) =>
          q.eq("ownerId", ownerId).eq("milestoneId", milestone._id),
        )
        .take(LIST_LIMIT);
      const candidate = units
        .filter((u) => u.activeFlag && u.known !== true)
        .sort((a, b) => a.order - b.order)[0];
      if (candidate) {
        return { milestone, unit: candidate };
      }
    }

    const candidate = unassignedUnits[0];
    if (candidate) {
      return { milestone: null, unit: candidate };
    }
    return null;
  },
});

export const progress = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    await requireOwnedProject(ctx, ownerId, args.projectId);

    const milestones = await bucketMilestones(ctx, ownerId, args.projectId)
      .take(LIST_LIMIT);

    const result = [];
    for (const milestone of milestones) {
      if (milestone.archivedAt !== undefined) continue;
      const units = await ctx.db
        .query("tasks")
        .withIndex("by_owner_milestone", (q) =>
          q.eq("ownerId", ownerId).eq("milestoneId", milestone._id),
        )
        .take(LIST_LIMIT);
      result.push({
        milestone,
        units,
        total: units.length,
        completed: units.filter((u) => !u.activeFlag).length,
        known: units.filter((u) => u.known === true).length,
      });
    }
    return result;
  },
});

export const create = mutation({
  args: { projectId: v.id("projects"), name: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    await requireOwnedProject(ctx, ownerId, args.projectId);

    const last = await bucketMilestones(ctx, ownerId, args.projectId)
      .order("desc")
      .first();

    return await ctx.db.insert("milestones", {
      ownerId,
      projectId: args.projectId,
      name: validTitle(args.name),
      order: orderBetween(last === null ? null : last.order, null),
    });
  },
});

export const rename = mutation({
  args: { milestoneId: v.id("milestones"), name: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const milestone = await requireOwnedMilestone(
      ctx,
      ownerId,
      args.milestoneId,
    );
    await ctx.db.patch(milestone._id, { name: validTitle(args.name) });
  },
});

export const archive = mutation({
  args: { milestoneId: v.id("milestones") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const milestone = await requireOwnedMilestone(
      ctx,
      ownerId,
      args.milestoneId,
    );
    await ctx.db.patch(milestone._id, { archivedAt: Date.now() });
  },
});

/**
 * Moves a milestone between two neighbours in the same roadmap. `afterId` /
 * `beforeId` name the rows on either side of the drop gap; a `null` side is
 * anchored to the bucket's extreme, exactly like `tasks.reorder`.
 */
export const reorder = mutation({
  args: {
    milestoneId: v.id("milestones"),
    afterId: v.optional(v.union(v.id("milestones"), v.null())),
    beforeId: v.optional(v.union(v.id("milestones"), v.null())),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const milestone = await requireOwnedMilestone(
      ctx,
      ownerId,
      args.milestoneId,
    );

    const afterId = args.afterId ?? null;
    const beforeId = args.beforeId ?? null;

    if (afterId === milestone._id || beforeId === milestone._id) {
      throw new Error(
        "milestones: a milestone cannot be positioned against itself",
      );
    }
    if (afterId === null && beforeId === null) {
      return;
    }

    let preceding: number | null = null;
    let following: number | null = null;

    if (afterId !== null) {
      const after = await requireOwnedMilestone(ctx, ownerId, afterId);
      if (after.projectId !== milestone.projectId) {
        throw new Error("milestones: cannot reorder across roadmaps");
      }
      preceding = after.order;
    }
    if (beforeId !== null) {
      const before = await requireOwnedMilestone(ctx, ownerId, beforeId);
      if (before.projectId !== milestone.projectId) {
        throw new Error("milestones: cannot reorder across roadmaps");
      }
      following = before.order;
    }

    if (beforeId === null) {
      preceding = await extremeOrder(
        ctx,
        ownerId,
        milestone.projectId,
        milestone,
        "desc",
      );
      if (preceding === null) return;
    }
    if (afterId === null) {
      following = await extremeOrder(
        ctx,
        ownerId,
        milestone.projectId,
        milestone,
        "asc",
      );
      if (following === null) return;
    }

    const order = orderBetween(preceding, following);
    if (order !== milestone.order) {
      await ctx.db.patch(milestone._id, { order });
    }
  },
});

/**
 * Links a unit to a milestone, proving both belong to the same roadmap.
 * Passing `null` unlinks; `undefined` leaves it alone (same shape as
 * `tasks.update`'s project unbind).
 */
export const linkUnit = mutation({
  args: {
    taskId: v.id("tasks"),
    milestoneId: v.union(v.id("milestones"), v.null()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const task = await requireOwnedTask(ctx, ownerId, args.taskId);
    if (args.milestoneId === null) {
      await ctx.db.patch(task._id, { milestoneId: undefined });
      return;
    }
    const milestone = await requireOwnedMilestone(
      ctx,
      ownerId,
      args.milestoneId,
    );
    if (task.projectId !== undefined && task.projectId !== milestone.projectId) {
      throw new Error("milestones: unit belongs to a different roadmap");
    }
    await ctx.db.patch(task._id, {
      milestoneId: milestone._id,
      projectId: milestone.projectId,
    });
  },
});
