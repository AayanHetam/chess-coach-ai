import { test, expect } from "@playwright/test";

/**
 * First-visit WelcomeTour (src/components/onboarding/WelcomeTour.tsx).
 *
 * The config seeds `cm-welcome-tour-v1=1` for every local spec so the tour
 * stays out of their way; this file opts back out to test the virgin path.
 * Consent is granted via its cookie up front because the tour's modal
 * backdrop would otherwise sit on top of the consent banner's button.
 */
test.use({
  storageState: {
    cookies: [
      {
        name: "cm_consent",
        value: "accepted",
        domain: "127.0.0.1",
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  },
});

const dialog = (page: import("@playwright/test").Page) =>
  page.getByRole("dialog", { name: "Quick tour" });

test("first product-page visit walks Puzzles → Analyze → Plan, then stays dismissed", async ({
  page,
}) => {
  await page.goto("/puzzles");

  const tour = dialog(page);
  await expect(tour).toBeVisible({ timeout: 15_000 });
  await expect(tour.getByText("Find your way around")).toBeVisible();

  // The miniature nav must mirror the real pill's vocabulary.
  for (const label of ["Plan", "Play", "Analyze", "Practice", "Learn", "Scout"]) {
    await expect(tour.getByText(label, { exact: true })).toBeVisible();
  }

  // Step 1 — Puzzles, under Practice.
  await expect(
    tour.getByRole("heading", { name: "Solve puzzles, with a coach" }),
  ).toBeVisible();

  await tour.getByRole("button", { name: "Next" }).click();
  await expect(
    tour.getByRole("heading", { name: "See where your games turned" }),
  ).toBeVisible();

  // Back works, then forward again to the last step.
  await tour.getByRole("button", { name: "Back" }).click();
  await expect(
    tour.getByRole("heading", { name: "Solve puzzles, with a coach" }),
  ).toBeVisible();
  await tour.getByRole("button", { name: "Next" }).click();
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(
    tour.getByRole("heading", { name: "Plan ties it together" }),
  ).toBeVisible();

  // Finishing routes to the plan and marks the tour seen.
  await tour.getByRole("button", { name: "Start training" }).click();
  await expect(page).toHaveURL(/\/plan$/, { timeout: 15_000 });
  await expect(dialog(page)).toBeHidden();

  await page.reload();
  // Wait for hydrated chrome (the signed-out /plan page has no role=heading,
  // and the nav link row is display:none on mobile), so the dialog-hidden
  // check can't pass vacuously before the app booted.
  await expect(
    page.getByRole("button", { name: "Open menu" }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(dialog(page)).toBeHidden();
});

test("closing the tour also marks it seen", async ({ page }) => {
  await page.goto("/learn");

  const tour = dialog(page);
  await expect(tour).toBeVisible({ timeout: 15_000 });
  await tour.getByRole("button", { name: "Close tour" }).click();
  await expect(tour).toBeHidden();

  await page.goto("/analysis");
  await expect(dialog(page)).toBeHidden();
});

test("the tour stays off the marketing homepage", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
  await expect(dialog(page)).toBeHidden();
});
