import { test, expect, type Page } from "@playwright/test";
import { waitForStableFen } from "../helpers";

/**
 * The Analyse tool's cheat gate, checked in a real browser.
 *
 * Stockfish's best move in a tactics position IS the puzzle's answer, so an
 * Analyse button that works before the puzzle is resolved would hand out
 * solutions. The gate is unit-tested as a pure function; this asserts the
 * wiring — that the rule survives contact with the actual page.
 *
 * The strongest assertion here is the network one: no engine request may be
 * issued while the puzzle is unsolved. A button that merely *looks* disabled
 * but still mounts the engine would pass a DOM-only test.
 */

function analyseButton(page: Page) {
  return page.getByRole("button", { name: "Analyse" });
}

test("Analyse is visible but disabled before the puzzle is solved", async ({
  page,
}) => {
  await page.goto("/puzzles");
  await waitForStableFen(page);

  // Disabled, NOT hidden: a tool that only appears once you succeed is a tool
  // nobody ever discovers exists.
  await expect(analyseButton(page)).toBeVisible();
  await expect(analyseButton(page)).toBeDisabled();
});

test("the disabled button explains the rule instead of looking broken", async ({
  page,
}) => {
  await page.goto("/puzzles");
  await waitForStableFen(page);

  // The tooltip lives on a span wrapper, since MUI tooltips need a
  // non-disabled child to receive pointer events.
  await analyseButton(page).locator("xpath=..").hover();
  await expect(
    page.getByText(/Unlocks once you solve it or show the solution/i)
  ).toBeVisible();
});

test("no engine is fetched while the puzzle is unsolved", async ({ page }) => {
  // The assertion that actually protects the answer. Everything above is DOM
  // state; this is whether Stockfish can run.
  const engineRequests: string[] = [];
  await page.route("**/engines/**", (route) => {
    engineRequests.push(route.request().url());
    return route.abort();
  });

  await page.goto("/puzzles");
  await waitForStableFen(page);

  // `dispatchEvent`, not `click({force:true})`. A forced click skips
  // actionability and lands on whatever occupies those coordinates, so on
  // local-mobile-light it never reached the handler — this test stayed green
  // with the gate REMOVED, twice, at both 1.5s and 5s windows. Dispatching the
  // event goes straight to React's handler on both projects, which is the
  // thing actually being tested: that the handler refuses on its own, rather
  // than relying on the `disabled` attribute to stop the user.
  await analyseButton(page).dispatchEvent("click");

  // Generous window: the positive control observes the request ~1s after the
  // click, so this is several times the measured latency.
  await page.waitForTimeout(5000);

  expect(engineRequests).toEqual([]);
  // Second, independent signal: the panel itself never renders, so this does
  // not rest on network interception alone.
  await expect(page.getByText(/Loading the engine|Evaluating…/)).toHaveCount(0);
});

test("opening Analyse once unlocked DOES fetch the engine", async ({
  page,
}) => {
  // The control for the test above. "No engine was fetched" is worthless on
  // its own — it would pass just as happily if the panel were broken and never
  // fetched anything under any circumstances. This proves the negative result
  // is caused by the gate and not by the feature being dead.
  const engineRequests: string[] = [];
  await page.route("**/engines/**", (route) => {
    engineRequests.push(route.request().url());
    // Aborted deliberately: this asserts the engine is REQUESTED. Letting a
    // ~7 MB WASM download run would make the spec slow and flaky for no extra
    // signal, and the panel's failure path is covered by unit tests.
    return route.abort();
  });

  await page.goto("/puzzles");
  await waitForStableFen(page);
  await page.getByRole("button", { name: /show solution/i }).click();
  await expect(analyseButton(page)).toBeEnabled({ timeout: 15000 });

  await analyseButton(page).click();
  await expect
    .poll(() => engineRequests.length, { timeout: 20000 })
    .toBeGreaterThan(0);
});

test("showing the solution unlocks Analyse", async ({ page }) => {
  await page.goto("/puzzles");
  await waitForStableFen(page);
  await expect(analyseButton(page)).toBeDisabled();

  // "Show solution" puts the answer on the board, so withholding the engine
  // afterwards would only punish the person trying to understand why.
  await page.getByRole("button", { name: /show solution/i }).click();

  await expect(analyseButton(page)).toBeEnabled({ timeout: 15000 });
});
