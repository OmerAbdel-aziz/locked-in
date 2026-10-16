/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { createOrUpdateUserWithCreatedAt } from "@/convex/auth";
import schema from "@/convex/schema";

/**
 * Regression gate for the live magic-link crash:
 * `[CONVEX A(auth:signIn)] ... Object is missing the required field
 * createdAt. Object: {email: ...}`.
 *
 * The library's default user writer inserts the verification profile
 * verbatim, so the first magic-link verification died on the required
 * `users.createdAt`. `callbacks.createOrUpdateUser` (above) stamps it.
 * These tests drive the callback directly through a real mutation ctx —
 * the full email round-trip needs Resend and is covered by the manual
 * Task 23 flow.
 */

const modules = import.meta.glob("../convex/**/*.*s");

function newTest() {
  return convexTest(schema, modules);
}

describe("createOrUpdateUserWithCreatedAt", () => {
  it("stamps createdAt on a new email verification (the crash)", async () => {
    const t = newTest();
    const userId = await t.run((ctx) =>
      createOrUpdateUserWithCreatedAt(ctx, {
        existingUserId: null,
        type: "verification",
        profile: { email: "a@example.com", emailVerified: true },
      }),
    );
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user).toMatchObject({ email: "a@example.com" });
    expect(typeof user?.createdAt).toBe("number");
    expect(typeof user?.emailVerificationTime).toBe("number");
  });

  it("links a repeat verification to the same user (no duplicates)", async () => {
    const t = newTest();
    const args = {
      existingUserId: null,
      type: "verification" as const,
      profile: { email: "b@example.com", emailVerified: true },
    };
    const first = await t.run((ctx) => createOrUpdateUserWithCreatedAt(ctx, args));
    const second = await t.run((ctx) =>
      createOrUpdateUserWithCreatedAt(ctx, args),
    );
    expect(second).toBe(first);
  });

  it("patches an existing user and preserves its createdAt", async () => {
    const t = newTest();
    const anon = await t.run((ctx) =>
      ctx.db.insert("users", { createdAt: 123, isAnonymous: true }),
    );
    const back = await t.run((ctx) =>
      createOrUpdateUserWithCreatedAt(ctx, {
        existingUserId: anon,
        type: "verification",
        profile: { email: "c@example.com", emailVerified: true },
      }),
    );
    expect(back).toBe(anon);
    const user = await t.run((ctx) => ctx.db.get(anon));
    expect(user).toMatchObject({
      email: "c@example.com",
      createdAt: 123,
      isAnonymous: true,
    });
  });

  it("preserves the anonymous shape (isAnonymous + createdAt)", async () => {
    const t = newTest();
    const userId = await t.run((ctx) =>
      createOrUpdateUserWithCreatedAt(ctx, {
        existingUserId: null,
        type: "email",
        profile: { isAnonymous: true, createdAt: 456 },
      }),
    );
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user).toMatchObject({ isAnonymous: true, createdAt: 456 });
  });

  it("leaves existing fields alone when the profile adds nothing", async () => {
    const t = newTest();
    const anon = await t.run((ctx) =>
      ctx.db.insert("users", {
        createdAt: 7,
        isAnonymous: true,
        email: "keep@example.com",
      }),
    );
    await t.run((ctx) =>
      createOrUpdateUserWithCreatedAt(ctx, {
        existingUserId: anon,
        type: "verification",
        profile: {},
      }),
    );
    const user = await t.run((ctx) => ctx.db.get(anon));
    // `patch` deletes fields given `undefined` — a pass-through of an empty
    // profile must not erase the email.
    expect(user).toMatchObject({
      email: "keep@example.com",
      createdAt: 7,
      isAnonymous: true,
    });
  });
});
