import { test, expect, type Page } from "@playwright/test";
import { Chess } from "chess.js";
import { waitForStableFen } from "../helpers";

/**
 * The session rail lists each puzzle once.
 *
 * Reported from a live screenshot: after solving, the rail showed
 * "Endgame 1122" with a green check AND "Endgame 1122" as the active row — one
 * puzzle, two lines. A graded puzzle stays `currentPuzzle` until you press
 * "New puzzle", and the rail concatenated results + current unconditionally.
 *
 * Reproduced against the pre-fix build before this was written: duplicate rows
 * and TWO elements carrying aria-current.
 */

const RAIL = 'nav[aria-label="Session puzzles"]';

function boardOnly(fen: string): string {
  return fen.split(" ")[0];
}

async function railRows(page: Page): Promise<string[]> {
  return page.evaluate((sel) => {
    const nav = document.querySelector(sel);
    if (!nav) return [];
    // Array.from, not spread: the repo's tsconfig target rejects iterating a
    // NodeList directly (TS2802).
    return Array.from(nav.querySelectorAll("div.MuiStack-root"))
      .map((r) => (r.textContent || "").trim().replace(/\s+/g, " "))
      .filter((t) => /\d{3,4}$/.test(t));
  }, RAIL);
}

/**
 * Solve the puzzle on the board for real.
 *
 * The solution isn't exposed to the DOM, so it is read off the "Show solution"
 * demo: capture the positions it plays through, then walk the same line on the
 * live board. Grading only fires on a genuine solve, and grading is what puts a
 * result in the rail — which is the state this whole spec is about.
 */
async function solveCurrentPuzzle(page: Page): Promise<void> {
  const fen = () =>
    page.locator("[data-board-fen]").getAttribute("data-board-fen");

  const line: string[] = [];
  await page.getByRole("button", { name: /show solution/i }).click();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(250);
    const f = await fen();
    if (f && f !== line[line.length - 1]) line.push(f);
  }
  const back = page.getByRole("button", { name: /back to your move/i });
  if (await back.count()) {
    await back.click();
    await page.waitForTimeout(1200);
  }
  expect(line.length, "the demo must reveal the solution line").toBeGreaterThan(
    1
  );

  for (let step = 0; step < 6; step++) {
    const cur = await fen();
    if (!cur) break;
    const idx = line.findIndex((f) => boardOnly(f) === boardOnly(cur));
    if (idx === -1 || !line[idx + 1]) break;

    const legal = new Chess(cur).moves({ verbose: true }) as Array<{
      from: string;
      to: string;
    }>;
    const mv = legal.find((m) => {
      const probe = new Chess(cur);
      probe.move(m);
      return boardOnly(probe.fen()) === boardOnly(line[idx + 1]);
    });
    if (!mv) break;

    await page.locator(`[data-square="${mv.from}"]`).click();
    await page.locator(`[data-square="${mv.to}"]`).click();
    const submit = page.getByRole("button", { name: /submit move/i });
    if (
      (await submit.count()) &&
      (await submit.isEnabled().catch(() => false))
    ) {
      await submit.click();
    }
    await page.waitForTimeout(2000);
    if (await page.getByText("Solved", { exact: true }).count()) return;
  }
}

test("a solved puzzle occupies one rail row, not two", async ({ page }) => {
  await page.goto("/puzzles");
  await waitForStableFen(page);

  await solveCurrentPuzzle(page);
  // Guard against a vacuous pass: if the solve did not land, the rail never
  // reaches the state under test and every assertion below is meaningless.
  await expect(page.getByText("Solved", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  const rows = await railRows(page);
  expect(rows.length, "rail should have rows").toBeGreaterThan(0);
  expect(new Set(rows).size, `duplicate rail rows: ${rows.join(" | ")}`).toBe(
    rows.length
  );
});

test("exactly one rail row is marked current after solving", async ({
  page,
}) => {
  // The pre-fix build put aria-current on two rows, so a screen reader
  // announced two "current" items in a four-item list.
  await page.goto("/puzzles");
  await waitForStableFen(page);

  await solveCurrentPuzzle(page);
  await expect(page.getByText("Solved", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  const current = page.locator(`${RAIL} [aria-current="true"]`);
  await expect(current).toHaveCount(1);
});

test("the solved current row keeps BOTH its check and its highlight", async ({
  page,
}) => {
  // Dropping the current row would also remove the duplicate — and lose the
  // you-are-here indicator. The row has to carry the outcome AND the position.
  await page.goto("/puzzles");
  await waitForStableFen(page);

  await solveCurrentPuzzle(page);
  await expect(page.getByText("Solved", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  const current = page.locator(`${RAIL} [aria-current="true"]`).first();
  // Highlighted: the ember fill is what marks "you are here".
  await expect
    .poll(async () =>
      current.evaluate((el) => getComputedStyle(el).backgroundColor)
    )
    .toMatch(/rgba?\(255, 122, 26/);
  // ...and still shows the solved glyph, which is the green disc.
  const glyph = current.locator("div").first();
  await expect
    .poll(async () =>
      glyph.evaluate((el) => getComputedStyle(el).backgroundColor)
    )
    .toMatch(/rgb\(74, 222, 128\)/);
});
