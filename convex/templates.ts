import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { orderBetween } from "./lib/order";
import { resolveOwner } from "./lib/owner";

const LIST_LIMIT = 1000;

export const publish = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const user = await ctx.db.get(ownerId);
    if (user?.isAnonymous || user?.emailVerificationTime === undefined) {
      throw new Error("templates: verified email required to publish");
    }
    const project = await ctx.db.get(args.projectId);
    if (project === null || project.ownerId !== ownerId) throw new Error("templates: project not found");

    const milestones = await ctx.db
      .query("milestones")
      .withIndex("by_owner_project", (q) => q.eq("ownerId", ownerId).eq("projectId", args.projectId))
      .take(LIST_LIMIT);

    const milestoneData = [];
    for (const m of milestones) {
      const units = await ctx.db
        .query("tasks")
        .withIndex("by_owner_milestone", (q) => q.eq("ownerId", ownerId).eq("milestoneId", m._id))
        .take(LIST_LIMIT);
      milestoneData.push({
        name: m.name,
        order: m.order,
        units: units.map((u) => ({
          title: u.title,
          estimate: u.estimate,
          known: u.known,
          order: u.order,
        })),
      });
    }

    const rungs = await ctx.db
      .query("rungs")
      .withIndex("by_owner_project", (q) => q.eq("ownerId", ownerId).eq("projectId", args.projectId))
      .take(LIST_LIMIT);

    const data = {
      projectName: project.name,
      planWeeklyFocusHours: project.planWeeklyFocusHours,
      milestones: milestoneData,
      rungs: rungs.map((r) => ({
        title: r.title,
        company: r.company,
        payMin: r.payMin,
        payMax: r.payMax,
        requirements: r.requirements,
        degreeMention: r.degreeMention,
        sideDoor: r.sideDoor,
        order: r.order,
        milestoneIndexes: (r.milestoneIds ?? []).map((mid) => milestones.findIndex((m) => m._id === mid)).filter((i) => i >= 0),
      })),
    };

    return await ctx.db.insert("templates", {
      ownerId,
      name: project.name,
      publishedAt: Date.now(),
      data,
    });
  },
});

export const browse = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("templates")
      .withIndex("by_published")
      .order("desc")
      .take(LIST_LIMIT)
      .then((rows) => rows.filter((r) => !r.hidden && r.deletedAt === undefined));
  },
});

export const unpublish = mutation({
  args: { templateId: v.id("templates") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const t = await ctx.db.get(args.templateId);
    if (t === null || t.ownerId !== ownerId) throw new Error("templates: not found");
    await ctx.db.patch(args.templateId, { deletedAt: Date.now() });
  },
});

export const report = mutation({
  args: { templateId: v.id("templates") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const t = await ctx.db.get(args.templateId);
    if (t === null || t.deletedAt !== undefined) throw new Error("templates: not found");
    // self-report is a no-op for the owner's own template visibility? Hide anyway structurally.
    await ctx.db.patch(args.templateId, { hidden: true });
  },
});

export const fork = mutation({
  args: { templateId: v.id("templates") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    const t = await ctx.db.get(args.templateId);
    if (t === null || t.hidden || t.deletedAt !== undefined) throw new Error("templates: not found");

    const data = t.data as any;
    const projectId = await ctx.db.insert("projects", {
      ownerId,
      name: `${data.projectName ?? t.name} (fork)`,
      planWeeklyFocusHours: data.planWeeklyFocusHours,
    });

    const milestoneIdMap: Id<"milestones">[] = [];
    for (const m of data.milestones ?? []) {
      const mid = await ctx.db.insert("milestones", {
        ownerId,
        projectId,
        name: m.name,
        order: m.order ?? 0,
      });
      milestoneIdMap.push(mid);
      let uo = 0;
      for (const u of m.units ?? []) {
        await ctx.db.insert("tasks", {
          ownerId,
          title: u.title,
          estimate: u.estimate ?? 0,
          projectId,
          milestoneId: mid,
          order: u.order ?? (uo += 1024),
          activeFlag: true,
          known: u.known,
        });
      }
    }

    for (const r of data.rungs ?? []) {
      await ctx.db.insert("rungs", {
        ownerId,
        projectId,
        title: r.title,
        company: r.company,
        payMin: r.payMin,
        payMax: r.payMax,
        requirements: r.requirements,
        degreeMention: r.degreeMention,
        sideDoor: r.sideDoor,
        order: r.order ?? 0,
        milestoneIds: (r.milestoneIndexes ?? [])
          .map((i: number) => milestoneIdMap[i])
          .filter(Boolean),
      });
    }

    return projectId;
  },
});