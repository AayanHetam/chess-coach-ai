import { test, expect } from "@playwright/test";

/**
 * "How this goes wrong at your level", on a course page.
 *
 * Server-rendered, so there is no network stub to hide behind: if the trap file
 * is not readable in the running server this page simply comes back shorter,
 * with no error anywhere. That failure mode — a page that is quietly missing a
 * section — is the reason this test exists at all.
 *
 * Signed out, deliberately. `bandFor(undefined)` is `improving`, so this
 * exercises the real default path a visitor gets, and it needs no session to
 * do it.
 */

test("names the traps, whose they are, and how many decisions were searched", async ({ page }) => {
  await page.goto("/learn/w-italian");

  const traps = page.getByTestId("course-traps");
  await expect(traps).toBeVisible({ timeout: 20_000 });

  // The Fried Liver, found by counting results and nothing else. `.first()`,
  // because the rebuilt corpus surfaces several traps sharing this prefix —
  // 5.exd5 Nd4, and the 7.Qf3+ Ke8 continuation — and strict mode reads three
  // matches as a failure, which looks like the copy is missing rather than
  // present three times.
  await expect(
    traps.getByText(/1\.e4 e5 2\.Nf3 Nc6 3\.Bc4 Nf6 4\.Ng5 d5 5\.exd5/).first()
  ).toBeVisible();

  // Both halves are labelled, and they are different labels. Merging them
  // would tell a White player that a Black blunder is theirs.
  await expect(traps.getByText(/What you are most likely to fall for/i)).toBeVisible();
  await expect(traps.getByText(/What your opponents fall for/i)).toBeVisible();

  // The claim carries its evidence: a score, a comparison, and a game count.
  // .first(), because there are several traps and each carries its evidence.
  // Without it strict mode fails on three matches, which reads like the copy is
  // missing rather than present three times.
  await expect(
    traps.getByText(/against .* for everything else played from this position/).first()
  ).toBeVisible();

  // And its noise floor. A list of findings with no idea how many decisions
  // were searched invites the reader to assume the search was free.
  await expect(traps.getByText(/decisions in your band/)).toBeVisible();
  await expect(traps.getByText(/would be expected by chance alone/)).toBeVisible();

  // No engine is claimed, because none was consulted.
  await expect(traps.getByText(/no engine was asked for an opinion/i)).toBeVisible();
});

// Both halves of the cap property, and both are now reachable in a browser.
//
// They were not before: signed out the band is `improving`, and on the 233k
// sample no course on it exceeded the cap, so only the "fits" case could be
// tested here. Rebuilding improving from 4.5M games made the capped case
// reachable too.
test("claims no cap when everything fits", async ({ page }) => {
  // The Ruy at the improving band holds 3 and 5 — traps on the page, and both
  // groups under the cap. w-italian used to serve here and no longer can: the
  // rebuilt corpus took it from 3 traps to 19, which is exactly the kind of
  // silent rot a hand-picked fixture invites. The band-wide invariant is
  // asserted in traps.test.ts; this only has to prove the notice is conditional
  // in a real browser.
  await page.goto("/learn/w-ruy");
  const traps = page.getByTestId("course-traps");
  await expect(traps).toBeVisible({ timeout: 20_000 });
  await expect(traps.getByTestId("traps-capped")).toHaveCount(0);
});

test("says which few it picked when a course has more than it can show", async ({ page }) => {
  // Now reachable signed out: the improving band's own corpus is 4.5M games,
  // so 1.e4 carries far more traps than fit. Showing five as though they were
  // all five is a truncated list presented as a complete one.
  await page.goto("/learn/w-e4");
  const traps = page.getByTestId("course-traps");
  await expect(traps).toBeVisible({ timeout: 20_000 });
  await expect(traps.getByTestId("traps-capped").first()).toBeVisible();
  await expect(traps.getByText(/the \d+ costliest of [\d,]+/).first()).toBeVisible();
});

// The control. Without it this would pass on a page that renders the section
// unconditionally, which is the exact failure the component is written to avoid:
// an empty "how this goes wrong" heading reads as "there is nothing to fall
// for here", which is a claim nobody measured.
test("a course with no measured traps shows no section at all", async ({ page }) => {
  await page.goto("/learn/b-caro");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("course-traps")).toHaveCount(0);
});
