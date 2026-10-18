import { v } from "convex/values";

import { requireOwnedProject, resolveOwner, taskIfYours } from "./lib/owner";
import { mutation, query } from "./_generated/server";

/**
 * The in-flight timer's server mirror — ADR-005.
 *
 * The engine in `lib/pomodoro.ts` remains the single source of truth for
 * *transitions*; this table only remembers where the engine currently
 * stands, so a page reload can put it back. Three consequences shape the
 * file:
 *
 * **Boundary writes only.** The row is replaced on start, pause, resume,
 * skip, reset, completion, and deadline-moving settings changes — never on
 * a tick. PRD §9's "persist timer ticks to Convex (write session
 * boundaries only)" line is honored as written: these *are* boundaries.
 *
 * **Idle is no row.** Any transition whose next state has `startedAt ===
 * null` calls `clear`, so the row's lifetime is exactly the phase's. A
 * stale row therefore cannot happen from within one tab, and a second tab
 * hydrating while the first finished simply finds nothing.
 *
 * **Same ownership and validation rules as the log.** The owner is derived
 * through `resolveOwner` (never an argument), the client-supplied
 * timestamps are validated rather than trusted, and the binding arrives
 * already bound at phase start (D8) so `taskIfYours` /
 * `requireOwnedProject` check it exactly as `logCompleted` does.
 */

/** Timestamps must be after the app plausibly existed (same bar as sessions). */
const MIN_TIMESTAMP_MS = Date.UTC(2020, 0, 1);

/** Two hours of clock skew before a future timestamp is considered a lie. */
const FUTURE_TOLERANCE_MS = 2 * 60 * 60 * 1000;

/**
 * The timer as the *next* load should find it — or as the reactive picker
 * returns so all authenticated callers get an answer, not a hang.
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await resolveOwner(ctx);

    return await ctx.db
      .query("timerState")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
  },
});

/**
 * Replace this owner's single row with the client's current position.
 *
 * `save` rather than `patch`: `pausedAt` must *disappear* on the way back
 * to running, and patching optional fields away reads a lot like the bug
 * it prevents. A row is fully described by one boundary event, so the
 * replace is total by construction.
 *
 * Idempotent by value: saving the same anchor twice (two tabs finishing
 * the same phase, a replay) writes the same document again — the row has
 * no history to corrupt, unlike `sessions`.
 */
export const save = mutation({
  args: {
    phase: v.union(v.literal("focus"), v.literal("short"), v.literal("long")),
    cyclePosition: v.number(),
    status: v.union(v.literal("running"), v.literal("paused")),
    phaseEndsAt: v.number(),
    startedAt: v.number(),
    pausedAt: v.optional(v.number()),
    /** Bound at phase start by the client (D8), validated here. */
    boundTaskId: v.optional(v.id("tasks")),
    boundProjectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);

    // The timestamps are the client's clock — the clock `phaseEndsAt` was
    // anchored to — so they are validated, not trusted.
    const { startedAt, phaseEndsAt, pausedAt, cyclePosition, status } = args;

    if (!Number.isFinite(startedAt) || startedAt < MIN_TIMESTAMP_MS) {
      throw new Error("save: startedAt is not a plausible instant");
    }
    if (!Number.isFinite(phaseEndsAt) || phaseEndsAt <= startedAt) {
      throw new Error("save: phaseEndsAt must follow startedAt");
    }
    if (status !== "paused" && pausedAt !== undefined) {
      throw new Error("save: pausedAt belongs only to a paused timer");
    }
    if (
      status === "paused" &&
      pausedAt !== undefined &&
      (!Number.isFinite(pausedAt) || pausedAt < startedAt)
    ) {
      throw new Error("save: pausedAt must not precede startedAt");
    }
    const now = Date.now();
    if (phaseEndsAt > now + FUTURE_TOLERANCE_MS) {
      throw new Error("save: phaseEndsAt is implausibly far in the future");
    }
    if (
      !Number.isInteger(cyclePosition) ||
      cyclePosition < 1 ||
      cyclePosition > 12
    ) {
      throw new Error("save: cyclePosition is out of range");
    }

    const boundTaskId =
      args.boundTaskId === undefined
        ? undefined
        : ((await taskIfYours(ctx, ownerId, args.boundTaskId)) ?? undefined);

    const boundProjectId = args.boundProjectId;
    if (boundProjectId !== undefined) {
      await requireOwnedProject(ctx, ownerId, boundProjectId);
    }

    const existing = await ctx.db
      .query("timerState")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();

    const document = {
      ownerId,
      phase: args.phase,
      cyclePosition,
      status,
      phaseEndsAt,
      startedAt,
      pausedAt,
      boundTaskId,
      boundProjectId,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.replace(existing._id, document);
      return existing._id;
    }
    return await ctx.db.insert("timerState", document);
  },
});

/** The timer went idle (reset, skip to a waiting phase, non-autostarted
 * completion) — the row's lifetime ends with the phase's. */
export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await resolveOwner(ctx);

    // Queries cannot `.delete()`: read matches and remove each explicitly.
    for await (const row of ctx.db
      .query("timerState")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))) {
      await ctx.db.delete(row._id);
    }
  },
});
