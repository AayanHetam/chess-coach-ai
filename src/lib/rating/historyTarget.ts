import type { Platform } from "./platformRatings";

/**
 * Which linked account the trend graphs should read.
 *
 * The order matters and so does the shape. The route used to pick a PLATFORM
 * first — from `platformRatingSource`, else `primaryPlatform` — and only then
 * look up that platform's username, reporting `no_username` when it came back
 * undefined. But neither of those fields is a statement about which username
 * exists:
 *
 *   platformRatingSource  written by /api/ratings/lookup as whichever platform
 *                         held the user's BEST rating. Never cleared when the
 *                         underlying username changes.
 *   primaryPlatform       written from a quiz answer — an intention, recorded
 *                         before the user ever typed a username, and unchanged
 *                         when they later link the other site in Profile.
 *
 * So a profile with `primaryPlatform: "chesscom"` and only a Lichess username
 * — an ordinary result of answering "mostly Chess.com" and later linking
 * Lichess — reported "no username" and replaced three trend graphs with an
 * "add your username" prompt, while a perfectly good account sat one field
 * over. Preference must never be able to select an account that isn't there.
 *
 * Now: filter to the accounts that ACTUALLY exist, then apply preference to
 * that list. Absence of the preferred account degrades to the other one, and
 * only a genuinely empty profile returns null.
 */

export interface HistoryTargetInput {
  platformRatingSource?: Platform | null;
  primaryPlatform?: Platform | null;
  lichessUsername?: string | null;
  chesscomUsername?: string | null;
}

export interface HistoryTarget {
  platform: Platform;
  username: string;
}

export function selectHistoryTarget(
  user: HistoryTargetInput
): HistoryTarget | null {
  const available: HistoryTarget[] = [];
  const lichess = user.lichessUsername?.trim();
  const chesscom = user.chesscomUsername?.trim();
  if (lichess) available.push({ platform: "lichess", username: lichess });
  if (chesscom) available.push({ platform: "chesscom", username: chesscom });

  if (available.length === 0) return null;

  // Measurement beats intention: the stored rating source is where we actually
  // read a rating from, the quiz answer is what the user said months ago.
  for (const preferred of [user.platformRatingSource, user.primaryPlatform]) {
    if (!preferred) continue;
    const match = available.find((a) => a.platform === preferred);
    if (match) return match;
  }

  // Neither preference is available — take what we have rather than nothing.
  return available[0];
}
