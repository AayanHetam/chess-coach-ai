import { test, expect, type Page } from "@playwright/test";
import { stubMaiaHealthy, stubSignedIn } from "../helpers";

/**
 * The board never moves on a tap.
 *
 * The layout-shift budget (layout-stability.spec.ts) is measured at load and
 * discards every shift that follows an input, which is the Chrome field
 * rule and also a hole: a board that jumps when the reader opens Masters,
 * when the coach moves the board to the move asked about, or when a mode's
 * banner drops in above it, is invisible to that budget. This spec reads
 * the board's rectangle before and after each of those and asserts it did
 * not move. Every later client PR on /analysis extends it.
 *
 * No engine and no LLM: the review and the follow-up are stubbed, and the
 * engine worker is blocked so the composer opens at once ("answering
 * without engine analysis").
 */

/** Fixture 07: 8. Nc7+ forks king and rook while Black's queen on c1 is free with 8. Qxc1. */
const PGN = [
  '[White "E2E White"]',
  '[Black "E2E Black"]',
  '[Result "0-1"]',
  "",
  "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Qb6 5. Nf3 Qxb2 6. Na3 Qxa1 7. Nb5 Qxc1 8. Nc7+ Kd8 9. Nxa8 Qxd1+ 10. Kxd1 e5 0-1",
].join("\n");

const REVIEW =
  "The fork was tempting, but 8. Qxc1 simply takes the queen on c1.";

const FOLLOWUP =
  "You saw the fork, but the queen on c1 was free for the taking.\n\nLesson: take what is hanging before you start a combination.";

async function stubEverything(page: Page) {
  await page.route("**/engines/**", (route) => route.abort());
  await stubSignedIn(page);
  await stubMaiaHealthy(page);
  await page.route("**/api/mistake-puzzles", (r) =>
    r.fulfill({ json: { puzzles: [], recommendations: [] } })
  );
  // 1.e4 c5 2.Nf3 is inside the shipped tree; past it the route answers
  // "out of book", which is what the Masters view shows for most plies.
  await page.route("**/api/opening-explorer**", (r) =>
    r.fulfill({
      json: {
        moves: [],
        topGames: [],
        hasGameCounts: false,
        indexedPositions: 99_836,
        corpus: {
          games: 3_439_091,
          positions: 99_836,
          maxPlies: 24,
          minGames: 50,
          source: "Lichess Elite (2500+ vs 2300+), 2024-12 → 2025-11",
          generatedAt: "2026-08-24",
        },
      },
    })
  );
  await page.route("**/api/enhanced-analysis", async (route) => {
    const body =
      `data: ${JSON.stringify({ type: "text", delta: REVIEW })}\n\n` +
      `data: ${JSON.stringify({ type: "done", metadata: { contextId: "e2e-rect-1" } })}\n\n`;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body,
    });
  });
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gameAnalysis: {
          analysis: FOLLOWUP,
          position: "",
          anchor: { ply: 15, moveNumber: 8, color: "w", san: "Nc7+" },
          intent: { intent: "verdict", rule: "verdict:anchor" },
          followUpPrompt: "1.3",
          validationScore: 1,
          cached: false,
          fastPath: true,
        },
      }),
    });
  });
}

/**
 * The board's box in the DOCUMENT, to the pixel. Document coordinates, not
 * the viewport's: on a phone the page scrolls to bring a tapped control into
 * view, and a scroll moves nothing on the page.
 */
async function boardRect(page: Page) {
  const box = await page
    .locator(".cg-wrap")
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left + window.scrollX,
        y: r.top + window.scrollY,
        width: r.width,
        height: r.height,
      };
    });
  expect(box.width, "the board is on the page").toBeGreaterThan(0);
  return box;
}

function expectSameRect(
  before: { x: number; y: number; width: number; height: number },
  after: { x: number; y: number; width: number; height: number },
  when: string
) {
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(
      Math.abs(after[key] - before[key]),
      `${when}: board ${key}`
    ).toBeLessThanOrEqual(1);
  }
}

test.describe("the board's rectangle", () => {
  test("does not move across the views, the coach's jump and the way back", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await stubEverything(page);
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
    const composer = page.getByPlaceholder(
      "Ask anything — answering without engine analysis."
    );
    await expect(composer).toBeVisible({ timeout: 60_000 });
    const rest = await boardRect(page);

    // Masters and back.
    await page.getByText("Masters", { exact: true }).click();
    await expect(page.getByTestId("master-games-panel")).toBeVisible({
      timeout: 20_000,
    });
    expectSameRect(rest, await boardRect(page), "entering Masters");
    await page.getByText("Coach", { exact: true }).click();
    await expect(composer).toBeVisible();
    expectSameRect(rest, await boardRect(page), "leaving Masters");

    // The review, then a follow-up the coach answers about a named move:
    // the board goes to that move and the strip says so in place of the
    // move label. The board's box must not move for either.
    await composer.fill("analyse this game");
    await composer.press("Enter");
    await expect(page.getByText("simply takes the queen on c1")).toBeVisible({
      timeout: 30_000,
    });
    expectSameRect(rest, await boardRect(page), "the review");

    await composer.fill("Why was 8. Nc7+ a mistake?");
    await composer.press("Enter");
    const jump = page.getByTestId("coach-jump-banner");
    await expect(jump).toBeVisible({ timeout: 30_000 });
    await expect(jump).toContainText("8. Nc7+");
    expectSameRect(rest, await boardRect(page), "the coach's jump");

    await jump.getByRole("button", { name: /Back to/ }).click();
    await expect(jump).toHaveCount(0);
    expectSameRect(rest, await boardRect(page), "the way back");

    // The strip's sentence links the move the engine preferred, like the
    // transcript does, and tapping it is a preview, not a layout change.
    // (With the engine blocked there is no analysis to link; the strip's
    // linker is pinned by its unit test. The row's box is what matters.)
    const strip = page.getByTestId("move-analysis");
    const stripBox = (await strip.boundingBox())!;
    await page.keyboard.press("End");
    expect(
      Math.abs((await strip.boundingBox())!.height - stripBox.height)
    ).toBeLessThanOrEqual(2);
    expectSameRect(rest, await boardRect(page), "stepping to the end");
  });
});
