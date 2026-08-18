import { test, expect, type Page } from "@playwright/test";

/**
 * Handles: chosen at signup, and then actually USED to address people.
 *
 * Both halves are here because the second is the point of the first. #332
 * shipped handles claimable and nothing ever said one out loud, which is a
 * feature that exists only in the database.
 *
 * The signup half NEVER submits — it asserts the field is there and that a bad
 * handle is refused in the browser, so no account is created and the spec is
 * safe against any backend. The addressing half stubs /api/auth/me, the same
 * technique as plan-cards.spec.ts.
 */

async function openSignup(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /sign in/i })
    .first()
    .click();
  await page.getByText("Sign up", { exact: true }).click();
  // The COPPA gate is a 13+ affirmation checkbox (the DOB screen was retired
  // on main while this branch was open). No date is ever transmitted.
  await page.getByRole("checkbox", { name: /13 or older/i }).check();
  await page.getByRole("button", { name: /^continue$/i }).click();
}

/** Fill everything except the handle, so only the handle is under test. */
async function fillSignupExceptHandle(page: Page) {
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("longenough1!pass");
}

test.describe("signup asks for a handle", () => {
  test("the field is present and required", async ({ page }) => {
    await openSignup(page);
    // NOT { exact: true }: MUI renders a required label as "Handle *", so an
    // exact match silently finds nothing and the failure looks like a missing
    // field rather than a locator bug.
    const handle = page.getByLabel(/^Handle/);
    await expect(handle).toBeVisible();
    // Required is the whole change: #332 made handles claimable but optional,
    // which only queues up another cohort to prompt later.
    await expect(handle).toHaveAttribute("required", "");
  });

  test("it says the handle is public, before anyone types their name into it", async ({
    page,
  }) => {
    await openSignup(page);
    await expect(page.getByText(/other players see this/i)).toBeVisible();
  });

  test("a reserved handle is refused in the browser, with a specific reason", async ({
    page,
  }) => {
    let calls = 0;
    await page.route("**/api/auth/signup", (r) => {
      calls += 1;
      return r.fulfill({ status: 500, json: { error: "should not be called" } });
    });
    await openSignup(page);
    await fillSignupExceptHandle(page);
    await page.getByLabel(/^Handle/).fill("admin");
    await page
      .getByRole("button", { name: /create account|sign up/i })
      .first()
      .click();
    // Specific, not a generic 400 bounced back off the server.
    await expect(
      page.getByText(/reserved|not available|can't use/i).first()
    ).toBeVisible();
    expect(calls).toBe(0);
  });

  test("a too-short handle is refused without a round trip", async ({
    page,
  }) => {
    let calls = 0;
    await page.route("**/api/auth/signup", (r) => {
      calls += 1;
      return r.fulfill({ status: 500, json: { error: "should not be called" } });
    });
    await openSignup(page);
    await fillSignupExceptHandle(page);
    await page.getByLabel(/^Handle/).fill("ab");
    await page
      .getByRole("button", { name: /create account|sign up/i })
      .first()
      .click();
    await expect(page.getByText(/at least 3|too short/i).first()).toBeVisible();
    expect(calls).toBe(0);
  });
});

test.describe("the handle is what we call you", () => {
  async function stub(page: Page, user: Record<string, unknown>) {
    await page.route("**/api/auth/me", (r) =>
      r.fulfill({ json: { user, isIntern: false, isAdmin: false } })
    );
    await page.route("**/api/ratings/**", (r) =>
      r.fulfill({ json: { status: "no_username", trends: [] } })
    );
  }

  const BASE = {
    uid: "e2e",
    email: "someone@example.com",
    displayName: "Ana Sousa",
    onboardingCompletedAt: 1,
  };

  test("/plan greets by handle, not by the name they never chose", async ({
    page,
  }) => {
    await stub(page, { ...BASE, handle: "LazerWizard" });
    await page.goto("/plan");
    await expect(page.getByText("LazerWizard").first()).toBeVisible({
      timeout: 20_000,
    });
    // A handle exists so we do NOT have to put someone's real name on screen.
    await expect(page.getByText("Ana Sousa")).toHaveCount(0);
  });

  test("without a handle it falls back to the display name", async ({
    page,
  }) => {
    await stub(page, BASE);
    await page.goto("/plan");
    await expect(page.getByText("Welcome back,")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Ana").first()).toBeVisible();
  });

  test("with neither, the sentence still finishes", async ({ page }) => {
    // "Welcome back," with nothing after it reads as a bug, so the resolver
    // has a per-surface last resort rather than an empty string.
    await stub(page, {
      uid: "e2e",
      email: "someone@example.com",
      onboardingCompletedAt: 1,
    });
    await page.goto("/plan");
    await expect(page.getByText("Welcome back,")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("someone").first()).toBeVisible();
  });

  test("the avatar chip takes its initial from the same resolver", async ({
    page,
  }) => {
    await stub(page, { ...BASE, handle: "LazerWizard" });
    await page.goto("/plan");
    await expect(page.getByText("LazerWizard").first()).toBeVisible({
      timeout: 20_000,
    });
    // Located by its aria-label, not by its letter: the button correctly
    // names itself "Account menu" for assistive tech, so the letter is only
    // visible text. "L" for LazerWizard, not "A" for Ana — one chain, every
    // surface. This is the chip on every glassed route, and it kept saying
    // "A" after the first pass because a truncated grep hid NavPill.
    await expect(
      page.getByRole("button", { name: "Account menu" })
    ).toHaveText("L");
  });
});
