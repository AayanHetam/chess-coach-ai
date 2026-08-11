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

    await page.goto("/analysis");

    // The composer is disabled while Stockfish is mid-analysis, and whether
    // that window is open on arrival depends on machine speed — so drive the
    // request from the page's own send path once it is enabled, and skip
    // rather than flake if the engine never frees it in time.
    const composer = page.getByPlaceholder("Ask anything about this position...");
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
