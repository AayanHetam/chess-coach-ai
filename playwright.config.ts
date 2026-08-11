import { defineConfig, devices } from "@playwright/test";

/**
 * E2E harness (usability-detection program, 2026-08-10).
 *
 * Two families:
 * - tests/e2e/local  — critical-journey specs against a local `next start`
 *   of the production build. Run WITHOUT secrets (CI has none): they cover
 *   client-side journeys (dark chrome, auth dialog, DOB age gate, puzzle
 *   board) and never create accounts.
 * - tests/e2e/prod   — read-only smoke against https://www.chessmasti.com
 *   (nightly heartbeat + manual). Never writes data: bad-credential signin,
 *   OAuth redirect handoff, version/health probes only.
 *
 * `E2E_NO_SERVER=1` skips the webServer (used for prod-smoke runs).
 */

const PROD_BASE = "https://www.chessmasti.com";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "local-desktop-light",
      testDir: "tests/e2e/local",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:3210",
        // Light preference on purpose: the Obsidian-Glass surfaces must stay
        // dark for light-mode visitors (the white-homepage bug of 2026-08-10).
        colorScheme: "light",
      },
    },
    {
      name: "local-mobile-light",
      testDir: "tests/e2e/local",
      use: {
        ...devices["iPhone 13"],
        // iPhone descriptors default to WebKit; we only install Chromium
        // (locally and in CI). Chromium's mobile emulation covers what these
        // specs assert (viewport, touch, UA).
        browserName: "chromium",
        baseURL: "http://127.0.0.1:3210",
        colorScheme: "light",
      },
    },
    {
      name: "prod-smoke",
      testDir: "tests/e2e/prod",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: PROD_BASE,
        colorScheme: "light",
      },
    },
  ],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: "npx next start -p 3210",
        url: "http://127.0.0.1:3210",
        reuseExistingServer: !process.env.CI,
        timeout: 90_000,
      },
});
