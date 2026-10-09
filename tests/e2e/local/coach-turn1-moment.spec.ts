import { test, expect, type Page } from "@playwright/test";
import { stubMaiaHealthy, stubSignedIn } from "../helpers";
// Import-free by design (types only), so the spec computes the key the
// server would send.
import { cardKey } from "../../../src/lib/coach/turnMoment";

/**
 * A review's key moments drawn from their fields (pathway 4.2, behind
 * NEXT_PUBLIC_COACH_TURN1_MOMENTS, on in the CI legs).
 *
 * Under COACH_TURN1_MOMENTS the review's stream sends each card the ladder
 * passed as a moment, just before the card's text. The page draws a card
 * whose text is the one the moment was lifted from from the moment: the
 * idea and what happens as two plain lines (no labels, no lede), the rest
 * behind the same link, the lesson in the same note. A moment for another
 * text is not drawn, and a moment sent after its text still is. The text
 * stays the message's content, so the next question's history is the text.
 *
 * No engine and no LLM: the review and the follow-up are stubbed, and the
 * engine worker is blocked.
 */

/** Fixture 07: 8. Nc7+ forks king and rook while Black's queen on c1 is free with 8. Qxc1. */
const PGN = [
  '[White "E2E White"]',
  '[Black "E2E Black"]',
  '[Result "0-1"]',
  "",
  "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Qb6 5. Nf3 Qxb2 6. Na3 Qxa1 7. Nb5 Qxc1 8. Nc7+ Kd8 9. Nxa8 Qxd1+ 10. Kxd1 e5 0-1",
].join("\n");

const LEDE = "You spotted a fork, but the free queen was the bigger prize.";
const IDEA =
  "You saw the knight fork on c7 hitting the king and the rook on a8.";
const PROBLEM = "The queen on c1 was hanging with no defenders.";
const NOTE = "I left out a tactic I couldn't check.";

/** The board-rectangle review's card, with the ladder's note after the lede when asked. */
function cardText(noted = false): string {
  return [
    "[INSIGHT:8:w:blunder:+2.84:-2.11:Nc7+:Qxc1]",
    LEDE,
    ...(noted ? [NOTE] : []),
    "[WHY]",
    `Idea: ${IDEA}`,
    `Problem: ${PROBLEM}`,
    "Solution: 8. Qxc1 takes the queen immediately.",
    "Outcome: Material is level again instead of a knight lost.",
    "The takeaway: collect the most valuable free piece before you start a combination.",
    "[/WHY]",
    "[CONCEPT:backRankMate:Back Rank Mate]",
    "When the king is boxed in by its own pawns, a rook on the last rank ends the game.",
    "[/CONCEPT]",
    "[/INSIGHT]",
  ].join("\n");
}

const INTRO =
  "The fork was tempting, but 8. Qxc1 simply takes the queen on c1.";
const review = (card: string) => `${INTRO}\n\n${card}`;

const FEN = "r1b1kbnr/pp1ppppp/2n5/1N6/4P3/5N2/P1P2PPP/2qQKB1R w Kkq - 0 8";

/** The moment the server lifts from the card (turnMoments.ts), keyed on `keyOf`. */
function moment(keyOf: string) {
  return {
    idea: IDEA,
    happens: PROBLEM,
    proof: { kind: "engine", moveNumber: 8, color: "w" },
    lesson: {
      pattern: "",
      check:
        "collect the most valuable free piece before you start a combination.",
    },
    question: null,
    more: "Solution: 8. Qxc1 takes the queen immediately.\nOutcome: Material is level again instead of a knight lost.",
    omitted: [],
    ply: 14,
    fen: FEN,
    move: {
      san: "Nc7+",
      moveNumber: 8,
      color: "w",
      verdict: "blunder",
      evalBefore: "+2.84",
      evalAfter: "-2.11",
    },
    annotations: [],
    proofLine: {
      kind: "engine",
      moveNumber: 8,
      color: "w",
      startFen: FEN,
      startPly: 14,
      sans: ["Qxc1", "Rb8", "Qf4", "f6"],
      evalDisplay: "+2.84",
    },
    actions: [{ kind: "play_proof" }],
    card: {
      factIdPrefix: "M2",
      moveNumber: 8,
      color: "w",
      playedSan: "Nc7+",
      key: cardKey(keyOf),
    },
  };
}

const frame = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

async function stubCoach(page: Page, frames: unknown[]) {
  await page.route("**/engines/**", (route) => route.abort());
  await stubSignedIn(page);
  await stubMaiaHealthy(page);
  await page.route("**/api/mistake-puzzles", (r) =>
    r.fulfill({ json: { puzzles: [], recommendations: [] } })
  );
  await page.route("**/api/enhanced-analysis", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: frames.map(frame).join(""),
    })
  );
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/chat", async (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gameAnalysis: {
          analysis: "The queen on c1 was free for the taking.",
          position: "",
          followUpPrompt: "1.3",
          validationScore: 1,
          cached: false,
          fastPath: true,
        },
      }),
    });
  });
  return bodies;
}

const done = { type: "done", metadata: { contextId: "e2e-turn1-moment" } };

/** Load the game, check the build, and ask for the review. */
async function askForReview(page: Page) {
  // Every label the lead box ever shows, from its first paint: a card
  // drawn from its moment must never flash its prose first.
  await page.addInitScript(() => {
    const w = window as unknown as { __leadLabels: string[] };
    w.__leadLabels = [];
    const look = () => {
      document
        .querySelectorAll('[data-testid="insight-lead"]')
        .forEach((el) => {
          const t = el.textContent ?? "";
          if (/Idea|Problem/.test(t)) w.__leadLabels.push(t);
        });
    };
    new MutationObserver(look).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
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
  await composer.fill("analyse this game");
  await composer.press("Enter");
  await expect(page.getByTestId("key-moments")).toBeVisible({
    timeout: 30_000,
  });
  return composer;
}

test.describe("a review's key moment drawn from its fields", () => {
  test("two plain lines, the rest behind the link, the lesson, no flash, and the text in the history", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const card = cardText();
    const REVIEW = review(card);
    const bodies = await stubCoach(page, [
      { type: "moment", moment: moment(card) },
      { type: "text", delta: REVIEW },
      done,
    ]);
    const composer = await askForReview(page);

    const drawn = page.locator('[data-moment="on"]');
    await expect(drawn).toHaveCount(1);
    await expect(drawn.getByTestId("insight-moment-idea")).toHaveText(IDEA);
    await expect(drawn.getByTestId("insight-moment-happens")).toHaveText(
      PROBLEM
    );
    // No labels and no lede: the two lines are the opening.
    await expect(drawn).not.toContainText("Idea");
    await expect(drawn).not.toContainText("Problem");
    await expect(page.getByText(LEDE)).toHaveCount(0);
    await expect(drawn.getByTestId("insight-moment-note")).toHaveCount(0);
    // The header is the prose card's.
    await expect(drawn).toContainText("8. Nc7+");
    // The rest waits behind the same link.
    await expect(drawn.getByTestId("insight-rest")).toHaveCount(0);
    await drawn.getByText("Solution and outcome", { exact: true }).click();
    await expect(drawn.getByTestId("insight-rest")).toContainText(
      "takes the queen immediately"
    );
    await expect(drawn.getByTestId("insight-rest")).toContainText(
      "Material is level again"
    );
    // The lesson, as the moment says it.
    await expect(drawn.getByTestId("insight-lesson")).toContainText(
      "Collect the most valuable free piece before you start a combination."
    );
    await expect(drawn.getByTestId("insight-lesson")).not.toContainText(
      "The takeaway"
    );
    // The practice link is the prose card's.
    await expect(drawn.getByText("Practice back rank mate")).toBeVisible();
    // The lead box never showed the labelled prose, not even for a frame.
    expect(
      await page.evaluate(
        () => (window as unknown as { __leadLabels: string[] }).__leadLabels
      )
    ).toEqual([]);

    // The next question carries the review's text, never its fields.
    await composer.fill("Why was 8. Nc7+ a mistake?");
    await composer.press("Enter");
    await expect(
      page.getByText("The queen on c1 was free for the taking.")
    ).toBeVisible({ timeout: 30_000 });
    const history = bodies[0].conversationHistory as {
      role: string;
      content: string;
    }[];
    expect(history.at(-1)).toEqual({ role: "assistant", content: REVIEW });
    expect(JSON.stringify(bodies[0])).not.toContain('"moment"');
  });

  test("a moment for another text is not drawn: the card is the prose card", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const card = cardText();
    await stubCoach(page, [
      { type: "moment", moment: moment(card.replace("bigger prize", "prize")) },
      { type: "text", delta: review(card) },
      done,
    ]);
    await askForReview(page);
    await expect(page.locator("[data-moment]")).toHaveCount(0);
    await expect(page.getByText(LEDE)).toBeVisible();
    await expect(page.getByTestId("insight-lead")).toContainText("Idea");
    await expect(page.getByTestId("insight-lesson")).toContainText(
      "collect the most valuable free piece"
    );
    // The watch the first test relies on sees a labelled lead when there is one.
    expect(
      (
        await page.evaluate(
          () => (window as unknown as { __leadLabels: string[] }).__leadLabels
        )
      ).length
    ).toBeGreaterThan(0);
  });

  test("a moment sent after its card's text is still drawn", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const card = cardText();
    await stubCoach(page, [
      { type: "text", delta: review(card) },
      { type: "moment", moment: moment(card) },
      done,
    ]);
    await askForReview(page);
    const drawn = page.locator('[data-moment="on"]');
    await expect(drawn).toHaveCount(1);
    await expect(drawn.getByTestId("insight-moment-idea")).toHaveText(IDEA);
    await expect(page.getByText(LEDE)).toHaveCount(0);
  });

  test("the ladder's note in the lede is drawn under the two lines, quieter", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const card = cardText(true);
    await stubCoach(page, [
      { type: "moment", moment: moment(card) },
      { type: "text", delta: review(card) },
      done,
    ]);
    await askForReview(page);
    const drawn = page.locator('[data-moment="on"]');
    await expect(drawn).toHaveCount(1);
    const note = drawn.getByTestId("insight-moment-note");
    await expect(note).toHaveText(NOTE);
    // After the two lines, in the app's quieter colour.
    const lines = await drawn
      .getByTestId("insight-lead")
      .locator(":scope > [data-testid]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(lines).toEqual([
      "insight-moment-idea",
      "insight-moment-happens",
      "insight-moment-note",
    ]);
    await expect(note).toHaveCSS("color", "rgba(255, 255, 255, 0.62)");
    await expect(page.getByText(LEDE)).toHaveCount(0);
  });
});
