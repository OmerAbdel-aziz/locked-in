import { v } from "convex/values";
import { mutation } from "./_generated/server";
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
