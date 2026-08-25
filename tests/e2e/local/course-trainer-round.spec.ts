import { test, expect, type Page } from "@playwright/test";

/**
 * The probe loop, in a real browser.
 *
 * The three things no unit test can see: whether a right answer says so and
 * gets out of the way, whether a wrong answer produces a teach card with
 * anything IN it, and whether a slipped finger is punished.
 *
 * The band here is `improving` because the page resolves it from a session
 * cookie and these runs are signed out. That is deliberate — the band
 * arithmetic is covered exhaustively in unit tests.
 */

const ACCOUNT = "e2e";

/**
 * A signed-in account, for the paths that key storage by uid.
 *
 * getServerSideProps reads a real session cookie and this stub does not give it
 * one, so the BAND stays `improving` here. That is fine: the band arithmetic is
 * covered exhaustively in unit tests, and what these cases need is a uid.
 */
async function stubAccount(page: Page) {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        user: { uid: ACCOUNT, email: "e2e@example.com", handle: "e2e", displayName: "E2E" },
        isIntern: false,
        isAdmin: false,
      },
    })
  );
  await page.addInitScript(`window.ACCOUNT = ${JSON.stringify("e2e")};`);
}

async function dismissChrome(page: Page) {
  await page
    .getByRole("button", { name: "I agree" })
    .click({ timeout: 10_000 })
    .catch(() => {});
}

/**
 * Click-to-move, not dragTo: react-chessboard runs its own drag layer and
 * Playwright's synthetic drag does not drive it.
 */
async function play(page: Page, from: string, to: string) {
  await page.locator(`[data-square="${from}"]`).first().click();
  await page.locator(`[data-square="${to}"]`).first().click();
  // Clicking into a moving board drops the click, and the failure then looks
  // like a logic bug rather than a race.
  await page.waitForTimeout(260);
}

/**
 * The rail and the strip are the same controls at two widths, and BOTH are in
 * the DOM — one is hidden with display:none by a breakpoint. So every query for
 * a control has to be the visible one, and the honest assertion about the pair
 * is that exactly one is visible, not that only one exists.
 */
function control(page: Page, testid: string) {
  return page.getByTestId(testid).locator("visible=true");
}

async function openRound(page: Page) {
  await page.goto("/train/course/w-london/0?round=1");
  await dismissChrome(page);
  await expect(page.getByText("Your move")).toBeVisible({ timeout: 10_000 });
}

test.describe("the probe loop", () => {
  test("asks before it tells", async ({ page }) => {
    await openRound(page);
    // No teaching of any kind before an answer. THE ZERO that makes this a
    // confrontation rather than a curriculum.
    await expect(page.getByTestId("teach-card")).toHaveCount(0);
    await expect(page.getByText("Play the move this course plays here.")).toBeVisible();
  });

  test("a wrong move is taught, with something in the card", async ({ page }) => {
    await openRound(page);
    // a2a3 is legal in every London position at ply 2 and is never the course
    // move, so this is a miss by construction.
    await play(page, "a2", "a3");

    const card = page.getByTestId("teach-card");
    await expect(card).toBeVisible();
    await expect(page.getByText("Not the course move.")).toBeVisible();
    await expect(page.getByTestId("teach-played")).toHaveText("a3");
    // The answer is named, and it is not what they played.
    const answer = await page.getByTestId("teach-answer").innerText();
    expect(answer).not.toBe("a3");
    expect(answer.length).toBeGreaterThan(1);

    // The card is not a stub: on the 87% of decisions with no quote, the
    // replies table is what carries it.
    const text = await card.innerText();
    expect(text.length).toBeGreaterThan(60);
  });

  test("a slipped finger is not an answer", async ({ page }) => {
    await openRound(page);

    // A rook to a5, straight through its own pawn on a2: legal GEOMETRY, and
    // not a legal move. Clicking an own piece would not do — the board treats
    // that as switching the selection and never reports it at all, so it would
    // never reach the guard being tested.
    await play(page, "a1", "a5");

    // THE ZERO: no verdict, no teach card, no progress. The control is the next
    // test, where a legal-but-wrong move produces exactly one verdict.
    await expect(page.getByTestId("teach-card")).toHaveCount(0);
    await expect(page.getByTestId("verdict-correct")).toHaveCount(0);
    await expect(page.getByText("Your move")).toBeVisible();
    const dots = page.getByRole("img", { name: /answered/ }).first();
    await expect(dots).toHaveAttribute("aria-label", /^0 of \d+ answered$/);
  });

  test("the round advances only on a correct answer", async ({ page }) => {
    await openRound(page);
    const dots = page.getByRole("img", { name: /answered/ }).first();
    await expect(dots).toHaveAttribute("aria-label", /^0 of \d+ answered$/);

    await play(page, "a2", "a3");
    // Wrong: the counter has not moved.
    await expect(dots).toHaveAttribute("aria-label", /^0 of \d+ answered$/);

    await page.getByTestId("teach-continue").click();
    await expect(page.getByText("Your move")).toBeVisible();
    await expect(dots).toHaveAttribute("aria-label", /^0 of \d+ answered$/);
  });

  test("does not ask what it already knows", async ({ page }) => {
    // THE BUG THIS PINS: effects run in declaration order within one commit, so
    // the round was built in the same pass that READ the stored records — from
    // an empty set. A player coming back the next day was asked every decision
    // they already owned, and nothing on screen said anything was wrong.
    //
    // Seeding every decision as known makes the consequence binary: there is
    // nothing left to ask, so the round must not ask anything. Built from an
    // empty record set it asks the first question instead.
    await stubAccount(page);
    await page.goto("/train/course/w-london/0");
    await dismissChrome(page);

    const seeded = await page.evaluate(() => {
      const data = JSON.parse(document.getElementById("__NEXT_DATA__")!.textContent!);
      const probes = data.props.pageProps.probes as Array<{ key: string }>;
      const records: Record<string, unknown> = {};
      for (const probe of probes) {
        records[probe.key] = {
          key: probe.key,
          correctness: 2,
          asks: 1,
          misses: 0,
          hinted: false,
          lastRound: 1,
          at: 1,
        };
      }
      localStorage.setItem(
        `cm.course.v1.chapter:${(window as unknown as { ACCOUNT: string }).ACCOUNT}:w-london:0`,
        JSON.stringify({ v: 1, courseId: "w-london", chapter: 0, records, updatedAt: 1 })
      );
      return probes.length;
    });
    expect(seeded).toBeGreaterThan(0);

    await page.goto("/train/course/w-london/0?round=1");
    await dismissChrome(page);

    // Nothing to ask, so it lands back on the contract screen with everything
    // counted as known.
    await expect(page.getByText("Before we teach anything, we ask.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("bucket-known")).toHaveText(String(seeded));
    await expect(page.getByText("Your move")).toHaveCount(0);
  });

  test("still asks when it knows nothing — the control", async ({ page }) => {
    // Without this the test above passes on a page that never asks anything.
    await stubAccount(page);
    await page.goto("/train/course/w-london/0?round=1");
    await dismissChrome(page);
    await expect(page.getByText("Your move")).toBeVisible({ timeout: 10_000 });
  });

  test("leaving goes back to the course", async ({ page }) => {
    await openRound(page);
    await control(page, "round-exit").click();
    await expect(page).toHaveURL(/\/learn\/w-london/);
  });

  test("fits the viewport it is given", async ({ page }, testInfo) => {
    await openRound(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // Exactly one of the rail/strip pair is on screen at this width. Asserted
    // on visibility rather than on the DOM, because both are always mounted.
    await expect(page.getByRole("navigation", { name: "Chapter round" }).locator("visible=true")).toHaveCount(1);

    for (const id of ["round-exit", "round-restart"]) {
      const box = await control(page, id).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    await testInfo.attach(`round-${testInfo.project.name}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test("the teach card fits too", async ({ page }, testInfo) => {
    await openRound(page);
    await play(page, "a2", "a3");
    await expect(page.getByTestId("teach-card")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await testInfo.attach(`teach-${testInfo.project.name}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
});
