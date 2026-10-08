import { test, expect } from "@playwright/test";
import { stubAccount, gotoProfile } from "./ratedAccount";

/**
 * /profile — the setup block under the performance panels.
 *
 * The goal setter and the handle card moved here from /plan on 2026-09-22.
 * The onboarding quiz asks both questions at signup now, so what is left of
 * them is the door back in: changing a goal, and the accounts that predate
 * the questions entirely.
 *
 * These are the same assertions that used to guard them on /plan (see
 * plan-cards.spec.ts for why they exist at all: everything shipped to that
 * page on 2026-08-17 was verified by unit tests and a production build, and
 * none of it was ever observed on a screen). They follow the cards rather
 * than the page, because what they are really about is whether the card
 * works, and a move is exactly when that stops being true silently.
 */

test.describe("no goal set", () => {
  test.beforeEach(async ({ page }) => {
    await stubAccount(page);
  });

  test("the goal setter is offered, since the quiz is one-time", async ({
    page,
  }) => {
    await gotoProfile(page);
    // The whole reason this card exists: existing accounts were never asked.
    await expect(
      page.getByRole("button", { name: "Commit to my goal" })
    ).toBeVisible();
  });

  test("all three controls are offered, currents prefilled from the platform", async ({
    page,
  }) => {
    await gotoProfile(page);
    // The current side comes from the SAME response the trend panels render,
    // so the number in the box is the number on the chart above it.
    await expect(page.getByLabel("Bullet current rating")).toHaveValue("1289");
    await expect(page.getByLabel("Blitz current rating")).toHaveValue("1425");
    await expect(page.getByLabel("Rapid current rating")).toHaveValue("1805");
    // No goal typed anywhere yet — nothing to commit.
    await expect(
      page.getByRole("button", { name: "Commit to my goal" })
    ).toBeDisabled();
  });

  test("typing one goal is enough, and the patch stores it per control", async ({
    page,
  }) => {
    let patched: Record<string, unknown> | undefined;
    await page.route("**/api/users/me", async (route) => {
      if (route.request().method() === "PATCH") {
        patched = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill({ json: { ok: true } });
      }
      return route.fallback();
    });
    await gotoProfile(page);
    await expect(page.getByLabel("Rapid current rating")).toHaveValue("1805");

    await page.getByLabel("Rapid goal rating").fill("2000");
    // The gain chip is the Acely-style receipt that both numbers were read.
    await expect(page.getByText("+195 pts")).toBeVisible();

    const commit = page.getByRole("button", { name: "Commit to my goal" });
    await expect(commit).toBeEnabled();
    await commit.click();

    await expect.poll(() => patched).toBeTruthy();
    // Raw per-control numbers, plus the overall pair every existing reader
    // consumes. Chess.com IS the calibration scale, so they match here.
    expect(patched!.perfGoals).toEqual({ rapid: { start: 1805, goal: 2000 } });
    expect(patched!.goalRating).toBe(2000);
    expect(patched!.goalStartRating).toBe(1805);
    expect(patched!.goalTargetDate).toBeGreaterThan(Date.now());
  });

  test("a goal below the current rating is refused on the card", async ({
    page,
  }) => {
    await gotoProfile(page);
    await expect(page.getByLabel("Rapid current rating")).toHaveValue("1805");
    await page.getByLabel("Rapid goal rating").fill("1700");
    await expect(page.getByText("Set a goal above 1805")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Commit to my goal" })
    ).toBeDisabled();
  });

  test("an out-of-reach goal warns instead of promising a date", async ({
    page,
  }) => {
    await gotoProfile(page);
    await expect(page.getByLabel("Rapid current rating")).toHaveValue("1805");
    // +1195 at 15 min × 5 days runs past the model's 5-year ceiling. (2800
    // used to be enough here; the 2026-08-26 pace retune brought it inside
    // the ceiling, so the test now uses the input's 3000 cap.) The button
    // staying dead with no explanation would read as a broken page.
    await page.getByLabel("Rapid goal rating").fill("3000");
    await expect(page.getByText(/hard to reach at your pace/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Commit to my goal" })
    ).toBeDisabled();
  });
});

test.describe("a goal already set", () => {
  test("the committed numbers are shown rather than the form", async ({
    page,
  }) => {
    // Re-opening the whole form on every visit reads as "this was never
    // saved". The summary states what they committed to, with one way back in.
    await stubAccount(page, { perfGoals: true });
    await gotoProfile(page);
    await expect(page.getByText(/Aiming for Bullet 1500/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Commit to my goal" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Change goal" })
    ).toBeVisible();
  });

  test("Change goal opens the form seeded with those numbers", async ({
    page,
  }) => {
    await stubAccount(page, { perfGoals: true });
    await gotoProfile(page);
    await page.getByRole("button", { name: "Change goal" }).click();
    await expect(page.getByLabel("Rapid goal rating")).toHaveValue("2000");
    await expect(
      page.getByRole("button", { name: "Update my goal" })
    ).toBeVisible();
  });

  test("/plan's Change goal lands on the open form, not on the summary", async ({
    page,
  }) => {
    // The #goals deep link exists to save that second click. If it stops
    // opening the form, the link silently becomes a scroll.
    await stubAccount(page, { perfGoals: true });
    await page.goto("/profile#goals");
    await expect(
      page.getByRole("heading", { name: "Performance" })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Rapid goal rating")).toHaveValue("2000", {
      timeout: 10_000,
    });
  });
});

test.describe("handle card", () => {
  test("Claim only enables once the server says the handle is free", async ({
    page,
  }) => {
    await stubAccount(page);
    let asked = "";
    await page.route("**/api/profile/handle**", async (route) => {
      const url = new URL(route.request().url());
      asked = url.searchParams.get("handle") ?? "";
      await route.fulfill({ json: { available: true } });
    });
    await gotoProfile(page);

    const field = page.getByLabel("Handle");
    const claim = page.getByRole("button", { name: /^claim/i });
    await expect(field).toBeVisible();
    // The falsification the whole exercise is for: if the availability check
    // never reaches the endpoint, this button never enables and the feature is
    // dead on the screen while every unit test still passes.
    await expect(claim).toBeDisabled();
    await field.fill("lazerwizard");
    await expect(claim).toBeEnabled({ timeout: 5_000 });
    await expect(page.getByText(/is free/i)).toBeVisible();
    expect(asked).toBe("lazerwizard");
  });

  test("a taken handle keeps Claim disabled and says so", async ({ page }) => {
    await stubAccount(page);
    await page.route("**/api/profile/handle**", (r) =>
      r.fulfill({
        json: { available: false, message: "That handle is taken." },
      })
    );
    await gotoProfile(page);
    await page.getByLabel("Handle").fill("lazerwizard");
    await expect(page.getByText(/that handle is taken/i)).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole("button", { name: /^claim/i })).toBeDisabled();
  });

  test("a bad handle is refused in the browser, without asking the server", async ({
    page,
  }) => {
    await stubAccount(page);
    let calls = 0;
    await page.route("**/api/profile/handle**", (r) => {
      calls += 1;
      return r.fulfill({ json: { available: true } });
    });
    await gotoProfile(page);
    await page.getByLabel("Handle").fill("admin");
    await expect(
      page.getByText(/reserved|not available|can't use/i).first()
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^claim/i })).toBeDisabled();
    expect(calls).toBe(0);
  });

  test("claiming posts the handle and the card gets out of the way", async ({
    page,
  }) => {
    await stubAccount(page);
    let posted: string | undefined;
    await page.route("**/api/profile/handle**", async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        posted = (req.postDataJSON() as { handle?: string }).handle;
        return route.fulfill({ json: { ok: true, handle: "lazerwizard" } });
      }
      return route.fulfill({ json: { available: true } });
    });
    await gotoProfile(page);
    await page.getByLabel("Handle").fill("lazerwizard");
    await expect(page.getByRole("button", { name: /^claim/i })).toBeEnabled({
      timeout: 5_000,
    });
    await page.getByRole("button", { name: /^claim/i }).click();
    await expect(page.getByText("Pick your handle")).toHaveCount(0);
    expect(posted).toBe("lazerwizard");
  });

  test("an account that already has a handle is not asked again", async ({
    page,
  }) => {
    await stubAccount(page, { handle: "LazerWizard" });
    await gotoProfile(page);
    await expect(page.getByText("Pick your handle")).toHaveCount(0);
  });
});
