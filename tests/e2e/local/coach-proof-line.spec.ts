import { test, expect, type Page } from "@playwright/test";
import { stubSignedIn } from "../helpers";

/**
 * The proof line and the question anchor, on the real page.
 *
 * A key moment on turn 1 draws the engine's line from the client's own
 * Stockfish data as move chips with what each move does, and Play steps the
 * main board through it. A follow-up that cites a line with a token on a
 * line of its own gets the same treatment, and a follow-up whose question
 * named a move moves the board to that move, with a way back.
 *
 * No LLM is reached: the review and the follow-up are stubbed. The engine
 * is NOT blocked — the lines come from it — so the spec waits for the
 * analysis to finish and skips, like the other coach specs, on a machine
 * where it never does.
 */

/** Fixture 07: 8. Nc7+ forks king and rook while Black's queen on c1 is free with 8. Qxc1. */
const PGN = [
  '[White "E2E White"]',
  '[Black "E2E Black"]',
  '[Result "0-1"]',
  "",
  "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Qb6 5. Nf3 Qxb2 6. Na3 Qxa1 7. Nb5 Qxc1 8. Nc7+ Kd8 9. Nxa8 Qxd1+ 10. Kxd1 e5 0-1",
].join("\n");

const REVIEW = [
  "Let's walk through the key moments.",
  "",
  "[INSIGHT:8:w:blunder:+2.84:-2.11:Nc7+:Qxc1]",
  "You spotted a fork — but there was something even bigger hiding in plain sight.",
  "[WHY]",
  "Idea: You saw the knight fork on c7 hitting the king and the rook on a8.",
  "Problem: The queen on c1 was hanging with no defenders, and 8. Qxc1 simply takes it.",
  "Solution: 8. Qxc1 takes the queen immediately, and after Rb8 9. Qf4 you are a full queen ahead.",
  "Outcome: The fork was real, but the free queen was bigger.",
  "The takeaway: collect the most valuable free piece before you start a combination.",
  "[CONTINUATION:8:w]",
  "[MAIA_CONTINUATION:8:w]",
  "[/WHY]",
  "[CONCEPT:hangingPiece:Hanging Piece Awareness]",
  "When an enemy piece has no defenders, take it before anything else.",
  "[/CONCEPT]",
  "[/INSIGHT]",
].join("\n");

const FOLLOWUP = [
  "You saw the fork, and forks are worth seeing. But 7... Qxc1 left Black's queen with no defender, so 8. Qxc1 wins a queen outright, while the fork hands Black a check that wins yours back.",
  "",
  "[CONTINUATION:8:w]",
  "[PLAYED:8:w]",
  "",
  "Lesson: a forcing move is only as good as what it leaves behind. Before a check or a fork, list every capture your opponent has in reply.",
  "",
  "Your turn: after 8. Nc7+ Kd8 9. Nxa8, which check does Black have?",
].join("\n");

async function stubCoach(page: Page) {
  await stubSignedIn(page);
  // The recommendations card fetches puzzles after a review; without Neo4j
  // that is a 503, which is fine in production but paints the dev overlay
  // over the page. An empty answer keeps the spec about the coach panel.
  await page.route("**/api/mistake-puzzles", (r) =>
    r.fulfill({ json: { puzzles: [], recommendations: [] } }),
  );
  await page.route("**/api/enhanced-analysis", async (route) => {
    const body =
      `data: ${JSON.stringify({ type: "text", delta: REVIEW })}\n\n` +
      `data: ${JSON.stringify({ type: "done", metadata: { contextId: "e2e-proof-1" } })}\n\n`;
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
          followUpPrompt: "1.0",
          validationScore: 1,
          cached: false,
          fastPath: true,
        },
      }),
    });
  });
}

test.describe("coach proof lines", () => {
  test("a key moment draws the engine's line, plays it on the board, and a follow-up moves the board to the move it names", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await stubCoach(page);
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);

    // The composer unlocks only once Stockfish has evaluated the game —
    // which is also when the proof lines have data to draw from.
    const composer = page.getByPlaceholder("Ask anything about this position...");
    const ready = await composer
      .waitFor({ state: "visible", timeout: 180_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!ready, "Stockfish never finished on this machine — the line helpers are unit-tested");

    await composer.fill("analyse this game");
    await composer.press("Enter");

    // The card leads with the proof: the engine's line, with captions and a ledger.
    const cardLine = page.getByTestId("insight-engine-line").first();
    await expect(cardLine).toBeVisible({ timeout: 30_000 });
    const plies = cardLine.getByTestId("insight-engine-line-ply");
    expect(await plies.count()).toBeGreaterThanOrEqual(2);
    await expect(plies.first()).toContainText("8.Qxc1");
    await expect(plies.first()).toContainText("queen");
    await expect(page.getByTestId("insight-engine-line-ledger").first()).toContainText(/queen up/);
    // One line, not the old pair of identical "Engine line" / "Maia line" boxes.
    await expect(page.getByText("Maia line")).toHaveCount(0);
    // The card teaches at a glance: the intent and the problem above the
    // line, the lesson under it; the solution and the outcome wait behind
    // "Full explanation".
    await expect(page.getByTestId("insight-lead")).toContainText("You saw the knight fork");
    await expect(page.getByTestId("insight-lead")).toContainText("The queen on c1 was hanging");
    await expect(page.getByTestId("insight-lesson")).toContainText("collect the most valuable free piece");
    await expect(page.getByTestId("insight-lesson")).not.toContainText("The takeaway");
    await expect(page.getByText("takes the queen immediately")).toHaveCount(0);
    await page.getByText("Full explanation").click();
    await expect(page.getByText("takes the queen immediately")).toBeVisible();
    await expect(page.getByText("The fork was real, but the free queen was bigger.")).toBeVisible();

    // Play: the board branches off the mainline at the move and shows the line.
    await page.getByTestId("insight-engine-line-play").first().click();
    await expect(page.getByText("Exploring").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("exploration-path")).toContainText("Qxc1");
    await expect(page.getByText(/Back to move 7/)).toBeVisible();
    // Typing stops the line and leaves the board alone. (focus, not click:
    // the dev overlay of `next dev` sits over the composer and blocks a
    // click, and a production build has no overlay to worry about.)
    await composer.focus();

    // A follow-up that names a move: the answer's lines are drawn, and the
    // board goes to the move with a way back.
    await composer.fill("Why was 8. Nc7+ a mistake?");
    await composer.press("Enter");
    const banner = page.getByTestId("coach-jump-banner");
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner).toContainText("8. Nc7+");
    await expect(page.getByTestId("proof-line")).toHaveCount(2, { timeout: 10_000 });
    await expect(page.getByText("In the game")).toBeVisible();
    // The teaching notes wear their eyebrows.
    await expect(page.getByTestId("coach-note-lesson")).toContainText("list every capture your opponent has in reply");
    await expect(page.getByTestId("coach-note-lesson")).not.toContainText("Lesson:");
    await expect(page.getByTestId("coach-note-your-turn")).toContainText("which check does Black have");

    // The way back.
    await banner.getByRole("button", { name: /Back to/ }).click();
    await expect(banner).toHaveCount(0);
  });
});
