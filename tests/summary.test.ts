import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { startOfLocalDay } from "@/convex/tasks";
import schema from "@/convex/schema";

/**
 * Task 12 gate: the two derived readouts — the active-task card and the
 * Summary bento.
 *
 * Neither stores anything (ADR-003): the card counts the log, the bento
 * sums it, and both are recomputed on every read. So what is pinned here is
 * the *arithmetic and its boundaries*, which is where a derived metric goes
 * quietly wrong:
 *
 *   - **Which rows count.** Focus phases only — a break is a session, and no
 *     task is made of breaks.
 *   - **Which day counts.** "Today" is the *device's* local midnight (PRD
 *     D5), so it arrives as an argument and the same two rows flip in and
 *     out of the window as the offset changes. That is the edge the schema's
 *     `tzOffsetAtCompletion` comment exists to protect, and the one a naive
 *     UTC-day implementation gets wrong exactly once a day.
 *   - **What the denominator is.** The board the user can see, not "tasks
 *     with a session today" — a session row snapshots a task's identity,
 *     never its estimate, so any other reading lets a cleared task take its
 *     denominator with it and raise the score by deletion.
 *
 * Tasks and sessions are made through the real mutations, so a change to
 * what `create` or `logCompleted` actually writes breaks these tests rather
 * than being papered over by a direct insert.
 */

const modules = import.meta.glob("../convex/**/*.*s");

const MIN = 60_000;
/** 2024-01-15T13:00:00Z — a fixed afternoon, so "today" has a definite shape. */
const NOW = 1_705_323_600_000;
const UTC_MIDNIGHT = 1_705_276_800_000; // 2024-01-15T00:00:00Z

type Client = Awaited<ReturnType<typeof identity>>["client"];

/** One anonymous owner, as `tests/binding.test.ts` builds them. */
async function identity(base = convexTest(schema, modules)) {
  const ownerId = await base.run((ctx) =>
    ctx.db.insert("users", { createdAt: 1, isAnonymous: true }),
  );
  return { base, ownerId, client: base.withIdentity({ subject: `${ownerId}|s1` }) };
}

/** One session, written through the real logger. */
async function logSession(
  client: Client,
  fields: {
    phase?: "focus" | "short" | "long";
    startedAt: number;
    completedAt: number;
    taskId?: Id<"tasks">;
    projectId?: Id<"projects">;
  },
) {
  return client.mutation(api.sessions.logCompleted, {
    phase: "focus",
    tzOffsetAtCompletion: 0,
    ...fields,
  });
}

describe("startOfLocalDay", () => {
  it("shifts the UTC midnight by the device's offset, both ways", () => {
    // 13:00Z is 15:00 in UTC+2 and 08:00 in UTC-5, so the same instant sits
    // in two different local days' *afternoons* — and each day began at a
    // different UTC instant.
    expect(startOfLocalDay(NOW, 120)).toBe(UTC_MIDNIGHT - 120 * MIN);
    expect(startOfLocalDay(NOW, -300)).toBe(UTC_MIDNIGHT + 300 * MIN);
  });

  it("leaves a UTC device exactly at the UTC midnight", () => {
    expect(startOfLocalDay(NOW, 0)).toBe(UTC_MIDNIGHT);
  });

  it("lands on the *current* local day for an early-morning instant", () => {
    // 01:00Z is still *yesterday's* evening in UTC-5 (20:00 on the 14th), so
    // the day that is "today" for that device began at 05:00Z on the 14th —
    // the previous UTC midnight, shifted. Flooring the raw UTC instant first
    // would name 05:00Z on the 15th: four hours in the *future*, and a
    // window that has not started counting yet.
    const earlyMorning = UTC_MIDNIGHT + 60 * MIN;
    expect(startOfLocalDay(earlyMorning, -300)).toBe(
      UTC_MIDNIGHT - 19 * 60 * MIN,
    );
  });
});

describe("the active-task card (progressCard)", () => {
  it("reads nothing selected as an absent card", async () => {
    const { client: t } = await identity();

    await t.mutation(api.tasks.create, { title: "Untouched", estimate: 2 });

    // Untouched, not merely unselected: a task that exists but was never
    // chosen must not be assumed to be the one on the card.
    expect(await t.query(api.tasks.progressCard, {})).toBeNull();
  });

  it("shows the selected task's title, estimate and leaf count", async () => {
    const { client: t } = await identity();

    const a = await t.mutation(api.tasks.create, {
      title: "Draft the outline",
      estimate: 4,
    });
    await t.mutation(api.tasks.selectTask, { taskId: a });

    // The acceptance criterion, in the card's own words: completed sessions
    // against the task's estimate, counted off the log. Two *different*
    // completion instants — `logCompleted` refuses a repeat of one as the
    // duplicate it is (a replayed message, two tabs), which is the same
    // rule these fixtures must not trip over.
    await logSession(t, {
      startedAt: NOW - 55 * MIN,
      completedAt: NOW - 30 * MIN,
      taskId: a,
    });
    await logSession(t, {
      startedAt: NOW - 25 * MIN,
      completedAt: NOW,
      taskId: a,
    });

    expect(await t.query(api.tasks.progressCard, {})).toEqual({
      taskId: a,
      title: "Draft the outline",
      estimate: 4,
      leaves: 2,
    });
  });

  it("counts focus sessions only — a break is not progress", async () => {
    const { client: t } = await identity();

    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });
    await t.mutation(api.tasks.selectTask, { taskId: a });

    await logSession(t, { startedAt: NOW, completedAt: NOW + 25 * MIN, taskId: a });
    await logSession(t, {
      phase: "short",
      startedAt: NOW,
      completedAt: NOW + 5 * MIN,
      taskId: a,
    });
    await logSession(t, {
      phase: "long",
      startedAt: NOW,
      completedAt: NOW + 15 * MIN,
      taskId: a,
    });

    expect((await t.query(api.tasks.progressCard, {}))?.leaves).toBe(1);
  });

  it("hides the card when the pointer's target is gone", async () => {
    const { base, ownerId, client: t } = await identity();

    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });
    await t.mutation(api.tasks.selectTask, { taskId: a });

    // Deleted out from under the pointer — the shape a second tab leaves
    // behind. The card answers "nothing selected" rather than drawing a
    // card for a row that no longer exists (same stance as `activeTask`).
    await base.run(async (ctx) => {
      const task = await ctx.db.get(a);
      if (task === null || task.ownerId !== ownerId) {
        throw new Error("fixture: expected to own the task it just made");
      }
      await ctx.db.delete(a);
    });

    expect(await t.query(api.tasks.progressCard, {})).toBeNull();
  });

  it("refuses to card somebody else's task", async () => {
    const { base, client: alice } = await identity();
    const { ownerId: bobId, client: bob } = await identity(base);

    const hers = await alice.mutation(api.tasks.create, {
      title: "Alice's",
      estimate: 2,
    });
    // Pointing at a foreign task is not something the API can be talked
    // into — `selectTask` refuses it — so the read side is proved against
    // the pointer a hostile or corrupted row would carry.
    await base.run((ctx) => ctx.db.patch(bobId, { activeTaskId: hers }));

    expect(await bob.query(api.tasks.progressCard, {})).toBeNull();
  });

  it("resolves an owner before it reads anything", async () => {
    const { base } = await identity();

    // The choke point holds: no session, no card, whatever the pointer says.
    await expect(base.query(api.tasks.progressCard, {})).rejects.toThrow(
      /unauthenticated/i,
    );
  });
});

describe("the Summary bento (todaySummary)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sums today's focus time and leaves, and leaves the breaks out", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { client: t } = await identity();

    const a = await t.mutation(api.tasks.create, { title: "A", estimate: 2 });

    // Two 25-minute focus sessions, with a 5-minute break between them.
    // Each needs its own completion instant: `logCompleted` refuses a
    // repeat of one, which is the duplicate-protection talking, not a
    // limit on how many sessions a day may hold.
    await logSession(t, {
      startedAt: NOW - 25 * MIN,
      completedAt: NOW,
      taskId: a,
    });
    await logSession(t, {
      startedAt: NOW - 65 * MIN,
      completedAt: NOW - 40 * MIN,
      taskId: a,
    });
    await logSession(t, {
      phase: "short",
      startedAt: NOW - 35 * MIN,
      completedAt: NOW - 30 * MIN,
      taskId: a,
    });

    expect(await t.query(api.tasks.todaySummary, { tzOffsetMinutes: 0 })).toEqual({
      focusMinutes: 50,
      completedLeaves: 2,
      estimatedLeaves: 2,
      // Unbound sessions share the "No project" bucket — the donut never
      // silently drops time just because no project was attached (ADR-006).
      perProject: [
        {
          projectId: null,
          name: "No project",
          archived: false,
          focusMs: 50 * MIN,
          sessions: 2,
        },
      ],
    });
  });

  it("takes the denominator from the whole board, open and finished", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { client: t } = await identity();

    await t.mutation(api.tasks.create, { title: "A", estimate: 3 });
    const b = await t.mutation(api.tasks.create, { title: "B", estimate: 2 });
    await t.mutation(api.tasks.complete, { taskId: b });
    // A third task that gets cleared off the board entirely — its estimate
    // leaves with it, which is the whole reason the denominator is the
    // board and not "tasks the log has seen".
    const c = await t.mutation(api.tasks.create, { title: "C", estimate: 8 });
    await t.mutation(api.tasks.complete, { taskId: c });
    await t.mutation(api.tasks.clearCompleted, {});

    expect(
      (await t.query(api.tasks.todaySummary, { tzOffsetMinutes: 0 }))
        .estimatedLeaves,
    ).toBe(3);
  });

  it("counts a session by the device's day, not the server's", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { client: t } = await identity();

    // Both written an hour either side of *UTC* midnight: at UTC+2 they
    // fall at 00:10 and 23:40 on the 15th/14th, and at UTC-5 they fall on
    // the 14th at 19:10 and 18:40 — so neither offset may claim both, and
    // the 00:10 one must belong to the day that has just begun.
    const justPastMidnight = UTC_MIDNIGHT + 10 * MIN;
    const justBeforeMidnight = UTC_MIDNIGHT - 20 * MIN;

    await logSession(t, {
      startedAt: justPastMidnight - 25 * MIN,
      completedAt: justPastMidnight,
    });
    await logSession(t, {
      startedAt: justBeforeMidnight - 25 * MIN,
      completedAt: justBeforeMidnight,
    });

    // UTC+2: the local day began at 22:00Z the day before, so both are in
    // today and both count.
    expect(await t.query(api.tasks.todaySummary, { tzOffsetMinutes: 120 })).toEqual(
      {
        focusMinutes: 50,
        completedLeaves: 2,
        estimatedLeaves: 0,
        perProject: [
          {
            projectId: null,
            name: "No project",
            archived: false,
            focusMs: 50 * MIN,
            sessions: 2,
          },
        ],
      },
    );

    // UTC-5: the local day began at 05:00Z on the 15th, so both are still
    // yesterday — the same two rows, none of today's window.
    expect(await t.query(api.tasks.todaySummary, { tzOffsetMinutes: -300 })).toEqual(
      {
        focusMinutes: 0,
        completedLeaves: 0,
        estimatedLeaves: 0,
        perProject: [],
      },
    );
  });

  it("splits today's focus back into per-project slices for the bento's donut", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { client: t } = await identity();

    const projectId = await t.mutation(api.projects.create, {
      name: "Thesis",
    });

    await logSession(t, {
      projectId,
      startedAt: NOW - 30 * MIN,
      completedAt: NOW - 5 * MIN,
    });
    await logSession(t, {
      startedAt: NOW - 25 * MIN,
      completedAt: NOW,
    });

    // Two focus leave — the bound one is named; the unbound one shares the
    // "No project" bucket — sorted by focus time, the bound one first.
    await expect(
      (await t.query(api.tasks.todaySummary, { tzOffsetMinutes: 0 })).perProject,
    ).toEqual([
      {
        projectId,
        name: "Thesis",
        archived: false,
        focusMs: 25 * MIN,
        sessions: 1,
      },
      {
        projectId: null,
        name: "No project",
        archived: false,
        focusMs: 25 * MIN,
        sessions: 1,
      },
    ]);

    // A break never reaches the donut: no task is made of breaks (and the
    // slices only ever grow from focus rows).
    await logSession(t, {
      phase: "short",
      projectId,
      startedAt: NOW,
      completedAt: NOW + 5 * MIN,
    });
    expect(
      (await t.query(api.tasks.todaySummary, { tzOffsetMinutes: 0 })).perProject,
    ).toHaveLength(2);
  });

  it("is recomputed, not remembered — a new session moves it", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { client: t } = await identity();

    expect(
      (await t.query(api.tasks.todaySummary, { tzOffsetMinutes: 0 })).focusMinutes,
    ).toBe(0);

    await logSession(t, { startedAt: NOW - 25 * MIN, completedAt: NOW });

    expect(
      (await t.query(api.tasks.todaySummary, { tzOffsetMinutes: 0 })).focusMinutes,
    ).toBe(25);
    clock.mockRestore();
  });
});
