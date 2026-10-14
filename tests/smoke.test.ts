import { describe, expect, it } from "vitest";

// Smoke test: proves vitest is wired correctly (Task 1 acceptance).
// Task 5 replaces the real assertions here with the pomodoro engine suite.
describe("test runner", () => {
  it("runs assertions", () => {
    expect(1 + 1).toBe(2);
  });

  it("resolves the @/ path alias", async () => {
    // tsconfig maps "@/*" -> "./*" (see vite-tsconfig-paths in vitest.config.mts).
    // Importing the root package manifest exercises that mapping end to end.
    const pkg = (await import("@/package.json")) as { name: string };
    expect(pkg.name).toBe("locked-in");
  });
});
