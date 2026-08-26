import { test, expect, type Page } from "@playwright/test";

/**
 * The review schedule outlives the browser.
 *
 * This is the one claim the account copy exists to make, and no unit test can
 * make it: the merge is unit-tested, the route is unit-tested, and both can be
 * perfectly correct while the page never calls either. What has to be true is
 * that a line you learnt on one device comes back round on a device that has
 * never seen it.
 *
 * The account is a stub — an object standing in for Firestore — because what is
 * being tested is the WIRING. Firestore holding a document is covered by the
 * route's own tests.
 *
 * NOTHING about the schedule is seeded locally. localStorage carries only the
 * measured-repertoire cache, and that is there purely to put the card into its
 * ready state without spending an archive fetch and an engine pass on a claim
 * that has nothing to do with either. Its `reports: []` puts the card on its
 * "nothing left leaking" branch, which is deliberately the harder one: that
 * branch returns early, and a review queue is exactly what a player with a
 * clean repertoire still has to do.
 */

const DAY = 86_400_000;
const ME = "Lazer_Wizard";
const ACCOUNT = `chess.com:${ME}`;

const dueCard = (lineKey: string, label: string) => ({
  lineKey,
  line: { moves: ["e4", "c5", "c3"], color: "white", target: { san: "Nf3", source: "masters" } },
  label,
  easeFactor: 2.5,
  interval: 6,
  // Yesterday: due, and due is what the card renders.
  nextReview: Date.now() - DAY,
  lastReviewed: Date.now() - 7 * DAY,
  attempts: 2,
  lapses: 0,
});

async function stubAccount(page: Page) {
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
          platformRatingRaw: 1805,
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
  // The archive must never be needed. If the page reaches for it the seeded
  // cache did not take, and this test would be measuring something else.
  await page.route("**/api/scout", (r) => r.fulfill({ status: 500, body: "not for this test" }));
}

/**
 * A measured repertoire with nothing leaking, already in the local cache.
 *
 * This is the ONLY thing seeded. It costs the card its opt-in run, which is an
 * archive fetch and an engine pass over hundreds of games — neither of which
 * has anything to say about whether a review syncs.
 */
async function seedMeasuredRepertoire(page: Page) {
  await page.addInitScript(
    ([key, payload]) => {
      try {
        localStorage.setItem(key as string, payload as string);
        localStorage.setItem("cm-welcome-tour-v1", "1");
        localStorage.setItem("cm_onboarding_nudge_dismissed", "1");
      } catch {}
    },
    [
      `cm.repertoire.v1:chess.com:${ME.toLowerCase()}`,
      JSON.stringify({ builtAt: Date.now(), reports: [] }),
    ]
  );
}

async function gotoPlan(page: Page) {
  await page.goto("/plan");
  await expect(page.getByText("Your weakest line")).toBeVisible({ timeout: 20_000 });
  const consent = page.getByRole("button", { name: "I agree" });
  if (await consent.isVisible().catch(() => false)) await consent.click();
}

test("a line learnt on one device comes back round on a device that never saw it", async ({ page }) => {
  let gets = 0;
  await stubAccount(page);
  await page.route("**/api/trainer-progress", (route) => {
    gets++;
    return route.fulfill({
      json: { progress: { cards: [dueCard("white:e4 c5 c3", "1.e4 c5 2.c3")], repaired: [] } },
    });
  });
  await seedMeasuredRepertoire(page);

  await gotoPlan(page);

  // The account was actually asked — not merely that something rendered.
  await expect.poll(() => gets, { timeout: 15_000 }).toBeGreaterThan(0);

  // And what came back is on the screen, in the queue, as a link into the
  // trainer. This device has never held this card in localStorage.
  await expect(page.getByText("Due to check")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: /Review 1\.e4 c5 2\.c3/ })).toBeVisible();
});

// The control. Without it the test above would pass on a page that renders a
// hardcoded row, or that reads a schedule some other seed left behind, and
// would prove nothing about the account at all.
test("with nothing on the account, the device shows no reviews", async ({ page }) => {
  await stubAccount(page);
  await page.route("**/api/trainer-progress", (route) =>
    route.fulfill({ json: { progress: { cards: [], repaired: [] } } })
  );
  await seedMeasuredRepertoire(page);

  await gotoPlan(page);

  // The card itself is up — this is the same page in the same state, differing
  // only in what the account holds.
  await expect(page.getByText(/Not enough games yet|no line where you score/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Due to check")).toHaveCount(0);
});
