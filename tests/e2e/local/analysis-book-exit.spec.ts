import { test, expect, type Page } from "@playwright/test";

/**
 * "Where you left what players at your level play", on /analysis.
 *
 * The walk and the route are unit-tested. What no unit test can show is that
 * the panel is WIRED — that a loaded game reaches it with the right colour, and
 * that the five outcomes render as five different things on a real page.
 *
 * The second test is the one that matters. "We have no data past move 4" and
 * "you left the book at move 4" are opposite statements about the reader, and
 * the whole feature is worthless — worse than absent — if they ever read as
 * each other in the browser.
 */

const ME = "Lazer_Wizard";

const PGN = [
  `[White "${ME}"]`,
  `[Black "opponent"]`,
  `[Result "1-0"]`,
  ``,
  `1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 1-0`,
].join("\n");

async function stubAccount(page: Page) {
  await page.context().addCookies([
    { name: "cm_consent", value: "accepted", domain: "127.0.0.1", path: "/" },
  ]);
  // The side inference reads the handle out of localStorage, not out of the
  // profile — `chesscomUsername` on the account is not one of the candidates it
  // checks. Seeding the key the page actually reads is the difference between
  // the game loading with a known colour and the page asking "which side were
  // you playing?", which is what the card is gated on.
  await page.addInitScript(`try {
    localStorage.setItem("chesscom-username", ${JSON.stringify(JSON.stringify(ME))});
  } catch {}`);
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: {
        user: {
          uid: "e2e-user",
          email: "e2e@example.com",
          displayName: "E2E",
          handle: "e2e",
          // Matches the PGN's White header, so the page INFERS the side rather
          // than asking. The card is gated on knowing the colour: without it we
          // would have to guess whose moves to judge.
          chesscomUsername: ME,
          platformRating: 1400,
          platformRatingSource: "chesscom",
          onboardingCompletedAt: Date.now(),
        },
        isIntern: false,
        isAdmin: false,
      },
    })
  );
}

const corpus = {
  band: "improving",
  source: "Lichess rated blitz and rapid, 2025-11",
  games: 232933,
  maxPly: 14,
  minGames: 10,
  minShare: 0.02,
};

async function openGame(page: Page) {
  await page.goto("/analysis?pgn=" + encodeURIComponent(PGN));
  await expect(page.getByTestId("book-exit")).toBeVisible({ timeout: 45_000 });
}

test("names the move, the level, and what that level plays instead", async ({ page }) => {
  await stubAccount(page);
  await page.route("**/api/book-exit", (r) =>
    r.fulfill({
      json: {
        band: "improving",
        corpus,
        exit: {
          outcome: "left",
          ply: 6,
          moveNumber: 4,
          san: "b4",
          common: [
            { san: "c3", perMille: 640 },
            { san: "O-O", perMille: 180 },
            { san: "d3", perMille: 70 },
          ],
          depth: 6,
          transposes: false,
        },
      },
    })
  );

  await openGame(page);
  const card = page.getByTestId("book-exit");
  await expect(card.getByText("Move 4: you played b4.")).toBeVisible();
  // The population, named. "People at your level" over somebody else's numbers
  // is the one thing this panel must never do.
  await expect(card.getByText(/players rated 1200–1599/)).toBeVisible();
  await expect(card.getByText("c3")).toBeVisible();
  await expect(card.getByText("64%")).toBeVisible();
  // And it never calls the move a mistake. No engine was consulted.
  await expect(card.getByText(/not a mistake/i)).toBeVisible();
});

test("having no data does not read as having left the book", async ({ page }) => {
  await stubAccount(page);
  await page.route("**/api/book-exit", (r) =>
    r.fulfill({
      json: {
        band: "improving",
        corpus,
        exit: {
          outcome: "thin",
          ply: 6,
          moveNumber: 4,
          san: "b4",
          common: [],
          depth: 6,
          transposes: false,
        },
      },
    })
  );

  await openGame(page);
  const card = page.getByTestId("book-exit");
  await expect(card.getByText(/no data past move 4/i)).toBeVisible();
  // The collapse this feature exists to avoid, asserted at the level a reader
  // sees: nothing here may say they played it, or left anything.
  // The headline shape, specifically. A bare /you played/ also matches the
  // disclaimer's "not a comment on how you played", which would make this
  // assertion pass or fail on wording rather than on the claim.
  await expect(card.getByText(/Move \d+: you played/)).toHaveCount(0);
  await expect(card.getByText(/left the book/i)).toHaveCount(0);
  await expect(card.getByText(/not a comment on how you played/i)).toBeVisible();
});

test("an opponent leaving first is reported as theirs", async ({ page }) => {
  await stubAccount(page);
  await page.route("**/api/book-exit", (r) =>
    r.fulfill({
      json: {
        band: "improving",
        corpus,
        exit: {
          outcome: "opponent-left",
          ply: 7,
          moveNumber: 4,
          san: "Bxb4",
          common: [{ san: "Nxb4", perMille: 500 }],
          depth: 7,
          transposes: false,
        },
      },
    })
  );

  await openGame(page);
  const card = page.getByTestId("book-exit");
  await expect(card.getByText(/Your opponent left the book first/)).toBeVisible();
  await expect(card.getByText(/Move \d+: you played/)).toHaveCount(0);
});
