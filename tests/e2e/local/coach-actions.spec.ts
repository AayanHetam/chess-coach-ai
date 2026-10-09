import { expect, test, type Page } from "@playwright/test";
import { stubMaiaHealthy, stubSignedIn } from "../helpers";

/**
 * Orders the page carries out itself (lib/coach/pageActions.ts, pathway PR
 * 2.4): "flip the board", "go to move 20", "next move", "back", "play the
 * line again", "I was White". Each is done at once with no request to the
 * coach and acknowledged in one line; "why was move 20 bad?" still reaches
 * the coach, and none of the orders is in the history it is sent.
 *
 * Behind NEXT_PUBLIC_COACH_PAGE_ACTIONS: the CI legs build with it on. A
 * local build without it skips (the page says which it is), CI never does.
 */

/** Fischer v Spassky, 1972, game 6: 41 moves, so move 20 is real (20. e4 d4). */
const LONG_PGN = [
  '[White "E2E White"]',
  '[Black "E2E Black"]',
  '[Result "1-0"]',
  "",
  "1.c4 e6 2.Nf3 d5 3.d4 Nf6 4.Nc3 Be7 5.Bg5 O-O 6.e3 h6 7.Bh4 b6 8.cxd5 Nxd5 9.Bxe7 Qxe7 10.Nxd5 exd5 11.Rc1 Be6 12.Qa4 c5 13.Qa3 Rc8 14.Bb5 a6 15.dxc5 bxc5 16.O-O Ra7 17.Be2 Nd7 18.Nd4 Qf8 19.Nxe6 fxe6 20.e4 d4 21.f4 Qe7 22.e5 Rb8 23.Bc4 Kh8 24.Qh3 Nf8 25.b3 a5 26.f5 exf5 27.Rxf5 Nh7 28.Rcf1 Qd8 29.Qg3 Re7 30.h4 Rbb7 31.e6 Rbc7 32.Qe5 Qe8 33.a4 Qd8 34.R1f2 Qe8 35.R2f3 Qd8 36.Bd3 Qe8 37.Qe4 Nf6 38.Rxf6 gxf6 39.Rxf6 Kg8 40.Bc4 Kh8 41.Qf4 1-0",
].join("\n");

/** One alternative to tap: Black could have taken on e4 instead of pushing past it. */
const LONG_REVIEW =
  "The game turned when Black let the centre close. Instead of 20... d4, taking with 20... dxe4 kept the pieces breathing.";

const CHAT_ANSWER = "The push gave White the e5 square for good.";

/** Fixture 07, for the line the engine draws under a key moment. */
const SHORT_PGN = [
  '[White "E2E White"]',
  '[Black "E2E Black"]',
  '[Result "0-1"]',
  "",
  "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Qb6 5. Nf3 Qxb2 6. Na3 Qxa1 7. Nb5 Qxc1 8. Nc7+ Kd8 9. Nxa8 Qxd1+ 10. Kxd1 e5 0-1",
].join("\n");

const SHORT_REVIEW = [
  "Let's walk through the key moments.",
  "",
  "[INSIGHT:8:w:blunder:+2.84:-2.11:Nc7+:Qxc1]",
  "You spotted a fork, but there was something bigger hiding in plain sight.",
  "[WHY]",
  "Idea: You saw the knight fork on c7 hitting the king and the rook on a8.",
  "Problem: The queen on c1 was hanging with no defenders.",
  "Solution: 8. Qxc1 takes the queen immediately.",
  "Outcome: The fork was real, but the free queen was bigger.",
  "The takeaway: collect the most valuable free piece before you start a combination.",
  "[CONTINUATION:8:w]",
  "[/WHY]",
  "[/INSIGHT]",
].join("\n");

interface Requests {
  chat: Record<string, unknown>[];
  deep: Record<string, unknown>[];
}

async function stubCoach(
  page: Page,
  review: string,
  opts: { blockEngine: boolean }
): Promise<Requests> {
  const seen: Requests = { chat: [], deep: [] };
  if (opts.blockEngine)
    await page.route("**/engines/**", (route) => route.abort());
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
        `data: ${JSON.stringify({ type: "text", delta: review })}\n\n` +
        `data: ${JSON.stringify({ type: "done", metadata: { contextId: "e2e-actions-1" } })}\n\n`,
    });
  });
  await page.route("**/api/chat", async (route) => {
    seen.chat.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gameAnalysis: {
          analysis: CHAT_ANSWER,
          position: "",
          anchor: { ply: 39, moveNumber: 20, color: "w", san: "e4" },
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

/** Was this build made with page actions on? CI must be; a local build may not be. */
async function skipUnlessOn(page: Page) {
  const on =
    (await page
      .locator("[data-page-actions]")
      .first()
      .getAttribute("data-page-actions")) === "on";
  test.skip(
    !on && !process.env.CI,
    "built without NEXT_PUBLIC_COACH_PAGE_ACTIONS=1"
  );
  expect(on, "the CI legs build with page actions on").toBe(true);
}

/** Was this build made with the standing side on (NEXT_PUBLIC_COACH_PERSPECTIVE)? */
async function perspectiveOn(page: Page): Promise<boolean> {
  return (
    (await page
      .locator("[data-coach-perspective]")
      .first()
      .getAttribute("data-coach-perspective")) === "on"
  );
}

async function boardRect(page: Page) {
  return page
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
}

/** The board's box does not move for an order (document coordinates, to the pixel). */
function expectSameRect(
  before: { x: number; y: number; width: number; height: number },
  after: { x: number; y: number; width: number; height: number }
) {
  for (const key of ["x", "y", "width", "height"] as const)
    expect(
      Math.abs(after[key] - before[key]),
      `board ${key}`
    ).toBeLessThanOrEqual(1);
}

/** The words of every message the coach request carried as history. */
function historyText(body: Record<string, unknown>): string {
  const history = (body.conversationHistory ?? []) as { content: string }[];
  return history.map((m) => m.content).join("\n");
}

test.describe("orders the page carries out itself", () => {
  test("happen with no request and one line each, and a question still reaches the coach", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const seen = await stubCoach(page, LONG_REVIEW, { blockEngine: true });
    await page.goto(`/analysis?pgn=${encodeURIComponent(LONG_PGN)}`);
    const composer = page.getByPlaceholder(
      "Ask anything — answering without engine analysis."
    );
    await expect(composer).toBeVisible({ timeout: 60_000 });
    await skipUnlessOn(page);

    const label = page.getByTestId("move-analysis-label");
    const board = page.locator(".cg-wrap").first();
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
      await expect(composer).toHaveValue("");
    };

    // The side is unknown here and no coach context exists yet: "move 20"
    // is White's, as the coach would read it.
    await say("go to move 20", "Here's 20. e4, White's move 20.");
    await expect(label).toHaveText("20. e4");
    await say("next move", "Here's 20... d4.");
    await expect(label).toHaveText("20... d4");
    await say("step forward", "Here's 21. f4.");
    await say("back", "Back to 20... d4.");
    await expect(label).toHaveText("20... d4");
    await say("Flip the board, please", "Flipped. Black is at the bottom.");
    await expect(board).toHaveClass(/orientation-black/);
    await say("go to move 50", "The game ends at 41. Qf4.");
    await expect(label).toHaveText("20... d4");
    await say("go to the end", "Here's the last move, 41. Qf4.");
    await expect(label).toHaveText("41. Qf4");
    // "Back" right after a typed go-to returns to where it was typed.
    await say("back", "Back to 20... d4.");
    await expect(label).toHaveText("20... d4");

    // Not one request for any of it.
    expect(seen.chat).toHaveLength(0);
    expect(seen.deep).toHaveLength(0);
    expectSameRect(rest, await boardRect(page));

    // The review: none of the orders is in what the coach is sent. The
    // board was flipped with the side unknown, so the context is built for
    // Black, and a typed "move 20" now means Black's move 20, as the
    // coach's anchor would read it.
    await composer.fill("analyse this game");
    await composer.press("Enter");
    await expect(page.getByText(/kept the pieces breathing/)).toBeVisible({
      timeout: 30_000,
    });
    expect(seen.deep).toHaveLength(1);
    expect(historyText(seen.deep[0])).not.toMatch(/move 20|Flipped|Here's/);
    await say("go to move 20", "Here's 20... d4, Black's move 20.");
    await expect(label).toHaveText("20... d4");

    // The pathway's regression fixture: a question about move 20 is a
    // question. It reaches the coach, with the orders the page can carry
    // out listed and none of the orders in its history.
    await composer.fill("why was move 20 bad?");
    await composer.press("Enter");
    await expect(page.getByText(CHAT_ANSWER)).toBeVisible({ timeout: 30_000 });
    expect(seen.chat).toHaveLength(1);
    const asked = seen.chat[0];
    expect(asked.userMessage).toBe("why was move 20 bad?");
    expect(asked.pageActions).toEqual(
      expect.arrayContaining(["flip_board", "go_to_move", "back"])
    );
    expect(historyText(asked)).not.toMatch(/go to move|Flipped|Here's|Back to/);
    expect(historyText(asked)).toContain("kept the pieces breathing");

    // The coach's anchor moved the board, with its way back in the strip;
    // "back" is that way back.
    const jump = page.getByTestId("coach-jump-banner");
    await expect(jump).toContainText("20. e4");
    await say("go back", "Back to 20... d4.");
    await expect(jump).toHaveCount(0);
    await expect(label).toHaveText("20... d4");

    // An alternative from the review, explored, then played again by name.
    await page
      .locator('[title="Alternative: dxe4 — shows the position after it"]')
      .first()
      .click();
    await expect(page.getByTestId("exploration-path")).toHaveAttribute(
      "title",
      "dxe4"
    );
    // The move is a link, an alternative with its magnifier.
    await say(
      "play the line again",
      /^Playing the line from \W*20\.\.\. dxe4\.$/
    );
    await expect(page.getByTestId("exploration-path")).toHaveAttribute(
      "title",
      "dxe4"
    );
    await say("previous move", "Back to 20. e4.");
    await expect(page.getByTestId("exploration-path")).toHaveCount(0);
    await expect(label).toHaveText("20. e4");

    // The side, the way the greeting's own ask and chip set it.
    await say("I was white", "Coaching you as White.");
    await expect(page.getByTestId("player-side-chip")).toContainText(
      "Coaching you as White (your choice)"
    );
    await expect(board).toHaveClass(/orientation-white/);
    if (await perspectiveOn(page)) {
      // A wish is a switch of the side the answers are about: the player
      // stays White, and nothing is reviewed again (standingSide.ts).
      await say(
        "coach me as black",
        "Answers are about Black's moves now. You're still White."
      );
      await expect(page.getByTestId("player-side-chip")).toContainText(
        "Coaching you as White"
      );
      await say("back to my side", "Answers are about your moves again.");
    } else {
      await say("coach me as black", "Coaching you as Black now.");
      await expect(page.getByTestId("player-side-chip")).toContainText(
        "Coaching you as Black"
      );
      await say("back to my side", "Coaching you as White again.");
    }
    await expect(board).toHaveClass(/orientation-white/);

    // Still only the two requests the two questions made.
    expect(seen.deep).toHaveLength(1);
    expect(seen.chat).toHaveLength(1);
    expectSameRect(rest, await boardRect(page));
  });

  test("an order the server answered itself is carried out by the page, with its own line", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const seen = await stubCoach(page, LONG_REVIEW, { blockEngine: true });
    await page.goto(`/analysis?pgn=${encodeURIComponent(LONG_PGN)}`);
    const composer = page.getByPlaceholder(
      "Ask anything — answering without engine analysis."
    );
    await expect(composer).toBeVisible({ timeout: 60_000 });
    await skipUnlessOn(page);
    await composer.fill("analyse this game");
    await composer.press("Enter");
    await expect(page.getByText(/kept the pieces breathing/)).toBeVisible({
      timeout: 30_000,
    });

    // A server whose reading is newer than the page's answers a question
    // the page sent as one with an order: the page carries it out and
    // writes its own line, and the question leaves the coach's history.
    await page.route(
      "**/api/chat",
      async (route) => {
        seen.chat.push(route.request().postDataJSON());
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            gameAnalysis: {
              analysis: "",
              served: "page",
              actions: [{ kind: "flip_board" }],
              cached: false,
              fastPath: true,
            },
          }),
        });
      },
      { times: 1 }
    );
    const flipped = page.getByText("Flipped. Black is at the bottom.", {
      exact: true,
    });
    await composer.fill("turn it around for me, masti, would you");
    await composer.press("Enter");
    await expect(flipped).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator(".cg-wrap").first()).toHaveClass(
      /orientation-black/
    );
    expect(seen.chat).toHaveLength(1);

    // The next question goes as usual, without the served one in its history.
    await composer.fill("why was move 20 bad?");
    await composer.press("Enter");
    await expect(page.getByText(CHAT_ANSWER)).toBeVisible({ timeout: 30_000 });
    expect(seen.chat).toHaveLength(2);
    expect(historyText(seen.chat[1])).not.toMatch(/turn it around|Flipped/);
  });

  test("'play the line again' replays the line the reader last played", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const seen = await stubCoach(page, SHORT_REVIEW, { blockEngine: false });
    await page.goto(`/analysis?pgn=${encodeURIComponent(SHORT_PGN)}`);
    // The composer unlocks once Stockfish has evaluated the game, which is
    // when the key moment's line has data to draw from.
    const composer = page.getByPlaceholder(
      "Ask anything about this position..."
    );
    const ready = await composer
      .waitFor({ state: "visible", timeout: 180_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !ready,
      "Stockfish never finished on this machine; the replay target is unit-tested"
    );
    await skipUnlessOn(page);

    await composer.fill("analyse this game");
    await composer.press("Enter");
    const line = page.getByTestId("insight-engine-line").first();
    await expect(line).toBeVisible({ timeout: 30_000 });
    const plies = await line.getByTestId("insight-engine-line-ply").count();
    expect(plies).toBeGreaterThanOrEqual(2);

    // Play it through, then leave it.
    await page.getByTestId("insight-engine-line-play").first().click();
    const path = page.getByTestId("exploration-path");
    await expect
      .poll(
        async () =>
          ((await path.getAttribute("title")) ?? "").split(" ").length,
        {
          timeout: 20_000,
        }
      )
      .toBe(plies);
    await composer.focus();
    await composer.fill("back");
    await composer.press("Enter");
    await expect(path).toHaveCount(0);

    // Typed: the same line plays again on the board, from its first move.
    await composer.fill("play the line again");
    await composer.press("Enter");
    await expect(
      page.getByText(/^Playing the line from \W*8\. Qxc1\.$/)
    ).toBeVisible();
    await expect(path).toBeVisible();
    await expect
      .poll(
        async () =>
          ((await path.getAttribute("title")) ?? "").split(" ").length,
        {
          timeout: 20_000,
        }
      )
      .toBe(plies);
    expect(seen.chat).toHaveLength(0);
    expect(seen.deep).toHaveLength(1);
  });

  test("a switch of the side the answers are about is answered in one message, with no re-review", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const seen = await stubCoach(page, LONG_REVIEW, { blockEngine: true });
    await page.goto(`/analysis?pgn=${encodeURIComponent(LONG_PGN)}`);
    const composer = page.getByPlaceholder(
      "Ask anything — answering without engine analysis."
    );
    await expect(composer).toBeVisible({ timeout: 60_000 });
    await skipUnlessOn(page);
    const on = await perspectiveOn(page);
    test.skip(
      !on && !process.env.CI,
      "built without NEXT_PUBLIC_COACH_PERSPECTIVE=1"
    );
    expect(on, "the CI legs build with the standing side on").toBe(true);
    const say = async (text: string, ack: string) => {
      const lines = page.getByText(ack, { exact: true });
      const before = await lines.count();
      await composer.fill(text);
      await composer.press("Enter");
      await expect(lines).toHaveCount(before + 1, { timeout: 10_000 });
    };
    // A question that reaches the coach, once its answer is on the page.
    const ask = async (text: string, answer = CHAT_ANSWER) => {
      const before = seen.chat.length;
      const answers = page.getByText(answer, { exact: true });
      const shown = await answers.count();
      await composer.fill(text);
      await composer.press("Enter");
      await expect(answers).toHaveCount(shown + 1, { timeout: 30_000 });
      expect(seen.chat).toHaveLength(before + 1);
      return seen.chat[before];
    };

    await say("I was white", "Coaching you as White.");
    await composer.fill("analyse this game");
    await composer.press("Enter");
    await expect(page.getByText(/kept the pieces breathing/)).toBeVisible({
      timeout: 30_000,
    });
    expect(seen.deep).toHaveLength(1);

    // No standing side: nothing extra on the wire.
    expect("perspective" in (await ask("why was move 20 bad?"))).toBe(false);

    // The coach's jump holds the strip: back from it first, so the strip
    // is free to say the switch.
    const leaveJump = async () => {
      const jump = page.getByTestId("coach-jump-banner");
      if (await jump.count())
        await jump.getByRole("button", { name: /Back to/ }).click();
      await expect(jump).toHaveCount(0);
    };
    await leaveJump();

    // The switch: one line, no request, and the next question carries it.
    await say(
      "coach me as black",
      "Answers are about Black's moves now. You're still White."
    );
    await expect(page.getByTestId("standing-strip-state")).toHaveAttribute(
      "data-subject",
      "b"
    );
    expect((await ask("what went wrong?")).perspective).toBe("b");
    // A bare "move 20" is Black's now, for the page as for the coach.
    await say("go to move 20", "Here's 20... d4, Black's move 20.");
    // The way back is sent too: it is the only way the coach hears of it.
    await say("back to my side", "Answers are about your moves again.");
    expect((await ask("and then?")).perspective).toBe("w");

    await leaveJump();
    // The coach reading a question as a view from Black's side switches it
    // the same way, with the strip saying so.
    await page.route(
      "**/api/chat",
      async (route) => {
        seen.chat.push(route.request().postDataJSON());
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            gameAnalysis: {
              analysis: "Black grabbed one pawn too many.",
              position: "",
              followUpPrompt: "1.3",
              perspective: {
                side: "b",
                source: "words",
                rule: "colour_view",
                version: "1",
              },
              validationScore: 1,
              cached: false,
              fastPath: true,
            },
          }),
        });
      },
      { times: 1 }
    );
    await ask(
      "from Black's side, what went wrong?",
      "Black grabbed one pawn too many."
    );
    await expect(page.getByTestId("standing-strip-state")).toHaveAttribute(
      "data-subject",
      "b"
    );
    expect((await ask("tell me more")).perspective).toBe("b");

    // Never a second review.
    expect(seen.deep).toHaveLength(1);
  });
});
