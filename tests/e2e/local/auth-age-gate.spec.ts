import { test, expect } from "@playwright/test";

/**
 * COPPA age-gate journey (client-side only — never submits a signup, so no
 * account is ever created and the suite is safe against any backend).
 *
 * The gate is a single 13+ / Terms / Privacy consent checkbox. The under-13
 * lockout can no longer be triggered from the UI — it was set by the retired
 * DOB screen — but the localStorage flag is still honored, so that path is
 * covered by seeding the flag directly.
 */

const LEGACY_LOCK_KEY = "cm_age_gate_blocked";

async function openSignupTab(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /sign in/i })
    .first()
    .click();
  await page.getByText("Sign up", { exact: true }).click();
}

function ageCheckbox(page: import("@playwright/test").Page) {
  return page.getByRole("checkbox", { name: /at least 13 years old/i });
}

test("signup shows the age checkbox before any form fields", async ({
  page,
}) => {
  await openSignupTab(page);
  await expect(ageCheckbox(page)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Terms of Service" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Privacy Policy" })
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await expect(page.getByText(/continue with google/i)).toHaveCount(0);
});

test("confirming 13+ reveals the signup form and Google button", async ({
  page,
}) => {
  await openSignupTab(page);
  const cont = page.getByRole("button", { name: /^continue$/i });
  await expect(cont).toBeDisabled(); // no free pass without the affirmation
  await ageCheckbox(page).check();
  await cont.click();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByText(/continue with google/i)).toBeVisible();
});

test("the dialog has a close control the keyboard can reach", async ({
  page,
}) => {
  await openSignupTab(page);
  // Was a <div onClick>: no tab stop, no Enter/Space, invisible to AT.
  const close = page.getByRole("button", { name: "Close" });
  await expect(close).toBeVisible();
  await close.focus();
  await expect(close).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(ageCheckbox(page)).toBeHidden();
});

test("a legacy under-13 lock still blocks signup, keeps focus in the dialog", async ({
  page,
}) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "1"),
    LEGACY_LOCK_KEY
  );
  await openSignupTab(page);
  await expect(
    page.getByText(/can't create an account for you right now/i)
  ).toBeVisible();
  await expect(ageCheckbox(page)).toHaveCount(0);

  // Clicking the Sign up tab swapped the panel for the notice and unmounted
  // the focused element; focus used to land on <body> for ~100ms until MUI's
  // focus trap pulled it back, and an Escape pressed in that window was
  // swallowed. Deliberately no wait before asserting.
  const focusInsideDialog = await page.evaluate(
    () => !!document.activeElement?.closest('[aria-modal="true"]')
  );
  expect(focusInsideDialog).toBe(true);

  await page.keyboard.press("Escape");
  await expect(
    page.getByText(/can't create an account for you right now/i)
  ).toBeHidden();

  // Reopen: the lockout persists — no second try at the gate.
  await page
    .getByRole("button", { name: /sign in/i })
    .first()
    .click();
  await page.getByText("Sign up", { exact: true }).click();
  await expect(
    page.getByText(/can't create an account for you right now/i)
  ).toBeVisible();
  await expect(ageCheckbox(page)).toHaveCount(0);
});
