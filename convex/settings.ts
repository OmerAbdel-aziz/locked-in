/**
 * Settings storage — Task 16 (PRD §4.1).
 *
 * One row per owner, written lazily on first update. Reads return the PRD
 * defaults when no row exists yet, so a first-time visitor's timer is
 * already correct before they ever open the dialog — and the store's
 * `DEFAULT_SETTINGS` in `lib/pomodoro.ts` is the same numbers in a second
 * place only because the client must tick before any query settles.
 *
 * Ranges are enforced in the mutation, not the validator (same stance as
 * `tasks.create`'s estimate): the arguments stay plain numbers and the
 * bounds live here, next to the reason for each.
 */

import { v } from "convex/values";

import { resolveOwner } from "./lib/owner";
import { mutation, query } from "./_generated/server";

/**
 * Classic pomodoro defaults (PRD §4.1, decision D4): 25/5/15 minutes, 4
 * sessions per cycle, a focus end auto-starts the break while a break end
 * waits for the user. Notifications default to on — PRD §4.1 fires one on
 * every phase end unless the user opts out.
 */
export const SETTINGS_DEFAULTS = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  sessionCount: 4,
  autoStartBreak: true,
  autoStartFocus: false,
  notificationsEnabled: true,
} as const;

/** A minute is too short to focus in; three hours is no longer a pomodoro. */
const MIN_DURATION = 1;
const MAX_DURATION = 180;

/** One session per cycle means every focus earns a long break; past a dozen
 * the "Session N of M" pill stops meaning anything. */
const MIN_SESSION_COUNT = 1;
const MAX_SESSION_COUNT = 12;

function validDuration(name: string, value: number): number {
  if (!Number.isInteger(value) || value < MIN_DURATION || value > MAX_DURATION) {
    throw new Error(
      `settings: ${name} must be a whole number of minutes from ${MIN_DURATION} to ${MAX_DURATION}, got ${value}`,
    );
  }
  return value;
}

function validSessionCount(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < MIN_SESSION_COUNT ||
    value > MAX_SESSION_COUNT
  ) {
    throw new Error(
      `settings: sessionCount must be a whole number from ${MIN_SESSION_COUNT} to ${MAX_SESSION_COUNT}, got ${value}`,
    );
  }
  return value;
}

/**
 * The owner's settings, or the PRD defaults when nothing was ever saved.
 * Derived reads only — this never writes, so rendering the dialog can never
 * create a row as a side effect.
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await resolveOwner(ctx);

    const row = await ctx.db
      .query("settings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();

    if (row === null) {
      return { ...SETTINGS_DEFAULTS };
    }

    return {
      focusMin: row.focusMin,
      shortMin: row.shortMin,
      longMin: row.longMin,
      sessionCount: row.sessionCount,
      autoStartBreak: row.autoStartBreak,
      autoStartFocus: row.autoStartFocus,
      notificationsEnabled: row.notificationsEnabled,
    };
  },
});

/**
 * Patches the owner's settings. Omitted fields are left alone; an empty
 * patch still ensures the row exists. Invalid values are refused rather
 * than clamped — clamping would silently store a number the user did not
 * type, and the dialog validates first anyway.
 */
export const update = mutation({
  args: {
    focusMin: v.optional(v.number()),
    shortMin: v.optional(v.number()),
    longMin: v.optional(v.number()),
    sessionCount: v.optional(v.number()),
    autoStartBreak: v.optional(v.boolean()),
    autoStartFocus: v.optional(v.boolean()),
    notificationsEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx);

    const patch: {
      focusMin?: number;
      shortMin?: number;
      longMin?: number;
      sessionCount?: number;
      autoStartBreak?: boolean;
      autoStartFocus?: boolean;
      notificationsEnabled?: boolean;
    } = {};
    if (args.focusMin !== undefined) {
      patch.focusMin = validDuration("focusMin", args.focusMin);
    }
    if (args.shortMin !== undefined) {
      patch.shortMin = validDuration("shortMin", args.shortMin);
    }
    if (args.longMin !== undefined) {
      patch.longMin = validDuration("longMin", args.longMin);
    }
    if (args.sessionCount !== undefined) {
      patch.sessionCount = validSessionCount(args.sessionCount);
    }
    if (args.autoStartBreak !== undefined) {
      patch.autoStartBreak = args.autoStartBreak;
    }
    if (args.autoStartFocus !== undefined) {
      patch.autoStartFocus = args.autoStartFocus;
    }
    if (args.notificationsEnabled !== undefined) {
      patch.notificationsEnabled = args.notificationsEnabled;
    }

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();

    if (existing === null) {
      await ctx.db.insert("settings", { ownerId, ...SETTINGS_DEFAULTS, ...patch });
      return;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, patch);
    }
  },
});
