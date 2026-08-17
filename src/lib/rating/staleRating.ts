import { RATING_TTL_MS } from "./platformRatings";

/**
 * Is this profile's stored platform rating missing or old enough to re-fetch?
 *
 * Extracted so /plan and the profile dialog cannot disagree. The rule used to
 * live only inside PlatformRatingCard, which is mounted in the Profile dialog
 * and nowhere else — so a user who linked a username and went straight to
 * /plan never triggered a lookup at all. `platformRating` stayed undefined,
 * `resolveUserRating` fell through to the puzzle rating (which DEFAULTS to
 * 1200), and the goal card measured a target anchored at a real 1650 against
 * a number that was never a chess rating. The trend graphs, which read the
 * username directly, showed the true figure a few pixels below.
 *
 * Non-forced by design: the server's TTL is the real gate, so calling this on
 * every page visit costs nothing once a fresh value exists.
 */
export function shouldRefreshPlatformRating(
  profile:
    | {
        lichessUsername?: string | null;
        chesscomUsername?: string | null;
        platformRating?: number;
        platformRatingFetchedAt?: number;
      }
    | null
    | undefined,
  now: number = Date.now()
): boolean {
  if (!profile) return false;
  // Nothing to look up. Absence of a username is not staleness.
  const hasUsername = !!(
    profile.lichessUsername?.trim() || profile.chesscomUsername?.trim()
  );
  if (!hasUsername) return false;

  if (!profile.platformRating) return true;
  return now - (profile.platformRatingFetchedAt ?? 0) >= RATING_TTL_MS;
}
