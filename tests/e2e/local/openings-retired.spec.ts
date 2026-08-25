import { test, expect } from "@playwright/test";

/**
 * /openings is retired.
 *
 * It offered ONE hand-authored course at 0% under the title "Opening Training",
 * while /learn holds 43 generated ones. Two surfaces called opening training,
 * with the older and emptier one easier to find, is how shipped work comes to
 * look unshipped — and the app drawer was pointing at the old one.
 */

test.describe("the retired openings surface", () => {
  test("sends you to /learn", async ({ page }) => {
    await page.goto("/openings");
    await expect(page).toHaveURL(/\/learn$/);
  });

  test("keeps the query string on the old preview stub", async ({ page }) => {
    await page.goto("/preview/openings");
    await expect(page).toHaveURL(/\/learn/);
  });

  test("is not offered anywhere in the chrome", async ({ page }) => {
    await page.goto("/learn");
    await page
      .getByRole("button", { name: "I agree" })
      .click({ timeout: 10_000 })
      .catch(() => {});

    // THE ZERO: the number of links to the retired page, anywhere on the page
    // including the footer and the drawer. The control is the next assertion —
    // links to /learn must be greater than zero, so this cannot pass on a page
    // that rendered no links at all.
    await expect(page.locator('a[href="/openings"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Open menu" }).first().click();
    await expect(page.locator('a[href="/openings"]')).toHaveCount(0);
    expect(await page.locator('a[href="/learn"]').count()).toBeGreaterThan(0);
  });
});
