import { test, expect, type Page } from "@playwright/test";
import {
  clickBoardSquare,
  horizontalOverflow,
  stubMaiaHealthy,
  stubSignedIn,
} from "../helpers";
// Import-free by design (types only): the key a turn-1 moment carries.
import { cardKey } from "../../../src/lib/coach/turnMoment";

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
  "Outcome: Material is level again instead of a knight lost.",
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

async function stubEverything(
  page: Page,
  { blockEngine = true }: { blockEngine?: boolean } = {}
) {
  if (blockEngine) await page.route("**/engines/**", (route) => route.abort());
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

/**
 * The element shows all of its text: nothing cut by its own ellipsis, and
 * nothing hidden past the edge of a row that hides its overflow.
 */
async function notClipped(el: import("@playwright/test").Locator) {
  return el.evaluate((node) => {
    const own = node as HTMLElement;
    if (own.scrollWidth > own.clientWidth + 1) return false;
    const r = own.getBoundingClientRect();
    for (let p = own.parentElement; p; p = p.parentElement) {
      if (getComputedStyle(p).overflowX === "visible") continue;
      const b = p.getBoundingClientRect();
      if (r.left < b.left - 1 || r.right > b.right + 1) return false;
    }
    return true;
  });
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
    // The side is what the note says: never cut, the step buttons beside it.
    expect(
      await notClipped(state.getByTestId("standing-strip-label")),
      "the side is not cut"
    ).toBe(true);
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

  test("does not move for a follow-up drawn from its fields, or its line played", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await stubEverything(page);
    // The answer's fields beside its text (pathway 3.3): two lines, the
    // engine's line (nothing to draw it from, so the app's clause in its
    // place), the game's own line, the lesson and the question.
    const idea =
      "You went for the check because the fork looked like it won material.";
    const happens =
      "The queen on c1 was already hanging, so the knight is the piece that is lost.";
    const moment = {
      idea,
      happens,
      proof: { kind: "played", moveNumber: 8, color: "w" },
      lesson: {
        pattern: "take what is hanging first",
        check:
          "Before any fork, list every capture your opponent has in reply.",
      },
      question: "Black has just played 7... Qxc1: which piece can take it",
      more: null,
      omitted: [],
    };
    const text = [
      `${idea} ${happens}`,
      "[PLAYED:8:w]",
      "Lesson: take what is hanging first. Before any fork, list every capture your opponent has in reply.",
      "Your turn: Black has just played 7... Qxc1: which piece can take it?",
    ].join("\n\n");
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gameAnalysis: {
            analysis: text,
            moment,
            position: "",
            anchor: { ply: 15, moveNumber: 8, color: "w", san: "Nc7+" },
            followUpPrompt: "fielded-1",
            validationScore: 1,
            cached: false,
            fastPath: true,
          },
        }),
      })
    );
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
    const composer = page.getByPlaceholder(
      "Ask anything — answering without engine analysis."
    );
    await expect(composer).toBeVisible({ timeout: 60_000 });
    const built =
      (await page
        .locator("[data-followup-moments]")
        .first()
        .getAttribute("data-followup-moments")) === "on";
    test.skip(!built && !process.env.CI, "built without follow-up moments");
    expect(built, "the CI legs build with follow-up moments on").toBe(true);

    await composer.fill("analyse this game");
    await composer.press("Enter");
    await expect(page.getByText("simply takes the queen on c1")).toBeVisible({
      timeout: 30_000,
    });
    const rest = await boardRect(page);
    const strip = page.getByTestId("move-analysis");
    const stripBox = (await strip.boundingBox())!;

    await composer.fill("Why was 8. Nc7+ a mistake?");
    await composer.press("Enter");
    const drawn = page.getByTestId("coach-moment");
    await expect(drawn).toBeVisible({ timeout: 30_000 });
    await expect(drawn.getByTestId("proof-line")).toHaveCount(1);
    await expect(drawn.getByTestId("coach-note-lesson")).toBeVisible();
    await expect(page.getByTestId("coach-jump-banner")).toBeVisible();
    expectSameRect(
      rest,
      await boardRect(page),
      "a follow-up drawn from its fields"
    );
    expect(
      Math.abs((await strip.boundingBox())!.height - stripBox.height)
    ).toBeLessThanOrEqual(2);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    // Its line played on the board: the game's own moves, so the cursor
    // walks the mainline and the strip's first row is the move label again.
    await drawn.getByTestId("proof-line-play").click();
    await expect(page.getByTestId("coach-jump-banner")).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(page.getByTestId("move-analysis-label")).toBeVisible();
    expectSameRect(rest, await boardRect(page), "the answer's line played");
    expect(
      Math.abs((await strip.boundingBox())!.height - stripBox.height)
    ).toBeLessThanOrEqual(2);
  });

  // A review's key moments sent as fields (pathway 4.2, behind
  // NEXT_PUBLIC_COACH_TURN1_MOMENTS: CI builds with it on, a local build
  // without it skips). The card is drawn from its moment, the ladder's note
  // under its two lines, and its solution opened: the board's box and the
  // strip's height do not move for either.
  test("does not move for a review drawn from its moments, or its solution opened", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await stubEverything(page);
    const lede = "You spotted a fork, but the free queen was the bigger prize.";
    const note = "I left out a tactic I couldn't check.";
    const noted = REVIEW.replace(`${lede}\n`, `${lede}\n${note}\n`);
    const close = "[/INSIGHT]";
    const card = noted.slice(
      noted.indexOf("[INSIGHT:"),
      noted.indexOf(close) + close.length
    );
    // The fields the page reads: the card it names and its prose.
    const moment = {
      idea: "You saw the knight fork on c7 hitting the king and the rook on a8.",
      happens: "The queen on c1 was hanging with no defenders.",
      proof: { kind: "engine", moveNumber: 8, color: "w" },
      lesson: {
        pattern: "",
        check:
          "collect the most valuable free piece before you start a combination.",
      },
      question: null,
      more: "Solution: 8. Qxc1 takes the queen immediately.\nOutcome: Material is level again instead of a knight lost.",
      omitted: [],
      card: {
        factIdPrefix: "M2",
        moveNumber: 8,
        color: "w",
        playedSan: "Nc7+",
        key: cardKey(card),
      },
    };
    await page.route("**/api/enhanced-analysis", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body:
          `data: ${JSON.stringify({ type: "moment", moment })}\n\n` +
          `data: ${JSON.stringify({ type: "text", delta: noted })}\n\n` +
          `data: ${JSON.stringify({ type: "done", metadata: { contextId: "e2e-rect-moments" } })}\n\n`,
      })
    );
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
    const composer = page.getByPlaceholder(
      "Ask anything — answering without engine analysis."
    );
    await expect(composer).toBeVisible({ timeout: 60_000 });
    const built =
      (await page
        .locator("[data-turn1-moments]")
        .first()
        .getAttribute("data-turn1-moments")) === "on";
    test.skip(!built && !process.env.CI, "built without turn-1 moments");
    expect(built, "the CI legs build with turn-1 moments on").toBe(true);
    const rest = await boardRect(page);
    const strip = page.getByTestId("move-analysis");
    const stripBox = (await strip.boundingBox())!;

    await composer.fill("analyse this game");
    await composer.press("Enter");
    const drawn = page.locator('[data-moment="on"]');
    await expect(drawn).toBeVisible({ timeout: 30_000 });
    await expect(drawn.getByTestId("insight-moment-happens")).toBeVisible();
    await expect(drawn.getByTestId("insight-moment-note")).toHaveText(note);
    expectSameRect(
      rest,
      await boardRect(page),
      "a review drawn from its moments"
    );
    expect(
      Math.abs((await strip.boundingBox())!.height - stripBox.height)
    ).toBeLessThanOrEqual(2);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    await drawn.getByText("Solution and outcome", { exact: true }).click();
    await expect(drawn.getByTestId("insight-rest")).toBeVisible();
    expectSameRect(rest, await boardRect(page), "its solution opened");
    expect(
      Math.abs((await strip.boundingBox())!.height - stripBox.height)
    ).toBeLessThanOrEqual(2);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
});

/**
 * The story line in the greeting is the sign the sweep has landed: the
 * composer reads "Ask anything about this position..." before the game
 * has even loaded. Skips on a machine where Stockfish never finishes.
 */
async function sweepLands(page: Page) {
  const ready = await page
    .getByText(/The game turned at \d+\.+\S+/)
    .first()
    .waitFor({ state: "visible", timeout: 180_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!ready, "Stockfish never finished on this machine");
}

/**
 * The arrival (pathway 2.7, behind NEXT_PUBLIC_COACH_ARRIVAL_JUMP; the CI
 * legs build with it on): once the engine has swept a game loaded fresh,
 * the board opens at the move the game turned on (gameStory.ts), the strip
 * names it with the way back, the arc marks it and Masti wears the result.
 * The engine runs here, so the spec skips, like the what-if spec, on a
 * machine where the sweep never finishes.
 */
test.describe("the arrival at the move the game turned on", () => {
  /** The move the greeting says the game turned at, and its ply. */
  async function turningPoint(page: Page) {
    const greeting = page.getByText(/The game turned at \d+\.+\S+/).first();
    await expect(greeting).toBeVisible({ timeout: 30_000 });
    const m = /The game turned at (\d+)(\.+)(\S+?) \(/.exec(
      (await greeting.textContent()) ?? ""
    );
    expect(m, "the greeting names the move").not.toBeNull();
    const [, n, dots, san] = m!;
    const ply = (Number(n) - 1) * 2 + (dots === "." ? 1 : 2);
    return { ply, label: `${n}${dots} ${san}` };
  }

  async function arrivalOn(page: Page) {
    const on =
      (await page
        .locator("[data-arrival-jump]")
        .first()
        .getAttribute("data-arrival-jump")) === "on";
    test.skip(!on && !process.env.CI, "built without the arrival jump");
    expect(on, "the CI legs build with the arrival jump on").toBe(true);
  }

  test("opens at the turning point once the sweep lands, and the board does not move", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    await stubEverything(page, { blockEngine: false });
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
    await expect(page.locator(".cg-wrap").first()).toBeVisible({
      timeout: 60_000,
    });
    await arrivalOn(page);
    const rest = await boardRect(page);
    const strip = page.getByTestId("move-analysis");
    const stripHeight = (await strip.boundingBox())!.height;

    await sweepLands(page);
    const turned = await turningPoint(page);
    const state = page.getByTestId("arrival-strip-state");
    await expect(state).toBeVisible({ timeout: 10_000 });
    await expect(state).toHaveAttribute("data-ply", String(turned.ply));
    await expect(state).toContainText("Turning point");
    await expect(state).toContainText(turned.label);
    // The move is what the note says: never cut, at any width.
    const moveLabel = state.getByTestId("arrival-strip-label");
    await expect(moveLabel).toHaveText(turned.label);
    expect(await notClipped(moveLabel), "the move is not cut").toBe(true);
    expectSameRect(rest, await boardRect(page), "the arrival");
    expect(
      Math.abs((await strip.boundingBox())!.height - stripHeight)
    ).toBeLessThanOrEqual(2);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    // The step buttons stay beside it, on a phone too.
    await expect(page.getByLabel("Next move (→)").first()).toBeVisible();

    // The arc marks the move, where the arc draws that ply.
    const arc = page.getByTestId("eval-arc");
    const arcBox = (await arc.boundingBox())!;
    expect(Math.abs(arcBox.height - 30)).toBeLessThanOrEqual(1);
    const mark = page.getByTestId("eval-arc-decisive");
    await expect(mark).toHaveAttribute(
      "aria-label",
      `Go to ${turned.label}, the move that decided the game`
    );
    const markBox = (await mark.boundingBox())!;
    const at = (markBox.x + markBox.width / 2 - arcBox.x) / arcBox.width;
    expect(Math.abs(at - turned.ply / 20)).toBeLessThanOrEqual(0.02);

    // Masti wears the result: White lost this game, and the side is not
    // known until the reader says it.
    const face = page.getByTestId("coach-masti");
    await expect(face).toHaveAttribute("data-masti-avatar", "idea", {
      timeout: 5_000,
    });
    await page.getByTestId("player-side-ask").getByText("White").click();
    await expect(face).toHaveAttribute("data-masti-avatar", "defeated", {
      timeout: 5_000,
    });
    await expect(state).toBeVisible();
    // No figure over the board.
    const overBoard = await page.evaluate(() => {
      const board = document.querySelector(".cg-wrap")!.getBoundingClientRect();
      return Array.from(document.querySelectorAll("[data-masti-mood]")).some(
        (el) => {
          const r = el.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.left < board.right &&
            r.right > board.left &&
            r.top < board.bottom &&
            r.bottom > board.top
          );
        }
      );
    });
    expect(overBoard).toBe(false);

    // The way back: the state's own button beside a board, the step
    // buttons' Start on a phone.
    if (testInfo.project.name.includes("mobile"))
      await page.getByLabel("Start (Home)").first().click();
    else await state.getByRole("button", { name: "Back to start" }).click();
    await expect(state).toHaveCount(0);
    await expect(page.getByTestId("move-analysis-label")).toHaveText("Start");
    expectSameRect(rest, await boardRect(page), "back to the start");
    // Once per load: nothing takes the reader back there.
    await page.waitForTimeout(1_000);
    await expect(state).toHaveCount(0);

    // The arc's mark is a way there.
    await mark.click();
    await expect(page.getByTestId("move-analysis-label")).toHaveText(
      turned.label
    );
    expectSameRect(rest, await boardRect(page), "the arc's mark");
  });

  test("a reader who moved before the sweep landed is left where they are", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await stubEverything(page, { blockEngine: false });
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
    await expect(page.locator(".cg-wrap").first()).toBeVisible({
      timeout: 60_000,
    });
    await arrivalOn(page);
    // The game is on the board (its greeting is), and the sweep is not in.
    await expect(
      page.getByText("E2E White vs E2E Black").filter({ visible: true }).first()
    ).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("move-analysis-label")).toHaveText("1. e4");
    await sweepLands(page);
    await turningPoint(page);
    await page.waitForTimeout(1_000);
    await expect(page.getByTestId("arrival-strip-state")).toHaveCount(0);
    await expect(page.getByTestId("move-analysis-label")).toHaveText("1. e4");
    // The arc still marks it.
    await expect(page.getByTestId("eval-arc-decisive")).toBeVisible();
  });
});

/**
 * A compare (pathway 3.5, behind NEXT_PUBLIC_COACH_COMPARE, which the CI
 * legs build with): "8. Qxc1 or 8. Nd6+?" draws two lines under the
 * question and puts neither move on the board until the reader plays one.
 * The engine runs here, so the spec skips, like the what-if spec, on a
 * machine where the sweep never finishes.
 */
test.describe("a compare under the question", () => {
  test("does not move for a compare, or either of its lines played", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await stubEverything(page, { blockEngine: false });
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
    await expect(page.locator(".cg-wrap").first()).toBeVisible({
      timeout: 60_000,
    });
    const composer = page.getByPlaceholder(
      "Ask anything about this position..."
    );
    // Read by the e2e: was this build made with the compare on?
    const flag = (name: string) =>
      page.locator(`[${name}]`).first().getAttribute(name);
    const built = (await flag("data-coach-compare")) === "on";
    test.skip(!built && !process.env.CI, "built without the compare");
    expect(built, "the CI legs build with the compare on").toBe(true);
    // The story line in the greeting is the sign the sweep has landed.
    const ready = await page
      .getByText(/The game turned at \d+\.+\S+/)
      .first()
      .waitFor({ state: "visible", timeout: 180_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!ready, "Stockfish never finished on this machine");
    // The arrival, when it is built, opens at the turning point: back to
    // the start, where a compare's board is left alone.
    const arrival = page.getByTestId("arrival-strip-state");
    if (
      (await flag("data-arrival-jump")) === "on" &&
      (await arrival
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => true)
        .catch(() => false))
    ) {
      await composer.blur();
      await page.keyboard.press("Home");
      await expect(arrival).toHaveCount(0);
    }
    await composer.fill("analyse this game");
    await composer.press("Enter");
    // The review's key moment (its one-line intro gives way to the story).
    await expect(
      page.getByText("the free queen was the bigger prize")
    ).toBeVisible({ timeout: 30_000 });
    const rest = await boardRect(page);
    const strip = page.getByTestId("move-analysis");
    const stripHeight = (await strip.boundingBox())!.height;
    const label = await page.getByTestId("move-analysis-label").textContent();

    await composer.fill("8. Qxc1 or 8. Nd6+?");
    await composer.press("Enter");
    const compare = page.getByTestId("compare").last();
    await expect(compare).toBeVisible({ timeout: 5_000 });
    expectSameRect(rest, await boardRect(page), "the compare asked");
    await expect(compare.getByTestId("compare-line-second")).toBeVisible({
      timeout: 15_000,
    });
    await expect(compare).toHaveAttribute("data-status", /drawn|final/);
    expectSameRect(rest, await boardRect(page), "the compare drawn");
    // Neither move is on the board, and the strip names the move it did.
    await expect(page.getByTestId("exploration-path")).toHaveCount(0);
    await expect(page.getByTestId("move-analysis-label")).toHaveText(label!);
    expect(
      Math.abs((await strip.boundingBox())!.height - stripHeight)
    ).toBeLessThanOrEqual(2);
    // The coach's words leave it so.
    await expect(page.getByText("the queen on c1 was free")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("coach-jump-banner")).toHaveCount(0);
    expectSameRect(rest, await boardRect(page), "the coach's words");

    // Each line played on the board: the strip's state row, at its height.
    for (const which of ["first", "second"] as const) {
      const san = which === "first" ? "Qxc1" : "Nd6+";
      const play = compare.getByTestId(`compare-line-${which}-play`);
      await play.click();
      await expect(page.getByTestId("exploration-path")).toContainText(san, {
        timeout: 5_000,
      });
      await expect(play).toHaveText(/Play/, { timeout: 20_000 });
      expectSameRect(rest, await boardRect(page), `the ${which} line played`);
      expect(
        Math.abs((await strip.boundingBox())!.height - stripHeight)
      ).toBeLessThanOrEqual(2);
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    // Back: the board where the reader branched off.
    await page.getByRole("button", { name: /Leave this line/ }).click();
    await expect(page.getByTestId("exploration-path")).toHaveCount(0);
    expectSameRect(rest, await boardRect(page), "back");
  });
});

/**
 * Masti's marks (pathway 4.4, behind NEXT_PUBLIC_COACH_BOARD_ANNOTATIONS,
 * which the CI legs build with): the board draws the move the strip is
 * about, a line's ply the reader tapped, and nothing once the reader turns
 * the marks off, and the board's box does not move for any of it. The
 * engine runs here, so the spec skips on a machine where the sweep never
 * finishes.
 */
test.describe("Masti's marks on the board", () => {
  async function marksOn(page: Page) {
    const on =
      (await page
        .locator("[data-board-annotations]")
        .first()
        .getAttribute("data-board-annotations")) === "on";
    test.skip(!on && !process.env.CI, "built without the board's marks");
    expect(on, "the CI legs build with the board's marks on").toBe(true);
  }

  /**
   * What the board draws: which mark, its two move arrows by colour
   * (ANNOTATION_STYLE's played orange and engine green), and its rings by
   * square (chessground keeps a square's name on its node).
   */
  async function marks(page: Page) {
    return page.evaluate(() => {
      const wrap = document.querySelector(".cg-wrap")!;
      const lines = (stroke: string) =>
        wrap.querySelectorAll(`svg.cg-shapes line[stroke="${stroke}"]`).length;
      const rings = (cls: string) =>
        Array.from(wrap.querySelectorAll(`cg-board square.${cls}`))
          .map((el) => (el as unknown as { cgKey?: string }).cgKey ?? "?")
          .sort();
      return {
        source:
          document
            .querySelector("[data-annotation-source]")
            ?.getAttribute("data-annotation-source") ?? null,
        played: lines("#FB923C"),
        engine: lines("#86EFAC"),
        targets: rings("cm-anno-target"),
        threats: rings("cm-anno-threat"),
      };
    });
  }

  test("marks the move on the board, from the strip, a tapped line and the menu, and the board does not move", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await stubEverything(page, { blockEngine: false });
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
    await expect(page.locator(".cg-wrap").first()).toBeVisible({
      timeout: 60_000,
    });
    await marksOn(page);
    const rest = await boardRect(page);
    const strip = page.getByTestId("move-analysis");
    const stripHeight = (await strip.boundingBox())!.height;
    const label = page.getByTestId("move-analysis-label");
    const composer = page.getByPlaceholder(
      "Ask anything about this position..."
    );
    const still = async (when: string) => {
      expectSameRect(rest, await boardRect(page), when);
      expect(
        Math.abs((await strip.boundingBox())!.height - stripHeight),
        `${when}: the strip's height`
      ).toBeLessThanOrEqual(2);
    };

    await sweepLands(page);
    // The arrival, when it is built, opens at the turning point first.
    const arrival = page.getByTestId("arrival-strip-state");
    if (
      (await page
        .locator("[data-arrival-jump]")
        .first()
        .getAttribute("data-arrival-jump")) === "on"
    ) {
      await arrival
        .waitFor({ state: "visible", timeout: 10_000 })
        .catch(() => undefined);
    }
    await composer.blur();
    await page.keyboard.press("Home");
    await expect(arrival).toHaveCount(0);
    await expect(label).toHaveText("Start");

    // The strip's move: 8. Nc7+ and the engine's 8. Qxc1 as two arrows,
    // the rook the fork wins ringed, never the king.
    for (let i = 0; i < 15; i++) await page.keyboard.press("ArrowRight");
    await expect(label).toHaveText("8. Nc7+");
    const fork = {
      source: "strip",
      played: 1,
      engine: 1,
      targets: ["a8"],
      threats: [],
    };
    await expect.poll(() => marks(page)).toEqual(fork);
    await still("the strip's marks");

    // A flip keeps them (the board's own drawing used to go with a re-sync).
    const wrap = page.locator(".cg-wrap").first();
    await page.keyboard.press("f");
    await expect(wrap).toHaveClass(/orientation-black/);
    expect(await marks(page)).toEqual(fork);
    await still("a flip with the marks");
    await page.keyboard.press("f");
    await expect(wrap).toHaveClass(/orientation-white/);

    // 8... Kd8, the only move: no move arrows, and the knight on c7 the
    // king now attacks ringed in place of the rook.
    await page.keyboard.press("ArrowRight");
    await expect(label).toHaveText("8... Kd8");
    await expect
      .poll(() => marks(page))
      .toEqual({
        source: "strip",
        played: 0,
        engine: 0,
        targets: ["c7"],
        threats: [],
      });
    await still("the next move's marks");

    // A line's ply, tapped: its own mark, the ring alone (the move is the
    // board's last move already).
    await composer.fill("analyse this game");
    await composer.press("Enter");
    await expect(
      page.getByText("the free queen was the bigger prize")
    ).toBeVisible({ timeout: 30_000 });
    await page.getByText("What happened in the game").first().click();
    await page.getByTestId("insight-played-line-ply").first().click();
    await expect(label).toHaveText("8. Nc7+");
    await expect
      .poll(() => marks(page))
      .toEqual({
        source: "line",
        played: 0,
        engine: 0,
        targets: ["a8"],
        threats: [],
      });
    await still("a tapped line's marks");

    // Off the line's position, the line's mark is gone.
    await page.keyboard.press("ArrowLeft");
    await expect(label).toHaveText("7... Qxc1");
    await expect.poll(async () => (await marks(page)).source).toBe("strip");
    expect((await marks(page)).targets).toEqual(["d1"]);
    await still("stepping off the line");
    await page.keyboard.press("ArrowRight");
    await expect(label).toHaveText("8. Nc7+");
    await expect.poll(() => marks(page)).toEqual(fork);

    // The menu turns them off, and names the colours.
    await page.getByTestId("board-menu").click();
    await expect(page.getByTestId("board-menu-marks-key")).toHaveText(
      "Played · Engine preferred · At risk · Targeted"
    );
    await page.getByTestId("board-menu-marks").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("board-menu-marks")).toHaveCount(0);
    await expect
      .poll(() => marks(page))
      .toEqual({
        source: "none",
        played: 0,
        engine: 0,
        targets: [],
        threats: [],
      });
    await still("the marks turned off");
    await page.getByTestId("board-menu").click();
    await page.getByTestId("board-menu-marks").click();
    await page.keyboard.press("Escape");
    await expect.poll(() => marks(page)).toEqual(fork);
    await still("the marks turned back on");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("the eval bar swings over half a second, and not at all under reduced motion", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await stubEverything(page);
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
    const composer = page.getByPlaceholder(
      "Ask anything — answering without engine analysis."
    );
    await expect(composer).toBeVisible({ timeout: 60_000 });
    await marksOn(page);
    const fill = page.getByTestId("eval-bar-fill");
    const duration = () =>
      fill.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(await duration()).toBe("0.5s");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(composer).toBeVisible({ timeout: 60_000 });
    expect(await duration()).toBe("0s");
  });
});

/**
 * The diagnosing question (pathway 4.6, behind NEXT_PUBLIC_COACH_DIAGNOSE,
 * which the CI legs build with): once the sweep has landed and the side is
 * known, the coach asks what the opponent was threatening after the
 * player's costliest move. Answered on the board, it is a one-puzzle drill
 * whose status is the strip's first row, and its grade is a coach message:
 * none of it moves the board. The engine runs here, so the spec skips, like
 * the arrival's, on a machine where the sweep never finishes. A graded
 * answer's drill set (pathway 4.7, NEXT_PUBLIC_COACH_DIAGNOSE_DRILLS) is a
 * text link under the reply, and a set the puzzle store cannot fill is one
 * more coach line: neither moves the board.
 */
test.describe("the diagnosing question", () => {
  async function diagnoseOn(page: Page) {
    const on =
      (await page
        .locator("[data-coach-diagnose]")
        .first()
        .getAttribute("data-coach-diagnose")) === "on";
    test.skip(!on && !process.env.CI, "built without the diagnosing question");
    expect(on, "the CI legs build with the diagnosing question on").toBe(true);
  }

  /** Was this build made with the drill set on? CI must be. */
  async function drillsOn(page: Page): Promise<boolean> {
    const on =
      (await page
        .locator("[data-coach-diagnose-drills]")
        .first()
        .getAttribute("data-coach-diagnose-drills")) === "on";
    expect(
      on || !process.env.CI,
      "the CI legs build with the drill set on"
    ).toBe(true);
    return on;
  }

  /** Black's costliest move in this game, and White's threat after it, by the squares. */
  const THREATS: Record<string, [string, string]> = {
    "7... Qxc1": ["d1", "c1"],
    "5... Qxb2": ["c1", "b2"],
  };

  test("does not move for the answer on the board, its Back or its grade", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await stubEverything(page, { blockEngine: false });
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
    await expect(page.locator(".cg-wrap").first()).toBeVisible({
      timeout: 60_000,
    });
    await diagnoseOn(page);
    const rest = await boardRect(page);
    const strip = page.getByTestId("move-analysis");
    const stripHeight = (await strip.boundingBox())!.height;

    await page.getByTestId("player-side-ask").getByText("Black").click();
    await sweepLands(page);
    const controls = page.getByTestId("diagnose-ask");
    await expect(controls).toBeVisible({ timeout: 30_000 });
    await expect(controls).toHaveAttribute("data-variant", "threat");
    const ask = page.locator('[data-diagnose="ask"]');
    await expect(ask).toHaveCount(1);
    const m =
      /After (\d+\.+ \S+), what was White threatening\? Show me White's move\./.exec(
        (await ask.textContent()) ?? ""
      );
    expect(m, "the question names the move").not.toBeNull();
    const label = m![1];
    expect(Object.keys(THREATS)).toContain(label);
    const [from, to] = THREATS[label];
    expectSameRect(rest, await boardRect(page), "the question");

    // On the board: the drill's row says whose move it is, at its height.
    await controls.getByText("Answer on the board").click();
    const state = page.getByTestId("diagnose-strip-state");
    await expect(state).toBeVisible();
    await expect(state).toContainText("Your answer");
    await expect(page.getByTestId("diagnose-strip-text")).toHaveText(
      `White to move after ${label}`
    );
    await expect(controls).toHaveAttribute("data-mode", "board");
    expectSameRect(rest, await boardRect(page), "the answer on the board");
    expect(
      Math.abs((await strip.boundingBox())!.height - stripHeight)
    ).toBeLessThanOrEqual(2);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    // Its Back: the board goes back and the question is open again.
    await page.getByRole("button", { name: /Leave the answer/ }).click();
    await expect(state).toHaveCount(0);
    await expect(controls).toBeVisible();
    await expect(controls).toHaveAttribute("data-mode", "open");
    expectSameRect(rest, await boardRect(page), "the answer's Back");

    // The threat, played on the board: graded, and the drill closes.
    await controls.getByText("Answer on the board").click();
    await expect(state).toBeVisible();
    await clickBoardSquare(page, from);
    await clickBoardSquare(page, to);
    const reply = page.locator('[data-diagnose="reply"]');
    await expect(reply).toContainText("You saw it", { timeout: 10_000 });
    await expect(reply.getByTestId("coach-note-lesson")).toBeVisible();
    await expect(reply.getByTestId("proof-line")).toBeVisible();
    await expect(page.locator('[data-diagnose="answer"]')).toContainText(
      /\d+\. \S+/
    );
    await expect(state).toHaveCount(0, { timeout: 5_000 });
    await expect(controls).toHaveCount(0);
    // The drill set's link is under the reply with it.
    if (await drillsOn(page))
      await expect(page.getByTestId("diagnose-drill-link")).toBeVisible();
    expectSameRect(rest, await boardRect(page), "the grade");
    expect(
      Math.abs((await strip.boundingBox())!.height - stripHeight)
    ).toBeLessThanOrEqual(2);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("does not move for a drill set the puzzle store cannot fill", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await stubEverything(page, { blockEngine: false });
    await page.route("**/api/puzzle-feed", (r) =>
      r.fulfill({ status: 503, json: { error: "puzzle-feed unavailable" } })
    );
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
    await expect(page.locator(".cg-wrap").first()).toBeVisible({
      timeout: 60_000,
    });
    await diagnoseOn(page);
    test.skip(!(await drillsOn(page)), "built without the drill set");
    const rest = await boardRect(page);
    const strip = page.getByTestId("move-analysis");
    const stripHeight = (await strip.boundingBox())!.height;

    await page.getByTestId("player-side-ask").getByText("Black").click();
    await sweepLands(page);
    const controls = page.getByTestId("diagnose-ask");
    await expect(controls).toBeVisible({ timeout: 30_000 });
    // "No idea" is a guess, and no move of the game is graded one: the set
    // is the feed's alone.
    await controls.getByText("No idea").click();
    const link = page.getByTestId("diagnose-drill-link");
    await expect(link).toHaveText("Drill it: 3 puzzles like it");
    expectSameRect(rest, await boardRect(page), "the drill link");

    const url = page.url();
    await link.click();
    await expect(
      page.getByText(
        "The puzzle store didn't answer just now. Try again in a moment."
      )
    ).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toBe(url);
    expectSameRect(rest, await boardRect(page), "the empty set");
    expect(
      Math.abs((await strip.boundingBox())!.height - stripHeight)
    ).toBeLessThanOrEqual(2);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
});
