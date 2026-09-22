import { expect, type Page } from "@playwright/test";

/**
 * A signed-in account with a linked platform, stubbed at the network edge.
 *
 * /plan and /profile both have no getServerSideProps — auth is client-side
 * through AuthContext, which reads /api/auth/me. Stubbing that endpoint gives
 * the REAL page, with the real components, in whichever account state we want,
 * without secrets and without creating anything.
 *
 * Shared by plan-cards.spec.ts and profile-setup.spec.ts since the goal setter
 * and handle card moved to /profile (2026-09-22): the two suites need the same
 * account, and two drifting copies of it would let a card pass on one page
 * while being broken on the other.
 */

const DAY = 86_400_000;

/** A year of daily rating points ending at `end`, drifting gently upward. */
export function series(end: number, days: number, step: number) {
  const t0 = Date.now() - days * DAY;
  return Array.from({ length: days }, (_, i) => ({
    t: t0 + i * DAY,
    rating: Math.round(end - (days - 1 - i) * step),
  }));
}

export interface AccountState {
  handle?: string;
  goal?: boolean;
  /** A goal set control-by-control, the way the setter writes it. */
  perfGoals?: boolean;
  /** Practice budget. 15 min fits ONE extra task, 30+ fits both. */
  time?: "under-10" | "10-30" | "30-plus" | "60-plus";
}

export async function stubAccount(page: Page, state: AccountState = {}) {
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

/** The consent banner is fixed-position and has intercepted clicks before
 *  (the mobile-signup bug of 2026-08-11). Answer it like a user would. */
export async function dismissConsent(page: Page) {
  const consent = page.getByRole("button", { name: "I agree" });
  if (await consent.isVisible().catch(() => false)) await consent.click();
}

/** The page is up when its own heading is on screen, not when navigation ends. */
export async function gotoPlan(page: Page) {
  await page.goto("/plan");
  await expect(page.getByText("Your rating trend")).toBeVisible({
    timeout: 20_000,
  });
  await dismissConsent(page);
}

/**
 * /profile, scrolled to the setup block at the bottom.
 *
 * The goal setter and handle card sit UNDER the performance panels — they
 * configure the product rather than report on it — so a bare goto leaves them
 * below the fold. Waiting on the page heading and then on the card itself is
 * what makes these specs about the card rather than about scroll position.
 */
export async function gotoProfile(page: Page) {
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Performance" })
  ).toBeVisible({ timeout: 20_000 });
  await dismissConsent(page);
}
