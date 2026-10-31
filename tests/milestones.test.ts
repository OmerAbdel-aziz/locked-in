import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "@/convex/_generated/api";
import schema from "@/convex/schema";

/**
 * Issue 02 gate: milestone CRUD, unit linkage, fractional reordering with
 * order-exhaustion, and derived percent complete/known.
 */

const modules = import.meta.glob("../convex/**/*.*s");

async function world() {
  const base = convexTest(schema, modules);
  const ownerId = await base.run((ctx) =>
    ctx.db.insert("users", { createdAt: 1, isAnonymous: true }),
  );
  const strangerId = await base.run((ctx) =>
    ctx.db.insert("users", { createdAt: 2, isAnonymous: true }),
  );
  const t = base.withIdentity({ subject: `${ownerId}|s1` });
  const stranger = base.withIdentity({ subject: `${strangerId}|s2` });

  const projectId = await t.mutation(api.projects.create, {
    name: "Backend Roadmap",
  });

  return { base, ownerId, projectId, t, stranger };
}

describe("milestones", () => {
  it("creates, lists, renames and archives in fractional order", async () => {
    const { t, projectId } = await world();

    const first = await t.mutation(api.milestones.create, {
      projectId,
      name: "Month 1",
    });
    const second = await t.mutation(api.milestones.create, {
      projectId,
      name: "Month 2",
    });

    let list = await t.query(api.milestones.list, { projectId });
    expect(list.map((m) => m.name)).toEqual(["Month 1", "Month 2"]);
    expect(list[0].order).toBeLessThan(list[1].order);

    await t.mutation(api.milestones.rename, {
      milestoneId: first,
      name: "Foundations",
    });
    list = await t.query(api.milestones.list, { projectId });
    expect(list[0].name).toBe("Foundations");

    await t.mutation(api.milestones.archive, { milestoneId: second });
    list = await t.query(api.milestones.list, { projectId });
    expect(list.map((m) => m._id)).toEqual([first]);
  });

  it("reorders by neighbour ids, writing exactly one milestone", async () => {
    const { base, t, projectId } = await world();

    const a = await t.mutation(api.milestones.create, {
      projectId,
      name: "A",
    });
    const b = await t.mutation(api.milestones.create, {
      projectId,
      name: "B",
    });
    const c = await t.mutation(api.milestones.create, {
      projectId,
      name: "C",
    });

    const before = await t.query(api.milestones.list, { projectId });
    const cBefore = before.find((m) => m._id === c)?.order;

    await t.mutation(api.milestones.reorder, {
      milestoneId: c,
      afterId: a,
      beforeId: b,
    });

    const after = await t.query(api.milestones.list, { projectId });
    expect(after.map((m) => m._id)).toEqual([a, c, b]);

    // O(1): every row except the dragged one keeps its key bit-for-bit.
    for (const m of after) {
      if (m._id === c) continue;
      const old = before.find((x) => x._id === m._id);
      expect(m.order).toBe(old?.order);
    }
    expect(after.find((m) => m._id === c)?.order).not.toBe(cBefore);
    expect(after.filter((m) => m.order === cBefore)).toHaveLength(0);
    await expect(base.run((ctx) => ctx.db.get(c))).resolves.toBeTruthy();
  });

  it("refuses to reorder across roadmaps", async () => {
    const { t, projectId } = await world();
    const otherProject = await t.mutation(api.projects.create, {
      name: "Other",
    });
    const a = await t.mutation(api.milestones.create, {
      projectId,
      name: "A",
    });
    const other = await t.mutation(api.milestones.create, {
      projectId: otherProject,
      name: "Other A",
    });

    await expect(
      t.mutation(api.milestones.reorder, {
        milestoneId: a,
        afterId: other,
        beforeId: null,
      }),
    ).rejects.toThrow(/across roadmaps/);
  });

  it("links a unit to a milestone in the same roadmap only", async () => {
    const { t, projectId } = await world();
    const otherProject = await t.mutation(api.projects.create, {
      name: "Other",
    });
    const milestone = await t.mutation(api.milestones.create, {
      projectId,
      name: "M1",
    });
    const foreign = await t.mutation(api.milestones.create, {
      projectId: otherProject,
      name: "Foreign",
    });
    const unit = await t.mutation(api.tasks.create, {
      title: "Learn vectors",
      estimate: 2,
      projectId,
    });

    await t.mutation(api.milestones.linkUnit, {
      taskId: unit,
      milestoneId: milestone,
    });
    const { active } = await t.query(api.tasks.list, {});
    expect(active.find((task) => task._id === unit)?.milestoneId).toBe(
      milestone,
    );

    await expect(
      t.mutation(api.milestones.linkUnit, {
        taskId: unit,
        milestoneId: foreign,
      }),
    ).rejects.toThrow(/different roadmap/);
  });

  it("derives percent complete and percent known from unit state", async () => {
    const { t, projectId } = await world();
    const milestone = await t.mutation(api.milestones.create, {
      projectId,
      name: "M1",
    });
    const units = [];
    for (let i = 0; i < 3; i++) {
      units.push(
        await t.mutation(api.tasks.create, {
          title: `Unit ${i}`,
          estimate: 1,
          projectId,
        }),
      );
    }
    for (const unit of units) {
      await t.mutation(api.milestones.linkUnit, {
        taskId: unit,
        milestoneId: milestone,
      });
    }

    await t.mutation(api.tasks.complete, { taskId: units[0] });
    await t.mutation(api.tasks.update, { taskId: units[1], known: true });

    const [progress] = await t.query(api.milestones.progress, { projectId });
    expect(progress.total).toBe(3);
    expect(progress.completed).toBe(1);
    expect(progress.known).toBe(1);
  });

  it("rejects a stranger's milestone", async () => {
    const { t, stranger, projectId } = await world();
    const milestone = await t.mutation(api.milestones.create, {
      projectId,
      name: "Mine",
    });
    await expect(
      stranger.mutation(api.milestones.rename, {
        milestoneId: milestone,
        name: "Hijacked",
      }),
    ).rejects.toThrow(/not found/);
  });

  it("throws when a gap is exhausted instead of sharing a key", async () => {
    const { base, t, projectId } = await world();
    const a = await t.mutation(api.milestones.create, {
      projectId,
      name: "A",
    });
    const b = await t.mutation(api.milestones.create, {
      projectId,
      name: "B",
    });
    const c = await t.mutation(api.milestones.create, {
      projectId,
      name: "C",
    });

    // Put A and B on adjacent float64 keys, so the gap between them has no
    // representable midpoint. Reordering C into it must throw rather than
    // sharing a key.
    await base.run(async (ctx) => {
      await ctx.db.patch(a, { order: 1 });
      await ctx.db.patch(b, { order: 1 + Number.EPSILON });
    });

    await expect(
      t.mutation(api.milestones.reorder, {
        milestoneId: c,
        afterId: a,
        beforeId: b,
      }),
    ).rejects.toThrow(/exhausted/);
  });
});
