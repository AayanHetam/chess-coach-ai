import { test, expect, type Page } from "@playwright/test";
import { Chess } from "chess.js";
import { waitForStableFen } from "../helpers";

/**
 * Confirm-move staging on /puzzles, driven through the real board.
 *
 * Confirm-move is OFF by default (2026-09-08 — GM Alex Colovic's review:
 * "usually you make the move on the board and that's it"), so the staging
 * tests opt IN through the same quiet toggle a user would, then prove the
 * contract: a staged move arms Submit, tapping the board takes it back, and
 * turning confirm off again removes the controls. The first test pins the
 * default itself — a drop is graded on the spot and no Submit ever appears.
 * Keep it that way: seeding the pref in playwright.config would leave the
 * shipped default with zero coverage, which is exactly the state the GM hit.
 *
 * The puzzle feed is random, so a test cannot know which piece is movable.
 * The board therefore publishes its rendered position as `data-board-fen`,
 * which lets this spec compute a genuinely legal move with chess.js and click
 * the two squares — instead of guessing by clicking around and hoping for a
 * repaint, which is what the first draft did and why it silently skipped.
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

  /** Opt in: click the quiet toggle and wait for the disabled Submit to mount. */
  async function enableConfirm(page: Page) {
    await page.getByRole("button", { name: /Confirm each move: off/ }).click();
    await expect(
      page.getByRole("button", { name: /Confirm each move: on/ }),
    ).toBeVisible();
    const submit = page.getByRole("button", { name: "Submit move" });
    await expect(submit).toBeVisible();
    await expect(submit).toBeDisabled();
  }

  /** Play a legal move by reading the board's own position. */
  async function playLegalMove(page: Page): Promise<{ from: string; to: string; fenBefore: string }> {
    // Settle first: computing a move from a FEN the board is about to replace
    // would click squares belonging to a position that no longer exists, and
    // the move would silently not register.
    const fenBefore = await waitForStableFen(page);

    const moves = new Chess(fenBefore).moves({ verbose: true }) as Array<{
      from: string;
      to: string;
    }>;
    expect(moves.length, "position must have a legal move").toBeGreaterThan(0);

    const { from, to } = moves[0];
    await page.locator(`[data-square="${from}"]`).click();
    await page.locator(`[data-square="${to}"]`).click();
    return { from, to, fenBefore };
  }

  test("by default a dropped move is graded on the spot — nothing is staged", async ({
    page,
  }) => {
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(String(e)));

    await page.goto("/puzzles");
    await waitForBoard(page);

    // The default: no commit step at all.
    await expect(
      page.getByRole("button", { name: /Confirm each move: off/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit move" })).toHaveCount(0);

    const { fenBefore } = await playLegalMove(page);

    // Graded immediately: either the move was right and the position moved on
    // (FEN changed), or it was wrong and the status pill says so for a beat.
    await expect
      .poll(
        async () => {
          const fen = await page
            .locator("[data-board-fen]")
            .getAttribute("data-board-fen");
          const wrong = await page
            .getByText("Try again", { exact: true })
            .count();
          return fen !== fenBefore || wrong > 0;
        },
        { timeout: 10_000, message: "the move should be graded, not parked" },
      )
      .toBe(true);

    // And in neither case does a staging control appear.
    await expect(page.getByRole("button", { name: "Submit move" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Change move" })).toHaveCount(0);
    // The board also never locks the way a staged move locks it — but only
    // check that while the puzzle is still unsolved: the feed is random, so
    // the move played above is sometimes the solution of a one-move puzzle,
    // and a solved board is non-interactive for a completely different
    // reason (puzzles.tsx: `status !== "solved" && ...`).
    if ((await page.getByText("Solved", { exact: true }).count()) === 0) {
      await expect(page.locator("[data-board-fen]")).toHaveAttribute(
        "data-board-interactive",
        "true",
      );
    }

    expect(crashes).toEqual([]);
  });

  test("with confirm on, a staged move arms Submit and tapping the board takes it back", async ({
    page,
  }) => {
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(String(e)));

    await page.goto("/puzzles");
    await waitForBoard(page);
    await enableConfirm(page);

    const submit = page.getByRole("button", { name: "Submit move" });
    await expect(submit).toBeDisabled();

    await playLegalMove(page);

    // Staging arms Submit, offers the explicit take-back, and locks the board
    // (it is rendering the staged position, so a second drag would report
    // squares that don't exist in the real one).
    await expect(submit).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Change move" }),
    ).toBeVisible();
    await expect(page.locator("[data-board-fen]")).toHaveAttribute(
      "data-board-interactive",
      "false",
    );

    // Tapping the board is the take-back everyone tries first.
    await page.locator('[data-square="a1"]').click();
    await expect(submit).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Change move" }),
    ).toHaveCount(0);
    await expect(page.locator("[data-board-fen]")).toHaveAttribute(
      "data-board-interactive",
      "true",
    );

    expect(crashes).toEqual([]);
  });

  test("turning confirm on adds the staging controls and off removes them", async ({
    page,
  }) => {
    await page.goto("/puzzles");
    await waitForBoard(page);

    await expect(page.getByRole("button", { name: "Submit move" })).toHaveCount(0);

    await enableConfirm(page);

    await page.getByRole("button", { name: /Confirm each move: on/ }).click();

    await expect(page.getByRole("button", { name: "Submit move" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Change move" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Confirm each move: off/ }),
    ).toBeVisible();
  });

  test("turning confirm off mid-stage drops the staged move", async ({ page }) => {
    // Otherwise a move strands on the board with no Submit to commit it.
    await page.goto("/puzzles");
    await waitForBoard(page);
    await enableConfirm(page);

    const { fenBefore } = await playLegalMove(page);
    await expect(page.getByRole("button", { name: "Submit move" })).toBeEnabled();

    await page.getByRole("button", { name: /Confirm each move: on/ }).click();

    await expect(page.getByRole("button", { name: "Submit move" })).toHaveCount(0);
    // Board back on the real (pre-move) position and accepting input again.
    await expect(page.locator("[data-board-fen]")).toHaveAttribute(
      "data-board-fen",
      fenBefore,
    );
    await expect(page.locator("[data-board-fen]")).toHaveAttribute(
      "data-board-interactive",
      "true",
    );
  });

  test("the confirm choice survives a reload", async ({ page }) => {
    await page.goto("/puzzles");
    await waitForBoard(page);
    await enableConfirm(page);

    await page.reload();
    await waitForBoard(page);
    await expect(
      page.getByRole("button", { name: /Confirm each move: on/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit move" })).toBeVisible();
  });
});
