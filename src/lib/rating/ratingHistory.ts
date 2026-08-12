/**
 * Rating history — the series behind the bullet / blitz / rapid trend graphs
 * on /plan.
 *
 * The two platforms are wildly asymmetric here:
 *
 *   Lichess    GET /api/user/{name}/rating-history — one free call, complete
 *              per-perf history. Cheap.
 *   Chess.com  No history endpoint exists. Ratings live only inside monthly
 *              game archives, so a trend has to be derived by fetching N months
 *              and reading each game's rating + end_time. Expensive, and an
 *              active account has 200+ archive months.
 *
 * Parsing is kept pure here; the fetching lives in fetchRatingHistory.ts.
 */

import type { Platform } from "./platformRatings";

/** One point on a trend line. `t` is epoch ms; `rating` is the raw platform number. */
export interface RatingPoint {
  t: number;
  rating: number;
}

/** The three time controls we chart. Deliberately not "daily" or variants. */
export const CHARTED_PERFS = ["bullet", "blitz", "rapid"] as const;
export type ChartedPerf = (typeof CHARTED_PERFS)[number];

export type RatingSeries = Record<ChartedPerf, RatingPoint[]>;

export function emptySeries(): RatingSeries {
  return { bullet: [], blitz: [], rapid: [] };
}

// ─── Lichess ────────────────────────────────────────────────────────────────

/**
 * `GET https://lichess.org/api/user/{name}/rating-history` returns
 * `[{ name: "Bullet", points: [[year, month, day, rating], ...] }, ...]`.
 *
 * ⚠️ THE MONTH IS 0-INDEXED. Verified against the live API (2026-08-11): an
 * Atomic point reading `[2019, 0, 30, 1851]` is 30 January 2019, not February.
 * `new Date(y, m, d)` happens to use the same convention, so passing it
 * straight through is correct — but ANY hand-rolled formatting that treats it
 * as a calendar month shifts every point by one month, which on a trend chart
 * looks entirely plausible and is therefore invisible.
 */
interface LichessHistoryEntry {
  name?: string;
  points?: number[][];
}

/** Lichess labels perfs "Bullet"/"Blitz"/"Rapid"; we key on lowercase. */
export function parseLichessHistory(body: unknown): RatingSeries {
  const series = emptySeries();
  if (!Array.isArray(body)) return series;

  for (const raw of body as LichessHistoryEntry[]) {
    const key = String(raw?.name ?? "").toLowerCase();
    if (!(CHARTED_PERFS as readonly string[]).includes(key)) continue;
    const perf = key as ChartedPerf;

    for (const p of raw.points ?? []) {
      if (!Array.isArray(p) || p.length < 4) continue;
      const [y, m, d, rating] = p;
      if (![y, m, d, rating].every((n) => typeof n === "number" && Number.isFinite(n))) {
        continue;
      }
      // m is already 0-indexed, which is exactly what Date expects.
      const t = new Date(y, m, d).getTime();
      if (!Number.isFinite(t)) continue;
      series[perf].push({ t, rating: Math.round(rating) });
    }
    series[perf].sort((a, b) => a.t - b.t);
  }
  return series;
}

// ─── Chess.com ──────────────────────────────────────────────────────────────

interface ChessComGame {
  end_time?: number;
  time_class?: string;
  white?: { username?: string; rating?: number };
  black?: { username?: string; rating?: number };
}

/**
 * Derive history from a month of Chess.com games. Each game records BOTH
 * players' ratings at the time it finished, so we pick whichever side is the
 * user and take that rating.
 *
 * Username comparison is case-insensitive: Chess.com preserves the display
 * casing a user signed up with ("Hikaru") while the API path is lowercased,
 * so an exact match silently yields an empty chart.
 */
export function parseChessComArchiveMonth(
  username: string,
  games: unknown,
  into: RatingSeries = emptySeries()
): RatingSeries {
  if (!Array.isArray(games)) return into;
  const target = username.trim().toLowerCase();

  for (const g of games as ChessComGame[]) {
    const cls = g?.time_class;
    if (!cls || !(CHARTED_PERFS as readonly string[]).includes(cls)) continue;
    const perf = cls as ChartedPerf;

    const white = g.white?.username?.toLowerCase();
    const black = g.black?.username?.toLowerCase();
    const rating =
      white === target ? g.white?.rating : black === target ? g.black?.rating : undefined;

    const end = g.end_time;
    if (typeof rating !== "number" || !Number.isFinite(rating)) continue;
    if (typeof end !== "number" || !Number.isFinite(end)) continue;

    into[perf].push({ t: end * 1000, rating: Math.round(rating) });
  }
  return into;
}

export function sortSeries(series: RatingSeries): RatingSeries {
  for (const perf of CHARTED_PERFS) series[perf].sort((a, b) => a.t - b.t);
  return series;
}

// ─── Shaping for the chart ──────────────────────────────────────────────────

/**
 * Collapse to at most one point per day (the last rating that day) and keep
 * only the requested window. A heavy Chess.com user can produce thousands of
 * points a month; rendering them all is slow and reads as noise rather than a
 * trend.
 */
export function downsampleDaily(points: RatingPoint[], sinceMs: number): RatingPoint[] {
  const byDay = new Map<string, RatingPoint>();
  for (const p of points) {
    if (p.t < sinceMs) continue;
    const d = new Date(p.t);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const prev = byDay.get(key);
    if (!prev || p.t >= prev.t) byDay.set(key, p);
  }
  return Array.from(byDay.values()).sort((a, b) => a.t - b.t);
}

export interface PerfTrend {
  perf: ChartedPerf;
  points: RatingPoint[];
  current?: number;
  /** Change across the window. `undefined` when there is nothing to compare. */
  delta?: number;
  platform: Platform;
}

/**
 * Build the per-perf trend the chart renders.
 *
 * A single data point yields `delta: undefined`, NOT `0`. "0" renders as a flat
 * "no change" badge, which is a claim we cannot support from one observation —
 * the user simply has no history yet, and saying "+0" implies we measured it.
 */
export function buildTrend(
  perf: ChartedPerf,
  points: RatingPoint[],
  platform: Platform
): PerfTrend {
  const current = points.length > 0 ? points[points.length - 1].rating : undefined;
  const delta =
    points.length >= 2 ? points[points.length - 1].rating - points[0].rating : undefined;
  return { perf, points, current, delta, platform };
}
