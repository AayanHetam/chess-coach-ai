import { test, expect, type Page } from "@playwright/test";
import { Chess } from "chess.js";

/**
 * The opening trainer, played end to end in a real browser.
 *
 * The session rules are unit-tested; what cannot be unit-tested is whether the
 * board, the rail and the panel agree with each other on screen. A trainer that
 * asks for a move the board will not accept is broken in a way no pure test can
 * see.
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

async function stub(page: Page) {
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
          platformRatingPerf: "rapid",
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
  await page.route("**/api/scout", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(archive()) })
  );
  // Flat evaluation: the engine has no complaint, so the trainer has to fall
  // back to master practice for something to drill. That exercises the more
  // interesting of the two paths.
  await page.route("**/lichess.org/api/cloud-eval**", (r) => {
    const fen = decodeURIComponent(new URL(r.request().url()).searchParams.get("fen") ?? "");
    let uci = "e2e4";
    try {
      const board = new Chess(fen);
      const m = board.move(board.moves()[0]);
      if (m) uci = m.from + m.to + (m.promotion ?? "");
    } catch {
      /* default is treated as unusable */
    }
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ depth: 50, pvs: [{ moves: uci, cp: 15 }] }),
    });
  });
}

/**
 * Click-to-move, not dragTo.
 *
 * react-chessboard runs its own drag layer, and Playwright's synthetic dragTo
 * does not drive it. Clicking source then target is a real user path the board
 * supports, and it exercises the same onPieceDrop sink.
 */
async function play(page: Page, from: string, to: string) {
  await page.locator(`[data-square="${from}"]`).first().click();
  await page.locator(`[data-square="${to}"]`).first().click();
  // Let the move animation settle. Clicking into a moving board drops the
  // click, and the resulting failure looks like a logic bug rather than a race.
  await page.waitForTimeout(220);
}

async function measureThenTrain(page: Page) {
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(String(e)));

  await page.goto("/plan");
  await expect(page.getByText("Your weakest line")).toBeVisible({ timeout: 20_000 });
  const consent = page.getByRole("button", { name: "I agree" });
  if (await consent.isVisible().catch(() => false)) await consent.click();

  await page.getByRole("button", { name: /FIND MY WEAKEST LINE/i }).click();
  await expect(page.getByText("1.e4 c5 2.c3").first()).toBeVisible({ timeout: 120_000 });

  await page.getByRole("link", { name: /FIX THIS LINE/i }).click();
  await expect(page).toHaveURL(/\/train\/opening/);
  return crashes;
}


/**
 * One clean pass of 1.e4 ... Nf3 through the drill.
 *
 * Waits for the board to be back at the top of the run first. Clicking while
 * it still shows the previous position selects the wrong squares, and the
 * resulting "Nf3 is the move we are replacing" reads as a grading bug rather
 * than as a test that moved too fast.
 */
async function drillRun(page: Page) {
  await expect(page.getByText(/move 1 of/i)).toBeVisible({ timeout: 15_000 });
  // react-chessboard syncs its internal position from the prop in an effect,
  // so there is a window where the caption already says "move 1" but the board
  // still has no piece on e2. Clicking into it selects nothing and the next
  // click is read as the move, which surfaces as a bogus grading failure.
  await page.waitForTimeout(500);
  await play(page, "e2", "e4");
  await play(page, "g1", "f3");
}

/** Get from the plan into the drill act. */
async function intoDrill(page: Page) {
  await measureThenTrain(page);
  await expect(page.getByText(/Play the move you normally play here/i)).toBeVisible({
    timeout: 30_000,
  });
  await play(page, "c2", "c3");
  await page.getByRole("button", { name: /Drill|Finish/i }).first().click();
  await expect(page.getByText(/Play the line through/i)).toBeVisible({ timeout: 15_000 });
}

test.describe("opening trainer", () => {
  test.beforeEach(async ({ page }) => {
    await stub(page);
  });

  test("confronts, explains, then drills", async ({ page }) => {
    const crashes = await measureThenTrain(page);

    // ACT 1: the panel asks for a move and shows NOTHING else. Showing the
    // answer before the question is the failure this act is designed around.
    await expect(page.getByText(/Play the move you normally play here/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Your record here/i)).toHaveCount(0);
    await expect(page.getByText(/The theory/i)).toHaveCount(0);

    // Play the habit.
    await play(page, "c2", "c3");

    // ACT 2: their own record, and it names the move they just played.
    await expect(page.getByText(/Your record here/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/which is what you play here/i)).toBeVisible();
    await expect(page.getByText(/You score/i).first()).toBeVisible();
    await expect(page.getByText(/30%/).first()).toBeVisible();

    // The theory arrives from the corpus, quoted and credited.
    await expect(page.getByText(/anti-Sicilian/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: /Wikibooks/i }).first()).toBeVisible();

    expect(crashes, `page errors: ${crashes.join("\n")}`).toHaveLength(0);
  });

  test("the rail tracks the act, and the exit always works", async ({ page }) => {
    await measureThenTrain(page);
    await expect(page.getByText(/Play the move you normally play here/i)).toBeVisible({
      timeout: 30_000,
    });

    // One landmark either way: the rail on desktop, the strip on mobile. The
    // full step list only exists on the rail — the strip shows the current act,
    // because three rows in a 375px header is a header that eats the board.
    const nav = page.getByRole("navigation", { name: /Training session/i });
    await expect(nav).toBeVisible();
    await expect(nav.getByText("Play your move")).toBeVisible();

    const wide = (page.viewportSize()?.width ?? 0) >= 900;
    if (wide) await expect(nav.getByText(/See what it costs/i)).toBeVisible();

    // A trainer you cannot leave is a trap.
    await nav.getByRole("button", { name: /Leave the session/i }).click();
    await expect(page).toHaveURL(/\/plan/);
  });

  test("says so plainly when there is no line to train", async ({ page }) => {
    // Straight to the trainer with nothing measured: it must explain, not blank.
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(String(e)));
    await page.goto("/train/opening");
    await expect(page.getByText(/Nothing to train yet/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Back to your plan/i })).toBeVisible();
    expect(crashes, `page errors: ${crashes.join("\n")}`).toHaveLength(0);
  });

  test("a session survives leaving the page", async ({ page }) => {
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(String(e)));

    await intoDrill(page);
    await drillRun(page);
    await expect(page.getByText(/1 clean run banked/i)).toBeVisible({ timeout: 15_000 });

    // Walk away entirely, then come back. Three clean runs is a real ask, and
    // the honest way to make it is to make leaving free.
    await page.goto("/plan");
    await page.goto("/train/opening");

    await expect(page.getByText(/Picked up where you left off/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/1 clean run banked/i)).toBeVisible();
    // And the board is back at the top of the run, ready to play.
    await expect(page.getByText(/Play the line through/i)).toBeVisible();

    expect(crashes, `page errors: ${crashes.join("\n")}`).toHaveLength(0);
  });

  test("start over throws the saved session away", async ({ page }) => {
    await intoDrill(page);
    await drillRun(page);
    await expect(page.getByText(/1 clean run banked/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /Start over/i }).click();

    // Back to the first act, with nothing banked and no resume note.
    await expect(page.getByText(/Play the move you normally play here/i)).toBeVisible();
    await expect(page.getByText(/Picked up where you left off/i)).toHaveCount(0);
    await expect(page.getByText(/1 clean run banked/i)).toHaveCount(0);
  });

  test("finishing marks the line repaired, and the plan says so", async ({ page }) => {
    await intoDrill(page);
    for (let i = 0; i < 3; i++) await drillRun(page);

    await expect(page.getByText(/Repaired/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/three times clean/i)).toBeVisible();

    await page.locator('section[aria-label="Coaching"]').getByRole("button", { name: /Back to your plan/i }).click();
    await expect(page).toHaveURL(/\/plan/);

    // The card must not offer a fresh start for work already done.
    await expect(page.getByRole("link", { name: /TRAIN IT AGAIN/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: /FIX THIS LINE/i })).toHaveCount(0);
  });

  test("Escape leaves without losing the session", async ({ page }) => {
    await intoDrill(page);
    await drillRun(page);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/plan/);

    // Paused, not discarded: the card offers to resume.
    await expect(page.getByRole("link", { name: /RESUME TRAINING/i })).toBeVisible({
      timeout: 30_000,
    });
  });
});
