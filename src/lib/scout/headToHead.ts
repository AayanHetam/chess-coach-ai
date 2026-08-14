// ─────────────────────────────────────────────────────────────────────────────
// Head-to-head: what the rating gap actually predicts, and where your profile
// beats theirs.
//
// All deterministic. Elo's expected-score formula plus straight comparisons of
// numbers we already compute.
// ─────────────────────────────────────────────────────────────────────────────

import type { ProfileSnapshot, ScoutGame, TimeClass } from '@/types/scout';

/**
 * Elo expected score: E = 1 / (1 + 10^((Rb − Ra)/400)).
 *
 * Returns YOUR expected score in [0,1], where 0.5 is an even match. This is a
 * score expectation, not a win probability — draws count half, which is why a
 * "38%" here is not "you win 38% of the time".
 */
export function expectedScore(yourRating: number, theirRating: number): number {
  return 1 / (1 + Math.pow(10, (theirRating - yourRating) / 400));
}

/** Rating difference that a given expected score implies. */
export function ratingGapFor(expected: number): number {
  const clamped = Math.min(0.999, Math.max(0.001, expected));
  return -400 * Math.log10(1 / clamped - 1);
}

export type RatingSource = 'played' | 'self-reported';

export interface HeadToHead {
  yourRating: number;
  theirRating: number;
  /** Where your number came from — a self-reported rating is not evidence. */
  yourRatingSource: RatingSource;
  /** Your expected score, 0-1. */
  expected: number;
  /** theirRating − yourRating. Positive means they are favoured. */
  gap: number;
  /** The time class both numbers were read from, when they agree. */
  timeClass?: TimeClass;
}

export function buildHeadToHead(opts: {
  yourRating: number;
  yourRatingSource: RatingSource;
  theirProfile: ProfileSnapshot;
  timeClass?: TimeClass;
}): HeadToHead | null {
  const { yourRating, yourRatingSource, theirProfile, timeClass } = opts;
  if (!Number.isFinite(yourRating) || yourRating <= 0) return null;

  // Compare like with like where possible: their rating in the format you are
  // about to play beats their overall best.
  const scoped = timeClass
    ? theirProfile.ratings[timeClass as keyof typeof theirProfile.ratings]
    : undefined;
  const values = Object.values(theirProfile.ratings).filter(
    (r): r is number => typeof r === 'number' && r > 0
  );
  const theirRating = scoped ?? (values.length ? Math.max(...values) : theirProfile.peakRating);
  if (!theirRating) return null;

  return {
    yourRating,
    theirRating,
    yourRatingSource,
    expected: expectedScore(yourRating, theirRating),
    gap: theirRating - yourRating,
    timeClass: scoped ? timeClass : undefined,
  };
}

// ─── Rating trajectory ──────────────────────────────────────────────────────

export interface RatingPoint {
  date: number;
  rating: number;
}

/**
 * Their rating over time, for a sparkline.
 *
 * Downsampled to at most `maxPoints` by even stride rather than by averaging:
 * a sparkline should show the shape they actually traced, and smoothing hides
 * exactly the collapses and climbs that make the chart worth showing.
 */
export function buildRatingSeries(
  games: ScoutGame[],
  target: string,
  opts: { timeClass?: TimeClass; maxPoints?: number } = {}
): RatingPoint[] {
  const t = target.toLowerCase();
  const maxPoints = opts.maxPoints ?? 60;

  const points: RatingPoint[] = [];
  for (const g of games) {
    if (opts.timeClass && g.timeClass !== opts.timeClass) continue;
    if (!g.date || g.date <= 0) continue;
    const isWhite = g.whiteUsername.toLowerCase() === t;
    const isBlack = g.blackUsername.toLowerCase() === t;
    if (!isWhite && !isBlack) continue;
    const rating = isWhite ? g.whiteRating : g.blackRating;
    if (!rating || rating < 100) continue;
    points.push({ date: g.date, rating });
  }

  points.sort((a, b) => a.date - b.date);
  if (points.length <= maxPoints) return points;

  const stride = points.length / maxPoints;
  const out: RatingPoint[] = [];
  for (let i = 0; i < maxPoints; i += 1) {
    out.push(points[Math.floor(i * stride)]);
  }
  // Always keep the true endpoint — the latest rating is the one a reader
  // checks against, and a strided sample can otherwise drop it.
  const last = points[points.length - 1];
  if (out[out.length - 1].date !== last.date) out.push(last);
  return out;
}

/** Net rating change across the series, or null when there is nothing to compare. */
export function ratingTrend(series: RatingPoint[]): number | null {
  if (series.length < 2) return null;
  return series[series.length - 1].rating - series[0].rating;
}

// ─── Profile comparison ─────────────────────────────────────────────────────

export interface DimensionComparison {
  key: 'atk' | 'def' | 'time' | 'mind';
  label: string;
  you: number;
  them: number;
  /** you − them. Positive means the edge is yours. */
  delta: number;
}

const DIMENSION_LABELS: Array<[DimensionComparison['key'], string]> = [
  ['atk', 'Attack'],
  ['def', 'Defence'],
  ['time', 'Clock'],
  ['mind', 'Composure'],
];

export function compareProfiles(
  you: ProfileSnapshot,
  them: ProfileSnapshot
): DimensionComparison[] {
  return DIMENSION_LABELS.map(([key, label]) => ({
    key,
    label,
    you: you[key],
    them: them[key],
    delta: you[key] - them[key],
  }));
}

/** Where you are strongest relative to them — the matchup to steer toward. */
export function biggestEdge(cmp: DimensionComparison[]): DimensionComparison | null {
  if (cmp.length === 0) return null;
  return cmp.reduce((best, c) => (c.delta > best.delta ? c : best));
}

/** Where they are strongest relative to you — the matchup to avoid. */
export function biggestGap(cmp: DimensionComparison[]): DimensionComparison | null {
  if (cmp.length === 0) return null;
  return cmp.reduce((worst, c) => (c.delta < worst.delta ? c : worst));
}
