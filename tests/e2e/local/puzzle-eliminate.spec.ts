import { test, expect, type Page } from "@playwright/test";

/**
 * Eliminate mode: marking squares you've ruled out.
 *
 * The behaviour that matters is that turning it on suspends move input —
 * otherwise a tap meant as "rule this out" would play a move instead, which
 * on an unsolved puzzle costs the user their first-try credit.
 */

test.describe("eliminate mode", () => {
  test.beforeEach(({}, testInfo) => {
    testInfo.setTimeout(120_000);
  });

  async function waitForBoard(page: Page) {
    await expect(page.locator("[data-board-fen]")).toHaveAttribute(
      "data-board-interactive",
      "true",
      { timeout: 30_000 },
    );
  }

  test("toggling it suspends move input and restores it", async ({ page }) => {
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(String(e)));

    await page.goto("/puzzles");
    await waitForBoard(page);

    const eliminate = page.getByRole("button", { name: "Eliminate" });
    await expect(eliminate).toHaveAttribute("aria-pressed", "false");

    await eliminate.click();
    await expect(eliminate).toHaveAttribute("aria-pressed", "true");
    // The board must stop accepting moves, or a "rule this out" tap would
    // play a move and cost the user their first-try credit.
    await expect(page.locator("[data-board-fen]")).toHaveAttribute(
      "data-board-interactive",
      "false",
    );

    await eliminate.click();
    await expect(eliminate).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("[data-board-fen]")).toHaveAttribute(
      "data-board-interactive",
      "true",
    );

    expect(crashes).toEqual([]);
  });

  test("marking squares never changes the position", async ({ page }) => {
    await page.goto("/puzzles");
    await waitForBoard(page);

    const board = page.locator("[data-board-fen]");
    const before = await board.getAttribute("data-board-fen");

    await page.getByRole("button", { name: "Eliminate" }).click();
    for (const sq of ["e4", "d5", "a1"]) {
      await page.locator(`[data-square="${sq}"]`).click();
    }
    // Tapping twice unmarks; either way the board must be untouched.
    await page.locator('[data-square="e4"]').click();

    expect(await board.getAttribute("data-board-fen")).toBe(before);
  });
});
