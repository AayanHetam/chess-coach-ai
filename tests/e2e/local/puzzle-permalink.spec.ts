import { test, expect } from "@playwright/test";

/**
 * /puzzles/p/<id> — per-puzzle permalink (the destination reels link to).
 *
 * The known-good id is a row of public/data/lichess_puzzles_100k.csv, which
 * is committed — the id is stable until someone swaps the corpus file, and
 * this spec failing on a corpus swap is a feature: reels already posted
 * carry these links, so a swap that drops ids is a regression to catch,
 * not a flake. 0pT9G is also reel batch5/01, the first link shipped.
 */

const KNOWN_ID = "0pT9G";

test(`/puzzles/p/${KNOWN_ID} renders the puzzle, playable`, async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(String(e)));
  await page.goto(`/puzzles/p/${KNOWN_ID}`);

  // Theme heading + rating chip (structural: some heading, "Rated <n>").
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Rated \d{3,4}/)).toBeVisible();

  // A board is on screen: SSR serves the static diagram (role="img"),
  // and after hydration the interactive surface replaces it. Either
  // satisfies "the linked position is visible".
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document.querySelectorAll('[role="img"], [data-boardid]').length +
            document.querySelectorAll('img[src*="/piece/cburnett/"]').length,
        ),
      { timeout: 25_000 },
    )
    .toBeGreaterThan(0);

  // The funnel back to the band landing page exists and is on-grid.
  await expect(
    page.getByRole("link", { name: /More puzzles rated \d{3,4}/ }),
  ).toBeVisible();

  expect(crashes).toEqual([]);
});

test("an unknown id is a 404, not an error page", async ({ page }) => {
  const res = await page.goto("/puzzles/p/zzzzz9");
  expect(res?.status()).toBe(404);
});

test("a malformed id is a 404 without touching the corpus", async ({ page }) => {
  const res = await page.goto("/puzzles/p/not-a-valid-id!");
  expect(res?.status()).toBe(404);
});
