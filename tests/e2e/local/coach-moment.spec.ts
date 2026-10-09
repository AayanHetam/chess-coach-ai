import { test, expect, type Page } from "@playwright/test";
import { stubMaiaHealthy, stubSignedIn } from "../helpers";

/**
 * A follow-up answered in fields, drawn from them (pathway 3.3, behind
 * NEXT_PUBLIC_COACH_FOLLOWUP_MOMENTS, on in the CI legs).
 *
 * Under COACH_FOLLOWUP_PROMPT=fielded the chat route sends the answer's
 * fields beside its text. The page draws them: the idea and what happens
 * as two lines, the proof through the line renderer, the lesson and the
 * question as notes, and where it has no line to draw for the proof, the
 * app's one clause in its place rather than nothing. The text stays the
 * message's content, so the history the next question carries is the
 * text, and fields that are not the text are never drawn.
 *
 * No engine and no LLM: the review and the follow-ups are stubbed, and
 * the engine worker is blocked, so the engine's line has nothing to be
 * drawn from and the game's own line does.
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
  "[/INSIGHT]",
].join("\n");

const IDEA_A =
  "You went for the check because a knight that hits the king and the rook looks like it wins material.";
const HAPPENS_A =
  "The queen on c1 was already hanging, and after the king steps aside the knight is the piece that is lost.";
/** The fields of the first answer, as the route sends them. */
const MOMENT_A = {
  idea: IDEA_A,
  happens: HAPPENS_A,
  proof: { kind: "engine", moveNumber: 8, color: "w" },
  lesson: {
    pattern: "take what is hanging first",
    check:
      "Before any check or fork, list every capture your opponent has in reply.",
  },
  question: "Black has just played 7... Qxc1: which of your pieces can take it",
  more: null,
  omitted: [],
};
/** Their projection: the answer's text, word for word (momentToText). */
const TEXT_A = [
  `${IDEA_A} ${HAPPENS_A}`,
  "[CONTINUATION:8:w]",
  "Lesson: take what is hanging first. Before any check or fork, list every capture your opponent has in reply.",
  "Your turn: Black has just played 7... Qxc1: which of your pieces can take it?",
].join("\n\n");

const IDEA_B = "The check looked forcing, so it felt like the safe choice.";
const CLAUSE_HAPPENS =
  "What follows from it I can't confirm from the lines I have.";
/** The second: what happens removed by the checks, the game's own line as proof. */
const MOMENT_B = {
  idea: IDEA_B,
  happens: null,
  proof: { kind: "played", moveNumber: 8, color: "w" },
  lesson: null,
  question: null,
  more: null,
  omitted: ["happens"],
};
const TEXT_B = `${IDEA_B} ${CLAUSE_HAPPENS}\n\n[PLAYED:8:w]`;

/** The third: fields that are not the text served (a sentence dropped after). */
const TEXT_C = "The fork cost you the queen you could have taken.";

const CLAUSE_PROOF = "I don't have a line I can stand behind here.";

async function stubCoach(page: Page) {
  await page.route("**/engines/**", (route) => route.abort());
  await stubSignedIn(page);
  await stubMaiaHealthy(page);
  await page.route("**/api/mistake-puzzles", (r) =>
    r.fulfill({ json: { puzzles: [], recommendations: [] } })
  );
  await page.route("**/api/enhanced-analysis", async (route) => {
    const body =
      `data: ${JSON.stringify({ type: "text", delta: REVIEW })}\n\n` +
      `data: ${JSON.stringify({ type: "done", metadata: { contextId: "e2e-moment-1" } })}\n\n`;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body,
    });
  });
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/chat", async (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? "{}"));
    const n = bodies.length;
    const [analysis, moment] =
      n === 1
        ? [TEXT_A, MOMENT_A]
        : n === 2
          ? [TEXT_B, MOMENT_B]
          : [TEXT_C, MOMENT_B];
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gameAnalysis: {
          analysis,
          moment,
          position: "",
          followUpPrompt: "fielded-1",
          validationScore: 1,
          cached: false,
          fastPath: true,
        },
      }),
    });
  });
  return bodies;
}

test.describe("a follow-up drawn from its fields", () => {
  test("two lines, the proof or the app's clause in its place, the notes, and the text in the history", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const bodies = await stubCoach(page);
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

    // The first answer: two lines, and the engine's line has nothing to be
    // drawn from with the engine blocked, so the app says so in its place.
    await composer.fill("Why was 8. Nc7+ a mistake?");
    await composer.press("Enter");
    const first = page.getByTestId("coach-moment").first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await expect(first.getByTestId("coach-moment-idea")).toHaveText(IDEA_A);
    await expect(first.getByTestId("coach-moment-happens")).toHaveText(
      HAPPENS_A
    );
    await expect(first.getByTestId("coach-moment-proof-absent")).toHaveText(
      CLAUSE_PROOF
    );
    await expect(first.getByTestId("proof-line")).toHaveCount(0);
    // The lesson leads with the pattern's name; neither note wears its label
    // in the text, and no token reaches the reader.
    const lesson = first.getByTestId("coach-note-lesson");
    await expect(lesson).toContainText(
      "Take what is hanging first. Before any check or fork, list every capture your opponent has in reply."
    );
    await expect(
      lesson.getByText("Take what is hanging first.", { exact: true })
    ).toHaveCSS("font-weight", "700");
    await expect(lesson).not.toContainText("Lesson:");
    await expect(first.getByTestId("coach-note-your-turn")).toContainText(
      "which of your pieces can take it?"
    );
    await expect(first).not.toContainText("[CONTINUATION");
    await expect(first).not.toContainText("Your turn:");

    // The second: a removed field is the app's clause in its place, in the
    // quieter colour, and the game's own line is drawn from the moves alone.
    await composer.fill("And what did the check actually do?");
    await composer.press("Enter");
    const second = page.getByTestId("coach-moment").nth(1);
    await expect(second).toBeVisible({ timeout: 30_000 });
    await expect(second.getByTestId("coach-moment-idea")).toHaveText(IDEA_B);
    const absent = second.getByTestId("coach-moment-happens");
    await expect(absent).toHaveText(CLAUSE_HAPPENS);
    await expect(absent).toHaveAttribute("data-absent", "true");
    await expect(second.getByTestId("proof-line")).toHaveCount(1);
    await expect(second.getByTestId("coach-moment-proof-absent")).toHaveCount(
      0
    );
    await expect(second.getByTestId("coach-note-lesson")).toHaveCount(0);

    // What the second question carried: the first answer's text, never its
    // fields.
    const history = bodies[1].conversationHistory as {
      role: string;
      content: string;
    }[];
    expect(history.at(-1)).toEqual({ role: "assistant", content: TEXT_A });
    expect(JSON.stringify(bodies[1])).not.toContain('"moment"');

    // The third: fields that are not the text served are not drawn; the
    // answer is its text.
    await composer.fill("So the fork was a mistake?");
    await composer.press("Enter");
    await expect(page.getByText(TEXT_C)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("coach-moment")).toHaveCount(2);
  });
});
