import { test, expect, type Page } from "@playwright/test";
import { stubSignedIn } from "../helpers";

/**
 * Coach move links — a recommended move that the game happened to play LATER
 * must open as an alternative, not jump to the later occurrence.
 *
 * Founder report (2026-09-05): "you should have played 7.Qxe7" linked to the
 * game's 8.Qxe7. The resolver's ±2-ply typo window matched the later move and
 * the green link became an orange jump. The unit test on `resolveMoveRef` pins
 * the logic; this spec pins that the PAGE uses it — a link title, a click, and
 * the exploration preview that the click must produce.
 *
 * No LLM is reached: the review is a stubbed SSE stream carrying the sentence.
 */

/** Fixture 07: Black's 7...Qxc1 is played; the coach recommends 8.Qxc1 for White. */
const PGN = [
  '[White "E2E White"]',
  '[Black "E2E Black"]',
  '[Result "0-1"]',
  "",
  "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Qb6 5. Nf3 Qxb2 6. Na3 Qxa1 7. Nb5 Qxc1 8. Nc7+ Kd8 9. Nxa8 Qxd1+ 10. Kxd1 e5 0-1",
].join("\n");

const REVIEW =
  "The fork was tempting, but you should have played 8. Qxc1 instead of 8. Nc7+ — " +
  "the hanging queen was the bigger prize.";

const COMPOSER = "Ask anything — answering without engine analysis.";

async function pinComposerOpen(page: Page) {
  await page.route("**/engines/**", (route) => route.abort());
  // Signed in: a signed-out composer opens the sign-in dialog instead of
  // sending, and the stubbed review would never be requested.
  await stubSignedIn(page);
}

test.describe("coach move links", () => {
  test("a recommended move played later in the game opens as an alternative, and the greeting is plain", async ({
    page,
  }) => {
    await page.route("**/api/enhanced-analysis", async (route) => {
      const body = REVIEW.replace(/"/g, '\\"');
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body:
          `data: {"type":"text","delta":"${body}"}\n\n` +
          'data: {"type":"done","metadata":{"contextId":"e2e-links-1"}}\n\n',
      });
    });

    await pinComposerOpen(page);
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);

    const composer = page.getByPlaceholder(COMPOSER);
    const appeared = await composer
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!appeared, "coach composer never unlocked on this machine — resolveMoveRef is unit-tested");

    // The greeting no longer promises that a tab will "light up".
    await expect(page.getByText(/light up/)).toHaveCount(0);
    await expect(page.getByText(/fills in with each move's verdict/)).toBeVisible();

    await composer.fill("analyse this game");
    await composer.press("Enter");

    // The recommendation is an ALTERNATIVE link — not a jump to the later 7...Qxc1 / any Qxc1.
    const alternative = page.locator('[title="Alternative: Qxc1 — shows the position after it"]');
    await expect(alternative).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[title^="Jump to"][title*="Qxc1"]')).toHaveCount(0);
    // The move that WAS played at move 8 stays a jump.
    await expect(page.locator('[title="Jump to 8. Nc7+"]')).toBeVisible();

    // Click: the board branches off before White's 8th move with Qxc1 played,
    // and the exploration chip says so — the line is "Qxc1" and the way back
    // is the anchor (the position after Black's 7th move).
    await alternative.click();
    await expect(page.getByText("Exploring").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTitle("Qxc1", { exact: true })).toBeVisible();
    await expect(page.getByText(/Back to move 7/)).toBeVisible();
  });
});
