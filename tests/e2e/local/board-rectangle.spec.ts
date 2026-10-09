import { test, expect, type Page } from "@playwright/test";
import { horizontalOverflow, stubMaiaHealthy, stubSignedIn } from "../helpers";

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

/**
 * A review with one key moment whose concept link offers practice: that is
 * how a drill starts from the conversation ("Practice back rank mate"
 * fetches a pack, and "Big board" puts a puzzle on the main board).
 */
const REVIEW = [
  "The fork was tempting, but 8. Qxc1 simply takes the queen on c1.",
  "",
  "[INSIGHT:8:w:blunder:+2.84:-2.11:Nc7+:Qxc1]",
  "You spotted a fork, but the free queen was the bigger prize.",
  "[WHY]",
  "Idea: You saw the knight fork on c7 hitting the king and the rook on a8.",
  "Problem: The queen on c1 was hanging with no defenders.",
  "Solution: 8. Qxc1 takes the queen immediately.",
  "Outcome: A full queen ahead instead of a lost knight.",
  "The takeaway: collect the most valuable free piece before you start a combination.",
  "[/WHY]",
  "[CONCEPT:backRankMate:Back Rank Mate]",
  "When the king is boxed in by its own pawns, a rook on the last rank ends the game.",
  "[/CONCEPT]",
  "[/INSIGHT]",
].join("\n");

/** One back-rank puzzle: Black's setup move h7h6, then White's Re8 mates. */
const PUZZLE_PACK = {
  puzzles: [
    {
      puzzleId: "e2e-back-rank",
      fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1",
      moves: "h7h6 e1e8",
      rating: 1200,
      themes: ["backRankMate", "mateIn1"],
    },
  ],
};

const FOLLOWUP =
  "You saw the fork, but the queen on c1 was free for the taking.\n\nLesson: take what is hanging before you start a combination.";

async function stubEverything(page: Page) {
  await page.route("**/engines/**", (route) => route.abort());
  await stubSignedIn(page);
  await stubMaiaHealthy(page);
  await page.route("**/api/mistake-puzzles", (r) =>
    r.fulfill({ json: { puzzles: [], recommendations: [] } })
  );
  // The practice link's pack: signed-in readers go through adaptive-puzzles
  // first, then similar-puzzles; both answer with the same one puzzle.
  await page.route("**/api/adaptive-puzzles", (r) =>
    r.fulfill({ json: PUZZLE_PACK })
  );
  await page.route("**/api/similar-puzzles", (r) =>
    r.fulfill({ json: PUZZLE_PACK })
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

    // A what-if: the question names an alternative, so the space for the
    // board's answer is under it from the moment it is sent. With the
    // engine blocked the answer is that there is none, in the same space;
    // the board's box does not move for the question or for its answer.
    // (The engine's own answer, within two seconds, is coach-what-if.spec.)
    await composer.fill("what about 8. Qxc1 instead?");
    await composer.press("Enter");
    const whatIf = page.getByTestId("what-if").last();
    await expect(whatIf).toBeVisible({ timeout: 10_000 });
    await expect(whatIf).toHaveAttribute("data-status", "unavailable", {
      timeout: 10_000,
    });
    await expect(whatIf.getByTestId("what-if-summary")).toContainText(
      "8. Qxc1"
    );
    await expect(whatIf.getByTestId("what-if-line-placeholder")).toBeVisible();
    console.log(
      `[what-if] ${test.info().project.name}: block ${await whatIf.evaluate(
        (el) => (el as HTMLElement).offsetHeight
      )} px with the placeholder`
    );
    expectSameRect(rest, await boardRect(page), "a what-if with no engine");
    // With nothing drawn, the coach's anchor moves the board as before.
    await expect(jump).toBeVisible({ timeout: 30_000 });
    expectSameRect(
      rest,
      await boardRect(page),
      "the coach's jump after a what-if"
    );
    await jump.getByRole("button", { name: /Back to/ }).click();
    await expect(jump).toHaveCount(0);

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

    // A drill: the practice link fetches a pack, "Big board" puts the puzzle
    // on the main board, and the drill's status takes the strip's first row
    // at the row's own height. The banner that used to drop in above the
    // board is gone, so the board does not move; nor does it on the way back.
    await page.getByText("Practice back rank mate").click();
    await page.getByText("Back-rank mate", { exact: true }).first().click();
    // The button's accessible name is its tooltip; the pack shows one per
    // puzzle row and one in the expanded solver.
    await page
      .getByRole("button", { name: "Load this position onto the main board" })
      .first()
      .click();
    const drill = page.getByTestId("drill-strip-state");
    await expect(drill).toBeVisible({ timeout: 10_000 });
    await expect(drill).toContainText("Drill 1 of 1");
    expectSameRect(rest, await boardRect(page), "entering a drill");
    expect(
      Math.abs((await strip.boundingBox())!.height - stripBox.height)
    ).toBeLessThanOrEqual(2);
    // The way back wears its tooltip as its accessible name.
    await page.getByRole("button", { name: /Leave the drill/ }).click();
    await expect(drill).toHaveCount(0);
    expectSameRect(rest, await boardRect(page), "leaving a drill");
    // The outcome is in the conversation, not above the board.
    await expect(page.getByText(/Drill left at puzzle 1 of 1/)).toBeVisible();
  });

  // Orders the page carries out itself (pageActions.ts, behind
  // NEXT_PUBLIC_COACH_PAGE_ACTIONS: CI builds with it on, a local build
  // without it skips). A flip, a typed go-to, the coach's jump undone by
  // "back", and a drill that refuses an order and is left by one: the
  // board's box does not move for any of them.
  test("does not move for orders typed to the coach, in a drill or out of one", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await stubEverything(page);
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
    const composer = page.getByPlaceholder(
      "Ask anything — answering without engine analysis."
    );
    await expect(composer).toBeVisible({ timeout: 60_000 });
    const on =
      (await page
        .locator("[data-page-actions]")
        .first()
        .getAttribute("data-page-actions")) === "on";
    test.skip(!on && !process.env.CI, "built without page actions");
    expect(on, "the CI legs build with page actions on").toBe(true);
    const rest = await boardRect(page);
    // One more line with the acknowledgement than before the order: an
    // earlier copy of the same words does not count.
    const say = async (text: string, ack: string | RegExp) => {
      const lines = page.getByText(
        ack,
        typeof ack === "string" ? { exact: true } : {}
      );
      const before = await lines.count();
      await composer.fill(text);
      await composer.press("Enter");
      await expect(lines).toHaveCount(before + 1, { timeout: 10_000 });
      await expect(lines.last()).toBeVisible();
    };

    // (The go-to first: with the side unknown, a flip changes whose move
    // "move 8" is, for the coach and for the page alike.)
    await say("go to move 8", "Here's 8. Nc7+, White's move 8.");
    expectSameRect(rest, await boardRect(page), "a typed go-to");
    await say("flip the board", "Flipped. Black is at the bottom.");
    expectSameRect(rest, await boardRect(page), "a typed flip");
    await say("flip", "Flipped. White is at the bottom.");

    // The review, then the coach's jump, then "back" as its way back.
    await composer.fill("analyse this game");
    await composer.press("Enter");
    await expect(page.getByText("simply takes the queen on c1")).toBeVisible({
      timeout: 30_000,
    });
    await say("go to the start", "Back to the start.");
    await composer.fill("Why was 8. Nc7+ a mistake?");
    await composer.press("Enter");
    const jump = page.getByTestId("coach-jump-banner");
    await expect(jump).toBeVisible({ timeout: 30_000 });
    await say("back", "Back to the start.");
    await expect(jump).toHaveCount(0);
    expectSameRect(rest, await boardRect(page), "back from the coach's jump");

    // A drill owns the board: an order is refused in words, "back" leaves
    // it, and the drill says so itself (one line, not two).
    await page.getByText("Practice back rank mate").click();
    await page.getByText("Back-rank mate", { exact: true }).first().click();
    await page
      .getByRole("button", { name: "Load this position onto the main board" })
      .first()
      .click();
    const drill = page.getByTestId("drill-strip-state");
    await expect(drill).toBeVisible({ timeout: 10_000 });
    await say(
      "go to move 3",
      "You're in a drill. Say “back” to leave it first."
    );
    await expect(drill).toBeVisible();
    expectSameRect(rest, await boardRect(page), "an order refused in a drill");
    // The side said during a drill takes the board when the drill is left.
    await say("I was black", "Coaching you as Black.");
    await expect(drill).toBeVisible();
    await composer.fill("back");
    await composer.press("Enter");
    await expect(drill).toHaveCount(0);
    await expect(page.getByText(/Drill left at puzzle 1 of 1/)).toBeVisible();
    await expect(page.locator(".cg-wrap").first()).toHaveClass(
      /orientation-black/
    );
    expectSameRect(rest, await boardRect(page), "leaving a drill by order");
  });

  // A switch of the side the answers are about (standingSide.ts, behind
  // NEXT_PUBLIC_COACH_PERSPECTIVE and typed through page actions; CI builds
  // with both on): its acknowledgement takes the strip's first row at the
  // row's own height, its way back fits beside the menu, and neither moves
  // the board.
  test("does not move for a switch of the side the answers are about, or its way back", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await stubEverything(page);
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
    const composer = page.getByPlaceholder(
      "Ask anything — answering without engine analysis."
    );
    await expect(composer).toBeVisible({ timeout: 60_000 });
    const flag = (name: string) =>
      page.locator(`[${name}]`).first().getAttribute(name);
    const on =
      (await flag("data-page-actions")) === "on" &&
      (await flag("data-coach-perspective")) === "on";
    test.skip(
      !on && !process.env.CI,
      "built without perspective or page actions"
    );
    expect(on, "the CI legs build with perspective and page actions on").toBe(
      true
    );
    const say = async (text: string, ack: string) => {
      const lines = page.getByText(ack, { exact: true });
      const before = await lines.count();
      await composer.fill(text);
      await composer.press("Enter");
      await expect(lines).toHaveCount(before + 1, { timeout: 10_000 });
    };

    await say("I was white", "Coaching you as White.");
    // A switch rides on the follow-ups, so the review comes first.
    await composer.fill("analyse this game");
    await composer.press("Enter");
    await expect(page.getByText("simply takes the queen on c1")).toBeVisible({
      timeout: 30_000,
    });
    const rest = await boardRect(page);
    const strip = page.getByTestId("move-analysis");
    const stripBox = (await strip.boundingBox())!;

    await say(
      "coach me as black",
      "Answers are about Black's moves now. You're still White."
    );
    const state = page.getByTestId("standing-strip-state");
    await expect(state).toHaveAttribute("data-subject", "b");
    expectSameRect(rest, await boardRect(page), "a side switch");
    expect(
      Math.abs((await strip.boundingBox())!.height - stripBox.height)
    ).toBeLessThanOrEqual(2);
    // The way back fits in the row, left of the board menu.
    const back = state.getByRole("button", { name: "Back to my side" });
    const b = (await back.boundingBox())!;
    const m = (await page.getByTestId("board-menu").first().boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(m.x + 1);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    await back.click();
    await expect(state).toHaveCount(0);
    await expect(page.getByTestId("move-analysis-label")).toBeVisible();
    await expect(page.locator(".cg-wrap").first()).toHaveClass(
      /orientation-white/
    );
    expectSameRect(rest, await boardRect(page), "the way back");

    // Shown once: the board moving takes it away.
    await say(
      "coach me as black",
      "Answers are about Black's moves now. You're still White."
    );
    await expect(state).toBeVisible();
    // The key is the board's, not the composer's.
    await composer.blur();
    await page.keyboard.press("End");
    await expect(state).toHaveCount(0);
    expectSameRect(rest, await boardRect(page), "stepping after a switch");
  });
});
