import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { action, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { parseRoadmapSh } from "./lib/roadmapsh";
import { resolveOwner } from "./lib/owner";

export const commit = mutation({
  args: {
    name: v.string(),
    milestones: v.array(
      v.object({
        name: v.string(),
        units: v.array(
          v.object({
            title: v.string(),
            estimate: v.number(),
            optional: v.optional(v.boolean()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);

    const projectId = await ctx.db.insert("projects", {
      ownerId,
      name: args.name.trim() || "Imported roadmap",
    });

    let milestoneOrder = 0;
    for (const m of args.milestones) {
      const milestoneId = await ctx.db.insert("milestones", {
        ownerId,
        projectId,
        name: m.name.trim() || "Milestone",
        order: (milestoneOrder += 1024),
      });

      let unitOrder = 0;
      for (const u of m.units) {
        await ctx.db.insert("tasks", {
          ownerId,
          title: u.title.trim(),
          estimate: Math.min(8, Math.max(0, Math.round(u.estimate))),
          projectId,
          milestoneId,
          order: (unitOrder += 1024),
          activeFlag: true,
          known: u.optional ? true : undefined,
        });
      }
    }

    return projectId;
  },
});

export const importFromUrl = action({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const res = await fetch(args.url);
    if (!res.ok) {
      throw new Error(`roadmap.sh import: fetch failed (${res.status})`);
    }
    const payload = await res.json();
    const parsed = parseRoadmapSh(payload);
    const projectId: Id<"projects"> = await ctx.runMutation(api.roadmapImport.commit, {
      name: parsed.name,
      milestones: parsed.milestones,
    });
    return projectId;
  },
});
