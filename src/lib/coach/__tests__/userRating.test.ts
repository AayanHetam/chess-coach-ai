import { describe, expect, it } from "vitest";
import { resolveUserRating } from "../userRating";

/**
 * A1 (SILENT_SUBSTITUTION_HANDOFF §3 Group A): the client hardcoded 1500 into
 * every /api/enhanced-analysis body, which made the server's real rating chain
 * (Firestore profile → PGN header Elo) unreachable dead code.
 *
 * `resolveUserRating` is the ONE definition of that chain, shared by the
 * browser (AnalysisImpl's coachExtras) and the server (enhanced-analysis
 * route), so the two can no longer drift apart.
 *
 * The load-bearing assertion is the last one: absence must resolve to
 * `undefined`, never to a plausible-looking number.
 */
describe("resolveUserRating — single source of truth for the rating chain", () => {
  it("prefers the live rating snapshot", () => {
    expect(
      resolveUserRating({
        liveRatingSnapshot: 1720,
        measuredRating: 1400,
        selfReportedRating: 900,
      })
    ).toBe(1720);
  });

  it("falls back to the placement-measured rating", () => {
    expect(
      resolveUserRating({ measuredRating: 1400, selfReportedRating: 900 })
    ).toBe(1400);
  });

  it("falls back to the self-reported rating", () => {
    expect(resolveUserRating({ selfReportedRating: 900 })).toBe(900);
  });

  it("returns undefined for a signed-in user who has set no rating", () => {
    expect(resolveUserRating({})).toBeUndefined();
  });

  it("returns undefined when there is no profile at all", () => {
    expect(resolveUserRating(null)).toBeUndefined();
    expect(resolveUserRating(undefined)).toBeUndefined();
  });

  it("never substitutes a plausible default (the A1 bug)", () => {
    expect(resolveUserRating(null)).not.toBe(1500);
    expect(resolveUserRating({})).not.toBe(1500);
  });

  it("ignores non-finite / out-of-range junk rather than passing it through", () => {
    expect(resolveUserRating({ liveRatingSnapshot: NaN })).toBeUndefined();
    expect(resolveUserRating({ selfReportedRating: 0 })).toBeUndefined();
    expect(resolveUserRating({ selfReportedRating: 99999 })).toBeUndefined();
    // A junk high-priority field must not mask a good lower-priority one.
    expect(
      resolveUserRating({ liveRatingSnapshot: 0, selfReportedRating: 1250 })
    ).toBe(1250);
  });
});
