import { test, expect, type Page } from "@playwright/test";

/**
 * An earned review you cannot find is a review that does not exist.
 *
 * Cards are earned per chapter and were visible only on that chapter's own
 * hub, so a review earned on Monday was invisible on every screen a player
 * actually opens. These tests drive the two screens that now say it — the
 * catalogue and the daily plan — and, as the control, that both stay silent
 * for a player who has not got anything wrong.
 */

const ACCOUNT = "e2e";
const DAY = 24 * 60 * 60 * 1000;

async function stub(page: Page) {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: {
        user: {
          uid: ACCOUNT,
          email: "e@x.com",
          handle: "e2e",
          displayName: "E",
          platformRating: 1500,
          platformRatingSource: "chesscom",
          onboardingCompletedAt: Date.now() - 30 * DAY,
        },
        isIntern: false,
        isAdmin: false,
      },
    })
  );
  await page.addInitScript(`try { localStorage.setItem("cm_onboarding_nudge_dismissed", "1"); } catch {}`);
}

/** Seed one chapter of w-london with `due` cards already past their date. */
async function seedOwed(page: Page, due: number) {
  await page.addInitScript(
    ([account, count, day]) => {
      const records: Record<string, unknown> = {};
      for (let i = 0; i < (count as number); i++) {
        records[`k${i}`] = {
          key: `k${i}`,
          correctness: 2,
          asks: 2,
          misses: 1,
          hinted: false,
          lastRound: 1,
          at: 1,
          ease: 2.5,
          interval: 6,
          // Yesterday, so it is due whatever today turns out to be.
          dueAt: Date.now() - (day as number),
        };
      }
      try {
        localStorage.setItem(
          `cm.course.v1.chapter:${account}:w-london:0`,
          JSON.stringify({ v: 1, courseId: "w-london", chapter: 0, records, updatedAt: Date.now() })
        );
      } catch {
        /* storage off; the test below will say so */
      }
    },
    [ACCOUNT, due, DAY]
  );
}

async function dismiss(page: Page) {
  for (const name of [/I agree/, /Maybe later/i, /Close tour/]) {
    await page.getByRole("button", { name }).click({ timeout: 6000 }).catch(() => {});
  }
}

test.describe("the catalogue", () => {
  test.beforeEach(({ page }) => stub(page));

  test("puts what is owed first, and says how much", async ({ page }) => {
    await seedOwed(page, 4);
    await page.goto("/courses");
    await dismiss(page);

    const shelf = page.getByTestId("shelf-due");
    await expect(shelf).toBeVisible({ timeout: 20_000 });
    await expect(shelf.getByTestId("card-due-w-london")).toHaveText("4 due");
    // Only the course that owes something is on this rail.
    await expect(shelf.locator('[data-testid^="card-due-"]')).toHaveCount(1);

    // First on the page: the most specific true thing a catalogue can say.
    const headings = await page.getByRole("heading", { level: 2 }).allInnerTexts();
    expect(headings[0]).toBe("Due back");

    // The badge REPLACES "In progress" rather than stacking with it — both are
    // true at once on every owed card, and two badges on a 250px tile is a
    // badge nobody reads.
    await expect(shelf.getByText("In progress")).toHaveCount(0);
    // It is not repeated on the shelves that exist to be complete: "White
    // openings" lists every White course, and the due rail is a view of the
    // same library rather than a set removed from it.
    await expect(page.getByTestId("shelf-white").getByTestId("card-due-w-london")).toHaveCount(1);
  });

  // ── The control ─────────────────────────────────────────────────────────────
  test("says nothing about reviews for a player who has not got anything wrong", async ({ page }) => {
    await page.goto("/courses");
    await dismiss(page);
    await expect(page.getByRole("heading", { name: "White openings" })).toBeVisible({
      timeout: 20_000,
    });
    // Cards are EARNED. An encouraging empty rail here would be set dressing
    // over the claim.
    await expect(page.getByRole("heading", { name: "Due back" })).toHaveCount(0);
  });
});

test.describe("the daily plan", () => {
  test.beforeEach(({ page }) => stub(page));

  test("names the course that owes the most, and points at it", async ({ page }) => {
    await seedOwed(page, 3);
    await page.goto("/plan");
    await dismiss(page);

    const task = page.getByText("3 to review in the London System");
    await expect(task).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/Nothing here is new/)).toBeVisible();
  });

  test("keeps its generic task when nothing is owed", async ({ page }) => {
    await page.goto("/plan");
    await dismiss(page);
    await expect(page.getByText(/Build your repertoire|Your weakest line/).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(/to review in the/)).toHaveCount(0);
  });
});
