import { test, expect, type Page } from "@playwright/test";

/**
 * The book-exit note ("where you left what players at your level play") is
 * no longer part of the greeting on /analysis.
 *
 * Until 2026-10-07 it was the greeting's second paragraph, gated on the
 * reader's colour, and this spec pinned its five outcomes on the page. The
 * ideal coach never pushes opening theory (IDEAL_PRODUCT.md, decision 4:
 * "Many users don't even need help on theory"), so the note left the
 * greeting; the component, the books and the route stay for the moment the
 * player asks about the opening, and the walk and the route keep their unit
 * tests. What this spec now pins is the absence: a game that would have
 * drawn the note loads under a greeting that says nothing about the book.
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
  await page
    .context()
    .addCookies([
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

test("the greeting says nothing about the book, whoever played", async ({
  page,
}) => {
  await stubAccount(page);
  let calls = 0;
  await page.route("**/api/book-exit**", (r) => {
    calls += 1;
    return r.fulfill({ json: {} });
  });
  await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
  // The side is inferred from the handle, so the old gate would have opened.
  await expect(
    page.getByText(`${ME} vs opponent`).filter({ visible: true }).first()
  ).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("book-exit")).toHaveCount(0);
  await expect(page.getByText(/left the book/i)).toHaveCount(0);
  await expect(page.getByText(/Move \d+: you played/)).toHaveCount(0);
  expect(calls).toBe(0);
});
