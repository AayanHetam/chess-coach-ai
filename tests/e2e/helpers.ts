import type { Page } from "@playwright/test";

/** Relative luminance (0=black, 1=white) of the computed body background. */
export async function bodyLuminance(page: Page): Promise<number> {
  return page.evaluate(() => {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
    if (!m) return 1;
    return (0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2]) / 255;
  });
}

/**
 * Route /api/auth/me to a minimal signed-in user.
 *
 * The coach routes are session-gated, and since PR #483 the /analysis
 * composer gates signed-out visitors client-side as well: Enter opens the
 * sign-in dialog and no request leaves the page. A spec that asserts what the
 * browser SENDS therefore has to run as a signed-in user. The default user
 * carries no rating of any kind, so "never invents a rating" assertions still
 * hold; `onboardingCompletedAt` keeps the OnboardingNudge modal off the page.
 */
export async function stubSignedIn(
  page: Page,
  user: Record<string, unknown> = {}
): Promise<void> {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: {
        user: {
          uid: "e2e-user",
          handle: "e2e",
          onboardingCompletedAt: Date.now(),
          ...user,
        },
        isIntern: false,
        isAdmin: false,
      },
    })
  );
}

/** Pixels of horizontal overflow — >1 means the page scrolls sideways. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
}

/**
 * Wait until /puzzles stops swapping the puzzle, then return the settled FEN.
 *
 * The page can render a resumed puzzle first and then swap in the feed's first
 * batch, so the position is NOT stable the moment the board turns interactive.
 * Any test that reads `data-board-fen` and then acts on it — comparing it
 * later, or computing a legal move from it — must settle first, or it will
 * silently be working with a position the board has already replaced.
 *
 * This is not hypothetical: it failed exactly this way on CI while passing
 * locally, because the feed resolves faster on a dev machine than on a runner.
 */
export async function waitForStableFen(page: Page): Promise<string> {
  const board = page.locator("[data-board-fen]");
  let last = await board.getAttribute("data-board-fen");
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(400);
    const now = await board.getAttribute("data-board-fen");
    if (now && now === last) return now;
    last = now;
  }
  throw new Error("board never settled on a puzzle");
}

/**
 * Cumulative Layout Shift for one page load.
 *
 * Install with `observeLayoutShift(page)` BEFORE the first navigation — the
 * observer has to be running before any page script does, or the shifts it
 * exists to catch happen unwatched. `buffered: true` covers entries that
 * landed between the document opening and the observer attaching.
 *
 * Only shifts with `hadRecentInput === false` count, which is the same rule
 * Chrome's field metric uses: a page moving because the visitor tapped
 * something is not the defect.
 */
export async function observeLayoutShift(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        };
        if (e.hadRecentInput) continue;
        (window as unknown as { __cls: number }).__cls += e.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

/** The score accumulated so far. Pairs with observeLayoutShift(). */
export async function cumulativeLayoutShift(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __cls?: number }).__cls ?? 0
  );
}

/**
 * Slow the page down to something like a mid-range phone.
 *
 * Load this before measuring CLS or the measurement is worthless. Layout
 * shift is a function of how long a page spends in its pre-hydration state,
 * and an unthrottled `next start` on a dev machine or a CI runner paints the
 * finished page so fast that a bug costing a real visitor 0.3 reports as
 * 0.0000. Every regression this guards against was invisible without it.
 *
 * Chromium only (both local Playwright projects are Chromium; the iPhone
 * descriptor in playwright.config.ts overrides WebKit for exactly this kind
 * of reason).
 */
export async function throttleLikeAPhone(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 100,
    downloadThroughput: (2 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}

/**
 * Answer /api/maia-status the way production answers it.
 *
 * Production has the Maia microservice live (`maiaOptimal: true`), so the
 * Lc0DownloadBanner never renders there. CI and a bare dev checkout have no
 * MAIA_API_URL, the endpoint replies "not configured", and the banner drops
 * ~220px into the top of every route that does not chrome itself — which is
 * 0.26 of CLS, measured, and none of it the thing a layout-stability spec on
 * /analysis is trying to hold still.
 *
 * Same reasoning as stubSignedIn above: the E2E build carries no secrets, so
 * a service has to be stubbed to its real-world answer or the test measures
 * the sandbox instead of the product.
 *
 * Worth knowing rather than forgetting: that 220px insert is a real shift on
 * a real code path. It is latent only because Maia is healthy. If the banner
 * is ever meant to be shown to users in anger, it needs to come in out of
 * flow — reserved, fixed, or below the content — or it will cost every
 * content page its Core Web Vitals score on the day Maia goes down.
 */
export async function stubMaiaHealthy(page: Page): Promise<void> {
  await page.route("**/api/maia-status", (r) =>
    r.fulfill({
      json: {
        lc0Available: true,
        maiaOptimal: true,
        maiaServiceConfigured: true,
        maiaServiceReachable: true,
        maiaModelLoaded: true,
        model: "maia2",
        message: "Maia-2 is running and ready for predictions",
      },
    })
  );
}
