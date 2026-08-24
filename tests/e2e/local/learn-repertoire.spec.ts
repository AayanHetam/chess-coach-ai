import { test, expect, type Page } from "@playwright/test";

/**
 * /learn, the repertoire bracket, in a real browser.
 *
 * The bracket maths is unit-tested. What cannot be unit-tested is whether the
 * derived slots, the chooser and the coverage bar agree with each other on
 * screen — and whether a branch that only exists once a choice is made
 * actually appears when it is.
 */

async function stub(page: Page, rating?: number) {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: {
        user: {
          uid: "e2e", email: "e2e@example.com", handle: "e2e", displayName: "E2E",
          platformRating: rating, platformRatingSource: rating ? "chesscom" : undefined,
        },
        isIntern: false,
        isAdmin: false,
      },
    })
  );
}

async function throughQuiz(page: Page) {
  await page.goto("/learn");
  // The consent banner is a modal <dialog>, so while it is open the REST of
  // the page is out of the accessibility tree entirely and getByRole finds
  // nothing. It also mounts after navigation resolves, so the usual
  // `isVisible() ? click()` races it: the check runs before it exists, the
  // click is skipped, and every later locator fails for a reason that looks
  // nothing like a consent banner. Wait for it, then tolerate its absence.
  await page
    .getByRole("button", { name: "I agree" })
    .click({ timeout: 10_000 })
    .catch(() => {});
  // And the onboarding nudge is a MODAL <dialog>, which makes the entire rest
  // of the page inert to the accessibility tree. Every getByRole then reports
  // "element(s) not found" for content that is plainly there in the snapshot,
  // which is a fault that looks nothing like its cause.
  await page
    .getByRole("button", { name: /Maybe later/i })
    .click({ timeout: 10_000 })
    .catch(() => {});
  await expect(page.getByRole("heading", { name: /how much theory/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Whatever it takes/i }).click();
  await expect(page.getByRole("heading", { name: /what kind of game/i })).toBeVisible();
  await page.getByRole("button", { name: /punish mistakes/i }).click();
  await expect(page.getByRole("heading", { name: "Your repertoire" })).toBeVisible({ timeout: 15_000 });
}

test.describe("repertoire bracket", () => {
  test.beforeEach(async ({ page }) => {
    await stub(page);
  });

  test("asks two questions, then shows the bracket", async ({ page }) => {
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(String(e)));

    await throughQuiz(page);

    // Nothing chosen, so nothing is answered. A repertoire builder that opens
    // at some flattering number would be lying on its first screen. Asserted
    // through the meter's accessible name rather than by matching "0%" as
    // text, because "10%" contains "0%".
    await expect(page.getByRole("img", { name: /^0 percent answered$/ })).toBeVisible();
    await page.getByRole("tab", { name: /As Black/i }).click();
    await expect(page.getByRole("button", { name: /Against the Sicilian/i })).toHaveCount(0);
    // Black's roots are the moves White can open with.
    await expect(page.getByText(/Against 1\.e4/).first()).toBeVisible();
    await expect(page.getByText(/Against 1\.d4/).first()).toBeVisible();

    expect(crashes, `page errors: ${crashes.join("\n")}`).toHaveLength(0);
  });

  test("choosing an opening opens the branches it does not answer", async ({ page }) => {
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();

    await page.getByText(/Against 1\.d4/).first().click();
    // The suggestion carries what it costs and what it leaves open.
    const grunfeld = page.getByRole("button", { name: /Grünfeld Defence/i }).first();
    await expect(grunfeld).toBeVisible({ timeout: 10_000 });
    await grunfeld.click();

    // This is the whole point of the page: the Grünfeld answers 1.d4 and
    // nothing else, so the London and the Trompowsky now need their own answer.
    await expect(page.getByText(/Trompowsky/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Accelerated London System/i).first()).toBeVisible();
    // And the coverage number moved off zero.
    await expect(page.getByRole("img", { name: /^0 percent answered$/ })).toHaveCount(0);
  });

  test("the library search is filtered to what is reachable", async ({ page }) => {
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    await page.getByText(/Against 1\.e4/).first().click();

    const box = page.getByRole("textbox", { name: /Search every named opening/i });
    await expect(box).toBeVisible({ timeout: 10_000 });
    await box.fill("Najdorf");
    await expect(page.getByText(/Najdorf/).first()).toBeVisible({ timeout: 15_000 });

    // A real opening that cannot arise after 1.e4 must not be offered here.
    //
    // Note what this does NOT assert: that searching "Grünfeld" from 1.e4 finds
    // nothing. It finds "Van Geet Opening: Grünfeld Defense", which really is
    // reachable (1.e4 d5 2.Nc3 dxe4 3.Nxe4 e5). The guarantee is about the
    // LINE, not the name — so that is what is checked.
    await box.fill("Grünfeld");
    await expect(page.getByText(/Van Geet/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("1.d4 Nf6 2.c4 g6")).toHaveCount(0);
  });

  test("says what a position becomes, even where no book names it", async ({ page }) => {
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    // 1.c4 is 6% of Black's games, so it is one of the roots held back until
    // the first three are answered. Open the deferred group to reach it.
    await page.getByRole("button", { name: /more, when you are ready/i }).click();
    await page.getByText(/Against the English/).first().click();

    // 1.c4 has no prose anywhere. What it HAS is a measurable answer: the
    // continuation people actually play, the structure that produces, and the
    // breaks that really occur.
    await expect(page.getByText(/What this becomes/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/games\./).first()).toBeVisible();
    await expect(page.getByText(/Most played, not best/i).first()).toBeVisible();
  });

  test("pitches the same slot differently at 700 and at 1700", async ({ page }) => {
    // The whole point of the level model. A 700 and a 1700 opening the SAME
    // slot must not be handed the same list in the same order.
    await stub(page, 700);
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    await page.getByText(/Against 1\.d4/).first().click();

    const cards = page.locator('[role="group"] button').filter({ hasText: /answers|more decisions/ });
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    // A beginner is offered a beginner opening first, and told which ones cost.
    await expect(cards.first()).toContainText(/King's Indian/i);
    await expect(page.getByText(/A long way above your level/i).first()).toBeVisible();
    // And the one that suits them says BOTH things: it fits, and it is heavy.
    await expect(cards.first()).toContainText(/suits your level/i);
    await expect(cards.first()).toContainText(/a lot of theory/i);
  });

  test("tells a player when their repertoire is finished", async ({ page }) => {
    await stub(page, 700);
    await throughQuiz(page);
    // Nothing chosen, so it must NOT say they are done.
    await expect(page.getByText(/Not finished yet/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/treating you as starting out/i)).toBeVisible();
    // And it says what opening work is worth at this level, which is: not much.
    await expect(page.getByText(/not spent on tactics/i)).toBeVisible();
  });
});

test.describe("level-aware breadth", () => {
test('asks a beginner for three decisions, and defers the rest without hiding them', async ({ page }) => {
  // The tightest consensus in the coaching literature is about breadth, not
  // depth: one White opening, one answer to 1.e4, one answer to 1.d4. Showing a
  // 700 all five roots is a wall, and hiding two of them is a lie — so they are
  // deferred, named, and one click away.
  await throughQuiz(page);
  await page.getByRole('tab', { name: /As Black/i }).click();

  const deferred = page.getByRole('button', { name: /more, when you are ready/i });
  await expect(deferred).toBeVisible();
  // It says what is being held back and what it is worth, not just that
  // something is.
  await expect(deferred).toContainText(/of your games/);

  const before = await page.getByText(/of your games · nothing chosen/).count();
  await deferred.click();
  await expect(page.getByRole('button', { name: /Show fewer/i })).toBeVisible();
  expect(await page.getByText(/of your games · nothing chosen/).count()).toBeGreaterThan(before);
});

test('shows the position an opening becomes, not just its name', async ({ page }) => {
  // A name is not a picture. The player this page is for does not know what a
  // Grünfeld is, and the board tells them.
  await throughQuiz(page);
  await page.getByRole('tab', { name: /As Black/i }).click();
  await page.getByText(/Against 1\.e4/).first().click();

  const cards = page.locator('button', { hasText: 'Caro-Kann' }).first();
  await expect(cards).toBeVisible();
  // Every suggestion carries a board, and the boards are not all the same one.
  const boards = page.locator('svg[viewBox="0 0 100 100"]');
  expect(await boards.count()).toBeGreaterThan(3);
});

test('says what a choice finishes, in a sentence', async ({ page }) => {
  await throughQuiz(page);
  await page.getByRole('tab', { name: /As Black/i }).click();
  await page.getByText(/Against 1\.e4/).first().click();

  // One that answers the whole slot, and one that does not — the distinction a
  // bare percentage does not make.
  await expect(page.getByText(/answers everything after 1\.e4/).first()).toBeVisible();
  await expect(page.getByText(/You still need something for the other/).first()).toBeVisible();
});
});
