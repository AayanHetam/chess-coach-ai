import { test, expect, type Page } from "@playwright/test";

/**
 * The in-app account deletion, exercised in a real browser.
 *
 * Unit tests prove the deleter clears the right Firestore surfaces. They
 * cannot prove a user can REACH it, and "reachable" is the entire compliance
 * claim here — a delete function nobody can find is the state this repo was
 * already in, as an operator CLI behind a Gmail address.
 *
 * So the assertions are about the path: the control exists on the settings
 * surface, the destructive button stays disabled until the confirmation phrase
 * is typed exactly, and the click actually calls the endpoint.
 */

const ACCOUNT = "e2e-delete";

async function stub(page: Page) {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: {
        user: {
          uid: ACCOUNT,
          email: "e@x.com",
          handle: "e2edelete",
          displayName: "E",
          onboardingCompletedAt: Date.now(),
        },
        isIntern: false,
        isAdmin: false,
      },
    })
  );
  await page.addInitScript(
    `try { localStorage.setItem("cm_onboarding_nudge_dismissed", "1"); localStorage.setItem("cm_welcome_tour_seen", "1"); } catch {}`
  );
}

/**
 * Open Settings -> Account the way a user does: the account menu in the nav
 * pill, then the Settings item. Going through the real menu is the point —
 * asserting the dialog renders would not prove anybody can get to it.
 */
async function openAccountTab(page: Page) {
  await page.goto("/profile");
  await page.getByRole("button", { name: /account menu/i }).click();
  await page.getByRole("menuitem", { name: /^settings$/i }).click();
  await page.getByRole("tab", { name: /account/i }).click();
}

test.describe("delete my account", () => {
  test("is reachable from settings without contacting support", async ({
    page,
  }) => {
    await stub(page);
    await openAccountTab(page);
    await expect(
      page.getByRole("button", { name: /delete my account/i })
    ).toBeVisible();
  });

  test("stays disabled until DELETE is typed exactly", async ({ page }) => {
    await stub(page);
    await openAccountTab(page);
    await page.getByRole("button", { name: /delete my account/i }).click();

    const confirmButton = page.getByRole("button", { name: /delete forever/i });
    await expect(confirmButton).toBeDisabled();

    const field = page.getByLabel(/type delete to confirm/i);
    // Near-misses must not arm it.
    await field.fill("delete");
    await expect(confirmButton).toBeDisabled();
    await field.fill("DELETE ME");
    await expect(confirmButton).toBeDisabled();

    await field.fill("DELETE");
    await expect(confirmButton).toBeEnabled();
  });

  test("calls the endpoint with the confirmation phrase", async ({ page }) => {
    await stub(page);
    let posted: unknown = null;
    await page.route("**/api/account/delete", (r) => {
      posted = r.request().postDataJSON();
      return r.fulfill({ json: { ok: true, deleted: [], partial: false } });
    });

    await openAccountTab(page);
    await page.getByRole("button", { name: /delete my account/i }).click();
    await page.getByLabel(/type delete to confirm/i).fill("DELETE");
    await page.getByRole("button", { name: /delete forever/i }).click();

    await page.waitForURL(/deleted=1/);
    expect(posted).toEqual({ confirm: "DELETE" });
  });
});
