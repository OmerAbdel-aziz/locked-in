import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import schema from "@/convex/schema";

import {
  planMerge,
  projectMergeKey,
  resolveActiveTaskId,
  sessionMergeKey,
  taskMergeKey,
  type MergeSession,
  type MergeTask,
} from "../lib/merge";

const DAY = Date.UTC(2026, 9, 14); // fixed UTC midnight
const H1 = 3_600_000;

function task(over: Partial<MergeTask> & { id: string }): MergeTask {
  return {
    title: "Write",
    creationTime: DAY + H1,
    estimate: 2,
    activeFlag: true,
    order: 0,
    ...over,
  };
}

describe("task merge key (Q1: trimmed + case-folded + UTC day)", () => {
  it("folds case and trims", () => {
    expect(taskMergeKey("  Deep Work ", DAY + 1)).toBe(
      taskMergeKey("deep work", DAY + 2),
    );
  });
  it("same title different UTC day differs", () => {
    expect(taskMergeKey("Write", DAY + 1)).not.toBe(
      taskMergeKey("Write", DAY + 86_400_001),
    );
  });
  it("UTC day boundary, not local: 23:59 vs 00:01 UTC differ", () => {
    expect(taskMergeKey("Write", DAY + 86_399_999)).not.toBe(
      taskMergeKey("Write", DAY + 86_400_000),
    );
  });
});

describe("project merge key (Q4)", () => {
  it("is case-insensitive", () => {
    expect(projectMergeKey("Deep Work")).toBe(projectMergeKey("  DEEP work "));
  });
});

describe("golden fixtures: merge plan", () => {
  it("anonymous-only: everything survives", () => {
    const deviceTasks = [task({ id: "d1", order: 0 })];
    const plan = planMerge({
      accountTasks: [],
      deviceTasks,
      accountProjects: [],
      deviceProjects: [],
      accountSessions: [],
      deviceSessions: [
        {
          id: "s1",
          startedAt: DAY,
          completedAt: DAY + 25 * 60_000,
          phase: "focus",
          taskKey: taskMergeKey("Write", DAY + H1),
          projectKey: "",
          tzOffsetAtCompletion: 0,
        },
      ],
      accountMaxOrder: null,
    });
    expect(plan.survivingDeviceTaskIds).toEqual(["d1"]);
    expect(plan.survivingDeviceSessionIds).toEqual(["s1"]);
    expect(plan.duplicateDeviceSessionIds).toEqual([]);
  });

  it("account-only: nothing to merge", () => {
    const plan = planMerge({
      accountTasks: [task({ id: "a1" })],
      deviceTasks: [],
      accountProjects: [],
      deviceProjects: [],
      accountSessions: [],
      deviceSessions: [],
      accountMaxOrder: 0,
    });
    expect(plan.survivingDeviceTaskIds).toEqual([]);
    expect(plan.taskRemap).toEqual({});
  });

  it("both diverged: dedupe + union (Q2 account wins, Q5 remap)", () => {
    const creation = DAY + H1;
    const accountTasks = [
      task({ id: "a-write", title: "Write", creationTime: creation, order: 0 }),
      task({ id: "a-read", title: "Read", creationTime: creation, order: 1024 }),
    ];
    const deviceTasks = [
      // duplicate of account "Write" (different case/estimate) -> dropped
      task({
        id: "d-write",
        title: "  WRITE ",
        creationTime: creation + 5000,
        estimate: 5,
        order: 0,
      }),
      // brand-new device task -> survives, appended past max
      task({ id: "d-new", title: "Run", creationTime: creation, order: 0 }),
    ];
    const writeKey = taskMergeKey("Write", creation);
    const plan = planMerge({
      accountTasks,
      deviceTasks,
      accountProjects: [],
      deviceProjects: [],
      accountSessions: [
        {
          id: "as1",
          startedAt: DAY,
          completedAt: DAY + 1000,
          phase: "focus",
          taskKey: writeKey,
          projectKey: "",
          tzOffsetAtCompletion: 0,
        },
      ],
      deviceSessions: [
        // exact duplicate of account session -> dropped
        {
          id: "ds-dup",
          startedAt: DAY,
          completedAt: DAY + 1000,
          phase: "focus",
          taskKey: writeKey,
          projectKey: "",
          tzOffsetAtCompletion: 0,
        },
        // same triple, different tz -> kept (Q3 full-row)
        {
          id: "ds-tz",
          startedAt: DAY,
          completedAt: DAY + 1000,
          phase: "focus",
          taskKey: writeKey,
          projectKey: "",
          tzOffsetAtCompletion: -300,
        },
      ],
      accountMaxOrder: 1024,
    });
    expect(plan.taskRemap).toEqual({ "d-write": "a-write" });
    expect(plan.survivingDeviceTaskIds).toEqual(["d-new"]);
    expect(plan.deviceTaskOrders["d-new"]).toBe(2048);
    expect(plan.duplicateDeviceSessionIds).toEqual(["ds-dup"]);
    expect(plan.survivingDeviceSessionIds).toEqual(["ds-tz"]);
  });

  it("projects: earliest spelling wins, archived only if both (Q4)", () => {
    const plan = planMerge({
      accountTasks: [],
      deviceTasks: [],
      accountProjects: [
        { id: "ap", name: "Deep Work", creationTime: DAY + 2000 },
      ],
      deviceProjects: [
        {
          id: "dp",
          name: "deep work",
          creationTime: DAY + 1000,
          archivedAt: DAY,
        },
      ],
      accountSessions: [],
      deviceSessions: [],
      accountMaxOrder: null,
    });
    // earliest (device) spelling wins; only device archived -> open
    expect(plan.projectName["deep work"]).toBe("deep work");
    expect(plan.projectArchivedAt["deep work"]).toBeUndefined();
    expect(plan.projectRemap).toEqual({ dp: "ap" });
  });

  it("projects: archived only if both archived", () => {
    const plan = planMerge({
      accountTasks: [],
      deviceTasks: [],
      accountProjects: [
        { id: "ap", name: "P", creationTime: DAY, archivedAt: DAY + 1 },
      ],
      deviceProjects: [
        { id: "dp", name: "p", creationTime: DAY + 1, archivedAt: DAY + 2 },
      ],
      accountSessions: [],
      deviceSessions: [],
      accountMaxOrder: null,
    });
    expect(plan.projectArchivedAt["p"]).toBe(DAY + 1);
  });

  it("sessions: same triple different taskKey both survive (Q3)", () => {
    const a: MergeSession = {
      id: "a",
      startedAt: 1,
      completedAt: 2,
      phase: "focus",
      taskKey: "write|1",
      projectKey: "",
      tzOffsetAtCompletion: 0,
    };
    const b: MergeSession = { ...a, id: "b", taskKey: "read|1" };
    expect(sessionMergeKey(a)).not.toBe(sessionMergeKey(b));
    const plan = planMerge({
      accountTasks: [],
      deviceTasks: [],
      accountProjects: [],
      deviceProjects: [],
      accountSessions: [a],
      deviceSessions: [b],
      accountMaxOrder: null,
    });
    expect(plan.survivingDeviceSessionIds).toEqual(["b"]);
  });
});

const modules = import.meta.glob("../convex/**/*.*s");

function newTest() {
  return convexTest(schema, modules);
}

describe("convex merge.execute / discardDeviceData (integration)", () => {
  async function twoOwners() {
    const base = newTest();
    const deviceId = await base.run((ctx) =>
      ctx.db.insert("users", { createdAt: 1, isAnonymous: true }),
    );
    const accountId = await base.run((ctx) =>
      ctx.db.insert("users", { createdAt: 2 }),
    );
    return {
      base,
      deviceId,
      accountId,
      device: base.withIdentity({ subject: `${deviceId}|d` }),
      account: base.withIdentity({ subject: `${accountId}|a` }),
    };
  }

  it("execute unions diverged data: account wins, sessions remap, nothing lost", async () => {
    const { base, deviceId, account, accountId } = await twoOwners();
    const seed = await base.run((ctx) =>
      (async () => {
        const dp = await ctx.db.insert("projects", {
          ownerId: deviceId,
          name: "deep work",
        });
        const dt = await ctx.db.insert("tasks", {
          ownerId: deviceId,
          title: "Write",
          estimate: 5,
          order: 0,
          activeFlag: true,
          projectId: dp,
        });
        const at = await ctx.db.insert("tasks", {
          ownerId: accountId,
          title: "write",
          estimate: 2,
          order: 0,
          activeFlag: true,
        });
        await ctx.db.insert("sessions", {
          ownerId: deviceId,
          startedAt: 1000,
          completedAt: 2000,
          phase: "focus",
          taskId: dt,
          projectId: dp,
          tzOffsetAtCompletion: 0,
        });
        return { dt, at };
      })(),
    );
    const res = await account.mutation(api.merge.execute, {
      deviceOwnerId: deviceId,
    });
    // device "Write" (dup) dropped, its session remapped to account survivor
    expect(res).toMatchObject({ tasks: 0, projects: 1, sessions: 1 });
    const tasks = await base.run((ctx) =>
      ctx.db
        .query("tasks")
        .withIndex("by_owner", (q) => q.eq("ownerId", accountId))
        .collect(),
    );
    expect(tasks.map((t) => t.title)).toEqual(["write"]);
    const sessions = await base.run((ctx) =>
      ctx.db
        .query("sessions")
        .withIndex("by_owner_completed", (q) => q.eq("ownerId", accountId))
        .collect(),
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].taskId).toBe(seed.at);
    // project unioned under account, device row re-owned (not copied)
    const projects = await base.run((ctx) =>
      ctx.db
        .query("projects")
        .withIndex("by_owner", (q) => q.eq("ownerId", accountId))
        .collect(),
    );
    expect(projects).toHaveLength(1);
    expect(sessions[0].projectId).toBe(projects[0]._id);
    // identities linked device -> account
    const link = await base.run((ctx) =>
      ctx.db
        .query("identities")
        .withIndex("by_anonymousId", (q) => q.eq("anonymousId", deviceId))
        .unique(),
    );
    expect(link?.userId).toBe(accountId);
  });

  it("execute drops exact-duplicate sessions (Q3 full-row)", async () => {
    const { base, deviceId, account, accountId } = await twoOwners();
    await base.run((ctx) =>
      (async () => {
        for (const owner of [deviceId, accountId]) {
          await ctx.db.insert("sessions", {
            ownerId: owner as Id<"users">,
            startedAt: 1000,
            completedAt: 2000,
            phase: "focus" as const,
            tzOffsetAtCompletion: 0,
          });
        }
      })(),
    );
    const res = await account.mutation(api.merge.execute, {
      deviceOwnerId: deviceId,
    });
    expect(res.sessions).toBe(0);
    expect(res.discarded).toBe(1);
  });

  it("discardDeviceData hard-deletes device rows, keeps account (Q10)", async () => {
    const { base, deviceId, account, accountId } = await twoOwners();
    await base.run((ctx) =>
      (async () => {
        await ctx.db.insert("tasks", {
          ownerId: deviceId,
          title: "Old",
          estimate: 1,
          order: 0,
          activeFlag: true,
        });
        await ctx.db.insert("tasks", {
          ownerId: accountId,
          title: "Mine",
          estimate: 1,
          order: 0,
          activeFlag: true,
        });
      })(),
    );
    const res = await account.mutation(api.merge.discardDeviceData, {
      deviceOwnerId: deviceId,
    });
    expect(res.deleted).toBe(1);
    const remaining = await base.run((ctx) =>
      ctx.db
        .query("tasks")
        .withIndex("by_owner", (q) => q.eq("ownerId", accountId))
        .collect(),
    );
    expect(remaining.map((t) => t.title)).toEqual(["Mine"]);
  });

  it("importRows rejects unknown names, inserts valid, flags duplicates (Q8)", async () => {
    const { account, accountId } = await twoOwners();
    const S = Date.UTC(2026, 9, 14, 10, 0, 0);
    const E = S + 25 * 60_000;
    const res = await account.mutation(api.sessions.importRows, {
      rows: [
        {
          startedAt: S,
          completedAt: E,
          phase: "focus",
          task: "Ghost",
          project: "",
          tzOffsetAtCompletion: 0,
        },
      ],
    });
    expect(res[0].ok).toBe(false);
    // create the task, then import for real
    await account.mutation(api.tasks.create, { title: "Ghost", estimate: 2 });
    const res2 = await account.mutation(api.sessions.importRows, {
      rows: [
        {
          startedAt: S,
          completedAt: E,
          phase: "focus",
          task: "ghost",
          project: "",
          tzOffsetAtCompletion: 0,
        },
      ],
    });
    expect(res2[0]).toMatchObject({ ok: true, duplicate: false });
    const res3 = await account.mutation(api.sessions.importRows, {
      rows: [
        {
          startedAt: S,
          completedAt: E,
          phase: "focus",
          task: "ghost",
          project: "",
          tzOffsetAtCompletion: 0,
        },
      ],
    });
    expect(res3[0]).toMatchObject({ ok: true, duplicate: true });
    void accountId;
  });
});

describe("resolveActiveTaskId (Q6)", () => {
  const finalIds = new Set(["a1", "d-new"]);
  const surv = new Map([["d-old", "a1"]]);
  it("prefers account pointer when valid", () => {
    expect(
      resolveActiveTaskId({
        accountActiveTaskId: "a1",
        deviceActiveTaskId: "d-new",
        accountTaskIds: new Set(["a1"]),
        taskSurvivor: surv,
        finalAccountTaskIds: finalIds,
      }),
    ).toBe("a1");
  });
  it("falls back to device remapped survivor", () => {
    expect(
      resolveActiveTaskId({
        accountActiveTaskId: "dead",
        deviceActiveTaskId: "d-old",
        accountTaskIds: new Set(["a1"]),
        taskSurvivor: surv,
        finalAccountTaskIds: finalIds,
      }),
    ).toBe("a1");
  });
  it("clears when neither valid", () => {
    expect(
      resolveActiveTaskId({
        accountActiveTaskId: "dead",
        deviceActiveTaskId: "gone",
        accountTaskIds: new Set(["a1"]),
        taskSurvivor: surv,
        finalAccountTaskIds: finalIds,
      }),
    ).toBeUndefined();
  });
});
