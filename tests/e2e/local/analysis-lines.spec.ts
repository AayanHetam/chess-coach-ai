import { test, expect, type Page } from "@playwright/test";

/**
 * The Lines tab on /analysis, for a FEN-only load.
 *
 * Two ends of the same contract:
 *  - a working engine produces REAL lines for `/analysis?fen=` — SAN
 *    variations with an eval and a reached depth. This pins the whole
 *    live-eval path (effect → evaluatePositionWithUpdate → liveEval →
 *    pickDisplayEval → EngineLinesPanel), which until 2026-08-23 had no
 *    automated proof at all — the belief that headless Chromium can't
 *    complete a WASM search kept anyone from writing one.
 *  - a FAILED engine says so. `engine === null` has three faces (booting,
 *    unsupported, create() rejected) and the tab used to render the third
 *    as "Starting Stockfish…" forever — a school filter blocking
 *    /engines/* got a permanent progress message instead of the truth.
 */

const FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3";

async function acceptConsent(page: Page) {
  await page.context().addCookies([
    { name: "cm_consent", value: "accepted", domain: "127.0.0.1", path: "/" },
  ]);
}

async function openLinesTab(page: Page) {
  await page.goto("/analysis?fen=" + encodeURIComponent(FEN));
  // The tab row renders once the page shell mounts; the engine may still be
  // booting behind it, which is exactly what these tests observe.
  await page.getByText("Lines", { exact: true }).click({ timeout: 20_000 });
}

test("a FEN-only load produces real engine lines", async ({ page }) => {
  // Download + boot + search (or a Lichess cloud answer, whichever lands
  // first — both are correct); generous for CI's cold cache.
  test.setTimeout(150_000);
  await acceptConsent(page);
  await openLinesTab(page);

  // Scoped to the panel — the page header carries its own hidden "d16"
  // settings button that a bare depth locator happily matches instead.
  const panel = page.getByTestId("engine-lines-panel");
  // A SAN variation for Black to move: "3...Qf6 4.c3 …".
  await expect(panel.getByText(/\d\.\.\.[A-Za-z]/).first()).toBeVisible({
    timeout: 90_000,
  });
  // Its eval chip ("-0.13" / "0.00" / "+0.35") and the reached depth ("d18").
  await expect(panel.getByText(/^[+-]?\d+\.\d\d$/).first()).toBeVisible();
  await expect(panel.getByText(/^d\d{1,2}$/).first()).toBeVisible();
  // And no failure copy anywhere near it.
  await expect(panel.getByText(/couldn't load/)).toHaveCount(0);
});

test("a blocked engine admits failure instead of starting forever", async ({
  page,
}) => {
  // The nothing-yet-vs-nothing-ever distinction, at the level a user sees.
  // With /engines/* unreachable, create() rejects — the tab must say no
  // lines are coming, not sit on "Starting Stockfish…" indefinitely.
  await page.route("**/engines/**", (route) => route.abort());
  await acceptConsent(page);
  await openLinesTab(page);

  await expect(
    page.getByText("The engine couldn't load, so there are no lines here.")
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Starting Stockfish/)).toHaveCount(0);
});
