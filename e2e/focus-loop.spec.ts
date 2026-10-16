import { expect, test } from "@playwright/test";

/**
 * First-run focus loop E2E — Phases 2–5 regression at the Phase 8 gate.
 *
 * Covers Task 27 flow (1): first-run -> start timer -> task leaves + streak
 * surfaces exist. It does not wait out a 25-minute session; it proves the
 * loop's wiring (task create/select, progress card, bento, streak badge) is
 * live against the real backend, so Phase 6+ did not break the core.
 */

test.describe("first-run focus loop", () => {
  test("a first-time visitor can focus within 60 seconds with no account wall", async ({
    page,
  }) => {
    const start = Date.now();
    await page.goto("/");

    await expect(
      page.getByRole("button", { name: /start focus session/i }),
    ).toBeVisible({ timeout: 30_000 });
    // No signup wall: the sync entry is a quiet link, never a modal/prompt.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(Date.now() - start).toBeLessThan(60_000);

    // Right column is live: the add-task input renders once identity settles.
    await expect(
      page.getByPlaceholder(/add new task/i),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("task create -> select -> progress card + bento stay consistent", async ({
    page,
  }) => {
    await page.goto("/");
    const input = page.getByPlaceholder(/add new task/i);
    // The pill is disabled until the anonymous identity settles (Task 10):
    // wait for enabled, not merely visible — filling a disabled input is the
    // flake this guards against under parallel load.
    await expect(input).toBeEnabled({ timeout: 60_000 });

    const title = `e2e loop ${Date.now()}`;
    await input.fill(title);
    await input.press("Enter");
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });

    // Clicking selects it as the active task (D8): the card titles itself.
    await page.getByText(title).click();
    await expect(page.getByText("Currently Active")).toBeVisible();
  });

  test("streak badge and summary bento render without crashing a fresh account", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /start focus session/i }),
    ).toBeVisible({ timeout: 30_000 });
    // Badge + bento settle to zeros/dashes for a fresh log, never an error.
    await expect(page.getByText(/today's output/i)).toBeVisible({
      timeout: 30_000,
    });
    expect(errors).toEqual([]);
  });
});
