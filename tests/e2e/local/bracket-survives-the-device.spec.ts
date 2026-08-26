import { test, expect, type Page } from "@playwright/test";

/**
 * The repertoire outlives the browser.
 *
 * This is the one claim the account copy exists to make, and no unit test can
 * make it: the merge is unit-tested, the route is unit-tested, and both can be
 * perfectly correct while the page never calls either. What has to be true is
 * that a bracket built here comes back after the device forgets everything.
 *
 * The account is a stub — a Map standing in for Firestore — because what is
 * being tested is the WIRING, not the database. Firestore having a document is
 * covered by the route's own tests.
 */

interface Stubbed {
  puts: number;
}

/**
 * Put back the two first-visit modals that clearing storage revives.
 *
 * Neither has anything to do with a repertoire, and both are MODAL dialogs —
 * an open one makes the entire rest of the page inert to the accessibility
 * tree, so every getByRole reports "element(s) not found" for content
 * `innerText` can plainly see. The welcome tour is normally seeded at the
 * context level in playwright.config.ts; wiping localStorage mid-test undoes
 * that, which is exactly how this spec first failed — the only heading on the
 * page was "Solve puzzles, with a coach".
 *
 * Nothing about the bracket is seeded. The repertoire really is gone locally.
 */
async function keepModalsDown(page: Page) {
  await page.addInitScript(`try {
    localStorage.setItem("cm-welcome-tour-v1", "1");
    localStorage.setItem("cm_onboarding_nudge_dismissed", "1");
  } catch {}`);
}

async function stubAccount(page: Page, store: { bracket: unknown }, state: Stubbed) {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: {
        user: {
          uid: "e2e",
          email: "e2e@example.com",
          handle: "e2e",
          displayName: "E2E",
          platformRating: 1400,
          platformRatingSource: "chesscom",
          onboardingCompletedAt: Date.now(),
        },
        isIntern: false,
        isAdmin: false,
      },
    })
  );
  await page.route("**/api/repertoire-bracket", async (route) => {
    if (route.request().method() === "PUT") {
      state.puts++;
      const body = route.request().postDataJSON() as { bracket?: unknown };
      // The real route merges; the stub takes the newer copy, which is what a
      // merge against an older stored one returns.
      store.bracket = body?.bracket ?? store.bracket;
      return route.fulfill({ json: { bracket: store.bracket } });
    }
    return route.fulfill({ json: { bracket: store.bracket } });
  });
}

async function throughQuiz(page: Page) {
  await page.getByRole("button", { name: "I agree" }).click({ timeout: 10_000 }).catch(() => {});
  await expect(page.getByRole("heading", { name: /how much theory/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Whatever it takes/i }).click();
  await expect(page.getByRole("heading", { name: /what kind of game/i })).toBeVisible();
  await page.getByRole("button", { name: /punish mistakes/i }).click();
  await expect(page.getByRole("heading", { name: "Your repertoire" })).toBeVisible({ timeout: 15_000 });
}

test("a repertoire built on one device comes back on a device that never saw it", async ({ page }) => {
  const store: { bracket: unknown } = { bracket: null };
  const state: Stubbed = { puts: 0 };
  await stubAccount(page, store, state);
  await keepModalsDown(page);

  await page.goto("/learn");
  await throughQuiz(page);
  await page.getByRole("tab", { name: /As Black/i }).click();
  await page.getByText(/Against 1\.d4/).first().click();
  const grunfeld = page.getByRole("button", { name: /Grünfeld Defence/i }).first();
  await expect(grunfeld).toBeVisible({ timeout: 10_000 });
  await grunfeld.click();
  await expect(page.getByText(/Grünfeld/).first()).toBeVisible();

  // It reached the account, and the account holds the pick — not merely that a
  // request was made.
  await expect.poll(() => state.puts, { timeout: 10_000 }).toBeGreaterThan(0);
  const saved = store.bracket as { black?: Array<{ slotId: string }> } | null;
  expect(saved?.black?.some((p) => p.slotId.startsWith("black:d4"))).toBe(true);

  // ── The device forgets everything ────────────────────────────────────────
  // A cleared cache, a new phone, a private window. Before the account copy
  // existed this was the end of the repertoire.
  //
  // The onboarding nudge is put back down straight afterwards, and that is not
  // the test cheating: clearing storage also revives it, it is a MODAL
  // <dialog>, and an open one makes the entire rest of the page inert to the
  // accessibility tree. Every getByRole then reports "element(s) not found"
  // for content `innerText` can plainly see — a failure that looks nothing
  // like its cause. Nothing about the repertoire is seeded.
  await page.evaluate(() => window.localStorage.clear());
  await keepModalsDown(page);
  await page.reload();
  await page.getByRole("button", { name: "I agree" }).click({ timeout: 10_000 }).catch(() => {});

  // Straight to the bracket: the quiz answers came back too, so it does not
  // re-ask. That is the tell that the whole state was restored and not just
  // the picks.
  await expect(page.getByRole("heading", { name: "Your repertoire" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: /As Black/i }).click();
  await expect(page.getByText(/Grünfeld/).first()).toBeVisible({ timeout: 15_000 });
});

// The control. Without it the test above would pass on a page that simply
// never clears anything, and would prove nothing about the account at all.
test("with no account copy, a cleared device really does lose the repertoire", async ({ page }) => {
  const store: { bracket: unknown } = { bracket: null };
  const state: Stubbed = { puts: 0 };
  await stubAccount(page, store, state);
  // The account is there but permanently empty: every GET returns nothing, as
  // if the sync had never worked.
  await page.route("**/api/repertoire-bracket", (route) => route.fulfill({ json: { bracket: null } }));
  await keepModalsDown(page);

  await page.goto("/learn");
  await throughQuiz(page);
  await page.getByRole("tab", { name: /As Black/i }).click();
  await page.getByText(/Against 1\.d4/).first().click();
  await page.getByRole("button", { name: /Grünfeld Defence/i }).first().click();
  await expect(page.getByText(/Grünfeld/).first()).toBeVisible();

  await page.evaluate(() => window.localStorage.clear());
  await keepModalsDown(page);
  await page.reload();
  await page.getByRole("button", { name: "I agree" }).click({ timeout: 10_000 }).catch(() => {});
  // Back to the quiz, because nothing remembered anything.
  await expect(page.getByRole("heading", { name: /how much theory/i })).toBeVisible({ timeout: 20_000 });
});
