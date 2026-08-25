import { test, expect, type Page } from "@playwright/test";

/**
 * The chapter contract screen, in a real browser.
 *
 * What cannot be unit-tested: whether the numbers the server computed and the
 * numbers on screen are the same numbers, whether the route is reachable from
 * the reader at all, and whether any of it survives 375px.
 *
 * The band is resolved server-side from a session cookie, so a signed-out
 * visitor here is the `improving` band. That is deliberate for this spec — the
 * band arithmetic is covered exhaustively in courseTrainerPage.test.ts, and
 * what is being checked here is the screen.
 */

async function dismissChrome(page: Page) {
  // The consent banner is a modal <dialog>: while it is open the rest of the
  // page is out of the accessibility tree entirely, so every role query finds
  // nothing for a reason that looks nothing like a consent banner.
  await page
    .getByRole("button", { name: "I agree" })
    .click({ timeout: 10_000 })
    .catch(() => {});
}

test.describe("the chapter contract", () => {
  test("says what the chapter is and what is left of it", async ({ page }) => {
    await page.goto("/train/course/w-london/0");
    await dismissChrome(page);

    // The chapter's own line, as a player writes it.
    await expect(page.getByText(/^1\.d4/)).toBeVisible();
    await expect(page.getByText(/% of what you meet here/)).toBeVisible();
    await expect(page.getByText("Before we teach anything, we ask.")).toBeVisible();

    // Three buckets, and nothing studied yet, so everything is unseen.
    const unseen = Number(await page.getByTestId("bucket-unseen").innerText());
    const learning = Number(await page.getByTestId("bucket-learning").innerText());
    const known = Number(await page.getByTestId("bucket-known").innerText());
    expect(unseen).toBeGreaterThan(0);
    expect(learning).toBe(0);
    expect(known).toBe(0);

    await expect(page.getByTestId("course-start")).toBeVisible();
  });

  test("is a bare route, so the board is not pushed off the screen", async ({ page }) => {
    await page.goto("/train/course/w-london/0");
    await dismissChrome(page);
    // THE ZERO: the number of site navigation landmarks on a full-viewport
    // session screen.
    await expect(page.locator("header nav")).toHaveCount(0);
  });

  test("is reachable from the chapter you are reading", async ({ page }) => {
    await page.goto("/learn/w-london");
    await dismissChrome(page);

    // Every chapter on the hub starts shut. Open the one we mean rather than
    // the first `[aria-expanded]` on the page, which is whatever the chrome put
    // there.
    const header = page.getByTestId("chapter-0").locator("[aria-expanded]").first();
    if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();

    const cta = page.getByTestId("chapter-0-train");
    await expect(cta).toBeVisible();

    await cta.click();
    await expect(page).toHaveURL(/\/train\/course\/w-london\/0/);
    await expect(page.getByText("Before we teach anything, we ask.")).toBeVisible();
  });

  test("goes back to the course, not to the plan", async ({ page }) => {
    // /train/opening exits to /plan. A course learner may never have measured
    // a plan, and stranding them on one would be a dead end.
    await page.goto("/train/course/w-london/0");
    await dismissChrome(page);
    await page.getByTestId("course-trainer-back").click();
    await expect(page).toHaveURL(/\/learn\/w-london/);
  });

  test("404s a chapter that does not exist", async ({ page }) => {
    const res = await page.goto("/train/course/w-london/40");
    expect(res?.status()).toBe(404);
  });

  test("404s a course that does not exist", async ({ page }) => {
    const res = await page.goto("/train/course/not-a-course/0");
    expect(res?.status()).toBe(404);
  });

  test("fits the viewport it is given", async ({ page }, testInfo) => {
    await page.goto("/train/course/w-london/0");
    await dismissChrome(page);
    await expect(page.getByTestId("course-buckets")).toBeVisible();

    // No horizontal scroll, at either width. The buckets are a three-column
    // grid and 375px is where that either works or does not.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // Every control is thumb-sized.
    for (const id of ["course-start", "course-trainer-back"]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    await testInfo.attach(`contract-${testInfo.project.name}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
});
