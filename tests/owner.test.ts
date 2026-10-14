import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { resolveOwner } from "@/convex/lib/owner";
import schema from "@/convex/schema";

/**
 * Task 4 gate: the owner-resolution helper every Convex function will use.
 *
 * `getAuthUserId` reads the caller's identity and takes the part of
 * `identity.subject` before the "|" divider, so `convex-test`'s
 * `withIdentity` drives it without a real JWT. Unauthenticated calls are
 * simply calls with no identity at all.
 *
 * Assertions go through a query rather than calling the helper on a
 * hand-built object: that is how every real caller in `convex/` will reach
 * it, so it is what "every subsequent function rejects unauthenticated calls
 * through the same helper" actually exercises.
 *
 * Each case seeds and queries the *same* `convexTest` instance —
 * `withIdentity` swaps only the auth fake and keeps the database, but a
 * second `convexTest(schema, modules)` call is a fresh, empty database.
 */

/**
 * The Convex function modules, required by `convex-test` for routing. This
 * test only drives inline closures, so nothing here is ever imported — but
 * the map must include `_generated`, which `convex-test` uses to locate the
 * functions root, and it keeps later tests able to call `api.*` unchanged.
 */
const modules = import.meta.glob("../convex/**/*.*s");

/** Convex Auth packs `userId|sessionId` into the JWT `sub` claim. */
const SUBJECT_DIVIDER = "|";

function newTest() {
  return convexTest(schema, modules);
}

type Test = ReturnType<typeof newTest>;

async function insertAnonymous(t: Test) {
  return t.run((ctx) =>
    ctx.db.insert("users", { createdAt: 1, isAnonymous: true }),
  );
}

/** A user plus the identities row merge-on-sign-in would have written. */
async function insertLinkedPair(t: Test) {
  return t.run(async (ctx) => {
    const anonymousId = await ctx.db.insert("users", {
      createdAt: 1,
      isAnonymous: true,
    });
    const accountId = await ctx.db.insert("users", {
      createdAt: 2,
      email: "focus@example.com",
    });
    await ctx.db.insert("identities", {
      anonymousId,
      userId: accountId,
      mergedAt: 3,
    });
    return { anonymousId, accountId };
  });
}

describe("resolveOwner", () => {
  it("rejects callers with no session", async () => {
    const t = newTest();

    await expect(
      t.query(async (ctx) => resolveOwner(ctx)),
    ).rejects.toThrow(/unauthenticated/i);
  });

  it("rejects a caller whose identity carries no subject", async () => {
    // Guards the degenerate case: `getAuthUserId` splits the subject, so a
    // missing one yields "" rather than null. That must be a rejection, not
    // an owner id of "".
    const t = newTest().withIdentity({ subject: "" });

    await expect(
      t.query(async (ctx) => resolveOwner(ctx)),
    ).rejects.toThrow(/unauthenticated/i);
  });

  it("returns the session user for an anonymous caller", async () => {
    const t = newTest();
    const anonymousId = await insertAnonymous(t);

    const caller = t.withIdentity({
      subject: `${anonymousId}${SUBJECT_DIVIDER}s1`,
    });

    await expect(
      caller.query(async (ctx) => resolveOwner(ctx)),
    ).resolves.toBe(anonymousId);
  });

  it("keeps the caller's own owner when nothing links them elsewhere", async () => {
    const t = newTest();
    const anonymousId = await insertAnonymous(t);
    // A different, unlinked identity exists — must not affect our caller.
    await insertAnonymous(t);

    const caller = t.withIdentity({
      subject: `${anonymousId}${SUBJECT_DIVIDER}s1`,
    });

    await expect(
      caller.query(async (ctx) => resolveOwner(ctx)),
    ).resolves.toBe(anonymousId);
  });

  it("follows the link into the account after merge-on-sign-in", async () => {
    const t = newTest();
    const { anonymousId, accountId } = await insertLinkedPair(t);

    // The session still belongs to the *anonymous* identity, but its data
    // now belongs to the account (ADR-002).
    const caller = t.withIdentity({
      subject: `${anonymousId}${SUBJECT_DIVIDER}s1`,
    });

    await expect(
      caller.query(async (ctx) => resolveOwner(ctx)),
    ).resolves.toBe(accountId);
  });

  it("does not redirect an account that merely absorbed others", async () => {
    // The link is anonymous -> account. The account caller must resolve to
    // itself, never follow the edge backwards.
    const t = newTest();
    const { accountId } = await insertLinkedPair(t);

    const caller = t.withIdentity({
      subject: `${accountId}${SUBJECT_DIVIDER}s1`,
    });

    await expect(
      caller.query(async (ctx) => resolveOwner(ctx)),
    ).resolves.toBe(accountId);
  });

  it("ignores a link row that points back at itself", async () => {
    // A self-referential row is a no-op, not a cycle and not an error.
    const t = newTest();
    const anonymousId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        createdAt: 1,
        isAnonymous: true,
      });
      await ctx.db.insert("identities", { anonymousId: id, userId: id });
      return id;
    });

    const caller = t.withIdentity({
      subject: `${anonymousId}${SUBJECT_DIVIDER}s1`,
    });

    await expect(
      caller.query(async (ctx) => resolveOwner(ctx)),
    ).resolves.toBe(anonymousId);
  });
});
