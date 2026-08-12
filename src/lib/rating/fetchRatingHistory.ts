/**
 * Fetching for the /plan rating trend graphs. Server-side only, same reasoning
 * as fetchPlatformRatings.ts.
 *
 * Cost asymmetry is the whole design constraint here:
 *
 *   Lichess    ONE request returns the complete history. Free.
 *   Chess.com  No history endpoint. We crawl monthly game archives backwards
 *              and read each game's rating. An active account has 200+ months
 *              of archives, so this is HARD-CAPPED — see ARCHIVE_MONTH_CAP.
 *              Uncapped, a single page load could issue hundreds of requests
 *              against a third party on a user's behalf.
 */

import {
  parseLichessHistory,
  parseChessComArchiveMonth,
  sortSeries,
  emptySeries,
  type RatingSeries,
} from "./ratingHistory";
import { isValidUsername } from "./fetchPlatformRatings";

const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "chessmasti.com rating history (contact: chessmastiprivacy@gmail.com)";

/**
 * Most months of Chess.com archives we will ever pull for one lookup. Twelve
 * months of trend is plenty to show progress, and this bounds the blast radius
 * of a single request to 12 upstream calls.
 */
export const ARCHIVE_MONTH_CAP = 12;

/** Archives fetched at once. Chess.com is tolerant but not a punching bag. */
const ARCHIVE_CONCURRENCY = 3;

async function getJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLichessHistory(username: string): Promise<RatingSeries | null> {
  if (!isValidUsername(username)) return null;
  const body = await getJson(
    `https://lichess.org/api/user/${encodeURIComponent(username)}/rating-history`
  );
  if (body === null) return null;
  return parseLichessHistory(body);
}

/**
 * Crawl the most recent `ARCHIVE_MONTH_CAP` months of Chess.com archives.
 *
 * Returns `null` only when the archive index itself is unreachable — a month
 * that fails individually is skipped, because a partial trend is still a useful
 * trend and is honestly represented by simply having fewer points.
 */
export async function fetchChessComHistory(username: string): Promise<RatingSeries | null> {
  if (!isValidUsername(username)) return null;
  const lower = username.trim().toLowerCase();

  const index = (await getJson(
    `https://api.chess.com/pub/player/${encodeURIComponent(lower)}/games/archives`
  )) as { archives?: string[] } | null;
  if (!index || !Array.isArray(index.archives)) return null;

  const recent = index.archives.slice(-ARCHIVE_MONTH_CAP);
  const series = emptySeries();

  for (let i = 0; i < recent.length; i += ARCHIVE_CONCURRENCY) {
    const batch = recent.slice(i, i + ARCHIVE_CONCURRENCY);
    const months = await Promise.all(batch.map((url) => getJson(url)));
    for (const m of months) {
      const games = (m as { games?: unknown } | null)?.games;
      if (games) parseChessComArchiveMonth(lower, games, series);
    }
  }
  return sortSeries(series);
}

export function fetchHistoryFor(
  platform: "lichess" | "chesscom",
  username: string
): Promise<RatingSeries | null> {
  return platform === "lichess"
    ? fetchLichessHistory(username)
    : fetchChessComHistory(username);
}
