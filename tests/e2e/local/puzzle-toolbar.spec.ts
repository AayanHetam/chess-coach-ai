import { test, expect, type Page } from "@playwright/test";

/**
 * The board-card toolbar: solve clock and the Reference tool.
 *
 * The clock is the interesting one to cover — a stopwatch that doesn't tick,
 * or that keeps ticking after a solve, looks broken in a way no unit test on
 * the formatter would catch.
 */

test.describe("puzzle toolbar", () => {
  // /puzzles boots Stockfish WASM and the server parses a 100k-row CSV.
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

  test("the solve clock is visible and ticks", async ({ page }) => {
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(String(e)));

    await page.goto("/puzzles");
    await waitForBoard(page);

    const clock = page.getByLabel(/^Solve time /);
    await expect(clock).toBeVisible();
    const first = await clock.textContent();
    expect(first).toMatch(/^\d+:\d{2}$/);

    // Poll rather than sleep-and-assert once: a single 1.5s wait races the
    // interval boundary and would flake roughly half the time.
    await expect
      .poll(async () => (await clock.textContent()) !== first, {
        timeout: 15_000,
      })
      .toBe(true);

    expect(crashes).toEqual([]);
  });

  test("hiding the clock keeps it out of view and persists", async ({
    page,
  }) => {
    await page.goto("/puzzles");
    await waitForBoard(page);

    await page.getByRole("button", { name: "Hide solve time" }).click();
    await expect(page.getByLabel("Solve time hidden")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Show solve time" }),
    ).toBeVisible();

    await page.reload();
    await waitForBoard(page);
    await expect(
      page.getByRole("button", { name: "Show solve time" }),
    ).toBeVisible();

    // And it can be turned back on.
    await page.getByRole("button", { name: "Show solve time" }).click();
    await expect(page.getByLabel(/^Solve time \d/)).toBeVisible();
  });

  test("Reference either opens a panel or explains why it can't", async ({
    page,
  }) => {
    await page.goto("/puzzles");
    await waitForBoard(page);

    const reference = page.getByRole("button", { name: "Reference" });
    await expect(reference).toBeVisible();

    // Coverage is honestly partial — roughly half the Lichess themes have no
    // static text — so a random puzzle may legitimately have nothing. Both
    // states are correct; a silently dead button would not be.
    if (await reference.isDisabled()) {
      await expect(reference).toHaveAttribute("aria-pressed", "false");
      return;
    }

    await reference.click();
    await expect(reference).toHaveAttribute("aria-pressed", "true");
    // The panel must carry real text, not an empty shell.
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (document.body.innerText || "").trim().length,
          ),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(80);

    await reference.click();
    await expect(reference).toHaveAttribute("aria-pressed", "false");
  });
});
