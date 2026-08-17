import { test, expect } from "@playwright/test";
import { dobYearsAgo } from "../helpers";

/**
 * COPPA DOB gate journey (client-side only — never submits a signup, so no
 * account is ever created and the suite is safe against any backend).
 */

async function openSignupTab(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.getByText("Sign up", { exact: true }).click();
}

test("signup shows the DOB gate before any form fields", async ({ page }) => {
  await openSignupTab(page);
  await expect(page.getByText(/what's your date of birth/i)).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await expect(page.getByText(/continue with google/i)).toHaveCount(0);
});

test("13+ DOB reveals the signup form and Google button", async ({ page }) => {
  await openSignupTab(page);
  await page.getByLabel("Date of birth").fill(dobYearsAgo(20));
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByText(/continue with google/i)).toBeVisible();
});

test("the dialog has a close control the keyboard can reach", async ({ page }) => {
  await openSignupTab(page);
  // Was a <div onClick>: no tab stop, no Enter/Space, invisible to AT.
  const close = page.getByRole("button", { name: "Close" });
  await expect(close).toBeVisible();
  await close.focus();
  await expect(close).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/what's your date of birth/i)).toBeHidden();
});

test("the lockout keeps focus inside the dialog, so Escape still works", async ({
  page,
}) => {
  await openSignupTab(page);
  await page.getByLabel("Date of birth").fill(dobYearsAgo(10));
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(
    page.getByText(/can't create an account for you right now/i)
  ).toBeVisible();

  // Deliberately no wait. The notice replaces the form and unmounts whatever
  // was focused; focus used to land on <body> for ~100ms until MUI's focus
  // trap pulled it back, and an Escape pressed in that window was swallowed.
  const focusInsideDialog = await page.evaluate(
    () => !!document.activeElement?.closest('[aria-modal="true"]')
  );
  expect(focusInsideDialog).toBe(true);

  await page.keyboard.press("Escape");
  await expect(
    page.getByText(/can't create an account for you right now/i)
  ).toBeHidden();
});

test("under-13 DOB blocks with a neutral notice and locks retries", async ({
  page,
}) => {
  await openSignupTab(page);
  await page.getByLabel("Date of birth").fill(dobYearsAgo(10));
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(
    page.getByText(/can't create an account for you right now/i)
  ).toBeVisible();

  // Reopen the dialog: the lockout must persist — no second try.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.getByText("Sign up", { exact: true }).click();
  await expect(
    page.getByText(/can't create an account for you right now/i)
  ).toBeVisible();
  await expect(page.getByLabel("Date of birth")).toHaveCount(0);
});
