import { test, expect, type Page } from "@playwright/test";
import { waitForStableFen } from "../helpers";

/**
 * /puzzles fits one screen on desktop and never scrolls.
 *
 * What the layout spec asked for from the start: "three regions, full viewport
 * height, no page scroll". The point of the format is that you never leave the
 * puzzle to see the set — and a page that scrolls invites you to leave it.
 *
 * Two assertions, because either alone is satisfiable in a broken way. "No page
 * scroll" passes fine if the board is clipped, and "board fully visible" passes
 * fine on a page you had to scroll. Both together are the actual contract.
 */

/** Desktop heights that actually exist. 768 is the cramped end of the range. */
const DESKTOP_VIEWPORTS = [
  { width: 1920, height: 1080, label: "1080p" },
  { width: 1512, height: 982, label: "MacBook 14" },
  { width: 1440, height: 900, label: "MacBook Air" },
  { width: 1366, height: 768, label: "768p laptop" },
];

async function boardBox(page: Page) {
  return page.locator("[data-board-fen]").boundingBox();
}

/**
 * Settle consent before measuring.
 *
 * The cookie banner is fixed to the bottom and only appears on a first visit,
 * and the locked layout subtracts its height so it never covers the controls.
 * Measuring with it up would judge the permanent layout by a temporary state —
 * and sizing the board around a banner nobody sees twice would waste that space
 * for every later visit. That the banner does not cover anything while it IS up
 * is covered by the answer-mode specs, which click those exact controls.
 */
async function acceptConsent(page: Page) {
  // A cookie, not localStorage — see CONSENT_COOKIE_NAME in lib/tracking.
  await page.context().addCookies([
    {
      name: "cm_consent",
      value: "accepted",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
}

test.describe("one-screen layout", () => {
  // The rail only renders at lg, so this is desktop-only by design. Mobile
  // stacks and is expected to scroll — covered separately below.
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1200,
    "desktop-only layout"
  );

  for (const vp of DESKTOP_VIEWPORTS) {
    test(`no page scroll and the whole board is visible at ${vp.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await acceptConsent(page);
      await page.goto("/puzzles");
      await waitForStableFen(page);

      const scroll = await page.evaluate(
        () =>
          document.documentElement.scrollHeight -
          document.documentElement.clientHeight
      );
      expect(
        scroll,
        `${vp.label} should not scroll vertically`
      ).toBeLessThanOrEqual(1);

      const box = await boardBox(page);
      expect(box, "board must render").not.toBeNull();
      // Clipping is the failure this replaced: capping the board by width only
      // let it overflow a shorter column and lose its bottom ranks.
      expect(box!.y, `${vp.label}: board top cut off`).toBeGreaterThanOrEqual(
        -1
      );
      expect(
        box!.y + box!.height,
        `${vp.label}: board bottom cut off`
      ).toBeLessThanOrEqual(vp.height + 1);
      // And it must stay a usable size rather than collapsing to fit.
      expect(
        box!.width,
        `${vp.label}: board too small to play on`
      ).toBeGreaterThan(240);
    });
  }

  test("the action pair stays reachable without scrolling", async ({
    page,
  }) => {
    // Fitting the board is pointless if Submit ends up below the fold.
    await page.setViewportSize({ width: 1440, height: 900 });
    await acceptConsent(page);
    await page.goto("/puzzles");
    await waitForStableFen(page);

    for (const name of [/new puzzle/i, /show solution/i]) {
      const box = await page
        .getByRole("button", { name })
        .first()
        .boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(901);
    }
  });
});

test("mobile keeps normal document flow", async ({ page, viewport }) => {
  // The inverse guard: a phone must NOT be trapped inside a 100dvh box. A board
  // plus a coach transcript cannot fit one small screen, so scrolling is right.
  test.skip((viewport?.width ?? 0) >= 1200, "mobile-only");
  await page.goto("/puzzles");
  await waitForStableFen(page);

  const scroll = await page.evaluate(
    () =>
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight
  );
  expect(scroll, "phone layout should scroll normally").toBeGreaterThan(0);
  // ...and still never sideways.
  const sideways = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  expect(sideways).toBeLessThanOrEqual(1);
});
