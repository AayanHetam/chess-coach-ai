import { test, expect, type Page } from "@playwright/test";
import { stubMaiaHealthy, stubSignedIn } from "../helpers";

/**
 * The Masters tab on /analysis — three things a user sees that no unit
 * test can.
 *
 *  - Past the book, the tab SAYS so. It used to read "Master DB unavailable
 *    on this network", in production, for what was simply the end of the
 *    book: the route answered 502 for "nobody knows this position", the same
 *    status as chessdb being unreachable. The route's side of that (200 with
 *    no rows, 502 only for an outage) is pinned by its own unit test, since
 *    chessdb.cn is a live dependency; this spec pins what the panel makes of
 *    that answer.
 *  - Between a click and the answer the list is empty. It used to keep the
 *    previous position's rows on screen (one of them wearing the new ply's
 *    PLAYED badge) and hand them to the board as arrows.
 *  - Sending a line to the coach shows the coach. The reply used to stream
 *    into the hidden Coach tab, so the button visibly did nothing.
 */

// 1.e4 c5 2.Nf3 — well inside the shipped tree, so the route answers from
// the file and the test needs no network.
const IN_BOOK =
  "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";

async function acceptConsent(page: Page) {
  await page
    .context()
    .addCookies([
      { name: "cm_consent", value: "accepted", domain: "127.0.0.1", path: "/" },
    ]);
}

async function openMastersTab(page: Page, fen: string) {
  await page.goto("/analysis?fen=" + encodeURIComponent(fen));
  await page.getByText("Masters", { exact: true }).click({ timeout: 20_000 });
  return page.getByTestId("master-games-panel");
}

test("past the book the tab says so, not that the database is down", async ({
  page,
}) => {
  await acceptConsent(page);
  await stubMaiaHealthy(page);
  // The route's out-of-book answer (its own unit test pins that shape).
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
  const panel = await openMastersTab(
    page,
    "3r2k1/1p3pp1/p1n1b2p/4p3/2P1P3/1P2BN1P/P4PP1/3R2K1 w - - 3 27"
  );

  await expect(panel.getByText(/Out of master-game book/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(panel.getByText(/unavailable|unreachable/)).toHaveCount(0);
  await expect(panel.getByTestId("master-candidate")).toHaveCount(0);
  // The header still says which position this is, from the FEN itself.
  await expect(panel.getByTestId("master-games-subtitle")).toHaveText(
    "Move 27 · White to move"
  );
  // And the footer names what was searched.
  await expect(panel.getByText(/3\.4M games · Lichess Elite/)).toBeVisible();
});

test("a click shows the new position's rows and never the old position's", async ({
  page,
}) => {
  await acceptConsent(page);
  await stubMaiaHealthy(page);
  // Hold the SECOND answer back so the gap between the click and the answer
  // is wide enough to look into.
  let answers = 0;
  await page.route("**/api/opening-explorer**", async (r) => {
    answers += 1;
    if (answers > 1) await new Promise((done) => setTimeout(done, 1_500));
    await r.continue();
  });
  const panel = await openMastersTab(page, IN_BOOK);
  const rows = panel.getByTestId("master-candidate");

  // Black to move after 1.e4 c5 2.Nf3: d6, Nc6 and e6 are the book.
  const d6 = rows.filter({ hasText: /^d6/ });
  await expect(d6).toBeVisible({ timeout: 15_000 });
  // The header names the opening, the summary counts the games that got
  // here, and every master row carries a result bar with the split in its
  // accessible name.
  await expect(panel.getByTestId("master-games-subtitle")).toContainText(
    /Sicilian/
  );
  await expect(panel.getByTestId("master-games-summary")).toContainText(
    /games reached this position/
  );
  await expect(
    d6.getByRole("img", {
      name: /White wins \d+% · Draws \d+% · Black wins \d+%/,
    })
  ).toBeVisible();
  await d6.click();

  // The board has left the mainline and says so.
  await expect(page.getByText("Exploring", { exact: true })).toBeVisible();
  // While the answer is held back: no rows, and the loading copy — not
  // d6 / Nc6 / e6 pretending to be White's replies.
  await expect(panel.getByText("Querying master database…")).toBeVisible();
  await expect(rows).toHaveCount(0);
  // Then White's replies to 2...d6, of which 3.d4 is the book move.
  await expect(rows.filter({ hasText: /^d4/ })).toBeVisible({
    timeout: 15_000,
  });
  await expect(rows.filter({ hasText: /^d6/ })).toHaveCount(0);
});

test("sending a line to the coach shows the coach", async ({ page }) => {
  await acceptConsent(page);
  await stubMaiaHealthy(page);
  await stubSignedIn(page);
  // Never reach the model: the assertion is about the tab, not the answer.
  await page.route("**/api/chat", (r) => r.fulfill({ status: 503, body: "" }));
  const panel = await openMastersTab(page, IN_BOOK);
  const d6 = panel.getByTestId("master-candidate").filter({ hasText: /^d6/ });
  await expect(d6).toBeVisible({ timeout: 15_000 });

  await d6.getByRole("button", { name: /ask masti about d6/i }).click();

  // The Coach tab is up, carrying the question that was just sent.
  await expect(
    page.getByText(/Tell me about d6 from this position/)
  ).toBeVisible({ timeout: 10_000 });
  await expect(panel).toHaveCount(0);
});

test("off the tree the rows are engine picks and say so", async ({ page }) => {
  await acceptConsent(page);
  await stubMaiaHealthy(page);
  // The route's chessdb answer (its unit test pins the side flip); Black to
  // move, so these evals are already White's.
  await page.route("**/api/opening-explorer**", (r) =>
    r.fulfill({
      json: {
        source: "chessdb",
        hasGameCounts: false,
        moves: [
          { uci: "d8f6", eval: -4, rank: 2, winrate: 49.7 },
          { uci: "g8f6", eval: 0, rank: 1, winrate: 50 },
          { uci: "d8e7", eval: 27, rank: 0, winrate: 52.04 },
        ],
        corpus: {
          games: 3_439_091,
          positions: 99_836,
          maxPlies: 24,
          minGames: 50,
          source: "Lichess Elite",
          generatedAt: "2026-08-24",
        },
      },
    })
  );
  const panel = await openMastersTab(
    page,
    // 1.e4 e5 2.Nf3 Nc6 3.Bc4 ... no: the Scholar's-mate try, Black to move.
    "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3"
  );
  await expect(panel.getByText("Engine analysis", { exact: true })).toBeVisible(
    {
      timeout: 15_000,
    }
  );
  await expect(panel.getByTestId("master-games-engine-notice")).toBeVisible();
  const rows = panel.getByTestId("master-candidate");
  await expect(rows).toHaveCount(3);
  // SAN is derived from the position; the eval is White's; the best row for
  // the mover (Black) is the LOWEST eval and reads "best", the rest a loss.
  await expect(rows.nth(0)).toContainText("Qf6");
  await expect(rows.nth(0)).toContainText("-0.04");
  await expect(rows.nth(0)).toContainText("best");
  await expect(rows.nth(0)).toContainText("Top choice");
  await expect(rows.nth(2)).toContainText("Qe7");
  await expect(rows.nth(2)).toContainText("−0.31");
  await expect(rows.nth(2)).toContainText("Inferior");
  await expect(panel.getByTestId("master-games-summary")).toHaveCount(0);
});

test("arrow keys drive the Masters tab: → plays the selection, ↑↓ move it, ← steps back", async ({
  page,
}) => {
  await acceptConsent(page);
  await stubMaiaHealthy(page);
  const panel = await openMastersTab(page, IN_BOOK);
  const rows = panel.getByTestId("master-candidate");
  const selected = panel.locator('[data-kb-selected="true"]');
  const path = page.getByTestId("exploration-path");

  // The most played reply is selected before anything is pressed.
  await expect(rows.first()).toContainText("d6", { timeout: 15_000 });
  await expect(selected).toContainText("d6");

  // → plays it; the board is now off the mainline by one move, and the
  // rows are White's replies to it, with the most played one selected.
  await page.keyboard.press("ArrowRight");
  await expect(path).toHaveText("d6");
  await expect(rows.first()).toContainText("d4", { timeout: 15_000 });
  await expect(selected).toContainText("d4");

  // ↓ moves the selection to the second row, and → plays that one.
  await page.keyboard.press("ArrowDown");
  const secondSan = (await rows.nth(1).getAttribute("aria-label"))!.replace(
    "Preview ",
    ""
  );
  await expect(selected).toContainText(secondSan);
  await page.keyboard.press("ArrowRight");
  await expect(path).toHaveText(`d6 ${secondSan}`);

  // ← takes that move back, and it comes up selected rather than the first
  // row, so ↓ from here reaches its siblings.
  await page.keyboard.press("ArrowLeft");
  await expect(path).toHaveText("d6");
  await expect(selected).toContainText(secondSan, { timeout: 15_000 });

  // ← again takes back the first explored move: the board is on the anchor.
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText("Exploring", { exact: true })).toHaveCount(0);
  await expect(selected).toContainText("d6", { timeout: 15_000 });
});
