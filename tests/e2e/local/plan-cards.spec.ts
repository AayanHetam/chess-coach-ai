import { test, expect } from "@playwright/test";
import { stubAccount, gotoPlan } from "./ratedAccount";

/**
 * /plan renders — the cards, not the modules behind them.
 *
 * Everything shipped to /plan on 2026-08-17 (goal setter, goal progress, the
 * forward projection, the analyze/theory tasks, the handle card) was verified
 * by unit tests, a production build, and grepping the bundle for strings. None
 * of it was ever observed on a screen. Twice that day a green suite sat on top
 * of a wrong screen, so the gap is not theoretical.
 *
 * Two of those cards have since left. The goal SETTER and the handle card
 * moved to /profile on 2026-09-22 — the quiz asks both questions at signup
 * now, so what is left of them is a settings form, and a settings form has no
 * business standing between a user and their daily plan. Their coverage moved
 * with them, to profile-setup.spec.ts. What stays here is what /plan still
 * owns: the progress card, the forecast, and the way in to set a goal.
 */

test.describe("no goal set", () => {
  test.beforeEach(async ({ page }) => {
    await stubAccount(page);
  });

  test("the way to set one is offered, not the form itself", async ({
    page,
  }) => {
    await gotoPlan(page);
    // A user with no goal must not hit a dead end here — the quiz is
    // one-time, so for an account that predates it this link is the only
    // route to a goal at all. What it must NOT be is the form: /plan is the
    // daily session, and a settings card ahead of it is a page that asks you
    // to configure it before it will help you.
    await expect(page.getByText("Set a rating goal")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Commit to my goal" })
    ).toHaveCount(0);
    await expect(page.getByLabel("Rapid current rating")).toHaveCount(0);
  });

  test("that way leads to the setter on /profile", async ({ page }) => {
    await gotoPlan(page);
    await page.getByText("Set a rating goal").click();
    await expect(page).toHaveURL(/\/profile#goals$/);
    await expect(
      page.getByRole("button", { name: "Commit to my goal" })
    ).toBeVisible({ timeout: 20_000 });
  });

  test("there is exactly ONE rating goal to set", async ({ page }) => {
    await gotoPlan(page);
    // /plan carried a second, older goal setter (GoalsCard) writing
    // goals.targetRating and scoring it against the PUZZLE rating. Two "Set a
    // goal" buttons, two fields, two scales — visible the moment the page was
    // looked at, invisible to every unit test. Now that the setter itself
    // lives on /profile, neither belongs here.
    await expect(
      page.getByRole("button", { name: /^set a goal$/i })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Commit to my goal" })
    ).toHaveCount(0);
  });

  test("the panels SAY why there is no forecast", async ({ page }) => {
    await gotoPlan(page);
    // Without this line, less-rendered and broken look identical to a reader.
    await expect(
      page.getByText(/set a goal above and these extend/i)
    ).toBeVisible();
  });

  test("no goal means no forecast line is drawn", async ({ page }) => {
    await gotoPlan(page);
    const dashed = page.locator('svg path[stroke-dasharray="4 4"]');
    await expect(dashed).toHaveCount(0);
  });
});

test.describe("goal set", () => {
  test.beforeEach(async ({ page }) => {
    await stubAccount(page, { goal: true });
  });

  test("each panel draws a dashed forecast, and the page says what dashed means", async ({
    page,
  }) => {
    await gotoPlan(page);
    await expect(
      page.getByText(/dashed = where each control could reach/i)
    ).toBeVisible();
    // Three panels, three forecasts. Recharts draws the dashed Area as its own
    // path, so a missing projection is a count of 0 rather than a subtle shape.
    // `.recharts-area-curve`, not any dashed path: recharts draws each Area as
    // TWO paths (fill + curve) and both inherit the dash, so a naive count
    // reads 6 and tells you nothing about how many panels forecast.
    await expect(
      page.locator('svg path.recharts-area-curve[stroke-dasharray="4 4"]')
    ).toHaveCount(3);
  });

  test("the explainer for the no-goal case is gone", async ({ page }) => {
    await gotoPlan(page);
    await expect(
      page.getByText(/set a goal above and these extend/i)
    ).toHaveCount(0);
  });

  test("the forecast gets the width its time span deserves", async ({
    page,
  }) => {
    await gotoPlan(page);
    // 60 days of history, 220 days of forecast. recharts defaults `dataKey` to
    // a CATEGORY axis, which spaces by index — one point per history day
    // against eight projection points put ~7 months in an eighth of the panel.
    // Geometry is the only thing that catches this; the dashed line is present
    // and correct either way.
    const solid = await page
      .locator("svg path.recharts-area-curve:not([stroke-dasharray])")
      .first()
      .boundingBox();
    const dashed = await page
      .locator('svg path.recharts-area-curve[stroke-dasharray="4 4"]')
      .first()
      .boundingBox();
    expect(solid).not.toBeNull();
    expect(dashed).not.toBeNull();
    // 220/60 is 3.7x; anything under 2x means the axis is not measuring time.
    expect(dashed!.width / solid!.width).toBeGreaterThan(2);
  });

  test("the goal line is drawn on the control the goal is about, and only that one", async ({
    page,
  }) => {
    await gotoPlan(page);
    // Recharts DISCARDS a ReferenceLine outside the y domain, so this rendered
    // zero elements on all three panels until the domain included it. Rapid is
    // where the 1805 platform rating came from, so rapid is where 2000 means
    // something; 2000 on the 1289 bullet panel is a different scale entirely.
    const lines = page.locator(".recharts-reference-line");
    await expect(lines).toHaveCount(1);
    await expect(page.getByText("goal 2000")).toBeVisible();
  });

  test("a control-by-control goal draws its own line on every panel it names", async ({
    page,
  }) => {
    await stubAccount(page, { perfGoals: true });
    await gotoPlan(page);
    // Each line carries that control's OWN raw target — not the overall goal
    // stamped three times onto three different scales.
    await expect(page.locator(".recharts-reference-line")).toHaveCount(3);
    await expect(page.getByText("goal 1500")).toBeVisible();
    await expect(page.getByText("goal 1600")).toBeVisible();
    await expect(page.getByText("goal 2000")).toBeVisible();
  });

  test("the progress card tracks each control against its own goal", async ({
    page,
  }) => {
    await stubAccount(page, { perfGoals: true });
    await gotoPlan(page);
    // "now" comes from the live platform numbers (1289/1425/1805), measured
    // against each control's own stored target — not the overall anchor goal
    // restated three times.
    await expect(page.getByText("1289 · 211 to go")).toBeVisible();
    await expect(page.getByText("1425 · 175 to go")).toBeVisible();
    await expect(page.getByText("1805 · 195 to go")).toBeVisible();
  });

  test("a control with no measurable current claims nothing", async ({
    page,
  }) => {
    await stubAccount(page, { perfGoals: true });
    // History gone (platforms unreachable). Progress needs a measured "now";
    // without one the rows must say so rather than drawing 0% covered.
    await page.route("**/api/ratings/history**", (r) =>
      r.fulfill({
        json: { status: "unavailable", message: "down", trends: [] },
      })
    );
    await page.goto("/plan");
    // Not gotoPlan(): with history unavailable the trends section renders its
    // failure message instead of the "Your rating trend" heading it waits on.
    await expect(page.getByText("1500 · no recent games")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("2000 · no recent games")).toBeVisible();
    await expect(page.getByText(/to go/)).toHaveCount(0);
  });

  test("a 30-minute budget buys both the game review and the theory task", async ({
    page,
  }) => {
    // 30 minutes on purpose. At 15 only ONE secondary task fits, and which one
    // rotates by day — asserting both there would pass or fail by calendar.
    await stubAccount(page, { goal: true, time: "30-plus" });
    await gotoPlan(page);
    await expect(page.getByText("Review one of your games")).toBeVisible();
    const theory = page.getByText("Build your repertoire");
    await expect(theory).toBeVisible();
    // It used to send people to Chessly with copy promising we were building
    // our own. We have. Nothing anywhere links out to a competitor, and THE
    // TASK ITSELF stays on the site.
    //
    // Scoped to the task's own anchor, not `a[href="/learn"]`: that also matches
    // the nav pill, which is collapsed on mobile, so the generic locator passed
    // on desktop and failed on a 375px viewport for a reason that had nothing
    // to do with the task.
    await expect(page.locator('a[href*="chessly"]')).toHaveCount(0);
    const taskLink = page.locator('a', { has: page.getByText("Build your repertoire") }).first();
    await expect(taskLink).toHaveAttribute("href", "/learn");
    await expect(taskLink).not.toHaveAttribute("target", "_blank");
  });
});

test.describe("the handle card is not here any more", () => {
  test("an account with no handle is asked on /profile, not on the plan", async ({
    page,
  }) => {
    // It used to sit above the goal card. Both were prompts bolted onto the
    // daily page because the quiz never asked; the quiz asks now.
    await stubAccount(page);
    await gotoPlan(page);
    await expect(page.getByText("Pick your handle")).toHaveCount(0);
  });
});
