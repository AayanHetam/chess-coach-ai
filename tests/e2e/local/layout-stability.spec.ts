import { test, expect } from "@playwright/test";
import {
  cumulativeLayoutShift,
  observeLayoutShift,
  stubMaiaHealthy,
  throttleLikeAPhone,
} from "../helpers";

/**
 * Cumulative Layout Shift budgets for the surfaces that had none.
 *
 * ─── WHY THESE ROUTES ─────────────────────────────────────────────────────
 * Measured against production on a 4x-throttled phone over slow 4G,
 * 2026-09-22. Every route below scored POOR or NEEDS WORK; every other
 * route on the site scored 0.0000 and is not listed, because a budget on a
 * page with no shift in it is a budget nobody will ever read.
 *
 *   /analysis          0.340   board chunk landed into a zero-height box
 *   /repetit-training  0.261   stats card inserted after the mount effect
 *   /puzzles/[rating]  0.176   static diagram swapped for a taller board
 *   /play              0.121   lobby rendered before the auth check answered
 *   /database          0.061   360px skeleton replaced by a 163px grid
 *
 * They are five faces of one bug: render something, find out what you should
 * have rendered, then render that instead at a different size. The fixes are
 * all "reserve the final size from the first frame", and this spec is what
 * stops the next component from reintroducing it.
 *
 * ─── WHY THE THROTTLE ─────────────────────────────────────────────────────
 * Without throttleLikeAPhone() this whole file passes on the broken code.
 * CLS is a function of how long a page sits in its pre-hydration state, and
 * an unthrottled `next start` closes that window before anything can be seen
 * to move. The throttle is not realism for its own sake — it is the only
 * reason the assertions below can fail.
 *
 * ─── WHY 0.1 ──────────────────────────────────────────────────────────────
 * 0.1 is Chrome's own "good" threshold, and it is deliberately looser than
 * what these routes now measure (all ≈0.00-0.02 after the fixes). A budget
 * pinned to the measured value would go red on a slow runner and teach
 * people to ignore it. This one only trips when a real regression lands.
 *
 * Mobile only. The shifts are worst at phone widths, it is the viewport the
 * field metric weights most heavily, and running the throttled pass twice
 * would put ~1 minute on every CI run to re-measure the easier case.
 */

/** Chrome's "good" threshold. See the note above before tightening it. */
const CLS_BUDGET = 0.1;

const ROUTES = [
  "/analysis",
  "/repetit-training",
  "/puzzles/1200",
  "/play",
  "/database",
];

for (const route of ROUTES) {
  test(`${route} stays within the CLS budget on a slow phone`, async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "local-mobile-light",
      "Mobile is where layout shift bites and where the field metric looks."
    );

    await observeLayoutShift(page);
    await throttleLikeAPhone(page);
    // See stubMaiaHealthy: without it this measures a banner that only a
    // secrets-free build ever shows, and drowns out what it is here to hold
    // still. Read that comment before deleting this line — the banner is a
    // real 0.26 shift, it is just not this spec's subject.
    await stubMaiaHealthy(page);

    await page.goto(route, { waitUntil: "load" });
    // Long enough for the late arrivals that cause these shifts: the auth
    // round trip, the localStorage read in a mount effect, and the dynamic
    // chunks (/analysis pulls in an 8k-line impl and then chessground).
    await page.waitForTimeout(9000);

    expect(await cumulativeLayoutShift(page)).toBeLessThan(CLS_BUDGET);
  });
}

/**
 * The mechanism behind the /analysis fix — that every dynamic import of
 * ChessgroundBoard reserves the board's square — is guarded in vitest, at
 * src/components/ui/__tests__/chessgroundBoardPlaceholder.test.ts, not here.
 *
 * The obvious browser assertion ("the board is square") passes on the broken
 * code too: the board IS square once it finally renders, and the defect is
 * the zero-height gap before that. A source test catches it; this file holds
 * the budget that the source test explains.
 */
