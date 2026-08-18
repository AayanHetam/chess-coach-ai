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

/**
 * Local port. Overridable because this repo is worked on by several sessions at
 * once, and `reuseExistingServer` will happily bind a run to WHOEVER already
 * holds the port — a different worktree, a different build. That happened: a
 * whole suite ran green-ish against another session's server and the failures
 * read as page bugs. Set E2E_PORT to get a server that is certainly yours.
 */
const PORT = process.env.E2E_PORT ?? "3210";
const LOCAL_BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  // Capped deliberately. Playwright's default is cores/2, but every spec here
  // drives a server-rendered page and /puzzles additionally boots Stockfish
  // WASM and parses a 100k-row CSV, so the workers starve each other rather
  // than sharing. Measured on a 10-core machine: default parallelism gave
  // 3 failures in 3.4 min (all timeouts, in specs unrelated to whatever was
  // being changed); 2 workers gave 48 passed in 1.3 min. Fewer is both faster
  // and honest — a timeout under self-inflicted load is a false red.
  workers: 2,
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
        baseURL: LOCAL_BASE,
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
        baseURL: LOCAL_BASE,
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
        command: `npx next start -p ${PORT}`,
        url: LOCAL_BASE,
        reuseExistingServer: !process.env.CI,
        timeout: 90_000,
        env: {
          ...process.env,
          // The instrumentation hook's parseEnv() requires ANTHROPIC_API_KEY
          // at server boot (fail-fast for the AI routes). CI has no secrets
          // and the journeys never invoke the LLM, so a dummy satisfies boot
          // without enabling anything. (SKIP_ENV_VALIDATION is set by `npm
          // run build` but read by nothing — it does not help here.)
          ANTHROPIC_API_KEY:
            process.env.ANTHROPIC_API_KEY ?? "e2e-dummy-key-never-called",
        },
      },
});
