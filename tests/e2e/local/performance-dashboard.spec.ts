import { test, expect, type Page } from "@playwright/test";
import { horizontalOverflow } from "../helpers";

/**
 * /profile performance dashboard.
 *
 * Two things worth guarding in CI:
 *  - the "last N" windows must collapse identically for a user with less
 *    history than the window asks for, and must actually differ when the data
 *    supports it;
 *  - "Analyze now" must hand a real game to /analysis. That path stages the
 *    PGN in sessionStorage rather than the URL, and the ingest lives in an
 *    8400-line component — exactly the kind of wiring that silently rots.
 */

const STATS_KEY = "chessMastiPuzzleStats";

/** Seed `n` solves, oldest first, with the `failOldest` oldest ones failed. */
function buildStats(n: number, failOldest = 0) {
  const now = Date.now();
  const recentSolves = Array.from({ length: n }, (_, i) => ({
    puzzleId: `p${i}`,
    puzzleRating: 1300,
    solved: i >= failOldest,
    timeMs: 12000,
    theme: "fork",
    timestamp: now - (n - i) * 60_000,
  }));
  const solved = recentSolves.filter((s) => s.solved).length;
  return {
    rating: 1300,
    totalAttempts: n,
    totalSolved: solved,
    totalFailed: n - solved,
    averageTimeMs: 12000,
    currentStreak: 1,
    bestStreak: 3,
    ratingHistory: recentSolves.map((s) => ({
      rating: 1300,
      timestamp: s.timestamp,
    })),
    themeStats: { fork: { attempts: n, solved, avgTimeMs: 12000 } },
    recentSolves,
  };
}

async function gotoWithStats(page: Page, stats: unknown) {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, JSON.stringify(value));
    },
    [STATS_KEY, stats] as const
  );
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Performance" })
  ).toBeVisible();
}

async function selectPuzzleWindow(page: Page, label: string | RegExp) {
  await page.getByLabel("Puzzle window").click();
  await page.getByRole("option", { name: label }).click();
}

/** The "Your last N puzzles…" subtitle, which states the real sample size. */
function puzzleSubtitle(page: Page) {
  return page.getByText(/Your last \d+ puzzles?/);
}

test("every oversized window shows the same numbers as the smallest", async ({
  page,
}) => {
  // 10 solves, asked for 20 / 50 / 100 / 500 / all. The headline requirement:
  // no empty chart, no NaN, no differently-shaped answer.
  await gotoWithStats(page, buildStats(10));

  for (const label of [
    /Last 20 puzzles/,
    /Last 100 puzzles/,
    /Last 500 puzzles/,
    /All puzzles/,
  ]) {
    await selectPuzzleWindow(page, label);
    await expect(puzzleSubtitle(page)).toContainText("Your last 10 puzzles");
    // Accuracy tile stays 100% across every window, and the theme bar keeps
    // its full 10-attempt sample rather than emptying out.
    await expect(page.getByText("10/10 solved")).toBeVisible();
  }

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

test("windows genuinely differ when there is enough history", async ({
  page,
}) => {
  // 25 solves where the 5 oldest failed: last 20 is 100%, all is 80%.
  await gotoWithStats(page, buildStats(25, 5));

  await selectPuzzleWindow(page, /Last 20 puzzles/);
  await expect(puzzleSubtitle(page)).toContainText("Your last 20 puzzles");
  await expect(page.getByText("20/20 solved")).toBeVisible();

  await selectPuzzleWindow(page, /All puzzles/);
  await expect(puzzleSubtitle(page)).toContainText("Your last 25 puzzles");
  await expect(page.getByText("20/25 solved")).toBeVisible();
});

test("a brand-new user gets empty states, not zeroes", async ({ page }) => {
  await gotoWithStats(page, buildStats(0));
  // "0%" would tell someone they failed at something they never attempted.
  await expect(page.getByText(/No puzzles solved yet/)).toBeVisible();
  await expect(page.getByText("no attempts")).toBeVisible();
  await expect(page.getByText("0%")).toHaveCount(0);
});

test("Analyze now hands the real game to /analysis", async ({ page }) => {
  const PGN = [
    '[White "Aayan"]',
    '[Black "Rival"]',
    '[Result "1-0"]',
    "",
    "1. e4 {[%clk 0:09:57.3]} e5 {[%clk 0:09:58.1]} 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0",
  ].join("\n");

  // Stage exactly as the button does, then land where it lands. This covers
  // the ingest side; the button's own staging call is unit-tested.
  await page.addInitScript((pgn) => {
    window.sessionStorage.setItem("cm-analysis-handoff", pgn);
  }, PGN);
  await page.goto("/analysis?handoff=1");

  await expect(page.getByText("Aayan").first()).toBeVisible({ timeout: 30000 });
  // Anchored on the header's "Opening ·" prefix: a bare /Ruy Lopez/ also
  // matches the coach's suggested-prompt chip, which is present regardless of
  // whether a game loaded and would make this assertion meaningless.
  await expect(page.getByText(/Opening · Ruy Lopez/)).toBeVisible();

  // The flag is dropped and the payload consumed, so a refresh cannot reload
  // a game the user has already moved past.
  await expect(page).toHaveURL(/\/analysis$/);
  expect(
    await page.evaluate(() => sessionStorage.getItem("cm-analysis-handoff"))
  ).toBeNull();
});
