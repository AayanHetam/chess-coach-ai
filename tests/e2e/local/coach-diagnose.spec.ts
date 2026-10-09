import { expect, test, type Page } from "@playwright/test";
import { stubMaiaHealthy, stubSignedIn } from "../helpers";

/**
 * The diagnosing question (pathway 4.6, lib/diagnose and diagnoseAsk.ts):
 * once per game per browser, after the sweep has landed and the side is
 * known, the coach goes back to the player's costliest move and asks what
 * the opponent was threatening there, or, where the reply was quiet, what
 * the plan was. A threat is answered on the board, typed, "no idea" or
 * skipped, and graded on the page: no answer reaches a coach route. A plan
 * goes to the coach as an ordinary follow-up. A key moment of the player's
 * offers the same question ("Why did I play this?").
 *
 * Behind NEXT_PUBLIC_COACH_DIAGNOSE: the CI legs build with it on. A local
 * build without it skips (the composer says which it is), CI never does.
 * The engine runs here, so the spec skips, like the arrival's, on a machine
 * where the sweep never finishes.
 */

/** Fixture 07: 6. Na3 leaves the rook on a1, 7... Qxc1 the queen to 8. Qxc1. */
const PGN = [
  '[White "E2E White"]',
  '[Black "E2E Black"]',
  '[Result "0-1"]',
  "",
  "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Qb6 5. Nf3 Qxb2 6. Na3 Qxa1 7. Nb5 Qxc1 8. Nc7+ Kd8 9. Nxa8 Qxd1+ 10. Kxd1 e5 0-1",
].join("\n");

/** A review with two of White's slips: 6. Na3 and 8. Nc7+. */
const REVIEW = [
  "Two moments decided this one.",
  "",
  "[INSIGHT:6:w:blunder:-1.20:-6.10:Na3:Bxb2]",
  "The queen on b2 was still loose.",
  "[WHY]",
  "Idea: You wanted to bring the knight out.",
  "Problem: The queen on b2 could take the rook on a1.",
  "Solution: 6. Bxb2 takes the queen.",
  "Outcome: White would have been a queen up.",
  "The takeaway: look at what a loose enemy piece can take before you develop.",
  "[/WHY]",
  "[/INSIGHT]",
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
  "[/INSIGHT]",
].join("\n");

/** Black's costliest move in this game, and White's threat after it, as SAN. */
const THREATS: Record<string, string> = {
  "7... Qxc1": "Qxc1",
  "5... Qxb2": "Bxb2",
};

interface Requests {
  chat: Record<string, unknown>[];
  deep: Record<string, unknown>[];
}

async function stubCoach(page: Page): Promise<Requests> {
  const seen: Requests = { chat: [], deep: [] };
  await stubSignedIn(page);
  await stubMaiaHealthy(page);
  await page.route("**/api/mistake-puzzles", (r) =>
    r.fulfill({ json: { puzzles: [], recommendations: [] } })
  );
  await page.route("**/api/enhanced-analysis", async (route) => {
    seen.deep.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body:
        `data: ${JSON.stringify({ type: "text", delta: REVIEW })}\n\n` +
        `data: ${JSON.stringify({ type: "done", metadata: { contextId: "e2e-diagnose-1" } })}\n\n`,
    });
  });
  await page.route("**/api/chat", async (route) => {
    seen.chat.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gameAnalysis: {
          analysis: "The fork was real, but the queen was free.",
          position: "",
          followUpPrompt: "1.3",
          validationScore: 1,
          cached: false,
          fastPath: true,
        },
      }),
    });
  });
  return seen;
}

/** Was this build made with the diagnosing question on? CI must be. */
async function diagnoseOn(page: Page) {
  const on =
    (await page
      .locator("[data-coach-diagnose]")
      .first()
      .getAttribute("data-coach-diagnose")) === "on";
  test.skip(!on && !process.env.CI, "built without NEXT_PUBLIC_COACH_DIAGNOSE");
  expect(on, "the CI legs build with the diagnosing question on").toBe(true);
}

/** The greeting's story line is the sign the sweep has landed. */
async function sweepLands(page: Page) {
  const ready = await page
    .getByText(/The game turned at \d+\.+\S+/)
    .first()
    .waitFor({ state: "visible", timeout: 180_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!ready, "Stockfish never finished on this machine");
}

async function open(page: Page) {
  await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
  await expect(page.locator(".cg-wrap").first()).toBeVisible({
    timeout: 60_000,
  });
  await diagnoseOn(page);
}

const composer = (page: Page) =>
  page.locator("[data-coach-diagnose] textarea").first();

test.describe("the diagnosing question", () => {
  test("as White: the plan goes to the coach, a key moment asks again, and no answer is sent", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const seen = await stubCoach(page);
    await open(page);
    await page.getByTestId("player-side-ask").getByText("White").click();
    await sweepLands(page);

    // 8. Nc7+ turned the game, and its reply (8... Kd8) threatens nothing:
    // the question asks for the plan.
    const controls = page.getByTestId("diagnose-ask");
    await expect(controls).toBeVisible({ timeout: 30_000 });
    await expect(controls).toHaveAttribute("data-variant", "plan");
    await expect(page.locator('[data-diagnose="ask"]')).toContainText(
      "What was your plan with 8. Nc7+?"
    );
    await controls.getByText("Tell Masti").click();
    const box = composer(page);
    await expect(box).toHaveValue("My plan with 8. Nc7+ was ");
    await expect(box).toBeFocused();
    await box.pressSequentially("to fork the king and the rook.");
    await box.press("Enter");

    // An ordinary follow-up: the review is asked for with the plan's words,
    // and nothing of the question is in its history.
    await expect.poll(() => seen.deep.length, { timeout: 15_000 }).toBe(1);
    const sent = seen.deep[0];
    expect(sent.userMessage).toBe(
      "My plan with 8. Nc7+ was to fork the king and the rook."
    );
    expect(JSON.stringify(sent.conversationHistory ?? [])).not.toMatch(
      /Your turn|plan with/
    );
    await expect(controls).toHaveCount(0);

    // One of the two cards offers the question (8. Nc7+ was asked), and
    // it is 6. Na3's: the question it asks names the move.
    const cards = page.getByTestId("key-moments");
    await expect(cards).toBeVisible({ timeout: 15_000 });
    const chips = cards.getByText("Why did I play this?");
    await expect(chips).toHaveCount(1);
    // Asked there, and answered "no idea": graded on the page.
    const before = { chat: seen.chat.length, deep: seen.deep.length };
    await chips.first().click();
    await expect(page.locator('[data-diagnose="ask"]').last()).toContainText(
      "Let's look at 6. Na3."
    );
    await expect(chips).toHaveCount(0);
    await expect(controls).toHaveAttribute("data-variant", "threat");
    await controls.getByText("No idea").click();
    const reply = page.locator('[data-diagnose="reply"]');
    // The move is a link, after its magnifier.
    await expect(reply).toContainText(/The threat was (?:\S+ )?6\.\.\. \S+/);
    await expect(reply.getByTestId("coach-note-lesson")).toBeVisible();
    await expect(page.locator('[data-diagnose="answer"]')).toHaveText(
      "No idea"
    );
    await page.waitForTimeout(500);
    expect(seen.chat.length).toBe(before.chat);
    expect(seen.deep.length).toBe(before.deep);

    // Once per game per browser: the store remembers it, and a reload asks
    // nothing.
    const asked = await page.evaluate(() =>
      window.localStorage.getItem("cm-analysis-diagnosed")
    );
    expect(asked).toContain("E2E White|E2E Black");
    await page.reload();
    await expect(page.locator(".cg-wrap").first()).toBeVisible({
      timeout: 60_000,
    });
    await sweepLands(page);
    await page.waitForTimeout(1_500);
    await expect(page.locator('[data-diagnose="ask"]')).toHaveCount(0);
  });

  test("as Black: a typed answer is graded on the page", async ({ page }) => {
    test.setTimeout(240_000);
    const seen = await stubCoach(page);
    await open(page);
    await page.getByTestId("player-side-ask").getByText("Black").click();
    await sweepLands(page);

    const controls = page.getByTestId("diagnose-ask");
    await expect(controls).toBeVisible({ timeout: 30_000 });
    await expect(controls).toHaveAttribute("data-variant", "threat");
    const m = /After (\d+\.+ \S+), what was White threatening\?/.exec(
      (await page.locator('[data-diagnose="ask"]').textContent()) ?? ""
    );
    expect(m, "the question names the move").not.toBeNull();
    const answer = THREATS[m![1]];
    expect(answer, `a threat for ${m![1]}`).toBeTruthy();

    await controls.getByText("Type it").click();
    await expect(controls).toHaveAttribute("data-mode", "type");
    const box = composer(page);
    await expect(box).toBeFocused();
    await expect(box).toHaveAttribute(
      "placeholder",
      "Type the move you think White wanted"
    );
    await box.fill(answer);
    await box.press("Enter");

    await expect(page.locator('[data-diagnose="answer"]')).toHaveText(answer);
    const reply = page.locator('[data-diagnose="reply"]');
    await expect(reply).toContainText("You saw it");
    await expect(reply.getByTestId("coach-note-lesson")).toBeVisible();
    await expect(controls).toHaveCount(0);
    await expect(box).toHaveValue("");
    await page.waitForTimeout(500);
    expect(seen.chat).toHaveLength(0);
    expect(seen.deep).toHaveLength(0);
  });
});
