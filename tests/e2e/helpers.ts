import type { Page } from "@playwright/test";

/** Relative luminance (0=black, 1=white) of the computed body background. */
export async function bodyLuminance(page: Page): Promise<number> {
  return page.evaluate(() => {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
    if (!m) return 1;
    return (0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2]) / 255;
  });
}

/** Pixels of horizontal overflow — >1 means the page scrolls sideways. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
}

/**
 * Wait until /puzzles stops swapping the puzzle, then return the settled FEN.
 *
 * The page can render a resumed puzzle first and then swap in the feed's first
 * batch, so the position is NOT stable the moment the board turns interactive.
 * Any test that reads `data-board-fen` and then acts on it — comparing it
 * later, or computing a legal move from it — must settle first, or it will
 * silently be working with a position the board has already replaced.
 *
 * This is not hypothetical: it failed exactly this way on CI while passing
 * locally, because the feed resolves faster on a dev machine than on a runner.
 */
export async function waitForStableFen(page: Page): Promise<string> {
  const board = page.locator("[data-board-fen]");
  let last = await board.getAttribute("data-board-fen");
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(400);
    const now = await board.getAttribute("data-board-fen");
    if (now && now === last) return now;
    last = now;
  }
  throw new Error("board never settled on a puzzle");
}
