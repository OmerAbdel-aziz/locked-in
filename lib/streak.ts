/**
 * Streak derivation — Task 15 (PRD §4.1, ADR-003).
 *
 * The streak is **never stored**: it is recomputed from the session log on
 * every read. A stored counter could not survive merge-on-sign-in (two
 * counters cannot be honestly unioned) or CSV import, and a single bug would
 * corrupt it permanently. The log is append-only, so derivation is the only
 * shape that stays honest.
 *
 * Rule (D5): a local calendar day is *earned* by ≥1 completed **focus**
 * session; a missed day breaks the streak; no grace period.
 *
 * Day grouping (PRD §6): each session carries its own `tzOffsetAtCompletion`
 * (minutes, east positive), and the local day is derived per session from
 * that recorded offset — never from the device's *current* offset. A session
 * that ended at 00:01 local belongs to the day that just began, not the one
 * that ended, and a traveller's history keeps the days they were actually
 * lived in.
 */

export const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

/** The fields of a session row the streak reads. Nothing else. */
export interface StreakSession {
  completedAt: number;
  /** Recorded UTC offset in minutes at completion (east positive). */
  tzOffsetAtCompletion: number;
  phase: "focus" | "short" | "long";
}

/**
 * The local calendar day a session was completed in, as whole days since
 * the Unix epoch. The recorded offset is shifted *before* flooring — the
 * same order `startOfLocalDay` in `convex/tasks.ts` uses, for the same
 * reason: flooring first names tomorrow's midnight for early-morning UTC
 * instants on western devices.
 */
export function localDayKey(completedAt: number, tzOffsetMinutes: number): number {
  return Math.floor((completedAt + tzOffsetMinutes * MS_PER_MINUTE) / MS_PER_DAY);
}

/**
 * The set of earned local days: one entry per day holding ≥1 completed
 * focus session. Breaks are sessions too, but no day is earned by resting.
 */
export function earnedDays(sessions: readonly StreakSession[]): Set<number> {
  const days = new Set<number>();
  for (const session of sessions) {
    if (session.phase !== "focus") {
      continue;
    }
    if (!Number.isFinite(session.completedAt)) {
      continue;
    }
    days.add(localDayKey(session.completedAt, session.tzOffsetAtCompletion));
  }
  return days;
}

/**
 * The current streak: consecutive earned days ending today — or, when today
 * is not earned yet, ending yesterday.
 *
 * The yesterday anchor is what makes the badge honest at 9am: a user who
 * earned the last five days but has not started today's session is still on
 * a five-day streak; the streak only breaks when a full local day passes
 * with nothing completed. A last-earned day older than yesterday means the
 * break already happened, so the answer is 0 rather than a stale count.
 *
 * Sessions completing in the future (clock skew) are ignored: they name
 * days that have not happened yet and must not extend the streak.
 *
 * `now` and `nowOffsetMinutes` are arguments rather than reads so this stays
 * pure — the badge supplies the device's current offset, the query supplies
 * the server's now, and tests supply fixtures.
 */
export function currentStreak(
  sessions: readonly StreakSession[],
  now: number,
  nowOffsetMinutes: number,
): number {
  const earned = earnedDays(sessions);
  if (earned.size === 0) {
    return 0;
  }

  const today = localDayKey(now, nowOffsetMinutes);
  const start = earned.has(today) ? today : today - 1;
  if (!earned.has(start)) {
    return 0;
  }

  let streak = 0;
  for (let day = start; earned.has(day); day--) {
    // A future-dated row can never be reached here: `start` is at most
    // today, and the walk only moves backwards. Days beyond today are
    // simply never counted.
    streak++;
  }
  return streak;
}
