import { expect, test } from "@playwright/test";

/**
 * Phase 6 E2E — Focus Shroud (Task 18).
 *
 * Runs against the production build served by playwright.config.ts with the
 * live Convex deployment (anonymous identity, no seeding). Show/hide is driven
 * through the real timer: Start -> veil up, Skip -> veil down. No 25-minute
 * waits anywhere.
 */

test.describe("Focus Shroud", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // First-run must offer focus immediately (PRD §10.1): the Start CTA is
    // the readiness signal, and it also proves the anonymous identity settled.
    await expect(
      page.getByRole("button", { name: /start focus session/i }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("veil is hidden at rest and rises over a running focus session", async ({
    page,
  }) => {
    const veil = page.getByTestId("focus-shroud");
    await expect(veil).toHaveAttribute("data-active", "false");

    await page.getByRole("button", { name: /start focus session/i }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(veil).toHaveAttribute("data-active", "true");

    // The engine stays above the veil (z-50) so digits/controls keep working.
    const engine = page.getByRole("region", { name: "Timer engine" });
    await expect(engine).toHaveClass(/z-50/);
  });

  test("veil auto-dismisses when the focus phase ends via Skip", async ({
    page,
  }) => {
    const veil = page.getByTestId("focus-shroud");
    await page.getByRole("button", { name: /start focus session/i }).click();
    await expect(veil).toHaveAttribute("data-active", "true");

    // Skip advances focus -> short break (auto-started): the veil must fall
    // even though a phase is still running, because it is not focus.
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(veil).toHaveAttribute("data-active", "false");
  });

  test("toggle hides the veil mid-session without pausing; Escape does the same", async ({
    page,
  }) => {
    const veil = page.getByTestId("focus-shroud");
    const toggle = page.getByTestId("shroud-toggle");

    await page.getByRole("button", { name: /start focus session/i }).click();
    await expect(veil).toHaveAttribute("data-active", "true");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(veil).toHaveAttribute("data-active", "false");
    // Display-only dismissal: the session keeps running.
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

    // Re-arm, then dismiss from the keyboard.
    await toggle.click();
    await expect(veil).toHaveAttribute("data-active", "true");
    await page.keyboard.press("Escape");
    await expect(veil).toHaveAttribute("data-active", "false");
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  });

  test("no console errors during the shroud loop", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.getByRole("button", { name: /start focus session/i }).click();
    await page.getByRole("button", { name: "Skip" }).click();
    expect(errors).toEqual([]);
  });
});
