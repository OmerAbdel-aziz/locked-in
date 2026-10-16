import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import schema from "@/convex/schema";

/**
 * Tasks 13 + 14 gate: project CRUD, the 100-active cap, archive semantics,
 * and the derived overview.
 *
 * The load-bearing claims are the two acceptance criteria, and both are
 * proved against rows rather than against mocks:
 *
 *   - **Archive never deletes or rewrites.** A task filed under the project
 *     and a session snapshotted to it are read back *after* the archive and
 *     required to be field-identical — the same project id, the same task
 *     id. Anything the archive touched would show up here.
 *   - **The overview reads the snapshot, not the name.** A rename between
 *     the session and the read must not move a minute of focus time, which
 *     is what makes "renames don't affect history" a query over ids rather
 *     than a hope about strings.
 *
 * Everything else is the ordinary contract — who may write what, which list
 * each bucket lands in, where the cap bites — written out because project
 * rows are edited through a UI and Task 24's merge will union them by name.
 */

const modules = import.meta.glob("../convex/**/*.*s");

function newTest() {
  return convexTest(schema, modules);
}

/** Two owners sharing one database, each with a caller of their own. */
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

const MIN = 60_000;
const NOW = 1_705_323_600_000; // 2024-01-15T13:00:00Z, an afternoon with a shape

async function logSession(
  t: Caller,
  fields: {
    startedAt: number;
    completedAt: number;
    phase?: "focus" | "short" | "long";
    taskId?: Id<"tasks">;
    projectId?: Id<"projects">;
  },
) {
  return t.mutation(api.sessions.logCompleted, {
    phase: "focus",
    tzOffsetAtCompletion: 0,
    ...fields,
  });
}

describe("create", () => {
  it("creates a project with a trimmed name", async () => {
    const { base, ownerId, t } = await world();

    const id = await t.mutation(api.projects.create, { name: "  Ship Q2  " });

    const row = await base.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ ownerId, name: "Ship Q2" });
    expect(row).not.toHaveProperty("archivedAt");

    const { active, archived } = await t.query(api.projects.list, {});
    expect(active.map((p) => p._id)).toEqual([id]);
    expect(archived).toEqual([]);
  });

  it.each(["", "    "])("rejects the blank name %j", async (name) => {
    const { t } = await world();
    await expect(t.mutation(api.projects.create, { name })).rejects.toThrow(
      /cannot be empty/i,
    );
  });

  it("rejects an absurdly long name", async () => {
    const { t } = await world();
    await expect(
      t.mutation(api.projects.create, { name: "x".repeat(101) }),
    ).rejects.toThrow(/limit is 100/);
  });

  it("enforces the 100-active cap with a friendly error", async () => {
    const { t } = await world();

    for (let i = 0; i < 100; i++) {
      await t.mutation(api.projects.create, { name: `project ${i}` });
    }
    await expect(
      t.mutation(api.projects.create, { name: "one too many" }),
    ).rejects.toThrow(/100 active projects/);

    // The cap counts the board, not history: archiving one frees the slot.
    const { active } = await t.query(api.projects.list, {});
    await t.mutation(api.projects.archive, { projectId: active[0]._id });
    await expect(
      t.mutation(api.projects.create, { name: "fits now" }),
    ).resolves.toBeDefined();
  });

  it("keeps two owners' boards apart", async () => {
    const { stranger, t } = await world();

    const mine = await t.mutation(api.projects.create, { name: "Mine" });
    const theirs = await stranger.mutation(api.projects.create, {
      name: "Theirs",
    });

    expect((await t.query(api.projects.list, {})).active.map((p) => p._id)).toEqual([
      mine,
    ]);
    expect(
      (await stranger.query(api.projects.list, {})).active.map((p) => p._id),
    ).toEqual([theirs]);
  });
});

describe("rename", () => {
  it("renames the project row and nothing else", async () => {
    const { base, t } = await world();
    const id = await t.mutation(api.projects.create, { name: "Old" });

    await t.mutation(api.projects.rename, { projectId: id, name: "  New  " });

    expect((await base.run((ctx) => ctx.db.get(id)))?.name).toBe("New");
  });

  it("rejects a blank or over-long replacement", async () => {
    const { t } = await world();
    const id = await t.mutation(api.projects.create, { name: "Keep" });

    await expect(
      t.mutation(api.projects.rename, { projectId: id, name: "   " }),
    ).rejects.toThrow(/cannot be empty/i);
    await expect(
      t.mutation(api.projects.rename, { projectId: id, name: "x".repeat(101) }),
    ).rejects.toThrow(/limit is 100/);
  });

  it("will not rename somebody else's project", async () => {
    const { base, stranger, t } = await world();
    const theirs = await stranger.mutation(api.projects.create, {
      name: "Theirs",
    });

    await expect(
      t.mutation(api.projects.rename, { projectId: theirs, name: "Mine now" }),
    ).rejects.toThrow(/project not found/);
    expect((await base.run((ctx) => ctx.db.get(theirs)))?.name).toBe("Theirs");
  });
});

describe("archive", () => {
  it("stamps archivedAt and moves the row between buckets", async () => {
    const { base, t } = await world();
    const id = await t.mutation(api.projects.create, { name: "Done" });

    const before = Date.now();
    await t.mutation(api.projects.archive, { projectId: id });
    const after = Date.now();

    const row = await base.run((ctx) => ctx.db.get(id));
    expect(row?.archivedAt).toBeGreaterThanOrEqual(before);
    expect(row?.archivedAt).toBeLessThanOrEqual(after);

    const { active, archived } = await t.query(api.projects.list, {});
    expect(active).toEqual([]);
    expect(archived.map((p) => p._id)).toEqual([id]);
  });

  it("is idempotent — archiving twice keeps the first stamp", async () => {
    const { base, t } = await world();
    const id = await t.mutation(api.projects.create, { name: "Done" });

    await t.mutation(api.projects.archive, { projectId: id });
    const first = (await base.run((ctx) => ctx.db.get(id)))?.archivedAt;

    await t.mutation(api.projects.archive, { projectId: id });
    expect((await base.run((ctx) => ctx.db.get(id)))?.archivedAt).toBe(first);
  });

  it("never deletes or rewrites tasks and sessions — the acceptance criterion", async () => {
    const { base, t } = await world();
    const projectId = await t.mutation(api.projects.create, { name: "Ship" });
    const taskId = await t.mutation(api.tasks.create, {
      title: "Build it",
      estimate: 2,
      projectId,
    });
    const sessionId = await logSession(t, {
      startedAt: NOW - 25 * MIN,
      completedAt: NOW,
      taskId,
      projectId,
    });

    const taskBefore = await base.run((ctx) => ctx.db.get(taskId));
    const sessionBefore = await base.run((ctx) => ctx.db.get(sessionId));

    await t.mutation(api.projects.archive, { projectId });

    // Field-identical: the same project id on the task, the same pair of
    // ids on the session. Anything the archive rewrote would differ here.
    expect(await base.run((ctx) => ctx.db.get(taskId))).toEqual(taskBefore);
    expect(await base.run((ctx) => ctx.db.get(sessionId))).toEqual(
      sessionBefore,
    );

    // And the task is still listed, still filed where it was.
    const { active } = await t.query(api.tasks.list, {});
    expect(active.map((task) => task._id)).toEqual([taskId]);
    expect(active[0].projectId).toBe(projectId);
  });

  it("will not archive somebody else's project", async () => {
    const { base, stranger, t } = await world();
    const theirs = await stranger.mutation(api.projects.create, {
      name: "Theirs",
    });

    await expect(
      t.mutation(api.projects.archive, { projectId: theirs }),
    ).rejects.toThrow(/project not found/);
    expect(
      (await base.run((ctx) => ctx.db.get(theirs))),
    ).not.toHaveProperty("archivedAt");
  });

  it("unarchives back onto the board, under the same cap", async () => {
    const { t } = await world();
    const id = await t.mutation(api.projects.create, { name: "Paused" });
    await t.mutation(api.projects.archive, { projectId: id });

    await t.mutation(api.projects.unarchive, { projectId: id });

    const { active, archived } = await t.query(api.projects.list, {});
    expect(active.map((p) => p._id)).toEqual([id]);
    expect(archived).toEqual([]);
  });
});

describe("overview", () => {
  it("derives counts, leaves and focus time from tasks and the log", async () => {
    const { t } = await world();
    const projectId = await t.mutation(api.projects.create, { name: "Ship" });
    const otherId = await t.mutation(api.projects.create, { name: "Other" });

    const open = await t.mutation(api.tasks.create, {
      title: "Open",
      estimate: 3,
      projectId,
    });
    const done = await t.mutation(api.tasks.create, {
      title: "Done",
      estimate: 2,
      projectId,
    });
    await t.mutation(api.tasks.complete, { taskId: done });
    // Somebody else's estimate, on another project — not this overview's.
    await t.mutation(api.tasks.create, {
      title: "Elsewhere",
      estimate: 8,
      projectId: otherId,
    });

    // Two 25-minute focus sessions on the open task, a break between them,
    // and a focus session on the other project.
    await logSession(t, {
      startedAt: NOW - 25 * MIN,
      completedAt: NOW,
      taskId: open,
      projectId,
    });
    await logSession(t, {
      startedAt: NOW - 65 * MIN,
      completedAt: NOW - 40 * MIN,
      taskId: open,
      projectId,
    });
    await logSession(t, {
      phase: "short",
      startedAt: NOW - 35 * MIN,
      completedAt: NOW - 30 * MIN,
      taskId: open,
      projectId,
    });
    await logSession(t, {
      startedAt: NOW - 25 * MIN,
      completedAt: NOW - 1 * MIN,
      projectId: otherId,
    });

    expect(await t.query(api.projects.overview, { projectId })).toEqual({
      project: expect.objectContaining({ _id: projectId, name: "Ship" }),
      openCount: 1,
      doneCount: 1,
      estimatedLeaves: 5,
      completedLeaves: 2,
      focusMinutes: 50,
      focusSessions: 2,
      tasks: expect.arrayContaining([
        expect.objectContaining({ _id: open, title: "Open", activeFlag: true }),
        expect.objectContaining({ _id: done, title: "Done", activeFlag: false }),
      ]),
    });
  });

  it("survives a rename — history is keyed by id, not by name", async () => {
    const { t } = await world();
    const projectId = await t.mutation(api.projects.create, { name: "Old" });
    await logSession(t, {
      startedAt: NOW - 25 * MIN,
      completedAt: NOW,
      projectId,
    });

    await t.mutation(api.projects.rename, { projectId, name: "New" });

    const view = await t.query(api.projects.overview, { projectId });
    expect(view.project.name).toBe("New");
    expect(view.focusMinutes).toBe(25);
    expect(view.completedLeaves).toBe(1);
  });

  it("survives an archive — an archived project keeps its attribution", async () => {
    const { t } = await world();
    const projectId = await t.mutation(api.projects.create, { name: "Ship" });
    await logSession(t, {
      startedAt: NOW - 25 * MIN,
      completedAt: NOW,
      projectId,
    });

    await t.mutation(api.projects.archive, { projectId });

    const view = await t.query(api.projects.overview, { projectId });
    expect(view.project.archivedAt).toEqual(expect.any(Number));
    expect(view.focusMinutes).toBe(25);
    expect(view.openCount).toBe(0);
  });

  it("is calm for an empty project — no fabricated numbers", async () => {
    const { t } = await world();
    const projectId = await t.mutation(api.projects.create, { name: "Empty" });

    expect(await t.query(api.projects.overview, { projectId })).toEqual({
      project: expect.objectContaining({ _id: projectId, name: "Empty" }),
      openCount: 0,
      doneCount: 0,
      estimatedLeaves: 0,
      completedLeaves: 0,
      focusMinutes: 0,
      focusSessions: 0,
      tasks: [],
    });
  });

  it("refuses a foreign project and a caller with no session", async () => {
    const { stranger, t } = await world();
    const theirs = await stranger.mutation(api.projects.create, {
      name: "Theirs",
    });

    await expect(
      t.query(api.projects.overview, { projectId: theirs }),
    ).rejects.toThrow(/project not found/);

    const bare = newTest();
    await expect(
      bare.query(api.projects.overview, { projectId: theirs }),
    ).rejects.toThrow(/unauthenticated/i);
  });
});

describe("owner enforcement", () => {
  it("refuses every function when the caller has no session", async () => {
    const t = newTest();
    const projectId = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        createdAt: 1,
        isAnonymous: true,
      });
      return ctx.db.insert("projects", { ownerId, name: "seed" });
    });

    await expect(
      t.mutation(api.projects.create, { name: "x" }),
    ).rejects.toThrow(/unauthenticated/i);
    await expect(
      t.mutation(api.projects.rename, { projectId, name: "x" }),
    ).rejects.toThrow(/unauthenticated/i);
    await expect(
      t.mutation(api.projects.archive, { projectId }),
    ).rejects.toThrow(/unauthenticated/i);
    await expect(
      t.mutation(api.projects.unarchive, { projectId }),
    ).rejects.toThrow(/unauthenticated/i);
    await expect(t.query(api.projects.list, {})).rejects.toThrow(
      /unauthenticated/i,
    );
    await expect(
      t.query(api.projects.overview, { projectId }),
    ).rejects.toThrow(/unauthenticated/i);
  });
});
