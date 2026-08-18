import { test, expect, type Page } from "@playwright/test";

/**
 * The "add an email" nag on /plan.
 *
 * Signup no longer requires an address, which buys a two-field signup and
 * costs recoverability: with nothing on file there is nowhere to send a reset
 * link. This card is the other half of that trade, so it is worth a spec that
 * proves it appears for exactly the accounts that need it and for no others.
 */

async function stub(page: Page, user: Record<string, unknown>) {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ json: { user, isIntern: false, isAdmin: false } })
  );
  await page.route("**/api/ratings/**", (r) =>
    r.fulfill({ json: { status: "no_username", trends: [] } })
  );
}

const NO_EMAIL = {
  uid: "e2e",
  handle: "LazerWizard",
  hasPassword: true,
  onboardingCompletedAt: 1,
};

test("an account with no email is told what it stands to lose", async ({
  page,
}) => {
  await stub(page, NO_EMAIL);
  await page.goto("/plan");
  await expect(page.getByText("Keep your account")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/nowhere to send a reset link/i)).toBeVisible();
});

test("an account that HAS an email is not nagged", async ({ page }) => {
  await stub(page, { ...NO_EMAIL, email: "someone@example.com" });
  await page.goto("/plan");
  await expect(page.getByText("Welcome back,")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Keep your account")).toHaveCount(0);
});

test("a Google account is not nagged — it arrived with an address", async ({
  page,
}) => {
  // hasPassword false means OAuth, which means an email already exists. Nagging
  // here would also ask for a password the account does not have.
  await stub(page, { ...NO_EMAIL, hasPassword: false });
  await page.goto("/plan");
  await expect(page.getByText("Welcome back,")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Keep your account")).toHaveCount(0);
});

test("saving asks for the password too, and sends both", async ({ page }) => {
  let posted: Record<string, unknown> | undefined;
  await stub(page, NO_EMAIL);
  await page.route("**/api/profile/email", async (route) => {
    posted = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ json: { user: {} } });
  });
  await page.goto("/plan");
  await page.getByRole("button", { name: "Add email" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "Email" }).fill("me@example.com");
  // The password field is the point: without it, a stolen session could
  // attach its own address and then send itself a reset.
  // Located by aria-label, not getByLabel: "Daily email reminders" further
  // down the page also matches a substring search for "Email"/"Password", and
  // the strict-mode violation reads as a missing field rather than an
  // ambiguous one.
  const pw = page.locator('input[aria-label="Password"]');
  await expect(pw).toBeVisible();
  await pw.fill("correct-horse-1!");
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect.poll(() => posted?.email).toBe("me@example.com");
  expect(posted?.password).toBe("correct-horse-1!");
});

test("Save stays disabled until both fields are filled", async ({ page }) => {
  await stub(page, NO_EMAIL);
  await page.goto("/plan");
  await page.getByRole("button", { name: "Add email" }).click({ timeout: 20_000 });
  const save = page.getByRole("button", { name: /^save$/i });
  await expect(save).toBeDisabled();
  await page.getByRole("textbox", { name: "Email" }).fill("me@example.com");
  await expect(save).toBeDisabled();
  await page.locator('input[aria-label="Password"]').fill("correct-horse-1!");
  await expect(save).toBeEnabled();
});

test("a rejected address is reported, not swallowed", async ({ page }) => {
  await stub(page, NO_EMAIL);
  await page.route("**/api/profile/email", (r) =>
    r.fulfill({
      status: 409,
      json: { error: "An account with this email already exists." },
    })
  );
  await page.goto("/plan");
  await page.getByRole("button", { name: "Add email" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "Email" }).fill("taken@example.com");
  await page.locator('input[aria-label="Password"]').fill("correct-horse-1!");
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(/already exists/i)).toBeVisible();
});
