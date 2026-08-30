import { test, expect, type Page } from "@playwright/test";
import { waitForStableFen } from "../helpers";

/**
 * Keyboard move entry on the shared board (PuzzleBoardSurface).
 *
 * Until this shipped, every input path was pointer-shaped — drag, or
 * tap-tap — so a keyboard-only user could not answer a course-trainer probe,
 * or any puzzle. The board container is now focusable; typing a move
 * character opens an entry overlay; Enter feeds the parsed move through the
 * SAME onPieceDrop sink a drag uses. Because the change lives in the shared
 * component, one keyboard path serves every surface — these tests pin the
 * two ends: /puzzles (staging semantics) and the course trainer (the probe
 * that motivated the fix).
 */

async function acceptConsent(page: Page) {
  await page.context().addCookies([
    { name: "cm_consent", value: "accepted", domain: "127.0.0.1", path: "/" },
  ]);
}

function board(page: Page) {
  return page.locator("[data-board-fen]").first();
}

/** Type a move into the focused board. The first key OPENS the overlay and
 *  pre-fills itself; the rest land in the input once it mounts — the delay
 *  is what gives React the frame to mount it. */
async function typeMove(page: Page, move: string) {
  await board(page).focus();
  await page.keyboard.type(move, { delay: 80 });
  await page.keyboard.press("Enter");
}

test.describe("keyboard entry on /puzzles", () => {
  test.beforeEach(async ({ page }) => {
    await acceptConsent(page);
    await page.goto("/puzzles");
    await waitForStableFen(page);
  });

  test("a typed UCI move stages exactly like a dragged one", async ({
    page,
  }) => {
    const fenBefore = await board(page).getAttribute("data-board-fen");
    // The feed is random, so compute nothing: ask the position itself. The
    // parser accepts bare UCI, and chess.js in the page already knows the
    // legal moves — read one out.
    const uci = await page.evaluate(() => {
      // data-board-fen is the source of truth the e2e contract promises.
      const fen = document
        .querySelector("[data-board-fen]")!
        .getAttribute("data-board-fen")!;
      // A tiny FEN-only legal-move reader is overkill here — the page ships
      // chess.js, but it isn't on window. Send the FEN back instead.
      return fen;
    });
    const { Chess } = await import("chess.js");
    const move = new Chess(uci).moves({ verbose: true })[0];

    await typeMove(page, `${move.from}${move.to}`);

    // Confirm-move is ON by default: the typed move STAGES — the board shows
    // the staged position and Submit arms. Identical to the drag contract.
    await expect
      .poll(async () => board(page).getAttribute("data-board-fen"), {
        message: "typed move should stage onto the board",
      })
      .not.toBe(fenBefore);
    await expect(
      page.getByRole("button", { name: /submit move/i }),
    ).toBeEnabled();

    // The staged board is non-interactive — typing must now do nothing.
    await expect(board(page)).toHaveAttribute(
      "data-board-interactive",
      "false",
    );
    await board(page).focus();
    await page.keyboard.press("e");
    await expect(page.getByTestId("board-keyboard-entry")).toHaveCount(0);
  });

  test("an illegal entry reports an error instead of guessing", async ({
    page,
  }) => {
    // a1→a1 parses as UCI in every position and is legal in none.
    await typeMove(page, "a1a1");
    await expect(
      page.getByTestId("board-keyboard-entry").getByRole("alert"),
    ).toHaveText("Not a legal move here.");
    // Escape closes the overlay and returns focus to the board.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("board-keyboard-entry")).toHaveCount(0);
  });
});

test("a course-trainer probe can be answered entirely by keyboard", async ({
  page,
}) => {
  // THE case that motivated the feature: the probe asks for a move and every
  // prior input path needed a pointer. a2a3 is legal in every London position
  // at ply 2 and never the course move — a deterministic miss, which is
  // perfect: the teach card appearing proves the typed move was GRADED.
  await acceptConsent(page);
  await page.goto("/train/course/w-london/0?round=1");
  await page
    .getByRole("button", { name: "I agree" })
    .click({ timeout: 10_000 })
    .catch(() => {});
  await expect(page.getByText("Your move")).toBeVisible({ timeout: 10_000 });

  await typeMove(page, "a2a3");

  await expect(page.getByTestId("teach-card")).toBeVisible();
  await expect(page.getByTestId("teach-played")).toHaveText("a3");
});
