/**
 * Merge planning — Phase 8, Task 24 (pure logic).
 *
 * Locked semantics (human rulings 2026-10-16):
 *   Q1 (task key):      trimmed + case-folded title + UTC calendar day of
 *                       creationTime (`Math.floor(ms / 86400000)`).
 *   Q2 (task winner):   account row wins wholesale; device duplicate dropped,
 *                       its sessions remap to the survivor.
 *   Q3 (session key):   full-row match — startedAt + completedAt + phase +
 *                       task key + project key + tzOffset. Else keep both.
 *   Q4 (project):       case-insensitive name; earliest creationTime keeps its
 *                       spelling; archived only if BOTH sides archived.
 *   Q5 (remap):         sessions on losing task/project ids rewrite to
 *                       survivors (plus task.projectId remap).
 *   Q6 (order/select):  account order keys kept; device-only survivors append
 *                       past max account key in +APPEND_STEP steps;
 *                       activeTaskId = account's if valid else device's
 *                       remapped else cleared; settings = account wins.
 *
 * Framework-free: operates on plain `{id, ...}` shapes so vitest can drive it
 * without Convex. `convex/merge.ts` adapts real Docs to these shapes and
 * applies the returned plan.
 */

export const MS_PER_DAY = 86_400_000;

/** Keep in step with `convex/lib/order.ts` APPEND_STEP (no import: lib stays Convex-free). */
export const APPEND_STEP = 1024;

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

export function normalizeProjectName(name: string): string {
  return name.trim().toLowerCase();
}

export function utcDay(creationTimeMs: number): number {
  return Math.floor(creationTimeMs / MS_PER_DAY);
}

/** Q1: trimmed + case-folded title + UTC day of creationTime. */
export function taskMergeKey(title: string, creationTimeMs: number): string {
  return `${normalizeTitle(title)}|${utcDay(creationTimeMs)}`;
}

/** Q4: case-insensitive project name. */
export function projectMergeKey(name: string): string {
  return normalizeProjectName(name);
}

export type Phase = "focus" | "short" | "long";

export interface MergeTask {
  id: string;
  title: string;
  creationTime: number;
  estimate: number;
  completedAt?: number;
  activeFlag: boolean;
  projectId?: string;
  order: number;
}

export interface MergeProject {
  id: string;
  name: string;
  creationTime: number;
  archivedAt?: number;
}

export interface MergeSession {
  id: string;
  startedAt: number;
  completedAt: number;
  phase: Phase;
  /** Resolved logical task key ("" when unbound). Caller maps taskId via tasks first. */
  taskKey: string;
  /** Normalized project name ("" when unbound). */
  projectKey: string;
  tzOffsetAtCompletion: number;
}

/**
 * Q3: full-row session identity. Two rows with the same triple but different
 * binding/tz are DIFFERENT rows and both survive.
 */
export function sessionMergeKey(s: MergeSession): string {
  return [
    s.startedAt,
    s.completedAt,
    s.phase,
    s.taskKey,
    s.projectKey,
    s.tzOffsetAtCompletion,
  ].join("|");
}

export interface MergePlan {
  /** device task id -> surviving account task id (dedupe drops). */
  taskRemap: Record<string, string>;
  /** device project id -> surviving account project id. */
  projectRemap: Record<string, string>;
  /** device-only task ids that survive as new rows (rewritten below). */
  survivingDeviceTaskIds: string[];
  /** device-only project ids that survive as new rows. */
  survivingDeviceProjectIds: string[];
  /** device session ids that are true duplicates (drop). */
  duplicateDeviceSessionIds: string[];
  /** device session ids that survive as new rows (with remapped keys). */
  survivingDeviceSessionIds: string[];
  /** projectId rewrite for surviving device tasks (old device project -> survivor). */
  deviceTaskProjectRemap: Record<string, string>;
  /** winning project rows' final archivedAt (project merge key -> archivedAt|undefined). */
  projectArchivedAt: Record<string, number | undefined>;
  /** winning project rows' final name spelling (merge key -> name). */
  projectName: Record<string, string>;
  /** order to assign each surviving device task (task id -> order). */
  deviceTaskOrders: Record<string, number>;
}

export function planMerge(args: {
  accountTasks: MergeTask[];
  deviceTasks: MergeTask[];
  accountProjects: MergeProject[];
  deviceProjects: MergeProject[];
  accountSessions: MergeSession[];
  deviceSessions: MergeSession[];
  accountMaxOrder: number | null;
}): MergePlan {
  const {
    accountTasks,
    deviceTasks,
    accountProjects,
    deviceProjects,
    accountSessions,
    deviceSessions,
    accountMaxOrder,
  } = args;

  // ---- Projects first (tasks reference them) ----
  const accountProjectsByKey = new Map<string, MergeProject>();
  for (const p of accountProjects) {
    const k = projectMergeKey(p.name);
    const prev = accountProjectsByKey.get(k);
    if (!prev || p.creationTime < prev.creationTime) {
      accountProjectsByKey.set(k, p);
    }
  }
  // Intra-account duplicates collapse the same way (earliest wins); extra
  // account rows sharing a key are treated as already-merged and ignored.
  const projectRemap: Record<string, string> = {};
  const survivingDeviceProjectIds: string[] = [];
  const projectArchivedAt: Record<string, number | undefined> = {};
  const projectName: Record<string, string> = {};

  // Seed winners with account rows.
  for (const [k, p] of accountProjectsByKey) {
    projectName[k] = p.name;
    projectArchivedAt[k] = p.archivedAt;
  }

  // Device projects: match by key against account winner, else survive.
  const deviceProjectsByKey = new Map<string, MergeProject[]>();
  for (const p of deviceProjects) {
    const k = projectMergeKey(p.name);
    const list = deviceProjectsByKey.get(k) ?? [];
    list.push(p);
    deviceProjectsByKey.set(k, list);
  }
  for (const [k, rows] of deviceProjectsByKey) {
    // Earliest device row represents the device side for this key.
    rows.sort((a, b) => a.creationTime - b.creationTime);
    const deviceRep = rows[0];
    const accountWinner = accountProjectsByKey.get(k);
    if (accountWinner) {
      // Q4: earliest creationTime keeps spelling; archived only if both.
      const winner =
        deviceRep.creationTime < accountWinner.creationTime
          ? deviceRep
          : accountWinner;
      projectName[k] = winner.name;
      const bothArchived =
        accountWinner.archivedAt !== undefined &&
        deviceRep.archivedAt !== undefined;
      projectArchivedAt[k] =
        bothArchived
          ? Math.min(accountWinner.archivedAt!, deviceRep.archivedAt!)
          : undefined;
      for (const r of rows) {
        projectRemap[r.id] = accountWinner.id;
      }
    } else {
      // No account side: earliest device row survives, rest remap to it.
      projectName[k] = deviceRep.name;
      projectArchivedAt[k] =
        rows.every((r) => r.archivedAt !== undefined)
          ? Math.min(...rows.map((r) => r.archivedAt!))
          : undefined;
      survivingDeviceProjectIds.push(deviceRep.id);
      for (const r of rows.slice(1)) {
        projectRemap[r.id] = deviceRep.id;
      }
    }
  }
  // Account-side intra-key extras remap to the winner (keeps keys total).
  for (const p of accountProjects) {
    const k = projectMergeKey(p.name);
    const winner = accountProjectsByKey.get(k)!;
    if (p.id !== winner.id) {
      projectRemap[p.id] = winner.id;
    }
  }

  // Full project id -> survivor id (account ids map to themselves via key winner).
  const projectSurvivor = new Map<string, string>();
  for (const p of accountProjects) {
    const k = projectMergeKey(p.name);
    projectSurvivor.set(p.id, accountProjectsByKey.get(k)!.id);
  }
  for (const [from, to] of Object.entries(projectRemap)) {
    projectSurvivor.set(from, to);
  }
  for (const id of survivingDeviceProjectIds) {
    projectSurvivor.set(id, id);
  }

  // ---- Tasks: Q1 key, Q2 account wins ----
  const accountTasksByKey = new Map<string, MergeTask>();
  for (const t of accountTasks) {
    const k = taskMergeKey(t.title, t.creationTime);
    const prev = accountTasksByKey.get(k);
    if (!prev || t.creationTime < prev.creationTime) {
      accountTasksByKey.set(k, t);
    }
  }
  const taskRemap: Record<string, string> = {};
  const survivingDeviceTaskIds: string[] = [];
  const deviceTaskProjectRemap: Record<string, string> = {};
  const deviceTaskOrders: Record<string, number> = {};

  // Account intra-key extras remap to winner.
  for (const t of accountTasks) {
    const k = taskMergeKey(t.title, t.creationTime);
    const winner = accountTasksByKey.get(k)!;
    if (t.id !== winner.id) {
      taskRemap[t.id] = winner.id;
    }
  }

  let nextOrder = (accountMaxOrder ?? -APPEND_STEP) + APPEND_STEP;
  // Group device tasks by key so intra-device dupes collapse (earliest reps).
  const deviceTasksByKey = new Map<string, MergeTask[]>();
  for (const t of deviceTasks) {
    const k = taskMergeKey(t.title, t.creationTime);
    const list = deviceTasksByKey.get(k) ?? [];
    list.push(t);
    deviceTasksByKey.set(k, list);
  }
  for (const [k, rows] of deviceTasksByKey) {
    rows.sort((a, b) => a.creationTime - b.creationTime);
    const accountWinner = accountTasksByKey.get(k);
    if (accountWinner) {
      for (const r of rows) {
        taskRemap[r.id] = accountWinner.id;
      }
    } else {
      const rep = rows[0];
      survivingDeviceTaskIds.push(rep.id);
      for (const r of rows.slice(1)) {
        taskRemap[r.id] = rep.id;
      }
      // Q6: append past max account key.
      deviceTaskOrders[rep.id] = nextOrder;
      nextOrder += APPEND_STEP;
      // Q5: task.projectId remaps to project survivor when set.
      if (rep.projectId !== undefined) {
        const surv = projectSurvivor.get(rep.projectId);
        if (surv !== undefined && surv !== rep.projectId) {
          deviceTaskProjectRemap[rep.id] = surv;
        }
      }
    }
  }

  const taskSurvivor = new Map<string, string>();
  for (const t of accountTasks) {
    const k = taskMergeKey(t.title, t.creationTime);
    taskSurvivor.set(t.id, accountTasksByKey.get(k)!.id);
  }
  for (const [from, to] of Object.entries(taskRemap)) {
    taskSurvivor.set(from, to);
  }
  for (const id of survivingDeviceTaskIds) {
    taskSurvivor.set(id, id);
  }

  // ---- Sessions: Q3 full-row key over RESOLVED logical keys ----
  // Caller passes taskKey/projectKey already resolved against the CURRENT
  // owner; here we rewrite device rows through the survivor maps by asking the
  // caller for join data. Since MergeSession carries logical keys (not ids),
  // the device side must be built with post-remap keys. To keep this pure and
  // total, we accept an optional resolver: device sessions may carry
  // `taskKey`/`projectKey` pre-remap, and `taskIdMaps` translate them.
  // Simplest correct contract: the caller builds MergeSession.taskKey as the
  // TASK MERGE KEY of the bound task (title+day, not the id) and
  // projectKey as the normalized project name. Those logical keys are
  // owner-independent, so no id translation is needed here at all.
  const accountKeys = new Set(accountSessions.map(sessionMergeKey));
  const duplicateDeviceSessionIds: string[] = [];
  const survivingDeviceSessionIds: string[] = [];
  for (const s of deviceSessions) {
    if (accountKeys.has(sessionMergeKey(s))) {
      duplicateDeviceSessionIds.push(s.id);
    } else {
      survivingDeviceSessionIds.push(s.id);
      accountKeys.add(sessionMergeKey(s)); // intra-device dupes collapse too
    }
  }

  return {
    taskRemap,
    projectRemap,
    survivingDeviceTaskIds,
    survivingDeviceProjectIds,
    duplicateDeviceSessionIds,
    survivingDeviceSessionIds,
    deviceTaskProjectRemap,
    projectArchivedAt,
    projectName,
    deviceTaskOrders,
  };
}

/**
 * Resolve which activeTaskId survives (Q6): account's if it names a surviving
 * row, else device's remapped through the task survivor map, else cleared.
 */
export function resolveActiveTaskId(args: {
  accountActiveTaskId?: string;
  deviceActiveTaskId?: string;
  accountTaskIds: Set<string>;
  taskSurvivor: Map<string, string>;
  finalAccountTaskIds: Set<string>;
}): string | undefined {
  const { accountActiveTaskId, deviceActiveTaskId } = args;
  if (
    accountActiveTaskId !== undefined &&
    args.finalAccountTaskIds.has(accountActiveTaskId)
  ) {
    return accountActiveTaskId;
  }
  // Account pointer may name a deduped-away account row: follow it to winner.
  if (accountActiveTaskId !== undefined) {
    const surv = args.taskSurvivor.get(accountActiveTaskId);
    if (surv !== undefined && args.finalAccountTaskIds.has(surv)) {
      return surv;
    }
  }
  if (deviceActiveTaskId !== undefined) {
    const surv =
      args.taskSurvivor.get(deviceActiveTaskId) ?? deviceActiveTaskId;
    if (args.finalAccountTaskIds.has(surv)) {
      return surv;
    }
  }
  return undefined;
}
