import { test, expect, type Page } from "@playwright/test";

/**
 * /courses — the whole library on shelves.
 *
 * The 43 generated courses were previously reachable only from a chip on a
 * FILLED slot on /learn, so a player had to finish deciding before they could
 * see what there was to learn. This page is the browse surface; these tests
 * guard the two things a catalogue must never do — look more finished than the
 * product is, and show the same course twice.
 */

async function stub(page: Page) {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: {
        user: { uid: "e2e", email: "e@x.com", handle: "e2e", displayName: "E", platformRating: 1500, platformRatingSource: "chesscom" },
        isIntern: false, isAdmin: false,
      },
    })
  );
}

async function open(page: Page) {
  await page.goto("/courses");
  await page.getByRole("button", { name: "I agree" }).click({ timeout: 10_000 }).catch(() => {});
  await page.getByRole("button", { name: /Maybe later/i }).click({ timeout: 10_000 }).catch(() => {});
  await page.getByRole("button", { name: "Close tour" }).click({ timeout: 10_000 }).catch(() => {});
  await expect(page.getByRole("heading", { name: "Courses", level: 1 })).toBeVisible({ timeout: 20_000 });
}

test.describe("course catalogue", () => {
  test.beforeEach(({ page }) => stub(page));

  test("lists every course, on shelves, crash-free", async ({ page }) => {
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(String(e)));
    await open(page);

    await expect(page.getByText(/43 opening courses/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "White openings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Black openings" })).toBeVisible();

    // No progress and no bracket, so neither of those shelves may appear. An
    // empty rail is a promise the product has not kept.
    await expect(page.getByRole("heading", { name: "Pick up where you left off" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "In your repertoire" })).toHaveCount(0);

    expect(crashes, crashes.join("\n")).toHaveLength(0);
  });

  test("a card carries the position, the line and the character", async ({ page }) => {
    await open(page);
    const london = page.getByRole("link", { name: /London System/ }).first();
    await expect(london).toBeVisible();
    await expect(london).toContainText("solid");
    await expect(london).toContainText(/\d+ chapters/);
    // A name means nothing to somebody who does not know it; the board does.
    expect(await london.locator('svg[viewBox="0 0 100 100"]').count()).toBe(1);
    await expect(london).toHaveAttribute("href", "/learn/w-london");
  });

  test("the board is big enough to read", async ({ page }) => {
    await open(page);
    const board = page.getByRole("link", { name: /London System/ }).first().locator("svg").first();
    const box = await board.boundingBox();
    // Eight squares across. Below ~80px a piece is under 10px and every
    // opening renders as the same dark smudge — decoration pretending to be
    // information, which is how the first cut of this shipped.
    expect(box!.width).toBeGreaterThan(80);
  });

  test("filtering by side shows only that side, and offers a way back", async ({ page }) => {
    await open(page);
    await page.getByRole("tab", { name: "Black openings" }).click();
    await expect(page.getByRole("heading", { name: "White openings" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Black openings" })).toBeVisible();
    await page.getByRole("button", { name: /All courses/ }).click();
    await expect(page.getByRole("heading", { name: "White openings" })).toBeVisible();
  });

  test("an empty repertoire filters to nothing, never to everything", async ({ page }) => {
    // The dangerous default. Falling through to the whole catalogue would tell
    // a player who has chosen nothing that all 43 courses are theirs.
    await open(page);
    await page.getByRole("tab", { name: "In your repertoire" }).click();
    await expect(page.getByText(/Choose some openings on Learn/)).toBeVisible();
    await expect(page.getByRole("link", { name: /London System/ })).toHaveCount(0);
  });

  test("search flattens the shelves and finds by move as well as name", async ({ page }) => {
    await open(page);
    await page.getByLabel("Search courses").fill("alapin");
    await expect(page.getByRole("link", { name: /Alapin/ })).toHaveCount(1);
    // Shelves are a browse; a search is a request for an answer.
    await expect(page.getByRole("heading", { name: "White openings" })).toHaveCount(0);

    await page.getByLabel("Search courses").fill("Bf4");
    await expect(page.getByRole("link", { name: /London System/ })).toHaveCount(1);

    await page.getByLabel("Search courses").fill("zzzz");
    await expect(page.getByText(/Nothing matches/)).toBeVisible();
  });

  test("the London System is drawn as the London System", async ({ page }) => {
    // It shipped drawing a Nimzo-Indian, identical to the "1.d4" card beside
    // it, because a system opening has no root line to walk from. Asserted on
    // screen because that is where it was found.
    await open(page);
    const london = page.getByRole("link", { name: /London System/ }).first();
    const d4 = page.getByRole("link", { name: /^1\.d4/ }).first();
    await expect(london).toBeVisible();
    const shot = async (l: typeof london) => (await l.locator("svg").first().innerHTML()).length;
    const a = await london.locator("svg").first().innerHTML();
    const b = await d4.locator("svg").first().innerHTML();
    expect(a).not.toBe(b);
    expect(await shot(london)).toBeGreaterThan(0);
  });

  test("is reachable from Learn, which is where somebody wanting one is", async ({ page }) => {
    await page.goto("/learn");
    await page.getByRole("button", { name: "I agree" }).click({ timeout: 10_000 }).catch(() => {});
    await page.getByRole("button", { name: /Maybe later/i }).click({ timeout: 10_000 }).catch(() => {});
    await page.getByRole("button", { name: "Close tour" }).click({ timeout: 10_000 }).catch(() => {});
    await page.getByRole("button", { name: /Whatever it takes/i }).click();
    await page.getByRole("button", { name: /punish mistakes/i }).click();
    const link = page.getByRole("link", { name: /Browse every course/ });
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.click();
    await expect(page).toHaveURL(/\/courses$/);
  });
});
