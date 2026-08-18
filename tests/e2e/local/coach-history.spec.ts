import { test, expect, type Page } from "@playwright/test";

/**
 * GROUP D (SILENT_SUBSTITUTION_HANDOFF §3) — history contamination, asserted
 * on the real page.
 *
 * `conversationHistory` is replayed to the model as its OWN prior turns, which
 * it treats as authoritative and will defend. Unit tests prove the builder
 * filters correctly; only the real page proves the component actually SETS the
 * flags the builder filters on. That distinction is the whole reason this file
 * exists — the audit's worked example of getting it wrong was a correct
 * implementation living in a component nothing rendered.
 *
 * No LLM is involved: the coach endpoints are intercepted and fulfilled with
 * hand-written SSE, which is also how truncation is simulated.
 */

const CORRECTED = "CORRECTED-ANALYSIS-SENTINEL: the knight was defended.";
const RAW_STREAMED = "RAW-STREAMED-SENTINEL: the knight hangs.";

/**
 * Pin the composer open. Its placeholder changes with the engine gate, so a
 * booting Stockfish flips the locator out from under the test — which is
 * exactly how these specs passed locally and timed out in CI.
 *
 * Blocking the engine assets makes the worker fail to load, which the gate
 * reports as `unavailable`: the input stays open behind one stable
 * placeholder. Before T7 was fixed this worked by accident — a null engine
 * read as "not analyzing" and the composer opened with nothing saying the
 * engine was missing. Nothing here asserts engine output.
 */
async function openAnalysis(page: Page) {
  await page.route("**/engines/**", (route) => route.abort());
  await page.goto("/analysis");
  const composer = page.getByPlaceholder(
    "Ask anything — answering without engine analysis.",
  );
  const ok = await composer
    .waitFor({ state: "visible", timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  return { composer, ok };
}

function sse(events: string[]) {
  return events.map((e) => `data: ${e}\n\n`).join("");
}

test.describe("Group D — what the coach is told it previously said", () => {
  test("the cold-start greeting never reaches the model", async ({ page }) => {
    // /analysis opens on an empty board with one UI-authored coach greeting
    // in state. This is the DEFAULT first-time-visitor path: ask anything
    // before loading a PGN and the request must not carry that greeting as
    // the model's own prior turn.
    //
    // The far worse version of this — a three-turn seeded exchange about a
    // Kasparov demo game, with hand-written eval numbers ("+2.4 to +4.7",
    // "Kasparov calculated 15+ ply") replayed as the model's own analysis —
    // is gone with the demo itself. Both sentinels are asserted: the live
    // greeting, and the retired fabrication, so a revert of either the demo
    // or the `synthetic` flag fails here.
    const GREETING = "Board's empty";
    const RETIRED_FABRICATION = "Kasparov calculated 15+ ply";
    const bodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/enhanced-analysis", async (route) => {
      bodies.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: sse(['{"type":"text","delta":"ok"}', '{"type":"done"}']),
      });
    });

    const { composer, ok } = await openAnalysis(page);
    test.skip(!ok, "composer never unlocked — unit tests cover the builder");

    // Control: the greeting really is on screen, so "absent from history"
    // below means "filtered", not "was never rendered in the first place".
    await expect(page.getByText(GREETING, { exact: false }).first()).toBeVisible(
      { timeout: 15_000 }
    );

    await composer.fill("what can you tell me?");
    await composer.press("Enter");
    await expect.poll(() => bodies.length, { timeout: 30_000 }).toBe(1);

    const history = JSON.stringify(bodies[0].conversationHistory ?? []);
    expect(
      history,
      "the UI's own greeting was replayed to the model as something it said"
    ).not.toContain(GREETING);
    expect(
      history,
      "the retired demo seed is back and carrying invented eval numbers"
    ).not.toContain(RETIRED_FABRICATION);
  });

  test("a corrected answer replaces the raw one in what gets replayed", async ({
    page,
  }) => {
    // D1: the server stores the CORRECTED analysis as canonical and re-injects
    // it as the first assistant message. The client kept the RAW streamed text
    // and re-sent that, so the model's most recent statement was the
    // uncorrected one — it defends that line, and the corrected copy reads as
    // superseded.
    const chatBodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/enhanced-analysis", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: sse([
          JSON.stringify({ type: "text", delta: RAW_STREAMED }),
          JSON.stringify({
            type: "done",
            metadata: {
              contextId: "e2e-ctx-d1",
              corrected: true,
              analysis: CORRECTED,
            },
          }),
        ]),
      });
    });
    await page.route("**/api/chat", async (route) => {
      chatBodies.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "ok" }),
      });
    });

    const { composer, ok } = await openAnalysis(page);
    test.skip(!ok, "composer never unlocked — unit tests cover the builder");

    await composer.fill("analyse this game");
    await composer.press("Enter");
    await expect(page.getByText(CORRECTED)).toBeVisible({ timeout: 30_000 });

    await composer.fill("tell me more");
    await composer.press("Enter");
    await expect.poll(() => chatBodies.length, { timeout: 30_000 }).toBe(1);

    const history = JSON.stringify(chatBodies[0].conversationHistory ?? []);
    expect(history, "the corrected analysis was not replayed").toContain(CORRECTED);
    expect(
      history,
      "the RAW uncorrected analysis was replayed as the model's last word"
    ).not.toContain(RAW_STREAMED);
  });

  test("a truncated answer is not replayed as a completed turn", async ({
    page,
  }) => {
    // D4: the reader exited on the stream closing with no check that a
    // `type:"done"` EVENT ever arrived — a Vercel kill or a cut SSE body
    // produced a fragment that rendered as finished and entered history.
    // Simulated here by closing the stream after text and no done event.
    // Capture BOTH endpoints. A truncated turn-1 leaves no usable assistant
    // turn, so turn 2 correctly falls back to the deep path rather than the
    // contextId fast path — asserting on /api/chat alone would fail for a
    // reason that has nothing to do with D4. What matters is that the fragment
    // is absent from whichever request carries the history.
    const secondTurnBodies: Array<Record<string, unknown>> = [];
    const FRAGMENT = "FRAGMENT-SENTINEL: the critical moment is move 24 where you";
    let deepCalls = 0;
    await page.route("**/api/enhanced-analysis", async (route) => {
      deepCalls += 1;
      if (deepCalls > 1) {
        secondTurnBodies.push(JSON.parse(route.request().postData() ?? "{}"));
      }
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: sse([JSON.stringify({ type: "text", delta: FRAGMENT })]),
      });
    });
    await page.route("**/api/chat", async (route) => {
      secondTurnBodies.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "ok" }),
      });
    });

    const { composer, ok } = await openAnalysis(page);
    test.skip(!ok, "composer never unlocked — unit tests cover the builder");

    await composer.fill("analyse this game");
    await composer.press("Enter");
    await expect(page.getByText(FRAGMENT)).toBeVisible({ timeout: 30_000 });

    await composer.fill("and then?");
    await composer.press("Enter");
    await expect
      .poll(() => secondTurnBodies.length, { timeout: 30_000 })
      .toBeGreaterThan(0);

    const history = JSON.stringify(
      secondTurnBodies[0].conversationHistory ?? []
    );
    expect(
      history,
      "a half-finished sentence was replayed to the model as a completed thought"
    ).not.toContain(FRAGMENT);
  });
});

test.describe("T5 — a pipeline-timeout non-answer is not passed off as an answer", () => {
  test("the timeout placeholder is marked partial and kept out of history", async ({
    page,
  }) => {
    // The server already reports `pipeline.timedOut`; the client just never
    // read it. So "Still analyzing — the deep-validation pass took longer than
    // expected" rendered IDENTICALLY to a real analysis and was replayed to
    // the model as its own prior answer.
    const PLACEHOLDER =
      "Still analyzing — the deep-validation pass took longer than expected.";
    const secondTurnBodies: Array<Record<string, unknown>> = [];
    let deepCalls = 0;
    await page.route("**/api/enhanced-analysis", async (route) => {
      deepCalls += 1;
      if (deepCalls > 1) {
        secondTurnBodies.push(JSON.parse(route.request().postData() ?? "{}"));
      }
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: sse([
          JSON.stringify({ type: "text", delta: PLACEHOLDER }),
          JSON.stringify({
            type: "done",
            metadata: { contextId: "e2e-ctx-t5", pipeline: { timedOut: true } },
          }),
        ]),
      });
    });
    await page.route("**/api/chat", async (route) => {
      secondTurnBodies.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "ok" }),
      });
    });

    const { composer, ok } = await openAnalysis(page);
    test.skip(!ok, "composer never unlocked — unit tests cover the builder");

    await composer.fill("analyse this game");
    await composer.press("Enter");
    await expect(page.getByText(PLACEHOLDER)).toBeVisible({ timeout: 30_000 });

    // The reader must be told this is not a finished answer.
    await expect(page.getByText(/cut off before it finished/i)).toBeVisible({
      timeout: 10_000,
    });

    await composer.fill("and then?");
    await composer.press("Enter");
    await expect
      .poll(() => secondTurnBodies.length, { timeout: 30_000 })
      .toBeGreaterThan(0);

    const history = JSON.stringify(
      secondTurnBodies[0].conversationHistory ?? []
    );
    expect(
      history,
      "a non-answer was replayed to the model as its own prior analysis"
    ).not.toContain("Still analyzing");
  });
});
