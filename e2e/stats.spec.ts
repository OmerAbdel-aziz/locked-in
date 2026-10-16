import { expect, test } from "@playwright/test";

/**
 * Phase 7 E2E — stats surface (Tasks 19–22).
 *
 * Task 27 flow (3), attribution half: the /stats route renders its range
 * selector, charts-or-calm-empty-state, and history grouping against the live
 * backend. Hand-computed oracle values are pinned in vitest
 * (tests/aggregations.test.ts); here the gate is that the surface loads,
 * switches ranges, and never shows a crash or a fabricated number state.
 */

test.describe("stats surface", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/stats");
    await expect(
      page.getByRole("heading", { name: "Stats" }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("range selector switches presets and reveals custom dates", async ({
    page,
  }) => {
    const tabs = page.getByRole("tablist", { name: "Stats range" });
    await expect(tabs).toBeVisible({ timeout: 30_000 });

    for (const name of ["Today", "7 days", "30 days"]) {
      await page.getByRole("tab", { name }).click();
      await expect(page.getByRole("tab", { name })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }

    await page.getByRole("tab", { name: "Custom" }).click();
    // Native date inputs name local days (panel converts with device offset).
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
  });

  test("page settles into charts or the calm empty state, never a blank crash", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));

    // Either real aggregates (headlines) or the new-user empty state must
    // appear once queries settle — both are valid, a hang is not.
    const headlines = page.getByText("Focus time");
    const empty = page.getByText(/nothing here yet|no sessions/i);
    await expect(headlines.or(empty).first()).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test("Focus <-> Stats nav moves both directions", async ({ page }) => {
    await page.getByRole("link", { name: "Focus" }).click();
    await expect(
      page.getByRole("button", { name: /start focus session/i }),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Stats" }).click();
    await expect(
      page.getByRole("heading", { name: "Stats" }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
