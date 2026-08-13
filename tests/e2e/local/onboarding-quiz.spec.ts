import { test, expect, type Page } from "@playwright/test";
import { horizontalOverflow } from "../helpers";

/**
 * The onboarding quiz is the acquisition funnel — every new user arrives
 * through it — and until now it had NO end-to-end coverage at all. Two real
 * defects reached it unseen: the CTA reading "See my results" on question 1,
 * and (nearly) a goal-rating step whose chart nobody had watched render.
 *
 * These walk the whole funnel as a logged-out visitor. No account is created
 * and no network secrets are needed: the platform branch is avoided so the
 * suite never depends on Lichess or Chess.com being reachable from CI.
 */

async function dismissConsent(page: Page) {
  await page.getByText("I agree").first().click({ timeout: 5_000 }).catch(() => {});
}

/** Advance, tolerating either CTA label. */
async function next(page: Page) {
  await page
    .getByRole("button", { name: /Continue|See my results/ })
    .first()
    .click();
  await page.waitForTimeout(400);
}

test("the quiz walks end to end on the self-assessment branch", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(String(e)));

  await page.goto("/onboarding");
  await dismissConsent(page);

  // Q1 — play style. The CTA must NOT claim to be the last step here.
  await expect(page.getByText("How do you currently play?")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("button", { name: "Continue" }).first()
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "See my results" })).toHaveCount(0);

  await page.getByText("Over the board").first().click();
  await next(page);

  // Q2-Q4 — self assessment.
  await expect(page.getByText(/How long have you played/i)).toBeVisible();
  await page.getByText("1–3 years").first().click();
  await next(page);

  await expect(page.getByText(/spot a fork or a pin/i)).toBeVisible();
  await page.getByText("Sometimes").first().click();
  await next(page);

  await page.getByText("A few online").first().click();
  await next(page);

  // Q5 — goals. Five phase categories, each with a board diagram.
  await expect(page.getByText("What do you want to improve?")).toBeVisible();
  for (const label of ["Tactics", "Openings", "Middlegame", "Endgame"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await page.getByText("Tactics", { exact: true }).first().click();
  await next(page);

  // Q6 — the goal rating, and the projection that made this PR worth checking.
  await expect(page.getByText(/rating do you want to reach/i)).toBeVisible();
  await expect(page.getByRole("slider")).toBeVisible();
  await next(page);

  // Q7 — daily time budget.
  await expect(page.getByText(/How much time can you practise|practice/i)).toBeVisible();
  await page.getByText("10–30 min / day").first().click();
  await next(page);

  // Q8 — frequency, and the genuinely final step.
  await expect(page.getByText(/How often can you practise|practice/i)).toBeVisible();
  await page.getByText("About 4 days").first().click();
  await expect(
    page.getByRole("button", { name: "See my results" })
  ).toBeVisible();

  expect(crashes, `page errors during the quiz: ${crashes.join(" | ")}`).toEqual([]);
});

test("the goal step renders a projection rather than an empty box", async ({ page }) => {
  await page.goto("/onboarding");
  await dismissConsent(page);

  await page.getByText("Over the board").first().click();
  await next(page);
  await page.getByText("1–3 years").first().click();
  await next(page);
  await page.getByText("Sometimes").first().click();
  await next(page);
  await page.getByText("A few online").first().click();
  await next(page);
  await page.getByText("Tactics", { exact: true }).first().click();
  await next(page);

  await expect(page.getByText(/rating do you want to reach/i)).toBeVisible();

  // The self-assessment branch supplies a current rating, so a projection must
  // actually be drawn — chart plus the honest range beside it. An empty panel
  // here is the failure this test exists to catch.
  await expect(page.getByText(/Most players land between/i)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator("svg.recharts-surface").first()).toBeVisible();

  // And it must never present itself as a promise.
  await expect(page.getByText(/not a promise/i)).toBeVisible();
});

test("the quiz has no sideways scroll on mobile", async ({ page }) => {
  await page.goto("/onboarding");
  await dismissConsent(page);
  await page.waitForLoadState("networkidle");
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});
