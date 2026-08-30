import { test, expect, type Page } from "@playwright/test";

/**
 * /plan renders — the cards, not the modules behind them.
 *
 * Everything shipped to /plan on 2026-08-17 (goal setter, goal progress, the
 * forward projection, the analyze/theory tasks, the handle card) was verified
 * by unit tests, a production build, and grepping the bundle for strings. None
 * of it was ever observed on a screen. Twice that day a green suite sat on top
 * of a wrong screen, so the gap is not theoretical.
 *
 * /plan has no getServerSideProps — auth is client-side through AuthContext,
 * which reads /api/auth/me. Stubbing that endpoint gives the REAL page, with
 * the real components, in whichever account state we want, without secrets and
 * without creating anything. That is the point: these are the shipped
 * components, not a storybook of look-alikes.
 */

const DAY = 86_400_000;

/** A year of daily rating points ending at `end`, drifting gently upward. */
function series(end: number, days: number, step: number) {
  const t0 = Date.now() - days * DAY;
  return Array.from({ length: days }, (_, i) => ({
    t: t0 + i * DAY,
    rating: Math.round(end - (days - 1 - i) * step),
  }));
}

interface AccountState {
  handle?: string;
  goal?: boolean;
  /** A goal set control-by-control, the way the new setter writes it. */
  perfGoals?: boolean;
  /** Practice budget. 15 min fits ONE extra task, 30+ fits both. */
  time?: "under-10" | "10-30" | "30-plus" | "60-plus";
}

async function stubAccount(page: Page, state: AccountState = {}) {
  const user: Record<string, unknown> = {
    uid: "e2e-user",
    email: "e2e@example.com",
    displayName: "E2E",
    chesscomUsername: "Lazer_Wizard",
    platformRatingSource: "chesscom",
    platformRating: 1805,
    platformRatingRaw: 1805,
    platformRatingPerf: "rapid",
    dailyTimeCommitment: state.time ?? "10-30",
    practiceDaysPerWeek: 5,
    // Quiz already done. Without it OnboardingNudge opens a MUI Modal over the
    // page, and a modal marks the rest of the app aria-hidden — every
    // getByRole() below then finds nothing, on a page that looks fine in a
    // screenshot. That is a property of modals, not a bug, but it makes the
    // account state the test runs in load-bearing.
    onboardingCompletedAt: Date.now() - 30 * DAY,
  };
  if (state.handle) user.handle = state.handle;
  if (state.goal || state.perfGoals) {
    Object.assign(user, {
      goalRating: 2000,
      goalStartRating: 1805,
      goalSetAt: Date.now() - 7 * DAY,
      goalTargetDate: Date.now() + 220 * DAY,
    });
  }
  if (state.perfGoals) {
    // Starts sit BELOW the history stub's live currents (1289/1425/1805) so
    // the progress rows have real distance-covered to draw.
    Object.assign(user, {
      perfGoals: {
        bullet: { start: 1240, goal: 1500 },
        blitz: { start: 1380, goal: 1600 },
        rapid: { start: 1740, goal: 2000 },
      },
    });
  }

  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ json: { user, isIntern: false, isAdmin: false } })
  );
  // Already fresh, so useEnsurePlatformRating must not fire. Stubbed anyway:
  // an unstubbed call would 401 and the failure would look like the page's.
  await page.route("**/api/ratings/lookup**", (r) =>
    r.fulfill({ json: { rating: 1805, raw: 1805, perf: "rapid" } })
  );
  await page.route("**/api/ratings/history**", (r) =>
    r.fulfill({
      json: {
        status: "ok",
        platform: "chesscom",
        username: "Lazer_Wizard",
        windowDays: 365,
        trends: [
          {
            perf: "bullet",
            platform: "chesscom",
            points: series(1289, 60, 4),
            current: 1289,
            delta: 236,
          },
          {
            perf: "blitz",
            platform: "chesscom",
            points: series(1425, 60, 2.2),
            current: 1425,
            delta: 132,
          },
          {
            perf: "rapid",
            platform: "chesscom",
            points: series(1805, 60, 1),
            current: 1805,
            delta: 59,
          },
        ],
      },
    })
  );
}

/** The page is up when its own heading is on screen, not when navigation ends. */
async function gotoPlan(page: Page) {
  await page.goto("/plan");
  await expect(page.getByText("Your rating trend")).toBeVisible({
    timeout: 20_000,
  });
  // The consent banner is fixed-position and has intercepted clicks before
  // (the mobile-signup bug of 2026-08-11). Answer it like a user would.
  const consent = page.getByRole("button", { name: "I agree" });
  if (await consent.isVisible().catch(() => false)) await consent.click();
}

test.describe("no goal set", () => {
  test.beforeEach(async ({ page }) => {
    await stubAccount(page);
  });

  test("the goal setter is offered, since the quiz is one-time", async ({
    page,
  }) => {
    await gotoPlan(page);
    // The whole reason this card exists: existing accounts were never asked.
    await expect(
      page.getByRole("button", { name: "Commit to my goal" })
    ).toBeVisible();
  });

  test("there is exactly ONE rating goal to set", async ({ page }) => {
    await gotoPlan(page);
    // /plan carried a second, older goal setter (GoalsCard) writing
    // goals.targetRating and scoring it against the PUZZLE rating. Two "Set a
    // goal" buttons, two fields, two scales — visible the moment the page was
    // looked at, invisible to every unit test.
    await expect(
      page.getByRole("button", { name: /^set a goal$/i })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Commit to my goal" })
    ).toHaveCount(1);
  });

  test("all three controls are offered, currents prefilled from the platform", async ({
    page,
  }) => {
    await gotoPlan(page);
    // The current side comes from the SAME response the trend panels render,
    // so the number in the box is the number on the chart below it.
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
    await gotoPlan(page);
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
    await gotoPlan(page);
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
    await gotoPlan(page);
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
    await gotoPlan(page);

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
    await gotoPlan(page);
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
    await gotoPlan(page);
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
    await gotoPlan(page);
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
    await gotoPlan(page);
    await expect(page.getByText("Pick your handle")).toHaveCount(0);
  });
});
