/**
 * The user's rating — resolved in exactly one place.
 *
 * Background (SILENT_SUBSTITUTION_HANDOFF §3 A1): `AnalysisImpl` sent a
 * hardcoded `userRating: 1500` on every `/api/enhanced-analysis` request. Since
 * the body value wins the server's fallback chain, the Firestore profile rating
 * and the PGN header Elo below it were unreachable dead code, and every user in
 * the product was coached as a 1500 — silently, because 1500 looks plausible.
 *
 * Two copies of the chain (one in the browser, one in the route) is how that
 * class of bug comes back, so both now call this.
 *
 * Absence resolves to `undefined`, never to a number. `undefined` is what lets
 * the server try its own sources, and — if those are empty too — what makes the
 * prompt say "not provided" instead of asserting a fabricated rating as fact.
 */

/** The rating-bearing subset of the Firestore user doc (`UserProfile`). */
export interface RatingBearingProfile {
  /** Mirror of the live puzzle rating; tracks improvement, so it wins. */
  liveRatingSnapshot?: number;
  /** Result of the placement test. */
  measuredRating?: number;
  /** What the user told us at onboarding. */
  selfReportedRating?: number;
}

/**
 * Plausible-rating window. Mirrors the guard the enhanced-analysis route
 * already applies to PGN header Elo (`headerElo >= 100 && <= 3500`) so junk
 * ("?", "0", a stray timestamp) can't skew skill calibration.
 */
export const MIN_PLAUSIBLE_RATING = 100;
export const MAX_PLAUSIBLE_RATING = 3500;

/** True when `value` is a real, in-range rating rather than junk or absence. */
export function isPlausibleRating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_PLAUSIBLE_RATING &&
    value <= MAX_PLAUSIBLE_RATING
  );
}

/**
 * Resolve the user's rating from their profile, preferring the freshest
 * source. Junk in a higher-priority field falls through to the next source
 * rather than poisoning the result.
 *
 * @returns the rating, or `undefined` when the user genuinely has none.
 */
export function resolveUserRating(
  profile: RatingBearingProfile | null | undefined
): number | undefined {
  if (!profile) return undefined;
  const candidates = [
    profile.liveRatingSnapshot,
    profile.measuredRating,
    profile.selfReportedRating,
  ];
  return candidates.find(isPlausibleRating);
}
