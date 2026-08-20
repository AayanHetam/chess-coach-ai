import { test, expect, type Page } from "@playwright/test";

/**
 * /learn, the repertoire bracket, in a real browser.
 *
 * The bracket maths is unit-tested. What cannot be unit-tested is whether the
 * derived slots, the chooser and the coverage bar agree with each other on
 * screen — and whether a branch that only exists once a choice is made
 * actually appears when it is.
 */

async function stub(page: Page) {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: {
        user: { uid: "e2e", email: "e2e@example.com", handle: "e2e", displayName: "E2E" },
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
    await page.getByText(/Against the English/).first().click();

    // 1.c4 has no prose anywhere. What it HAS is a measurable answer: the
    // continuation people actually play, the structure that produces, and the
    // breaks that really occur.
    await expect(page.getByText(/What this becomes/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/games\./).first()).toBeVisible();
    await expect(page.getByText(/Most played, not best/i).first()).toBeVisible();
  });
});
