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
