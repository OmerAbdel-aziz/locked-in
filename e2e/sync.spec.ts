import { expect, test } from "@playwright/test";

/**
 * Phase 8 E2E — identity, merge prompt, CSV (Tasks 23–25).
 *
 * Task 27 flow (2): the sign-in merge prompt. No real email is ever sent here
 * (CI has no mailbox): the gate is the prompt's ask-first contract — an
 * anonymous visitor sees the quiet "Sync your data" link and NO merge dialog
 * during core flows (PRD §10.1), while /login offers the magic-link form and
 * the CSV tools stay hidden until a real session exists. The golden-fixture
 * merge semantics themselves are pinned in vitest (tests/merge.test.ts) and
 * at the mutation layer (convex/merge.ts).
 */

test.describe("identity and merge contract", () => {
  test("anonymous users are never interrupted on the focus screen", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /start focus session/i }),
    ).toBeVisible({ timeout: 30_000 });

    // The only sign-in surface is the header link; the merge dialog (which
    // requires a signed-in account + remembered device owner) never appears.
    // The link renders once the anonymous identity settles, which can take a
    // while under parallel load — wait generously.
    await expect(
      page.getByRole("link", { name: /sync your data/i }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole("dialog", { name: /merge device data/i }),
    ).toHaveCount(0);
  });

  test("/login offers the magic link form and stays quiet otherwise", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: /sync your data/i }),
    ).toBeVisible({ timeout: 30_000 });

    // Anonymous state: email form present, merge prompt absent, CSV tools
    // absent (DataIo renders null until authenticated). The form renders once
    // the provider settles ("Loading…" until then) — wait generously.
    const email = page.locator('input[type="email"]');
    const sendButton = page.getByRole("button", {
      name: /send sign-in link/i,
    });
    const mergeDialog = page.getByRole("dialog", {
      name: /merge device data/i,
    });
    const exportButton = page.getByRole("button", { name: /export csv/i });

    await expect(email.or(sendButton).first()).toBeVisible({ timeout: 60_000 });
    await expect(mergeDialog).toHaveCount(0);
    await expect(exportButton).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
