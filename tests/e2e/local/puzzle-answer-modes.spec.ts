import { test, expect, type Page } from "@playwright/test";
import { horizontalOverflow } from "../helpers";

/**
 * Answer modes on /puzzles, driven for real.
 *
 * Unit tests already prove the option list is sound (deterministic, one
 * solution, all legal). What they cannot prove is that a user can actually
 * *use* it: that the toggle persists, that tapping a row grades the puzzle,
 * that a wrong tap doesn't hand over the answer, and that switching modes
 * doesn't leave dead controls on screen. Those are the bugs that reach people.
 *
 * Everything here is structural — roles, counts, enabled/disabled — so copy
 * and styling changes don't flake the gate.
 */

/** The board card can take a moment to get its first puzzle from the feed. */
async function waitForPuzzle(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => (document.body.innerText || "").trim().length),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(80);
  // The answer-mode toggle only renders once a puzzle is on the board.
  await expect(page.getByRole("button", { name: /^Answer:/ })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("puzzle answer modes", () => {
  // /puzzles is the heaviest page in the app — it boots Stockfish WASM and the
  // server parses a 100k-row puzzle CSV. Served alone it renders in 2-4s, but
  // under parallel workers it can exceed the 60s global test timeout. Raise it
  // here rather than globally, so the rest of the suite keeps its tighter gate.
  test.beforeEach(({}, testInfo) => {
    testInfo.setTimeout(120_000);
  });

  test("defaults to board mode with no choice rows", async ({ page }) => {
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(String(e)));

    await page.goto("/puzzles");
    await waitForPuzzle(page);

    await expect(
      page.getByRole("button", { name: "Answer: on the board" }),
    ).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Choose a move" })).toHaveCount(
      0,
    );
    expect(crashes).toEqual([]);
  });

  test("switching to multiple choice shows answerable options", async ({
    page,
  }) => {
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(String(e)));

    await page.goto("/puzzles");
    await waitForPuzzle(page);
    await page.getByRole("button", { name: "Answer: on the board" }).click();

    const group = page.getByRole("radiogroup", { name: "Choose a move" });
    await expect(group).toBeVisible();

    const options = group.getByRole("radio");
    const count = await options.count();
    // Four when the position allows it; never one, which would be no question.
    expect(count).toBeGreaterThan(1);
    expect(count).toBeLessThanOrEqual(4);

    // Every row must carry a move to pick.
    for (let i = 0; i < count; i++) {
      await expect(options.nth(i)).toHaveText(/\S/);
    }
    expect(crashes).toEqual([]);
  });

  test("board-only controls disappear in choice mode", async ({ page }) => {
    // The whole point of hiding them: a disabled "Submit move" sitting beside
    // the real answer rows reads as a broken screen.
    await page.goto("/puzzles");
    await waitForPuzzle(page);

    await expect(
      page.getByRole("button", { name: /Confirm each move/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Answer: on the board" }).click();
    await expect(page.getByRole("radiogroup", { name: "Choose a move" })).toBeVisible();

    await expect(
      page.getByRole("button", { name: /Confirm each move/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Submit move" })).toHaveCount(
      0,
    );
  });

  test("the mode choice survives a reload", async ({ page }) => {
    await page.goto("/puzzles");
    await waitForPuzzle(page);
    await page.getByRole("button", { name: "Answer: on the board" }).click();
    await expect(
      page.getByRole("button", { name: "Answer: multiple choice" }),
    ).toBeVisible();

    await page.reload();
    await waitForPuzzle(page);
    await expect(
      page.getByRole("button", { name: "Answer: multiple choice" }),
    ).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Choose a move" })).toBeVisible();
  });

  test("picking an option resolves the attempt without crashing", async ({
    page,
  }) => {
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(String(e)));

    await page.goto("/puzzles");
    await waitForPuzzle(page);
    await page.getByRole("button", { name: "Answer: on the board" }).click();

    const group = page.getByRole("radiogroup", { name: "Choose a move" });
    await expect(group).toBeVisible();
    await group.getByRole("radio").first().click();

    // Either outcome is fine — we're asserting the interaction resolves and
    // the status row reflects it, not which option happened to be first.
    await expect(
      page.getByText(/Solved|Try again|to move/).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(crashes).toEqual([]);
  });

  test("choice mode does not push the page sideways", async ({ page }) => {
    // The rows sit under the board inside an already-constrained card, and
    // the mobile project runs this at phone width. A four-row answer block
    // that overflows would be the most visible possible regression.
    await page.goto("/puzzles");
    await waitForPuzzle(page);
    await page.getByRole("button", { name: "Answer: on the board" }).click();
    await expect(page.getByRole("radiogroup", { name: "Choose a move" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("switching back to the board restores board answering", async ({
    page,
  }) => {
    await page.goto("/puzzles");
    await waitForPuzzle(page);

    await page.getByRole("button", { name: "Answer: on the board" }).click();
    await expect(page.getByRole("radiogroup", { name: "Choose a move" })).toBeVisible();

    await page.getByRole("button", { name: "Answer: multiple choice" }).click();
    await expect(page.getByRole("radiogroup", { name: "Choose a move" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: /Confirm each move/ }),
    ).toBeVisible();
  });
});
