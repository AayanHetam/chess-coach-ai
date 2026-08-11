import { test, expect } from "@playwright/test";
import { bodyLuminance } from "../helpers";

/**
 * Every primary-nav surface must load dark, non-empty, and crash-free for a
 * logged-out light-preference visitor. Catches the whole
 * white-page/invisible-text class in one sweep. Structural assertions on
 * purpose (text volume, not copy) so copy edits don't flake the gate.
 */

const PAGES = [
  "/play",
  "/analysis",
  "/puzzles",
  "/plan",
  "/openings",
  "/scout",
];

for (const route of PAGES) {
  test(`${route} renders dark, non-empty, crash-free`, async ({ page }) => {
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(String(e)));
    await page.goto(route);
    await expect
      .poll(
        () => page.evaluate(() => (document.body.innerText || "").trim().length),
        { timeout: 25_000 }
      )
      .toBeGreaterThan(80);
    expect(await bodyLuminance(page)).toBeLessThan(0.25);
    expect(crashes).toEqual([]);
  });
}
