import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex schema v1 — Tasks 3 + 4.
 *
 * Field-for-field with PRD §6. Everything not listed here is deliberately
 * absent: streaks, leaf counts, daily totals and every other aggregate are
 * *derived* from `sessions` at read time and never stored (ADR-003).
 *
 * `...authTables` comes from Convex Auth and owns the six `auth*` system
 * tables plus its own `users` shape. Our `users` below *replaces* the
 * library's entry, because PRD §6 requires a `createdAt` the library doesn't
 * define — so it carries the library's optional profile fields and its
 * `email`/`phone` indexes (Task 23's magic link queries by email) alongside
 * the column PRD asks for.
 *
 * Foreign keys use `v.id(...)`, not `string`, so they carry referential
 * integrity and type as `Id<"table">` rather than degrading to `string` on
 * read. Adopted while every table is still empty, so there is no data to
 * migrate.
 *
 * Indexes are named and shaped by the two requirements in Task 3:
 *   - stats over an owner + completedAt range (bounded scans, never a
 *     full-log pull — see the PRD's "Stats page slow" mitigation)
 *   - listing an owner's active tasks in fractional `order`
 * plus owner+taskId and owner+day coverage from the acceptance list.
 *
 * "Day" grouping needs no dedicated index: a calendar day at the session's
 * `tzOffsetAtCompletion` is just a bounded `completedAt` range, so
 * `by_owner_completed` serves day derivations by converting the local
 * day's boundaries to UTC once and running one range scan. That keeps the
 * schema as PRD §6 specifies instead of smuggling in a denormalized
 * `dayKey` field.
 */
export default defineSchema({
  ...authTables,

  /**
   * Replaces `authTables.users` (see header). `createdAt` is PRD §6's;
   * the rest are the library's, all optional. `isAnonymous` is what the
   * Anonymous provider writes on first visit (Task 4).
   */
  users: defineTable({
    // PRD §6
    createdAt: v.number(),
    /**
     * PRD §4.1's selection — "clicking a task selects it … `activeTaskId`
     * persisted per owner" — which §6's data model gives **no column at all**.
     * Adding one was therefore an §9 ask-first schema change (approved
     * 2026-10-15: a column on `users`, chosen over a new one-row-per-owner
     * table and over a client-side-only pointer).
     *
     * It is a *pointer*, so it inherits none of a foreign key's lifecycle
     * duties: it is written only after `requireOwnedTask` has proved the
     * target belongs to this owner, and read back through the row's own
     * primary key — which is exactly what `resolveOwner` already returns, so
     * selection costs one `patch` with no lookup and one point read.
     *
     * It is deliberately **left pointing at a task that has been completed**
     * (Task 11: a finished task keeps receiving sessions until another is
     * chosen), and deliberately **cleared** by `clearCompleted`, the one
     * place that deletes the rows it can point at.
     *
     * Unindexed: selection is read and written by owner id alone, which is
     * the primary key. Nothing ever searches *for* owners by their choice.
     */
    activeTaskId: v.optional(v.id("tasks")),
    // Convex Auth profile fields
    email: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    phone: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phoneVerificationTime: v.optional(v.number()),
  })
    // Required by Convex Auth's own queries; Task 23 magic link uses email.
    // Convex appends _creationTime to every index automatically, so it is
    // not spelled out here (matching every other index in this schema).
    .index("email", ["email"])
    .index("phone", ["phone"]),

  /**
   * The link table that makes two identity paths safe to merge: an
   * anonymous identity and the user it eventually belongs to.
   * Every Convex function resolves its owner through this (ADR-002).
   */
  identities: defineTable({
    /** The anonymous Convex Auth user row (a `users` doc with isAnonymous). */
    anonymousId: v.optional(v.id("users")),
    /** Raw device marker from browser storage, when one exists. */
    deviceId: v.optional(v.string()),
    /** Set once the anonymous identity is linked to an account. */
    userId: v.optional(v.id("users")),
    /** Set when the merge runs — the moment anonymous data joined an account. */
    mergedAt: v.optional(v.number()),
  })
    .index("by_anonymousId", ["anonymousId"])
    .index("by_userId", ["userId"]),

  /** `archivedAt` hides a project without deleting it or rewriting history. */
  projects: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    archivedAt: v.optional(v.number()),
    /** Plan (D-3): weekly focus-hour target for this roadmap. Null-safe default = unset. */
    planWeeklyFocusHours: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    // Merge dedupes projects by name case-insensitively (ADR-002).
    .index("by_owner_name", ["ownerId", "name"]),

  tasks: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    /** Points at a `projects` row. */
    projectId: v.optional(v.id("projects")),
    /** Points at a `milestones` row (v2 roadmap spine). Null-safe default = unset. */
    milestoneId: v.optional(v.id("milestones")),
    /** Per-unit "already known" flag (v2). Null-safe default = false. */
    known: v.optional(v.boolean()),
    /** Pomodoro leaves, 0–8 (range enforced in the mutation, not the validator). */
    estimate: v.number(),
    /** Fractional rank — insert between neighbours, never renumber the list. */
    order: v.number(),
    /** Present when done; `activeFlag` is the fast path for "is it open?". */
    completedAt: v.optional(v.number()),
    activeFlag: v.boolean(),
  })
    // One index does double duty: open tasks for an owner, already in
    // fractional order — this is the task list's hot path.
    .index("by_owner_active", ["ownerId", "activeFlag", "order"])
    .index("by_owner", ["ownerId"])
    .index("by_owner_task_project", ["ownerId", "projectId"])
    .index("by_owner_milestone", ["ownerId", "milestoneId"]),

  /**
   * The canonical data: an append-only log written once when a phase ends
   * (ADR-003). Never updated after insert.
   *
   * `taskId` binds at session start and is immutable. `projectId` is a
   * denormalized snapshot taken at start so renaming or archiving a project
   * never rewrites recorded history.
   */
  sessions: defineTable({
    ownerId: v.id("users"),
    startedAt: v.number(),
    completedAt: v.number(),
    phase: v.union(v.literal("focus"), v.literal("short"), v.literal("long")),
    /** Bound at start; immutable afterwards. */
    taskId: v.optional(v.id("tasks")),
    /** Snapshot at start — survives task/project changes. */
    projectId: v.optional(v.id("projects")),
    /**
     * UTC offset (minutes) at completion. Day grouping uses this, not the
     * server's clock: a session ending 01:00 counts for *that* calendar day.
     */
    tzOffsetAtCompletion: v.number(),
  })
    // Stats + streak + daily derivation all bound on this one range scan.
    .index("by_owner_completed", ["ownerId", "completedAt"])
    .index("by_owner_task", ["ownerId", "taskId"]),

  /**
   * The single in-flight timer, mirrored for refresh recovery (ADR-005).
   *
   * Written by the client on **boundary events only** — start, pause, resume,
   * skip, reset, completion, and any transition that moves the deadline or
   * the cycle — never per tick. The countdown is never stored as remaining
   * time; only the wall-clock instants `phaseEndsAt` / `startedAt` /
   * `pausedAt` are, so a device that closed an hour ago re-derives the
   * correct remaining time (or the fact the phase is overdue) from its own
   * clock at hydrate time, byte-for-byte the same math the live face uses.
   *
   * Ephemeral and *rewritable*, deliberately unlike append-only `sessions`
   * (ADR-003): a completed session is history and must never change, while
   * this row is the timer's current position and every boundary replaces it.
   * Idle is the **absence** of a row — `clear` deletes it on the way down,
   * so stale rows can never resurrect a finished session in a second tab.
   *
   * One row per owner, enforced by read-then-write on the `by_owner` index
   * (the writer is per-tab, and last-tab-writer-wins is the honest outcome
   * of two devices trying to run the same phase at once).
   */
  timerState: defineTable({
    ownerId: v.id("users"),
    phase: v.union(v.literal("focus"), v.literal("short"), v.literal("long")),
    /** "The focus session that will start next", 1..N — same rule as the engine's. */
    cyclePosition: v.number(),
    /** A row always describes running or paused — idle is no row at all. */
    status: v.union(v.literal("running"), v.literal("paused")),
    /** Wall-clock ms when the running phase ends (always present in a row). */
    phaseEndsAt: v.number(),
    /** Pause-adjusted start of the logged session (always present in a row). */
    startedAt: v.number(),
    /** Present only while `paused`; removed on the way back to running. */
    pausedAt: v.optional(v.number()),
    /** The D8 binding of this phase, as it stood at phase start. */
    boundTaskId: v.optional(v.id("tasks")),
    /** The same instant's project snapshot (PRD §6 semantics, same as `sessions`). */
    boundProjectId: v.optional(v.id("projects")),
    /** Client clock at the last boundary — diagnostic, never authoritative. */
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  /**
   * v2 roadmap spine: Milestones group Units within a Roadmap (project).
   * Null-safe defaults so existing data reads identically.
   */
  milestones: defineTable({
    ownerId: v.id("users"),
    projectId: v.id("projects"),
    name: v.string(),
    /** Fractional rank — same machinery as tasks.order. */
    order: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_project", ["ownerId", "projectId"])
    .index("by_owner_project_order", ["ownerId", "projectId", "order"]),

  /**
   * v2 career ladder: Rungs attached to a Roadmap.
   */
  rungs: defineTable({
    ownerId: v.id("users"),
    projectId: v.id("projects"),
    title: v.string(),
    company: v.optional(v.string()),
    payMin: v.optional(v.number()),
    payMax: v.optional(v.number()),
    requirements: v.optional(v.array(v.string())),
    degreeMention: v.optional(v.boolean()),
    sideDoor: v.optional(v.boolean()),
    /** Milestone ids this rung draws on. */
    milestoneIds: v.optional(v.array(v.id("milestones"))),
    order: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_project", ["ownerId", "projectId"]),

  /**
   * Published roadmap templates (v2 social). Stored as a snapshot so forks
   * never touch the source. `hidden` flips on report; `deletedAt` on unpublish.
   */
  templates: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    publishedAt: v.number(),
    hidden: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    data: v.any(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_published", ["publishedAt"]),

  /** One row per owner, written lazily on first use. */
  settings: defineTable({
    ownerId: v.id("users"),
    focusMin: v.number(),
    shortMin: v.number(),
    longMin: v.number(),
    /** Focus sessions before a long break. */
    sessionCount: v.number(),
    autoStartBreak: v.boolean(),
    autoStartFocus: v.boolean(),
    notificationsEnabled: v.boolean(),
  }).index("by_owner", ["ownerId"]),
});
