import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  normalizeProjectName,
  planMerge,
  resolveActiveTaskId,
  taskMergeKey,
  type MergeSession,
} from "./lib/merge";
import { resolveOwner } from "./lib/owner";

/**
 * Merge-on-sign-in — Task 24.
 *
 * Locked semantics (human rulings 2026-10-16, see `lib/merge.ts` header):
 * Q1 task key = trimmed+case-folded title + UTC day of `_creationTime`;
 * Q2 account task wins wholesale; Q3 sessions dedupe full-row;
 * Q4 earliest project spelling wins, archived only if both;
 * Q5 sessions remap to survivors; Q6 orders appended, account
 * activeTaskId/settings win; Q10 "use account instead" hard-deletes.
 *
 * Identity model: the caller is the ACCOUNT owner (post-magic-link
 * `resolveOwner`). The device rows live under the ANONYMOUS owner id, passed
 * explicitly as `deviceOwnerId` (remembered by the client from its
 * pre-sign-in session). Convex `Id<"users">` values are unguessable
 * capabilities, so naming one proves same-device possession for this MVP —
 * documented, not silent. Nothing here trusts a client-supplied owner for
 * the CALLER; only the source dataset is named.
 */

const LIST_LIMIT = 1000;

async function readOwnerData(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">,
) {
  const [tasks, projects, sessions, settings, user] = await Promise.all([
    ctx.db
      .query("tasks")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(LIST_LIMIT),
    ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(LIST_LIMIT),
    ctx.db
      .query("sessions")
      .withIndex("by_owner_completed", (q) => q.eq("ownerId", ownerId))
      .take(LIST_LIMIT),
    ctx.db
      .query("settings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first(),
    ctx.db.get(ownerId),
  ]);
  return { tasks, projects, sessions, settings, user };
}

// --- adapters: Docs -> lib/merge.ts shapes ---

function toMergeTask(t: Doc<"tasks">) {
  return {
    id: t._id as string,
    title: t.title,
    creationTime: t._creationTime,
    estimate: t.estimate,
    completedAt: t.completedAt,
    activeFlag: t.activeFlag,
    projectId: t.projectId as string | undefined,
    order: t.order,
  };
}

function toMergeProject(p: Doc<"projects">) {
  return {
    id: p._id as string,
    name: p.name,
    creationTime: p._creationTime,
    archivedAt: p.archivedAt,
  };
}

function sessionLogicalKeys(
  s: Doc<"sessions">,
  tasksById: Map<string, Doc<"tasks">>,
  projectsById: Map<string, Doc<"projects">>,
): Pick<MergeSession, "taskKey" | "projectKey"> {
  let taskKey = "";
  if (s.taskId !== undefined) {
    const t = tasksById.get(s.taskId as string);
    if (t) taskKey = taskMergeKey(t.title, t._creationTime);
    // Dangling taskId (task cleared mid-session, Task 11): unbound key.
  }
  let projectKey = "";
  if (s.projectId !== undefined) {
    const p = projectsById.get(s.projectId as string);
    if (p) projectKey = normalizeProjectName(p.name);
  }
  return { taskKey, projectKey };
}

/** Counts of device-side rows, so the client knows whether to prompt (ADR-002 ask-first). */
export const needsMerge = query({
  args: { deviceOwnerId: v.id("users") },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);
    if (args.deviceOwnerId === ownerId) {
      return { tasks: 0, projects: 0, sessions: 0, showPrompt: false };
    }
    const [tasks, projects, sessions] = await Promise.all([
      ctx.db
        .query("tasks")
        .withIndex("by_owner", (q) => q.eq("ownerId", args.deviceOwnerId))
        .take(1),
      ctx.db
        .query("projects")
        .withIndex("by_owner", (q) => q.eq("ownerId", args.deviceOwnerId))
        .take(1),
      ctx.db
        .query("sessions")
        .withIndex("by_owner_completed", (q) =>
          q.eq("ownerId", args.deviceOwnerId),
        )
        .take(1),
    ]);
    const total = tasks.length + projects.length + sessions.length;
    return {
      tasks: tasks.length,
      projects: projects.length,
      sessions: sessions.length,
      showPrompt: total > 0,
    };
  },
});

/**
 * Merge device data into the caller's account (default action).
 * Idempotent-ish: re-running with the same device owner finds no surviving
 * device rows left to copy (they were re-owned, not copied — see below) and
 * duplicates collapse via the plan.
 *
 * Implementation moves ownership by RE-OWNING surviving device rows
 * (patch ownerId) rather than copying: fewer writes, and session `_id`
 * stability is irrelevant (nothing references sessions). Device duplicates
 * are deleted; account winners are patched for name/archivedAt.
 */
export const execute = mutation({
  args: { deviceOwnerId: v.id("users") },
  handler: async (ctx, args) => {
    const accountId = await resolveOwner(ctx);
    const deviceId = args.deviceOwnerId;
    if (deviceId === accountId) {
      return { tasks: 0, projects: 0, sessions: 0, discarded: 0 };
    }

    const [account, device] = await Promise.all([
      readOwnerData(ctx, accountId),
      readOwnerData(ctx, deviceId),
    ]);

    const accountTasksById = new Map(
      account.tasks.map((t) => [t._id as string, t]),
    );
    const deviceTasksById = new Map(
      device.tasks.map((t) => [t._id as string, t]),
    );
    const accountProjectsById = new Map(
      account.projects.map((p) => [p._id as string, p]),
    );
    const deviceProjectsById = new Map(
      device.projects.map((p) => [p._id as string, p]),
    );

    const toSession = (
      s: Doc<"sessions">,
      tb: Map<string, Doc<"tasks">>,
      pb: Map<string, Doc<"projects">>,
    ): MergeSession => ({
      id: s._id as string,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      phase: s.phase,
      ...sessionLogicalKeys(s, tb, pb),
      tzOffsetAtCompletion: s.tzOffsetAtCompletion,
    });

    const accountMaxOrder =
      account.tasks.length === 0
        ? null
        : Math.max(...account.tasks.map((t) => t.order));

    const plan = planMerge({
      accountTasks: account.tasks.map(toMergeTask),
      deviceTasks: device.tasks.map(toMergeTask),
      accountProjects: account.projects.map(toMergeProject),
      deviceProjects: device.projects.map(toMergeProject),
      accountSessions: account.sessions.map((s) =>
        toSession(s, accountTasksById, accountProjectsById),
      ),
      deviceSessions: device.sessions.map((s) =>
        toSession(s, deviceTasksById, deviceProjectsById),
      ),
      accountMaxOrder,
    });

    let projects = 0;
    let tasks = 0;
    let sessions = 0;
    let discarded = 0;

    // --- Projects: patch account winners, re-own device survivors ---
    const projectKeyOf = new Map<string, string>(); // survivor device id -> merge key
    for (const p of device.projects) {
      const k = normalizeProjectName(p.name);
      if (plan.survivingDeviceProjectIds.includes(p._id as string)) {
        projectKeyOf.set(p._id as string, k);
      }
    }
    // Account winners take the planned name/archivedAt.
    for (const p of account.projects) {
      const k = normalizeProjectName(p.name);
      const wantName = plan.projectName[k];
      const wantArchived = plan.projectArchivedAt[k];
      if (
        wantName !== undefined &&
        (p.name !== wantName || p.archivedAt !== wantArchived)
      ) {
        await ctx.db.patch(p._id, {
          name: wantName,
          archivedAt: wantArchived,
        });
      }
    }
    const deviceProjectToAccount = new Map<string, Id<"projects">>();
    for (const id of plan.survivingDeviceProjectIds) {
      const row = deviceProjectsById.get(id)!;
      const k = projectKeyOf.get(id)!;
      await ctx.db.patch(row._id, {
        ownerId: accountId,
        name: plan.projectName[k] ?? row.name,
        archivedAt: plan.projectArchivedAt[k],
      });
      deviceProjectToAccount.set(id, row._id);
      projects++;
    }
    // Device duplicates + account-side extras: remap target is the winner.
    for (const dup of device.projects) {
      const target = plan.projectRemap[dup._id as string] as
        | string
        | undefined;
      if (target === undefined) continue; // survivor, handled above
      // Sessions pointing at the loser move to the winner (Q5); the row is deleted.
      const winnerId = (
        accountProjectsById.has(target)
          ? (target as string)
          : (deviceProjectToAccount.get(target) ?? target)
      ) as Id<"projects">;
      deviceProjectToAccount.set(dup._id as string, winnerId);
      await ctx.db.delete(dup._id);
      discarded++;
    }

    const resolveProject = (
      oldId: Id<"projects"> | undefined,
    ): Id<"projects"> | undefined => {
      if (oldId === undefined) return undefined;
      const mapped = deviceProjectToAccount.get(oldId as string);
      if (mapped !== undefined) return mapped;
      if (accountProjectsById.has(oldId as string)) return oldId;
      return undefined; // dangling -> unbound (never store a dead id)
    };

    // --- Tasks: account wins (no patch); device survivors re-owned ---
    const deviceTaskToAccount = new Map<string, Id<"tasks">>();
    for (const t of account.tasks) {
      deviceTaskToAccount.set(t._id as string, t._id);
    }
    for (const id of plan.survivingDeviceTaskIds) {
      const row = deviceTasksById.get(id)!;
      const newProjectId = resolveProject(row.projectId);
      await ctx.db.patch(row._id, {
        ownerId: accountId,
        order: plan.deviceTaskOrders[id] ?? row.order,
        projectId: newProjectId,
      });
      deviceTaskToAccount.set(id, row._id);
      tasks++;
    }
    for (const [from, to] of Object.entries(plan.taskRemap)) {
      const winner = deviceTaskToAccount.get(to) ?? (to as Id<"tasks">);
      deviceTaskToAccount.set(from, winner as Id<"tasks">);
    }
    // Delete device duplicates (their sessions were remapped, counted below).
    for (const t of device.tasks) {
      if (!plan.survivingDeviceTaskIds.includes(t._id as string)) {
        await ctx.db.delete(t._id);
        discarded++;
      }
    }

    // --- Sessions: re-own survivors with remapped bindings; drop dupes ---
    const dupes = new Set(plan.duplicateDeviceSessionIds);
    for (const s of device.sessions) {
      if (dupes.has(s._id as string)) {
        await ctx.db.delete(s._id);
        discarded++;
        continue;
      }
      const newTaskId = s.taskId
        ? (deviceTaskToAccount.get(s.taskId as string) as
            | Id<"tasks">
            | undefined)
        : undefined;
      const newProjectId = resolveProject(s.projectId);
      await ctx.db.patch(s._id, {
        ownerId: accountId,
        taskId: newTaskId,
        projectId: newProjectId,
      });
      sessions++;
    }

    // --- activeTaskId (Q6) ---
    const finalTaskIds = new Set<string>([
      ...account.tasks.map((t) => t._id as string),
      ...plan.survivingDeviceTaskIds,
    ]);
    const survivorMap = new Map<string, string>();
    for (const [from, to] of Object.entries(plan.taskRemap)) {
      survivorMap.set(from, to);
    }
    const winner = resolveActiveTaskId({
      accountActiveTaskId: account.user?.activeTaskId as string | undefined,
      deviceActiveTaskId: device.user?.activeTaskId as string | undefined,
      accountTaskIds: new Set(account.tasks.map((t) => t._id as string)),
      taskSurvivor: survivorMap,
      finalAccountTaskIds: finalTaskIds,
    });
    await ctx.db.patch(accountId, { activeTaskId: winner as Id<"tasks"> | undefined });

    // --- settings: account wins; clone device's when account has none ---
    if (!account.settings && device.settings) {
      const { ownerId: _o, ...rest } = device.settings as Doc<"settings"> & {
        ownerId: Id<"users">;
      };
      void _o;
      await ctx.db.insert("settings", { ...rest, ownerId: accountId });
    }

    // --- link identities (same shape Task 4 established) ---
    const link = await ctx.db
      .query("identities")
      .withIndex("by_anonymousId", (q) => q.eq("anonymousId", deviceId))
      .unique();
    if (link) {
      await ctx.db.patch(link._id, { userId: accountId, mergedAt: Date.now() });
    } else {
      await ctx.db.insert("identities", {
        anonymousId: deviceId,
        userId: accountId,
        mergedAt: Date.now(),
      });
    }

    return { tasks, projects, sessions, discarded };
  },
});

/**
 * "Use account instead" (Q10 A): hard-delete every device row, then link.
 * Destructive and explicit — the prompt confirms before calling.
 */
export const discardDeviceData = mutation({
  args: { deviceOwnerId: v.id("users") },
  handler: async (ctx, args) => {
    const accountId = await resolveOwner(ctx);
    const deviceId = args.deviceOwnerId;
    if (deviceId === accountId) {
      return { deleted: 0 };
    }
    let deleted = 0;
    for (let round = 0; round < 50; round++) {
      const batch = await ctx.db
        .query("tasks")
        .withIndex("by_owner", (q) => q.eq("ownerId", deviceId))
        .take(100);
      if (batch.length === 0) break;
      for (const t of batch) {
        await ctx.db.delete(t._id);
        deleted++;
      }
      if (batch.length < 100) break;
    }
    for (let round = 0; round < 50; round++) {
      const batch = await ctx.db
        .query("sessions")
        .withIndex("by_owner_completed", (q) => q.eq("ownerId", deviceId))
        .take(100);
      if (batch.length === 0) break;
      for (const s of batch) {
        await ctx.db.delete(s._id);
        deleted++;
      }
      if (batch.length < 100) break;
    }
    for (let round = 0; round < 50; round++) {
      const batch = await ctx.db
        .query("projects")
        .withIndex("by_owner", (q) => q.eq("ownerId", deviceId))
        .take(100);
      if (batch.length === 0) break;
      for (const p of batch) {
        await ctx.db.delete(p._id);
        deleted++;
      }
      if (batch.length < 100) break;
    }
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_owner", (q) => q.eq("ownerId", deviceId))
      .first();
    if (settings) {
      await ctx.db.delete(settings._id);
      deleted++;
    }
    const deviceUser = await ctx.db.get(deviceId);
    if (deviceUser?.activeTaskId !== undefined) {
      await ctx.db.patch(deviceId, { activeTaskId: undefined });
    }
    const link = await ctx.db
      .query("identities")
      .withIndex("by_anonymousId", (q) => q.eq("anonymousId", deviceId))
      .unique();
    if (link) {
      await ctx.db.patch(link._id, { userId: accountId, mergedAt: Date.now() });
    } else {
      await ctx.db.insert("identities", {
        anonymousId: deviceId,
        userId: accountId,
        mergedAt: Date.now(),
      });
    }
    return { deleted };
  },
});
