import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/convex/_generated/api";
import schema from "@/convex/schema";
import { SETTINGS_DEFAULTS } from "@/convex/settings";

/**
 * Task 16 gate: settings storage.
 *
 * `settings` is one row per owner, written lazily: reads answer the PRD
 * defaults until the first update, and updates validate ranges the way
 * `tasks.create` validates its estimate — refused, never silently clamped.
 * The streak query (`sessions.streak`) is proved here too, because it is
 * the read side Task 15's badge stands on: derived from real rows through
 * the real `logCompleted`, never stored.
 */

const modules = import.meta.glob("../convex/**/*.*s");

const MIN = 60_000;
/** 2024-01-15T13:00:00Z — afternoon, so "today" is unambiguous at offset 0. */
const NOW = 1_705_323_600_000;

/** One anonymous owner, as `tests/sessions.test.ts` builds them. */
async function signedIn(base = convexTest(schema, modules)) {
  const ownerId = await base.run((ctx) =>
    ctx.db.insert("users", { createdAt: 1, isAnonymous: true }),
  );
  return { base, ownerId, t: base.withIdentity({ subject: `${ownerId}|s1` }) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("settings.get", () => {
  it("rejects a caller with no session", async () => {
    const { base } = await signedIn();

    await expect(base.query(api.settings.get, {})).rejects.toThrow(
      /unauthenticated/i,
    );
  });

  it("answers the PRD defaults when nothing was ever saved", async () => {
    const { t } = await signedIn();

    expect(await t.query(api.settings.get, {})).toEqual({
      focusMin: 25,
      shortMin: 5,
      longMin: 15,
      sessionCount: 4,
      autoStartBreak: true,
      autoStartFocus: false,
      notificationsEnabled: true,
    });
    expect(SETTINGS_DEFAULTS).toMatchObject({
      focusMin: 25,
      shortMin: 5,
      longMin: 15,
      sessionCount: 4,
      autoStartBreak: true,
      autoStartFocus: false,
    });
  });
});

describe("settings.update", () => {
  it("rejects a caller with no session", async () => {
    const { base } = await signedIn();

    await expect(
      base.mutation(api.settings.update, { focusMin: 50 }),
    ).rejects.toThrow(/unauthenticated/i);
  });

  it("persists a full update and reads it back", async () => {
    const { t } = await signedIn();

    await t.mutation(api.settings.update, {
      focusMin: 50,
      shortMin: 10,
      longMin: 30,
      sessionCount: 6,
      autoStartBreak: false,
      autoStartFocus: true,
      notificationsEnabled: false,
    });

    expect(await t.query(api.settings.get, {})).toEqual({
      focusMin: 50,
      shortMin: 10,
      longMin: 30,
      sessionCount: 6,
      autoStartBreak: false,
      autoStartFocus: true,
      notificationsEnabled: false,
    });
  });

  it("merges a partial update over the existing row", async () => {
    const { t } = await signedIn();

    await t.mutation(api.settings.update, { focusMin: 50 });
    await t.mutation(api.settings.update, { autoStartFocus: true });

    const settings = await t.query(api.settings.get, {});
    expect(settings.focusMin).toBe(50);
    expect(settings.autoStartFocus).toBe(true);
    // Untouched fields keep whatever they had — defaults here.
    expect(settings.shortMin).toBe(25 - 20);
    expect(settings.sessionCount).toBe(4);
  });

  it("keeps one row per owner across repeated updates", async () => {
    const { base, ownerId, t } = await signedIn();

    await t.mutation(api.settings.update, { focusMin: 50 });
    await t.mutation(api.settings.update, { focusMin: 15 });

    const rows = await base.run((ctx) =>
      ctx.db
        .query("settings")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].focusMin).toBe(15);
  });

  it("refuses durations outside 1..180 and counts outside 1..12", async () => {
    const { t } = await signedIn();

    for (const args of [
      { focusMin: 0 },
      { focusMin: 181 },
      { focusMin: 25.5 },
      { shortMin: -5 },
      { longMin: 0 },
      { sessionCount: 0 },
      { sessionCount: 13 },
      { sessionCount: 2.5 },
    ]) {
      await expect(t.mutation(api.settings.update, args)).rejects.toThrow(
        /settings/i,
      );
    }

    // Nothing above was written: a refused value leaves no row behind.
    expect(await t.query(api.settings.get, {})).toEqual({
      ...SETTINGS_DEFAULTS,
    });
  });

  it("keeps two owners' settings apart", async () => {
    const { base, t } = await signedIn();
    const { t: other } = await signedIn(base);

    await t.mutation(api.settings.update, { focusMin: 50 });

    expect((await t.query(api.settings.get, {})).focusMin).toBe(50);
    expect((await other.query(api.settings.get, {})).focusMin).toBe(25);
  });
});

describe("sessions.streak", () => {
  it("rejects a caller with no session", async () => {
    const { base } = await signedIn();

    await expect(
      base.query(api.sessions.streak, { tzOffsetMinutes: 0 }),
    ).rejects.toThrow(/unauthenticated/i);
  });

  it("is zero for a log with no focus sessions", async () => {
    const { t } = await signedIn();

    expect(await t.query(api.sessions.streak, { tzOffsetMinutes: 0 })).toBe(0);

    await t.mutation(api.sessions.logCompleted, {
      phase: "short",
      startedAt: NOW - 5 * MIN,
      completedAt: NOW - MIN,
      tzOffsetAtCompletion: 0,
    });

    expect(await t.query(api.sessions.streak, { tzOffsetMinutes: 0 })).toBe(0);
  });

  it("derives the streak from real rows — never stored", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { base, ownerId, t } = await signedIn();

    const day = 24 * 60 * MIN;
    for (const daysAgo of [0, 1, 2]) {
      const completedAt = NOW - daysAgo * day - 60 * MIN;
      await t.mutation(api.sessions.logCompleted, {
        phase: "focus",
        startedAt: completedAt - 25 * MIN,
        completedAt,
        tzOffsetAtCompletion: 0,
      });
    }

    expect(await t.query(api.sessions.streak, { tzOffsetMinutes: 0 })).toBe(3);

    // ADR-003's whole point: no column remembers the number. A new session
    // moves it, and the table carries no streak field to disagree.
    const tables = await base.run((ctx) =>
      ctx.db.query("sessions").collect(),
    );
    expect(tables).toHaveLength(3);
    expect(tables.every((row) => row.ownerId === ownerId)).toBe(true);
    for (const row of tables) {
      expect(row).not.toHaveProperty("streak");
    }
  });

  it("breaks on a gap and ignores another owner's history", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { base, t } = await signedIn();
    const { t: other } = await signedIn(base);

    const day = 24 * 60 * MIN;
    // Today and two days ago — yesterday missed.
    for (const daysAgo of [0, 2]) {
      const completedAt = NOW - daysAgo * day - 60 * MIN;
      await t.mutation(api.sessions.logCompleted, {
        phase: "focus",
        startedAt: completedAt - 25 * MIN,
        completedAt,
        tzOffsetAtCompletion: 0,
      });
    }
    // Somebody else's unbroken week must not leak across.
    for (const daysAgo of [0, 1, 2, 3, 4]) {
      const completedAt = NOW - daysAgo * day - 60 * MIN;
      await other.mutation(api.sessions.logCompleted, {
        phase: "focus",
        startedAt: completedAt - 25 * MIN,
        completedAt,
        tzOffsetAtCompletion: 0,
      });
    }

    expect(await t.query(api.sessions.streak, { tzOffsetMinutes: 0 })).toBe(1);
    expect(await other.query(api.sessions.streak, { tzOffsetMinutes: 0 })).toBe(
      5,
    );
  });
});
