import { test, expect, type Page } from "@playwright/test";
import { Chess } from "chess.js";

/**
 * "Your weakest line" on /plan, driven in a real browser.
 *
 * This card runs the repertoire screen during render and reads localStorage on
 * mount. A throw in either path does not blank the card — it takes the whole
 * /plan page down, and `next build` never exercises it. So the page is loaded
 * for real, with the real card, the real screen, and the real daily planner;
 * only the two network edges are stubbed.
 *
 * The fixture plants a weakness the screen has to actually find: this account
 * collapses specifically after 2.c3, and the sound Sicilian sibling exists so
 * the hole is a real choice rather than a forced continuation the screen would
 * collapse into its parent.
 */

const DAY = 86_400_000;
const ME = "Lazer_Wizard";

function games(moves: string[], n: number, share: number, from: number) {
  const wins = Math.round(n * share);
  return Array.from({ length: n }, (_, i) => ({
    id: `g${from + i}`,
    platform: "chess.com",
    moves,
    numMoves: moves.length,
    whiteUsername: ME,
    blackUsername: "other",
    whiteRating: 1800,
    blackRating: 1800,
    result: i < wins ? "1-0" : "0-1",
    timeControl: "600",
    timeClass: "rapid",
    termination: "resign",
    // Fixed: the index decays games against their newest, so a moving clock
    // would move the weights and make every number here approximate.
    date: Date.UTC(2026, 0, 1) + i * 60_000,
  }));
}

function archive() {
  const all = [
    ...games(["e4", "e5", "Nf3", "Nc6"], 300, 0.5, 0),
    ...games(["e4", "c5", "c3", "Nf6", "e5"], 150, 0.3, 300),
    ...games(["e4", "c5", "Nf3", "d6", "d4"], 100, 0.5, 450),
    ...games(["e4", "e6", "d4", "d5", "exd5", "exd5"], 60, 0.5, 550),
  ];
  return {
    username: ME,
    platform: "chess.com",
    games: all,
    totalGames: all.length,
    dateRange: { from: all[0].date, to: all[all.length - 1].date },
  };
}

async function stubAccount(page: Page) {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: {
        user: {
          uid: "e2e-user",
          email: "e2e@example.com",
          displayName: "E2E",
          handle: "e2e",
          chesscomUsername: ME,
          platformRatingSource: "chesscom",
          platformRating: 1805,
          platformRatingRaw: 1805,
          platformRatingPerf: "rapid",
          // 30-plus, because the theory task only fits once the budget can hold
          // BOTH secondary tasks — at 15 minutes analysis takes the single slot
          // and the card under test would never appear in the list at all.
          dailyTimeCommitment: "30-plus",
          practiceDaysPerWeek: 5,
          onboardingCompletedAt: Date.now() - 30 * DAY,
        },
        isIntern: false,
        isAdmin: false,
      },
    })
  );
  await page.route("**/api/ratings/lookup**", (r) =>
    r.fulfill({ json: { rating: 1805, raw: 1805, perf: "rapid" } })
  );
  await page.route("**/api/ratings/history**", (r) =>
    r.fulfill({ json: { status: "ok", platform: "chesscom", username: ME, windowDays: 365, trends: [] } })
  );
}

async function stubChess(page: Page) {
  await page.route("**/api/scout", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(archive()) })
  );
  // Flat evaluation, so nothing here can pass on an engine edge — the results
  // signal has to carry it. The move must be LEGAL in the position asked about:
  // a constant UCI string is illegal everywhere past the opening move, which
  // silently truncates the engine pass while the test still goes green.
  await page.route("**/lichess.org/api/cloud-eval**", (r) => {
    const fen = decodeURIComponent(new URL(r.request().url()).searchParams.get("fen") ?? "");
    let uci = "e2e4";
    try {
      const board = new Chess(fen);
      const move = board.move(board.moves()[0]);
      if (move) uci = move.from + move.to + (move.promotion ?? "");
    } catch {
      /* fall through; the caller treats the default as unusable */
    }
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ depth: 50, pvs: [{ moves: uci, cp: 15 }] }),
    });
  });
}

async function gotoPlan(page: Page) {
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(String(e)));
  await page.goto("/plan");
  await expect(page.getByText("Your weakest line")).toBeVisible({ timeout: 20_000 });
  const consent = page.getByRole("button", { name: "I agree" });
  if (await consent.isVisible().catch(() => false)) await consent.click();
  return crashes;
}

test.describe("the weakest-line card", () => {
  test.beforeEach(async ({ page }) => {
    await stubAccount(page);
    await stubChess(page);
  });

  test("costs nothing until asked, then names the line and its evidence", async ({ page }) => {
    const crashes = await gotoPlan(page);

    // Opt-in. The run costs an archive fetch and an engine pass, so a page load
    // must not spend either.
    const run = page.getByRole("button", { name: /FIND MY WEAKEST LINE/i });
    await expect(run).toBeVisible();

    // Until it has been measured, the daily task is still the generic one —
    // which now points at our own repertoire rather than off-site.
    await expect(page.getByText("Build your repertoire")).toBeVisible();

    await run.scrollIntoViewIfNeeded();
    await run.click();

    // The measured line, and the evidence it rests on.
    await expect(page.getByText("1.e4 c5 2.c3").first()).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(/You score here/i).first()).toBeVisible();
    await expect(page.getByText(/Your average/i).first()).toBeVisible();
    await expect(page.getByText(/independent lines tested/i).first()).toBeVisible();

    // A flat engine cannot fault the move, so the card must say the position is
    // the problem rather than invent a replacement out of noise.
    await expect(page.getByText(/sound move/i).first()).toBeVisible();

    // And the daily task now names THEIR line instead of the generic one.
    await expect(page.getByText(/Your weakest line: 1\.e4 c5 2\.c3/i).first()).toBeVisible();
    await expect(page.getByText("Build your repertoire")).toHaveCount(0);

    expect(crashes, `page errors: ${crashes.join("\n")}`).toHaveLength(0);
  });

  test("says what master practice does with the same decision", async ({ page }) => {
    await gotoPlan(page);
    await page.getByRole("button", { name: /FIND MY WEAKEST LINE/i }).click();
    await expect(page.getByText("1.e4 c5 2.c3").first()).toBeVisible({ timeout: 120_000 });

    // Not stubbed: this proves /api/master-ideas answers for the position the
    // screen actually landed on, from the real corpus, rather than for a
    // hand-picked FEN.
    await expect(page.getByText(/master games from this position/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("quotes the book, and credits it", async ({ page }) => {
    await gotoPlan(page);
    await page.getByRole("button", { name: /FIND MY WEAKEST LINE/i }).click();
    await expect(page.getByText("1.e4 c5 2.c3").first()).toBeVisible({ timeout: 120_000 });

    // Not stubbed: this proves /api/opening-theory answers for the position the
    // screen actually landed on, from the corpus committed to the repo.
    await expect(page.getByText(/anti-Sicilian/i).first()).toBeVisible({ timeout: 20_000 });

    // Attribution is a LICENCE CONDITION, not decoration. CC BY-SA requires
    // crediting the source with a link to the page the words came from, so the
    // absence of either link is a compliance failure, not a cosmetic one — and
    // the link has to survive URL construction, which is where dots and slashes
    // in "1...c5" get mangled into a 404.
    const source = page.getByRole("link", { name: /Wikibooks/i }).first();
    await expect(source).toBeVisible();
    await expect(source).toHaveAttribute(
      "href",
      "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...c5/2._c3"
    );
    const licence = page.getByRole("link", { name: /CC BY-SA/i }).first();
    await expect(licence).toBeVisible();
    await expect(licence).toHaveAttribute("href", /creativecommons\.org\/licenses\/by-sa/);
  });

  test("says so plainly when there is nothing to report", async ({ page }) => {
    // Same volume of games, every branch at the same score. We looked properly
    // and there is no weakness — which must not read as "we could not measure
    // you", the opposite instruction to the reader.
    await page.route("**/api/scout", (r) => {
      const even = [
        ...games(["e4", "e5", "Nf3", "Nc6"], 300, 0.5, 0),
        ...games(["e4", "c5", "c3", "Nf6"], 150, 0.5, 300),
        ...games(["e4", "c5", "Nf3", "d6"], 100, 0.5, 450),
      ];
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          username: ME,
          platform: "chess.com",
          games: even,
          totalGames: even.length,
          dateRange: { from: even[0].date, to: even[even.length - 1].date },
        }),
      });
    });

    const crashes = await gotoPlan(page);
    await page.getByRole("button", { name: /FIND MY WEAKEST LINE/i }).click();

    await expect(page.getByText(/no line where you score measurably below/i)).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByText(/not enough games/i)).toHaveCount(0);
    // The generic task stays, because nothing was measured to replace it with.
    await expect(page.getByText("Build your repertoire")).toBeVisible();

    expect(crashes, `page errors: ${crashes.join("\n")}`).toHaveLength(0);
  });
});
