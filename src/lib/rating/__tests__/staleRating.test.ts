import { describe, it, expect } from "vitest";
import { shouldRefreshPlatformRating } from "../staleRating";
import { RATING_TTL_MS } from "../platformRatings";

const NOW = 1_760_000_000_000;

describe("shouldRefreshPlatformRating", () => {
  it("refreshes when a username exists but no rating was ever fetched", () => {
    // The /plan case: the rule lived only in the profile dialog, so a user who
    // linked an account and went straight to /plan never triggered a lookup.
    // The goal card then anchored to the puzzle rating's 1200 default.
    expect(shouldRefreshPlatformRating({ lichessUsername: "lichy" }, NOW)).toBe(
      true
    );
  });

  it("leaves a fresh rating alone", () => {
    expect(
      shouldRefreshPlatformRating(
        {
          lichessUsername: "lichy",
          platformRating: 1650,
          platformRatingFetchedAt: NOW - 1000,
        },
        NOW
      )
    ).toBe(false);
  });

  it("refreshes once the value passes the TTL", () => {
    const stale = {
      lichessUsername: "lichy",
      platformRating: 1650,
      platformRatingFetchedAt: NOW - RATING_TTL_MS - 1,
    };
    expect(shouldRefreshPlatformRating(stale, NOW)).toBe(true);
  });

  it("does NOT treat a missing account as staleness", () => {
    // Nothing to look up. Firing here would be a guaranteed-useless request on
    // every page load for every user who has not linked anything.
    expect(shouldRefreshPlatformRating({}, NOW)).toBe(false);
    expect(shouldRefreshPlatformRating({ lichessUsername: "  " }, NOW)).toBe(
      false
    );
    expect(shouldRefreshPlatformRating(null, NOW)).toBe(false);
    expect(shouldRefreshPlatformRating(undefined, NOW)).toBe(false);
  });
});
