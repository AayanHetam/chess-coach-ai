import { test, expect, type Page } from "@playwright/test";

/**
 * The hub, the reader and the explorer, in a real browser.
 *
 * What no unit test can see: whether the chapter list actually opens, whether
 * stepping through a line moves the board, and whether the explorer's hits go
 * anywhere. The band here is `improving` — these runs are signed out and the
 * page resolves the band from a session cookie — which is deliberate: the band
 * arithmetic is covered exhaustively in unit tests.
 */

async function dismissChrome(page: Page) {
  await page
    .getByRole("button", { name: "I agree" })
    .click({ timeout: 10_000 })
    .catch(() => {});
}

test.describe("the course hub", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/learn/w-london");
    await dismissChrome(page);
  });

  test("says what the course is and how far through it you are", async ({ page }, testInfo) => {
    await expect(page.getByRole("heading", { name: "London System" })).toBeVisible();
    await expect(page.getByTestId("hub-verdict")).toContainText(/chapters/);

    // Signed out, so nothing is known — and the denominator is what a session
    // can ASK, never the course's own size, or the bar could not fill.
    const progress = await page.getByTestId("progress-count").innerText();
    expect(progress).toMatch(/^0 of \d+ decisions$/);

    await testInfo.attach(`hub-${testInfo.project.name}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test("a chapter opens onto its studies and its two ways in", async ({ page }) => {
    const row = page.getByTestId("chapter-0");
    // Every chapter starts shut: the hub is a list to scan, not a wall of text.
    await expect(page.getByTestId("chapter-0-train")).toHaveCount(0);

    await row.locator("[aria-expanded]").first().click();
    await expect(page.getByTestId("chapter-0-read")).toBeVisible();
    await expect(page.getByTestId("chapter-0-train")).toBeVisible();
    await expect(page.getByTestId("chapter-0-drill")).toBeVisible();

    // The London's first chapter is big enough to split, so it has studies.
    await expect(page.getByTestId("study-0-d5")).toBeVisible();
  });

  test("continue goes to the reader, not to the trainer", async ({ page }) => {
    // A reader BEFORE the confrontation is the shape this was built to.
    await page.getByTestId("hub-continue").click();
    await expect(page).toHaveURL(/\/learn\/w-london\/\d+/);
    await expect(page.getByTestId("reader-panel")).toBeVisible();
  });

  test("fits the viewport it is given", async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("the reader", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/learn/w-london/0");
    await dismissChrome(page);
  });

  test("shows our move face up, with what is measured about it", async ({ page }, testInfo) => {
    // Everything is face up here. Asking is the trainer's job.
    await expect(page.getByTestId("reader-our-move")).toBeVisible();
    await expect(page.getByTestId("reader-line")).toHaveText("1.d4 Nf6");

    await testInfo.attach(`reader-${testInfo.project.name}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test("steps forward and back, and the board follows", async ({ page }) => {
    const line = page.getByTestId("reader-line");
    // The PIECE, not the square's text: a square also renders its coordinate
    // label, so `toHaveText` on an empty square matches "c" and the assertion
    // passes on a board that never moved.
    const bishop = (square: string) => page.locator(`[data-square="${square}"] [data-piece="wB"]`);
    await expect(bishop("c1")).toHaveCount(1);

    await page.getByTestId("reader-forward").click();
    await expect(line).toHaveText("1.d4 Nf6 2.Bf4");
    await expect(bishop("f4")).toHaveCount(1);
    await expect(bishop("c1")).toHaveCount(0);

    await page.getByTestId("reader-back-move").click();
    await expect(line).toHaveText("1.d4 Nf6");
    await expect(bishop("c1")).toHaveCount(1);
  });

  test("their replies are choosable, and carry what people play", async ({ page }) => {
    await page.getByTestId("reader-forward").click();
    const replies = page.getByTestId("reader-their-move");
    await expect(replies).toBeVisible();
    await expect(replies).toContainText("%");

    await page.getByTestId("reader-reply-d5").click();
    await expect(page.getByTestId("reader-line")).toHaveText("1.d4 Nf6 2.Bf4 d5");
  });

  test("hands off to the trainer", async ({ page }) => {
    await page.getByTestId("reader-train").click();
    await expect(page).toHaveURL(/\/train\/course\/w-london\/0/);
    await expect(page.getByTestId("course-headline")).toHaveText(
      "Before we teach anything, we ask."
    );
  });
});

test.describe("the explorer", () => {
  test("finds a position and opens the reader on it", async ({ page }) => {
    await page.goto("/learn/w-london");
    await dismissChrome(page);

    await page.getByTestId("hub-explorer").click();
    const dialog = page.getByTestId("course-explorer");
    await expect(dialog).toBeVisible();

    await page.getByTestId("explorer-input").fill("d4 d5 Bf4");
    const hit = dialog.locator('[data-testid^="explorer-hit-"]').first();
    await expect(hit).toBeVisible({ timeout: 10_000 });
    await hit.click();

    await expect(page).toHaveURL(/\/learn\/w-london\/\d+\?line=/);
    await expect(page.getByTestId("reader-line")).toContainText("1.d4 d5 2.Bf4");
  });

  test("says so when nothing matches, rather than showing nothing", async ({ page }) => {
    await page.goto("/learn/w-london");
    await dismissChrome(page);
    await page.getByTestId("hub-explorer").click();
    await page.getByTestId("explorer-input").fill("e4 e5 Nf3 Nc6 Bb5");
    await expect(page.getByTestId("explorer-empty")).toBeVisible({ timeout: 10_000 });
  });
});
