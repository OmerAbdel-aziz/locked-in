import { describe, expect, it } from "vitest";

import {
  currentStreak,
  earnedDays,
  localDayKey,
  type StreakSession,
} from "@/lib/streak";

/**
 * Task 15 gate: the streak is derived from the session log, never stored
 * (ADR-003).
 *
 * What is pinned here is the *day arithmetic*, which is where a derived
 * streak goes quietly wrong:
 *
 *   - **Which day counts.** Each session's local day comes from its own
 *     recorded offset — never the device's current one — so the 23:59 vs
 *     00:01 edge and the two-offset fixtures below fail against any
 *     implementation that groups by UTC or by "now's" offset.
 *   - **What earns.** Focus sessions only; breaks never earn a day.
 *   - **What breaks.** A missed local day resets to whatever ends
 *     yesterday-or-today; no grace, nothing remembered.
 */

const MIN = 60_000;
/** 2024-01-15T13:00:00Z — a fixed afternoon, so "today" has a definite shape. */
const NOW = 1_705_323_600_000;
const UTC_MIDNIGHT = 1_705_276_800_000; // 2024-01-15T00:00:00Z
const DAY = 24 * 60 * MIN;

function focusAt(completedAt: number, tzOffsetAtCompletion = 0): StreakSession {
  return {
    // Twenty-five minutes of focus ending at the completion instant — the
    // span itself never matters to the streak, only the day it lands in.
    completedAt,
    tzOffsetAtCompletion,
    phase: "focus",
  };
}

describe("localDayKey", () => {
  it("names the UTC day for a UTC device", () => {
    expect(localDayKey(UTC_MIDNIGHT, 0)).toBe(localDayKey(NOW, 0));
    expect(localDayKey(UTC_MIDNIGHT - 1, 0)).toBe(localDayKey(NOW, 0) - 1);
  });

  it("shifts before flooring, so early-morning UTC stays in yesterday's western evening", () => {
    // 01:00Z is 20:00 on the 14th in UTC-5 — the same instant a
    // floor-first implementation would file under the 15th.
    const earlyMorning = UTC_MIDNIGHT + 60 * MIN;
    expect(localDayKey(earlyMorning, -300)).toBe(
      localDayKey(UTC_MIDNIGHT - 60 * MIN, -300),
    );
  });
});

describe("currentStreak", () => {
  it("is zero with no sessions", () => {
    expect(currentStreak([], NOW, 0)).toBe(0);
  });

  it("is zero when only breaks were completed", () => {
    const breaks: StreakSession[] = [
      { completedAt: NOW - 60 * MIN, tzOffsetAtCompletion: 0, phase: "short" },
      { completedAt: NOW - 30 * MIN, tzOffsetAtCompletion: 0, phase: "long" },
    ];
    expect(currentStreak(breaks, NOW, 0)).toBe(0);
    expect(earnedDays(breaks).size).toBe(0);
  });

  it("counts a single session today as a one-day streak", () => {
    expect(currentStreak([focusAt(NOW - 60 * MIN)], NOW, 0)).toBe(1);
  });

  it("splits 23:59 from 00:01 into two earned days", () => {
    // The timezone edge PRD §10.3 exists for: a session ending one minute
    // before local midnight and one ending one minute after it are two
    // different days of effort, not one long evening.
    const beforeMidnight = focusAt(UTC_MIDNIGHT - MIN);
    const afterMidnight = focusAt(UTC_MIDNIGHT + MIN);
    expect(earnedDays([beforeMidnight, afterMidnight]).size).toBe(2);
    expect(currentStreak([beforeMidnight, afterMidnight], NOW, 0)).toBe(2);
  });

  it("derives each day from its own recorded offset, not the device's", () => {
    // Both completed an hour either side of *UTC* midnight, each recorded
    // under UTC+2 (offset +120): locally 01:40 and 02:10 on the 15th — one
    // earned day. A UTC grouping would file them on opposite sides of
    // midnight and answer 2, which is exactly the bug this pins.
    const justPastMidnight = focusAt(UTC_MIDNIGHT + 10 * MIN, 120);
    const justBeforeMidnight = focusAt(UTC_MIDNIGHT - 20 * MIN, 120);
    expect(earnedDays([justPastMidnight, justBeforeMidnight]).size).toBe(1);
    expect(
      currentStreak([justPastMidnight, justBeforeMidnight], NOW, 120),
    ).toBe(1);

    // The same two UTC instants recorded under UTC-5 both land on the 14th
    // locally — one earned day, and it is yesterday, so the streak is 1.
    const western = [
      focusAt(UTC_MIDNIGHT + 10 * MIN, -300),
      focusAt(UTC_MIDNIGHT - 20 * MIN, -300),
    ];
    expect(earnedDays(western).size).toBe(1);
    expect(currentStreak(western, NOW, -300)).toBe(1);
  });

  it("keeps a traveller's history in the days they were lived in", () => {
    // Monday earned at home (UTC), Tuesday earned abroad (UTC+9), Wednesday
    // earned back home. Three different offsets, three consecutive local
    // days — the streak is 3 because each session names its own day.
    const monday = focusAt(UTC_MIDNIGHT - 2 * DAY + 12 * 60 * MIN, 0);
    const tuesday = focusAt(UTC_MIDNIGHT - DAY + 3 * 60 * MIN, 540);
    const wednesday = focusAt(NOW - 60 * MIN, 0);
    expect(currentStreak([monday, tuesday, wednesday], NOW, 0)).toBe(3);
  });

  it("breaks on a gap day — no grace", () => {
    const days = [
      focusAt(UTC_MIDNIGHT - 3 * DAY, 0),
      focusAt(UTC_MIDNIGHT - 2 * DAY, 0),
      // The 14th (UTC_MIDNIGHT - DAY) has nothing: a missed local day.
      focusAt(NOW - 60 * MIN, 0),
    ];
    expect(currentStreak(days, NOW, 0)).toBe(1);
  });

  it("holds yesterday's streak until today is missed outright", () => {
    const yesterday = [focusAt(UTC_MIDNIGHT - 12 * 60 * MIN, 0)];
    // 01:00Z on the 15th is still the 14th locally — nothing earned "today"
    // yet, but yesterday's streak is intact.
    expect(currentStreak(yesterday, UTC_MIDNIGHT + 60 * MIN, 0)).toBe(1);
    // Two full days later with nothing since, the break has happened.
    expect(currentStreak(yesterday, UTC_MIDNIGHT + 2 * DAY, 0)).toBe(0);
  });

  it("counts long runs of consecutive days", () => {
    const week = Array.from({ length: 7 }, (_, day) =>
      focusAt(UTC_MIDNIGHT - day * DAY + 12 * 60 * MIN, 0),
    );
    expect(currentStreak(week, NOW, 0)).toBe(7);
  });

  it("counts several sessions in one day as one earned day", () => {
    const three = [
      focusAt(NOW - 3 * 60 * MIN, 0),
      focusAt(NOW - 2 * 60 * MIN, 0),
      focusAt(NOW - 60 * MIN, 0),
    ];
    expect(currentStreak(three, NOW, 0)).toBe(1);
  });

  it("ignores sessions completing in the future", () => {
    // Clock skew must not mint days that have not happened yet.
    const rows = [focusAt(NOW - 60 * MIN, 0), focusAt(NOW + DAY, 0)];
    expect(currentStreak(rows, NOW, 0)).toBe(1);
  });
});
