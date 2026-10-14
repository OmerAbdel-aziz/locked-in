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
  })
    .index("by_owner", ["ownerId"])
    // Merge dedupes projects by name case-insensitively (ADR-002).
    .index("by_owner_name", ["ownerId", "name"]),

  tasks: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    /** Points at a `projects` row. */
    projectId: v.optional(v.id("projects")),
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
    .index("by_owner_task_project", ["ownerId", "projectId"]),

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
