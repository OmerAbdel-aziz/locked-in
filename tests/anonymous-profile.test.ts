import { describe, expect, it } from "vitest";

import { anonymousProfile } from "@/convex/auth";
import schema from "@/convex/schema";

/**
 * Task 4 gate: the profile written for a brand-new anonymous identity.
 *
 * This exists because of a bug the unit tests could not see and only the
 * live deployment exposed — Convex Auth's *default* anonymous profile writes
 * only `{ isAnonymous: true }`, while PRD §6 makes `users.createdAt`
 * required. First-load sign-in failed with a schema violation, on the very
 * page load that is supposed to be prompt-free.
 *
 * The required set is read from the real `users` validator rather than
 * restated by hand, so this keeps tracking the schema if it ever changes.
 */

type Validator = {
  isOptional: "optional" | "required";
  fields?: Record<string, Validator>;
};

const usersFields = (
  schema as unknown as {
    tables: Record<string, { validator: Validator }>;
  }
).tables.users.validator.fields;

if (usersFields === undefined) {
  throw new Error("users table has no validator fields");
}

const requiredFields = Object.entries(usersFields)
  .filter(([, v]) => v.isOptional === "required")
  .map(([name]) => name);

describe("anonymous identity profile", () => {
  it("needs the schema to actually require createdAt", () => {
    // If `createdAt` ever became optional this test would pass vacuously, so
    // pin the premise the regression rests on.
    expect(requiredFields).toContain("createdAt");
  });

  it("marks the new user as anonymous", () => {
    expect(anonymousProfile().isAnonymous).toBe(true);
  });

  it("stamps createdAt at roughly the current time", () => {
    const before = Date.now();
    const { createdAt } = anonymousProfile();
    const after = Date.now();

    expect(typeof createdAt).toBe("number");
    expect(createdAt).toBeGreaterThanOrEqual(before);
    expect(createdAt).toBeLessThanOrEqual(after);
  });

  it("supplies every field the users table requires", () => {
    const profile = anonymousProfile() as Record<string, unknown>;

    for (const field of requiredFields) {
      expect(profile, `users.${field} is required`).toHaveProperty(field);
      expect(profile[field], `users.${field} must be set`).toBeDefined();
    }
  });

  it("writes only fields the schema knows about", () => {
    // An extra unknown key is the same class of schema violation, in the
    // other direction.
    const profile = anonymousProfile() as Record<string, unknown>;

    for (const key of Object.keys(profile)) {
      expect(
        usersFields,
        `users.${key} is not declared in the schema`,
      ).toHaveProperty(key);
    }
  });
});
