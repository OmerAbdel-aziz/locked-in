import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { orderBetween } from "./lib/order";
import { requireOwnedProject, resolveOwner } from "./lib/owner";

const MAX_TITLE_LENGTH = 200;

function validTitle(raw: string): string {
  const title = raw.trim();
  if (title.length === 0) throw new Error("milestones: title cannot be empty");
  if (title.length > MAX_TITLE_LENGTH) throw new Error("milestones: title too long");
  return title;
}

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    await requireOwnedProject(ctx, ownerId, args.projectId);
    return ctx.db
      .query("milestones")
      .withIndex("by_owner_project", (q) => q.eq("ownerId", ownerId).eq("projectId", args.projectId))
      .collect();
  },
});

export const create = mutation({
  args: { projectId: v.id("projects"), name: v.string(), afterOrder: v.optional(v.number()), beforeOrder: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    await requireOwnedProject(ctx, ownerId, args.projectId);
    const order = orderBetween(args.afterOrder, args.beforeOrder);
    const id = await ctx.db.insert("milestones", { ownerId, projectId: args.projectId, name: validTitle(args.name), order });
    return id;
  },
});

export const rename = mutation({
  args: { id: v.id("milestones"), name: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const m = await ctx.db.get(args.id);
    if (!m || m.ownerId !== ownerId) throw new Error("not found");
    await ctx.db.patch(args.id, { name: validTitle(args.name) });
  },
});

export const archive = mutation({
  args: { id: v.id("milestones") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const m = await ctx.db.get(args.id);
    if (!m || m.ownerId !== ownerId) throw new Error("not found");
    await ctx.db.patch(args.id, { archivedAt: Date.now() });
  },
});

export const reorder = mutation({
  args: { id: v.id("milestones"), afterOrder: v.optional(v.number()), beforeOrder: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const m = await ctx.db.get(args.id);
    if (!m || m.ownerId !== ownerId) throw new Error("not found");
    const order = orderBetween(args.afterOrder, args.beforeOrder);
    await ctx.db.patch(args.id, { order });
  },
});
