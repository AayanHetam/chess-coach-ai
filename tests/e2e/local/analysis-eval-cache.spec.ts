import { test, expect } from "@playwright/test";

/**
 * The session eval cache hands a second game its own sweep, not the first
 * game's.
 *
 * /analysis caches a finished Stockfish sweep in sessionStorage under a key
 * derived from the PGN. For one commit after a new game loads, the page still
 * holds the previous game's eval: the reset effect only schedules the clear,
 * and the save effect used to run in that same commit with the NEW key and
 * the OLD eval. A second game with the same number of plies then found "its"
 * sweep in the cache and restored the first game's evaluations, move
 * classifications and accuracy as its own, with nothing on screen to say so.
 *
 * Real engine, on purpose: the bug lives in the hand-off between two sweeps,
 * and the proof is the second game's own verdict on its own move.
 */

/** Four plies, nothing to see. */
const QUIET = "1. e4 e5 2. Nf3 Nc6 *";
/** Four plies too, and 2. g4 walks into mate. */
const FOOLS_MATE = "1. f3 e5 2. g4 Qh4# 0-1";

const READY =
  "Ok, now ask me anything you want. Do you want me to analyze your game?";

test("a second game of the same length is swept on its own, not read from the first game's cache", async ({
  page,
}) => {
  // Two sweeps plus a cold WASM download in CI.
  test.setTimeout(240_000);

  await page.goto(`/analysis?pgn=${encodeURIComponent(QUIET)}`);
  await expect(page.getByText(READY)).toBeVisible({ timeout: 120_000 });

  // Load the second game into the same mounted page, the way a user pastes
  // one. A full navigation would remount and never hit the race.
  await page.locator("button", { hasText: "Load game" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Load game" });
  await dialog.getByRole("textbox").fill(FOOLS_MATE);
  await dialog.getByRole("button", { name: "Analyze" }).click();

  // A new load starts the transcript over: Masti asks for a second again,
  // and the ready line is spoken once his sweep of THIS game lands. (With
  // the first game's eval restored in its place it lands at once.)
  const waiting = page.getByText(
    "Wait a second, I am going through your game."
  );
  await expect(waiting).toHaveCount(1);
  await expect(page.getByText(READY)).toBeVisible({ timeout: 120_000 });

  // The second game's own sweep classifies 2. g4 as the blunder it is. With
  // the first game's eval restored in its place, g4 wore Nf3's verdict.
  await page.getByText("Moves", { exact: true }).click();
  await expect(page.getByLabel("Blunder · g4")).toBeVisible({
    timeout: 30_000,
  });
});
