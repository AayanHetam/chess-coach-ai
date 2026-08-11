import { test, expect, type Page } from "@playwright/test";
import { Chess } from "chess.js";
import { waitForStableFen } from "../helpers";

/**
 * Confirm-move staging on /puzzles, driven through the real board.
 *
 * The puzzle feed is random, so a test cannot know which piece is movable.
 * The board therefore publishes its rendered position as `data-board-fen`,
 * which lets this spec compute a genuinely legal move with chess.js and click
 * the two squares — instead of guessing by clicking around and hoping for a
 * repaint, which is what the first draft did and why it silently skipped.
 *
 * What it buys: proof that a staged move arms Submit, and that tapping the
 * board takes it back — the take-back path added alongside this spec.
 */

test.describe("confirm-move staging", () => {
  // /puzzles boots Stockfish WASM and the server parses a 100k-row CSV, so it
  // needs more headroom than the 60s global timeout under parallel workers.
  test.beforeEach(({}, testInfo) => {
    testInfo.setTimeout(120_000);
  });

  async function waitForBoard(page: Page) {
    await expect(page.getByRole("button", { name: /^Answer:/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("[data-board-fen]")).toHaveAttribute(
      "data-board-interactive",
      "true",
      { timeout: 30_000 },
    );
  }

  /** Play a legal move by reading the board's own position. */
  async function playLegalMove(page: Page): Promise<{ from: string; to: string }> {
    // Settle first: computing a move from a FEN the board is about to replace
    // would click squares belonging to a position that no longer exists, and
    // the move would silently not register.
    const fen = await waitForStableFen(page);

    const moves = new Chess(fen).moves({ verbose: true }) as Array<{
      from: string;
      to: string;
    }>;
    expect(moves.length, "position must have a legal move").toBeGreaterThan(0);

    const { from, to } = moves[0];
    await page.locator(`[data-square="${from}"]`).click();
    await page.locator(`[data-square="${to}"]`).click();
    return { from, to };
  }

  test("a staged move arms Submit, and tapping the board takes it back", async ({
    page,
  }) => {
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(String(e)));

    await page.goto("/puzzles");
    await waitForBoard(page);

    // Confirm-move is on by default, so nothing is staged yet.
    const submit = page.getByRole("button", { name: "Submit move" });
    await expect(submit).toBeVisible();
    await expect(submit).toBeDisabled();

    await playLegalMove(page);

    // Staging arms Submit and offers the explicit take-back.
    await expect(submit).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Change move" }),
    ).toBeVisible();

    // Tapping the board is the take-back everyone tries first.
    await page.locator('[data-square="a1"]').click();
    await expect(submit).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Change move" }),
    ).toHaveCount(0);

    expect(crashes).toEqual([]);
  });

  test("turning confirm off removes the staging controls", async ({ page }) => {
    await page.goto("/puzzles");
    await waitForBoard(page);

    await expect(
      page.getByRole("button", { name: "Submit move" }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Confirm each move: on/ }).click();

    await expect(
      page.getByRole("button", { name: "Submit move" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Confirm each move: off/ }),
    ).toBeVisible();
  });
});
