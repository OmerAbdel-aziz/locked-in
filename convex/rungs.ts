import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { orderBetween } from "./lib/order";
import {
  requireOwnedMilestone,
  requireOwnedProject,
  resolveOwner,
} from "./lib/owner";

const MAX_TITLE = 200;
const LIST_LIMIT = 1000;

function validTitle(raw: string): string {
  const t = raw.trim();
  if (t.length === 0) throw new Error("rungs: title cannot be empty");
  if (t.length > MAX_TITLE) throw new Error("rungs: title too long");
  return t;
}

function bucket(ctx: QueryCtx | MutationCtx, ownerId: Id<"users">, projectId: Id<"projects">) {
  return ctx.db
    .query("rungs")
    .withIndex("by_owner_project", (q) =>
      q.eq("ownerId", ownerId).eq("projectId", projectId),
    );
}

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    await requireOwnedProject(ctx, ownerId, args.projectId);
    return bucket(ctx, ownerId, args.projectId).take(LIST_LIMIT);
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await resolveOwner(ctx);
    return ctx.db
      .query("rungs")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(LIST_LIMIT);
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    company: v.optional(v.string()),
    payMin: v.optional(v.number()),
    payMax: v.optional(v.number()),
    requirements: v.optional(v.array(v.string())),
    degreeMention: v.optional(v.boolean()),
    sideDoor: v.optional(v.boolean()),
    milestoneIds: v.optional(v.array(v.id("milestones"))),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    await requireOwnedProject(ctx, ownerId, args.projectId);
    if (args.milestoneIds) {
      for (const m of args.milestoneIds) {
        const ms = await requireOwnedMilestone(ctx, ownerId, m);
        if (ms.projectId !== args.projectId) {
          throw new Error("rungs: milestone belongs to another roadmap");
        }
      }
    }
    const last = await bucket(ctx, ownerId, args.projectId).order("desc").first();
    return await ctx.db.insert("rungs", {
      ownerId,
      projectId: args.projectId,
      title: validTitle(args.title),
      company: args.company,
      payMin: args.payMin,
      payMax: args.payMax,
      requirements: args.requirements,
      degreeMention: args.degreeMention,
      sideDoor: args.sideDoor,
      milestoneIds: args.milestoneIds,
      order: orderBetween(last === null ? null : last.order, null),
    });
  },
});

export const update = mutation({
  args: {
    rungId: v.id("rungs"),
    title: v.optional(v.string()),
    company: v.optional(v.union(v.string(), v.null())),
    payMin: v.optional(v.union(v.number(), v.null())),
    payMax: v.optional(v.union(v.number(), v.null())),
    requirements: v.optional(v.array(v.string())),
    degreeMention: v.optional(v.boolean()),
    sideDoor: v.optional(v.boolean()),
    milestoneIds: v.optional(v.array(v.id("milestones"))),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const rung = await ctx.db.get(args.rungId);
    if (rung === null || rung.ownerId !== ownerId) throw new Error("rungs: not found");
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = validTitle(args.title);
    if (args.company !== undefined) patch.company = args.company === null ? undefined : args.company;
    if (args.payMin !== undefined) patch.payMin = args.payMin === null ? undefined : args.payMin;
    if (args.payMax !== undefined) patch.payMax = args.payMax === null ? undefined : args.payMax;
    if (args.requirements !== undefined) patch.requirements = args.requirements;
    if (args.degreeMention !== undefined) patch.degreeMention = args.degreeMention;
    if (args.sideDoor !== undefined) patch.sideDoor = args.sideDoor;
    if (args.milestoneIds !== undefined) {
      for (const m of args.milestoneIds) {
        const ms = await requireOwnedMilestone(ctx, ownerId, m);
        if (ms.projectId !== rung.projectId) throw new Error("rungs: milestone belongs to another roadmap");
      }
      patch.milestoneIds = args.milestoneIds;
    }
    if (Object.keys(patch).length > 0) await ctx.db.patch(args.rungId, patch);
  },
});

export const remove = mutation({
  args: { rungId: v.id("rungs") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const rung = await ctx.db.get(args.rungId);
    if (rung === null || rung.ownerId !== ownerId) throw new Error("rungs: not found");
    await ctx.db.delete(args.rungId);
  },
});

export const reorder = mutation({
  args: {
    rungId: v.id("rungs"),
    afterId: v.optional(v.union(v.id("rungs"), v.null())),
    beforeId: v.optional(v.union(v.id("rungs"), v.null())),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const rung = await ctx.db.get(args.rungId);
    if (rung === null || rung.ownerId !== ownerId) throw new Error("rungs: not found");

    const afterId = args.afterId ?? null;
    const beforeId = args.beforeId ?? null;
    if (afterId === rung._id || beforeId === rung._id) throw new Error("rungs: cannot position against itself");
    if (afterId === null && beforeId === null) return;

    let preceding: number | null = null;
    let following: number | null = null;
    if (afterId !== null) {
      const after = await ctx.db.get(afterId);
      if (after === null || after.ownerId !== ownerId || after.projectId !== rung.projectId) throw new Error("rungs: not found");
      preceding = after.order;
    }
    if (beforeId !== null) {
      const before = await ctx.db.get(beforeId);
      if (before === null || before.ownerId !== ownerId || before.projectId !== rung.projectId) throw new Error("rungs: not found");
      following = before.order;
    }
    if (beforeId === null) {
      const leader = await bucket(ctx, ownerId, rung.projectId).order("desc").take(2);
      const other = leader.find((r) => r._id !== rung._id);
      if (!other) return;
      preceding = other.order;
    }
    if (afterId === null) {
      const trailer = await bucket(ctx, ownerId, rung.projectId).order("asc").take(2);
      const other = trailer.find((r) => r._id !== rung._id);
      if (!other) return;
      following = other.order;
    }

    const order = orderBetween(preceding, following);
    if (order !== rung.order) await ctx.db.patch(rung._id, { order });
  },
});