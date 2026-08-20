import { test, expect, type Page } from "@playwright/test";
import { waitForStableFen } from "../helpers";

/**
 * The center/right split on /puzzles is user-resizable — PR-5 of
 * docs/PUZZLE_TRAINING_LAYOUT_SPEC.md, the grip in the gutter.
 *
 * Contract under test:
 *  - dragging the grip left widens the coach column (and right narrows it),
 *  - the chosen width survives a reload (localStorage),
 *  - arrow keys on the separator resize too, and clamp at both rails,
 *  - resizing never breaks the one-screen lock (#387) — no page scroll,
 *    board fully visible,
 *  - the grip does not exist on mobile, where the layout stacks.
 */

const GRIP = '[data-testid="coach-split-grip"]';
const COACH = '[data-testid="coach-column"]';

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

async function coachWidth(page: Page): Promise<number> {
  const box = await page.locator(COACH).boundingBox();
  if (!box) throw new Error("coach column did not render");
  return box.width;
}

async function pageScroll(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight,
  );
}

test.describe("coach split resize", () => {
  // The grip only renders at lg — mobile stacks and has nothing to resize.
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1200,
    "desktop-only layout",
  );

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await acceptConsent(page);
    await page.goto("/puzzles");
    await waitForStableFen(page);
  });

  test("dragging the grip widens the coach, persists across reload, and keeps one screen", async ({
    page,
  }) => {
    const before = await coachWidth(page);

    const grip = await page.locator(GRIP).boundingBox();
    expect(grip, "grip must render at desktop widths").not.toBeNull();
    const gx = grip!.x + grip!.width / 2;
    const gy = grip!.y + grip!.height / 2;

    // Real pointer events, not click({force}) — the drag path is pointer
    // capture + move, and synthetic forced clicks never exercise it.
    await page.mouse.move(gx, gy);
    await page.mouse.down();
    await page.mouse.move(gx - 120, gy, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(() => coachWidth(page), { message: "coach column should widen" })
      .toBeGreaterThanOrEqual(before + 110);
    const widened = await coachWidth(page);

    // Still one screen: the resize must never reintroduce the page scroll
    // (#387's contract) or push the board out of the viewport.
    expect(await pageScroll(page)).toBeLessThanOrEqual(1);
    const board = await page.locator("[data-board-fen]").boundingBox();
    expect(board).not.toBeNull();
    expect(board!.y).toBeGreaterThanOrEqual(-1);
    expect(board!.y + board!.height).toBeLessThanOrEqual(901);

    // The width is the persisted preference, not session state.
    const stored = await page.evaluate(() =>
      localStorage.getItem("cm_puzzle_coach_width"),
    );
    expect(stored).not.toBeNull();
    expect(Math.abs(Number(stored) - widened)).toBeLessThanOrEqual(2);

    await page.reload();
    await waitForStableFen(page);
    await expect
      .poll(() => coachWidth(page), {
        message: "persisted width should survive a reload",
      })
      .toBeGreaterThanOrEqual(widened - 2);
  });

  test("arrow keys resize the separator and clamp at both rails", async ({
    page,
  }) => {
    const before = await coachWidth(page);
    const grip = page.locator(GRIP);
    await grip.focus();

    // ArrowLeft moves the divider left → wider coach (24px per step).
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(() => coachWidth(page), { message: "3×ArrowLeft should widen by ~72px" })
      .toBeGreaterThanOrEqual(before + 70);

    // Hammering past the max rail must clamp, not eat the board column.
    for (let i = 0; i < 30; i++) await page.keyboard.press("ArrowLeft");
    const gridWidth = await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="coach-column"]')!
        .parentElement as HTMLElement;
      return grid.getBoundingClientRect().width;
    });
    const maxAllowed = Math.min(640, Math.round(gridWidth * 0.42));
    await expect
      .poll(() => coachWidth(page), { message: "width must clamp at the max rail" })
      .toBeLessThanOrEqual(maxAllowed + 2);
    expect(await pageScroll(page), "clamped layout must still fit").toBeLessThanOrEqual(1);

    // And the min rail on the way back down: 30 steps is far more than the
    // range, so it must land AT the rail — low enough to prove it moved,
    // high enough to prove it clamped.
    for (let i = 0; i < 30; i++) await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => coachWidth(page), { message: "width must clamp at the min rail" })
      .toBeLessThanOrEqual(345);
    expect(await coachWidth(page)).toBeGreaterThanOrEqual(338);

    // Double-click restores the untouched default split.
    await grip.dblclick();
    await expect
      .poll(() => coachWidth(page), { message: "double-click should reset" })
      .toBeGreaterThanOrEqual(before - 3);
    expect(await coachWidth(page)).toBeLessThanOrEqual(before + 3);
  });
});

test("mobile has no resize grip", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) >= 1200, "mobile-only");
  await acceptConsent(page);
  await page.goto("/puzzles");
  await expect(page.locator(GRIP)).toBeHidden();
});
