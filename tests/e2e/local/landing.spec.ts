import { test, expect } from "@playwright/test";
import { bodyLuminance, horizontalOverflow } from "../helpers";

/**
 * The landing must render full Obsidian-Glass for a light-preference,
 * logged-out visitor — the exact persona that saw a white page with
 * invisible hero text on 2026-08-10.
 */

test("landing is dark with the hero visible (light-preference visitor)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText(/chess coaching/i, {
    timeout: 15_000,
  });
  expect(await bodyLuminance(page)).toBeLessThan(0.2);
});

test("landing has no sideways scroll on mobile", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

test("landing survives without JS crashes", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(String(e)));
  await page.goto("/");
  await page.waitForTimeout(3000);
  expect(crashes).toEqual([]);
});

/**
 * The landing page is statically prerendered, so anything it derives from the
 * clock is baked at BUILD time and then rots.
 *
 * "landing survives without JS crashes" above asserts the same emptiness and
 * could never catch this: CI builds and runs the browser within the same day,
 * so the server's date and the browser's date agree and the mismatch is zero
 * by construction. Production is where they diverge — the day after a deploy
 * the HTML read AUGUST 22 while browsers read AUGUST 23, React hit a text
 * mismatch (#425), hydration failed (#418) and the entire root was discarded
 * and re-rendered on the client (#423), on every single visit. Sentry caught
 * it in its first hour of actually being wired up.
 *
 * Pinning the browser clock to a date no build can ever share is the thing
 * that makes this test able to fail. setFixedTime, not install: it fakes only
 * the reading of the clock and leaves real timers running, so the page's
 * animations and effects behave normally.
 */
test.describe("landing hydration under a skewed clock", () => {
  test.use({ timezoneId: "UTC" });

  test("hydrates cleanly when the browser's date differs from the build's", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.clock.setFixedTime(new Date("2031-03-09T12:00:00Z"));
    await page.goto("/");
    await page.waitForTimeout(3000);

    const hydration = errors.filter((m) =>
      /React error #(418|423|425)/.test(m)
    );
    expect(hydration).toEqual([]);

    // The date must still reach the viewer, and must be THEIR date. Without
    // this, deleting the date outright would satisfy the assertion above for
    // entirely the wrong reason.
    await expect(page.getByText(/PUZZLE OF THE DAY/i).first()).toContainText(
      /MARCH 9/i,
      { timeout: 10_000 }
    );
  });
});
