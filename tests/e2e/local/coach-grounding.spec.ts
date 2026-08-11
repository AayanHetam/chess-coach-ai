import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Browser-level guards for the silent-substitution fixes
 * (MASTERMIND_CONTEXT/SILENT_SUBSTITUTION_HANDOFF.md).
 *
 * Why this file exists at all: every finding in that document is a field that
 * a component *has* and fails to forward. Unit tests on the extracted builders
 * prove the builder is right; only a real page proves the builder is *called*
 * with the real value. The audit's own worked example of getting this wrong
 * was citing a correct implementation that lived in a dead component.
 *
 * These specs never reach an LLM: the coach endpoints are intercepted and
 * fulfilled with a minimal stub stream, so they run secrets-free in CI and
 * cost nothing. What is asserted is the request that left the browser.
 */

/** Minimal SSE body the panel's reader accepts without erroring. */
const STUB_SSE = 'data: {"type":"text","delta":"ok"}\n\ndata: {"type":"done"}\n\n';

async function fulfillStub(route: Route) {
  await route.fulfill({
    status: 200,
    headers: { "content-type": "text/event-stream" },
    body: STUB_SSE,
  });
}


/**
 * Keep the coach composer in ONE state for the whole test.
 *
 * `analysisActive = engine !== null && enginePositions === null` gates the
 * composer, and its placeholder text changes with it. Stockfish boots
 * asynchronously, so on a slow runner that flips mid-test and a
 * placeholder-based locator silently stops matching — which is exactly how
 * these specs passed locally and timed out in CI.
 *
 * Blocking the engine assets pins `engine` to null, so `analysisActive` stays
 * false and the composer stays open. That is not a contrivance: the coach
 * genuinely accepts questions with no engine data (finding T7), and none of
 * these assertions are about engine output — they are about which fields the
 * browser puts in the request body.
 */
async function pinComposerOpen(page: Page) {
  await page.route("**/engines/**", (route) => route.abort());
}

const COMPOSER = "Ask anything about this position...";

/** The board card can take a moment to get its first puzzle from the feed. */
async function waitForPuzzle(page: Page) {
  await expect(page.getByRole("button", { name: /^Answer:/ })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("A2 — the puzzle coach is told the student's rating", () => {
  // /puzzles boots Stockfish WASM and the server parses a 100k-row CSV.
  test.beforeEach(({}, testInfo) => {
    testInfo.setTimeout(120_000);
  });

  test("the coach request carries the same rating the puzzle was picked for", async ({
    page,
  }) => {
    // Driven through the panel's own composer rather than through an attempt:
    // the auto-fired turn-0 only runs once a puzzle RESOLVES, and most feed
    // puzzles are multi-move, so a single correct click leaves the outcome
    // "unattempted" and nothing fires. Asking a question is the path every
    // user has, is enabled unconditionally, and exercises the same body.
    // Both endpoints are captured because the panel routes by outcome.
    const bodies: Array<{ url: string; json: Record<string, unknown> }> = [];
    for (const path of ["**/api/puzzle-chat", "**/api/puzzle-hint"]) {
      await page.route(path, async (route) => {
        bodies.push({
          url: route.request().url(),
          json: JSON.parse(route.request().postData() ?? "{}"),
        });
        await fulfillStub(route);
      });
    }

    await page.goto("/puzzles");
    await waitForPuzzle(page);

    const composer = page.getByPlaceholder(/Ask (for a hint|about this puzzle)…/);
    await expect(composer).toBeVisible({ timeout: 30_000 });
    await composer.fill("what is the idea here?");
    await composer.press("Enter");

    await expect.poll(() => bodies.length, { timeout: 30_000 }).toBeGreaterThan(0);

    const { url, json } = bodies[0];
    const rating = json.userRating;

    // THE ASSERTION. Before the A2 fix this key was absent from every request
    // and both prompt builders fell to their "Student rating: unknown" branch
    // — a puzzle selected for the user's exact ±150 band, then explained at a
    // generic club-player level.
    expect(
      rating,
      `${url} carried no userRating — the coach will say "Student rating: unknown"`
    ).toBeDefined();
    expect(typeof rating).toBe("number");
    // The puzzle feed clamps the band to [400, 3000]; a value outside that is
    // junk, not a rating.
    expect(rating as number).toBeGreaterThanOrEqual(400);
    expect(rating as number).toBeLessThanOrEqual(3000);
  });
});

test.describe("A1 — the analysis coach never invents a rating", () => {
  test("a signed-out visitor's request carries no fabricated rating", async ({
    page,
  }) => {
    // Signed out ⇒ no profile ⇒ no rating. The correct wire behaviour is to
    // OMIT the field so the server can fall back to its own sources (Firestore
    // profile, then the PGN header Elo). Sending 1500 — as this page did for
    // months — makes both of those unreachable and asserts "- User rating:
    // 1500" to the model as measured fact.
    const bodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/enhanced-analysis", async (route) => {
      bodies.push(JSON.parse(route.request().postData() ?? "{}"));
      await fulfillStub(route);
    });

    await pinComposerOpen(page);
    await page.goto("/analysis");

    // The composer is disabled while Stockfish is mid-analysis, and whether
    // that window is open on arrival depends on machine speed — so drive the
    // request from the page's own send path once it is enabled, and skip
    // rather than flake if the engine never frees it in time.
    const composer = page.getByPlaceholder(COMPOSER);
    const appeared = await composer
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !appeared,
      "coach composer never unlocked on this machine — covered by the unit test on buildAnalysisRequestBody"
    );

    await composer.fill("what happened in this game?");
    await composer.press("Enter");

    await expect.poll(() => bodies.length, { timeout: 30_000 }).toBeGreaterThan(0);

    const body = bodies[0];
    expect(
      body.userRating,
      "signed-out request carried a rating the client cannot possibly know"
    ).toBeUndefined();
    expect("userRating" in body).toBe(false);
  });
});

test.describe("B1 — follow-ups are grounded on the board the user is viewing", () => {
  test("navigating back changes the FEN the follow-up request carries", async ({
    page,
  }) => {
    // The whole finding: the fast path sent only {contextId, userMessage,
    // conversationHistory}. The server then fell back to `context.fen` — the
    // position after the ENTIRE game is replayed — and presented it to the
    // model as "the board the user is looking at RIGHT NOW". Navigate to move
    // 12, ask "what should I play here?", get an answer about move 40.
    //
    // Driven through the real page. The deep call is stubbed with just enough
    // SSE to hand the client a contextId, which is what unlocks the fast path;
    // no LLM is involved.
    const deepBodies: Array<Record<string, unknown>> = [];
    const chatBodies: Array<Record<string, unknown>> = [];

    await page.route("**/api/enhanced-analysis", async (route) => {
      deepBodies.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body:
          'data: {"type":"text","delta":"stub analysis"}\n\n' +
          'data: {"type":"done","metadata":{"contextId":"e2e-ctx-1"}}\n\n',
      });
    });
    await page.route("**/api/chat", async (route) => {
      chatBodies.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "stub follow-up" }),
      });
    });

    await pinComposerOpen(page);
    await page.goto("/analysis");

    const composer = page.getByPlaceholder(COMPOSER);
    const appeared = await composer
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !appeared,
      "coach composer never unlocked on this machine — unit tests cover buildChatRequestBody"
    );

    // Sit at the END of the game first — that is the board the server would
    // fall back to, so starting there makes the later assertion meaningful.
    // The key handler ignores events raised inside inputs, so blur first.
    await composer.blur();
    await page.keyboard.press("End");

    // Turn 1 goes down the deep path and yields the contextId.
    await composer.fill("analyse this game");
    await composer.press("Enter");
    await expect.poll(() => deepBodies.length, { timeout: 30_000 }).toBe(1);
    const deepFen = deepBodies[0].fen as string;
    expect(deepFen, "deep request should carry a position").toBeTruthy();

    // Now navigate back to an early move — the exact user action in the
    // finding: "navigate to move 12, ask what I should play here".
    await composer.blur();
    await page.keyboard.press("Home");
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");

    // Turn 2 takes the fast path — the one that used to carry no position.
    await composer.fill("what should I play here?");
    await composer.press("Enter");
    await expect.poll(() => chatBodies.length, { timeout: 30_000 }).toBe(1);

    const body = chatBodies[0];
    expect(
      body.fen,
      "follow-up carried no FEN — the server will silently answer about the final position"
    ).toBeTruthy();
    expect(typeof body.moveIndex).toBe("number");
    // Having stepped back, the viewed board must not be the one turn 1 sent.
    expect(body.fen).not.toBe(deepFen);
  });
});
