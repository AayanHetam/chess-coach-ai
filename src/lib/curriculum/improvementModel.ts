/**
 * How long will it take me to reach my goal rating?
 *
 * Pure, dependency-free, and deliberately conservative. This produces a number
 * we SHOW A USER about their own future, so the standard is the same one the
 * rest of this codebase holds: never assert precision we do not have.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE THE NUMBERS COME FROM  (researched 2026-08-12)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Every source agrees the cost of a rating point rises roughly exponentially
 * with rating: below 1000 a player is losing to one-move blunders, and fixing
 * that is cheap; above 2000 the remaining errors are subtle and expensive.
 *
 * The model is  hoursPer100(R) = H0 · e^((R − R0) / S).
 *
 * It is calibrated against published TIMELINE statements rather than published
 * hours-per-point rates, because the rate figures in circulation contradict
 * each other (one source's two calculators imply both "200 points in 4-8
 * months" and "500 points in 8-14 months" at the same 5 h/week, which cannot
 * both be true under diminishing returns). Timelines validate as:
 *
 *     1000→1500 @5h/wk   model 11.9 mo   published  8-14 mo   ✓
 *     1400→1800 @5h/wk   model  1.9 yr   published  1-3 yr    ✓
 *     1600→1800 @5h/wk   model 14.7 mo   published 12-18 mo   ✓
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE OUTPUT IS A RANGE AND NEVER A DATE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Charness, Tuffiash, Krampe, Reingold & Vasyukova (2005), n=419, Elo
 * 1150-2650: accumulated serious study is the single strongest predictor of
 * chess skill — and everything chess-related combined still explains only
 * ~40% of the variance in rating. Reported hours to reach master ranged from
 * 3,016 to 23,608: an 8:1 spread between the fastest and slowest players.
 *
 * A single "you'll hit 1700 on 14 March" would therefore be a fabrication
 * wearing the costume of a calculation. Every estimate here carries a fast/slow
 * band, and callers must render the band.
 *
 * ⚠️ THE CONSTANTS BELOW ARE A CHESS-JUDGEMENT CALL, not a measurement. They
 * are isolated so tuning them is a one-line change.
 */

/** Ratings are on the Chess.com-like calibration scale (see rating/platformRatings). */
export const MODEL = {
  /** Hours of deliberate practice per 100 rating points, at REFERENCE_RATING. */
  HOURS_PER_100_AT_REF: 48,
  REFERENCE_RATING: 1250,
  /** Cost multiplies by e for every S rating points gained. */
  E_FOLDING_POINTS: 380,
  /**
   * Weekly hours above this are discounted: consistent moderate practice beats
   * marathon sessions. Below it, hours count linearly — a concave curve through
   * the reference would credit 2 h/week as worth more than 2 hours, which
   * flatters small commitments and this estimate must not do that.
   */
  REFERENCE_WEEKLY_HOURS: 5,
  LONG_SESSION_EXPONENT: 0.75,
  /** Multipliers on the central estimate. Derived from the variance above. */
  FAST_MULTIPLIER: 0.65,
  SLOW_MULTIPLIER: 1.75,
  /** Beyond this the answer is "pick a nearer goal", not a number. */
  MAX_SENSIBLE_YEARS: 12,
} as const;

export const MIN_GOAL_RATING = 100;
export const MAX_GOAL_RATING = 3000;

/** Hours of deliberate practice to gain 100 rating points, starting from `rating`. */
export function hoursPer100(rating: number): number {
  const { HOURS_PER_100_AT_REF: H0, REFERENCE_RATING: R0, E_FOLDING_POINTS: S } = MODEL;
  return H0 * Math.exp((rating - R0) / S);
}

/**
 * Total hours to move from `from` to `to`. Integral of the cost curve, so it
 * accounts for the cost rising continuously across the span rather than
 * applying one flat rate to the whole gap.
 */
export function hoursBetween(from: number, to: number): number {
  if (to <= from) return 0;
  const { HOURS_PER_100_AT_REF: H0, REFERENCE_RATING: R0, E_FOLDING_POINTS: S } = MODEL;
  return (S / 100) * H0 * (Math.exp((to - R0) / S) - Math.exp((from - R0) / S));
}

/**
 * Spacing effect. Six days with a rest day is the shape spaced-repetition
 * research points at; cramming the same minutes into one or two sittings
 * retains less.
 */
export function spacingFactor(daysPerWeek: number): number {
  if (daysPerWeek <= 2) return 0.8;
  if (daysPerWeek <= 4) return 0.92;
  if (daysPerWeek <= 6) return 1;
  return 0.98; // 7 days: no rest day is very slightly worse than 6
}

/**
 * Convert a stated schedule into effective weekly practice hours.
 * Linear up to the reference, concave above it.
 */
export function effectiveWeeklyHours(minutesPerDay: number, daysPerWeek: number): number {
  const raw = (Math.max(0, minutesPerDay) * Math.max(0, daysPerWeek)) / 60;
  const { REFERENCE_WEEKLY_HOURS: REF, LONG_SESSION_EXPONENT: P } = MODEL;
  const discounted = raw <= REF ? raw : REF + Math.pow(raw - REF, P);
  return discounted * spacingFactor(daysPerWeek);
}

/**
 * Rating reached after `weeks` at a constant effective rate — the closed-form
 * inverse of `hoursBetween`. This is what gives the projection chart its shape:
 * growth is concave, fast at first and flattening, because each further point
 * costs more than the last. A straight line would misrepresent the whole thing.
 */
export function ratingAfterWeeks(
  current: number,
  weeks: number,
  effectiveWeekly: number
): number {
  const { HOURS_PER_100_AT_REF: H0, REFERENCE_RATING: R0, E_FOLDING_POINTS: S } = MODEL;
  if (weeks <= 0 || effectiveWeekly <= 0) return current;
  const base = Math.exp((current - R0) / S);
  const gained = (100 * effectiveWeekly * weeks) / (S * H0);
  return R0 + S * Math.log(base + gained);
}

export type ProjectionStatus =
  | "ok"
  /** Goal is at or below where they already are. */
  | "already_there"
  /** Reachable, but not on any timescale worth drawing. */
  | "unrealistic"
  /** No schedule given, so there is nothing to project from. */
  | "no_schedule";

export interface ProjectionPoint {
  weeks: number;
  rating: number;
}

export interface Projection {
  status: ProjectionStatus;
  currentRating: number;
  goalRating: number;
  /** Effective — already discounted for long sessions and spacing. */
  weeklyHours: number;
  totalHours: number;
  /** Central estimate. Undefined unless status is "ok". */
  weeks?: number;
  months?: number;
  /** The honest band around the central estimate. */
  fastMonths?: number;
  slowMonths?: number;
  /** Curve for the chart: rating over time, up to the central estimate. */
  curve: ProjectionPoint[];
  /**
   * How stretching the goal is for the stated schedule: required weekly hours
   * to arrive within a year, divided by what they actually plan to do. 1.0 =
   * on track for a year; 2.0 = the goal needs twice the effort or twice the
   * time. Drives training intensity downstream.
   */
  intensity: number;
}

export interface ProjectionInput {
  currentRating: number;
  goalRating: number;
  minutesPerDay: number;
  daysPerWeek: number;
  /** Points to plot. */
  curvePoints?: number;
}

const WEEKS_PER_MONTH = 52 / 12;

export function projectToGoal(input: ProjectionInput): Projection {
  const { currentRating, goalRating, minutesPerDay, daysPerWeek } = input;
  const weeklyHours = effectiveWeeklyHours(minutesPerDay, daysPerWeek);
  const totalHours = hoursBetween(currentRating, goalRating);

  const base: Projection = {
    status: "ok",
    currentRating,
    goalRating,
    weeklyHours,
    totalHours,
    curve: [],
    intensity: 0,
  };

  if (goalRating <= currentRating) return { ...base, status: "already_there" };
  if (weeklyHours <= 0) return { ...base, status: "no_schedule" };

  const weeks = totalHours / weeklyHours;
  const months = weeks / WEEKS_PER_MONTH;

  // Required pace to arrive inside a year, against what they actually plan.
  const intensity = totalHours / 52 / weeklyHours;

  if (months / 12 > MODEL.MAX_SENSIBLE_YEARS) {
    return { ...base, status: "unrealistic", weeks, months, intensity };
  }

  const n = Math.max(2, input.curvePoints ?? 24);
  const curve: ProjectionPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const w = (weeks * i) / n;
    curve.push({ weeks: w, rating: Math.round(ratingAfterWeeks(currentRating, w, weeklyHours)) });
  }

  return {
    ...base,
    status: "ok",
    weeks,
    months,
    fastMonths: months * MODEL.FAST_MULTIPLIER,
    slowMonths: months * MODEL.SLOW_MULTIPLIER,
    curve,
    intensity,
  };
}

/**
 * Training intensity tier for the daily plan.
 *
 * Capped on purpose. A user who wants +800 points in a year does not get a
 * session eight times longer than they said they had time for — they get the
 * hardest sensible session and honest messaging about the timeline. Silently
 * inflating the workload past what someone signed up for is how people quit.
 */
export type IntensityTier = "steady" | "focused" | "hard";

export function intensityTier(intensity: number): IntensityTier {
  if (intensity <= 1.15) return "steady";
  if (intensity <= 2.2) return "focused";
  return "hard";
}

/** Multiplier on the daily session size. Deliberately narrow. */
export function sessionSizeMultiplier(tier: IntensityTier): number {
  switch (tier) {
    case "steady":
      return 1;
    case "focused":
      return 1.25;
    case "hard":
      return 1.5;
  }
}
