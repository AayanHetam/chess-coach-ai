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
   * Minutes in a SESSION beyond which returns diminish — attention and recall
   * fall off inside one sitting.
   *
   * This used to be applied to the WEEKLY total, which was simply wrong: the
   * cited rationale is "very long study SESSIONS vs consistent moderate
   * practice", and taxing the weekly total penalises the person doing an hour
   * every day exactly like the person cramming seven hours on Sunday. Those are
   * not the same and the spacing factor already separates them.
   */
  REFERENCE_SESSION_MINUTES: 45,
  LONG_SESSION_EXPONENT: 0.75,
  /**
   * Guided-practice efficiency.
   *
   * ⚠️ THIS IS A PRODUCT CLAIM, NOT A RESEARCH FINDING — flagged so nobody
   * mistakes it for one later.
   *
   * Every published improvement rate measures SELF-DIRECTED players: someone
   * choosing their own puzzles, without a measured weakness map, without
   * spaced repetition, without feedback on why a move failed. Charness et al.
   * found 80% of masters used a coach and that coached practice correlated
   * MORE strongly with skill than solo study did — but the hours-per-point
   * figures in circulation are drawn from the unguided population.
   *
   * This product is adaptive puzzles aimed at measured weaknesses, plus a
   * coach, plus SRS. That it beats unguided study is its entire premise.
   *
   * 0.24 is calibrated to Aayan's coaching experience — a 1300 practising
   * daily reaching 1600 in about four months — held against the 30-minute cap
   * the quiz now asks for rather than the hour it used to assume. It
   * reproduces 4.0 months at 30 min daily and 4.6 at 30 min x 6 days.
   *
   * This is the OPTIMISTIC end of what is defensible, and that is a deliberate
   * founder call. The band and the "not a promise" line ship alongside it for
   * exactly that reason: the estimate leans forward, so the uncertainty has to
   * stay visible rather than being quietly dropped.
   *
   * Isolated here so it is one line to tune, and so the literature-calibrated
   * base curve underneath stays honest and independently testable.
   */
  GUIDED_PRACTICE_MULTIPLIER: 0.24,
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
  const {
    HOURS_PER_100_AT_REF: H0,
    REFERENCE_RATING: R0,
    E_FOLDING_POINTS: S,
  } = MODEL;
  return H0 * Math.exp((rating - R0) / S);
}

/**
 * Total hours to move from `from` to `to`. Integral of the cost curve, so it
 * accounts for the cost rising continuously across the span rather than
 * applying one flat rate to the whole gap.
 */
export function hoursBetween(from: number, to: number): number {
  if (to <= from) return 0;
  const {
    HOURS_PER_100_AT_REF: H0,
    REFERENCE_RATING: R0,
    E_FOLDING_POINTS: S,
  } = MODEL;
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
 *
 * The concave discount applies to the SESSION, not the week, so consistent
 * daily practice is not taxed as though it were cramming. Spacing is handled
 * separately by `spacingFactor`.
 */
export function effectiveWeeklyHours(
  minutesPerDay: number,
  daysPerWeek: number
): number {
  const mins = Math.max(0, minutesPerDay);
  const days = Math.max(0, daysPerWeek);
  const { REFERENCE_SESSION_MINUTES: REF, LONG_SESSION_EXPONENT: P } = MODEL;
  const effectiveMinutes = mins <= REF ? mins : REF + Math.pow(mins - REF, P);
  return ((effectiveMinutes * days) / 60) * spacingFactor(days);
}

/**
 * Hours of GUIDED practice to get from `from` to `to` — what this product
 * actually delivers, and what every user-facing estimate must use.
 * `hoursBetween` remains the unguided, literature-calibrated baseline.
 */
export function guidedHoursBetween(from: number, to: number): number {
  return hoursBetween(from, to) * MODEL.GUIDED_PRACTICE_MULTIPLIER;
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
  const {
    HOURS_PER_100_AT_REF: H0,
    REFERENCE_RATING: R0,
    E_FOLDING_POINTS: S,
  } = MODEL;
  if (weeks <= 0 || effectiveWeekly <= 0) return current;
  const base = Math.exp((current - R0) / S);
  // Divided by the guided multiplier so the curve and the headline agree: an
  // hour of practice buys more rating here than the unguided baseline assumes.
  const gained =
    (100 * effectiveWeekly * weeks) /
    (S * H0 * MODEL.GUIDED_PRACTICE_MULTIPLIER);
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
  /**
   * The date we tell the user to aim for — epoch ms.
   *
   * A target, not a prediction. `earliestDate`/`latestDate` carry the same
   * fast/slow band expressed as dates, and callers should keep showing them:
   * practice explains ~40% of rating variance, so a bare date implies a
   * precision nobody has. Deliberate product decision (Aayan, 2026-08-14) —
   * a goal you can put in a calendar beats a range you can't act on.
   */
  targetDate?: number;
  earliestDate?: number;
  latestDate?: number;
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
  /**
   * "Now", for the target date. Injected rather than read from the clock so
   * the model stays pure and the dates are testable.
   */
  nowMs?: number;
}

const WEEKS_PER_MONTH = 52 / 12;

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** "March 2027" — the granularity the estimate can actually support. */
export function formatTargetDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

export function projectToGoal(input: ProjectionInput): Projection {
  const { currentRating, goalRating, minutesPerDay, daysPerWeek } = input;
  const weeklyHours = effectiveWeeklyHours(minutesPerDay, daysPerWeek);
  const totalHours = guidedHoursBetween(currentRating, goalRating);

  const base: Projection = {
    status: "ok",
    currentRating,
    goalRating,
    weeklyHours,
    totalHours,
    curve: [],
    intensity: 0,
  };

  // A non-finite input must never travel as `status: "ok"`. It used to: an
  // undefined currentRating produced NaN arithmetic all the way through and
  // still reported "ok", so a caller trusting the status rendered
  // `formatTargetDate(NaN)` — the string "Invalid Date", presented as a
  // promise. Only an upstream guard in GoalRatingPicker kept it off screen.
  if (!Number.isFinite(currentRating) || !Number.isFinite(goalRating)) {
    return { ...base, status: "no_schedule" };
  }

  if (goalRating <= currentRating) return { ...base, status: "already_there" };
  if (weeklyHours <= 0) return { ...base, status: "no_schedule" };

  const weeks = totalHours / weeklyHours;
  const months = weeks / WEEKS_PER_MONTH;

  // Required pace to arrive inside a year, against what they actually plan.
  const intensity = totalHours / 52 / weeklyHours;

  if (months / 12 > MODEL.MAX_SENSIBLE_YEARS) {
    return { ...base, status: "unrealistic", weeks, months, intensity };
  }

  const now = input.nowMs ?? Date.now();
  const addMonths = (mo: number) => {
    const d = new Date(now);
    // setMonth handles year rollover and clamps day-of-month, so a 31st never
    // silently becomes the 1st of the following month.
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + Math.round(mo));
    d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
    return d.getTime();
  };

  const n = Math.max(2, input.curvePoints ?? 24);
  const curve: ProjectionPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const w = (weeks * i) / n;
    curve.push({
      weeks: w,
      rating: Math.round(ratingAfterWeeks(currentRating, w, weeklyHours)),
    });
  }

  return {
    ...base,
    status: "ok",
    weeks,
    months,
    fastMonths: months * MODEL.FAST_MULTIPLIER,
    slowMonths: months * MODEL.SLOW_MULTIPLIER,
    targetDate: addMonths(months),
    earliestDate: addMonths(months * MODEL.FAST_MULTIPLIER),
    latestDate: addMonths(months * MODEL.SLOW_MULTIPLIER),
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

// ─── Progress against a promise ─────────────────────────────────────────────

export type GoalPace = "ahead" | "on_track" | "behind" | "reached";

export interface GoalProgress {
  pace: GoalPace;
  /** Rating the original plan expected by now. */
  expectedRating: number;
  currentRating: number;
  goalRating: number;
  /** Points ahead (+) or behind (-) the plan. */
  pointsVsPlan: number;
  /**
   * Weeks ahead (+) or behind (-): the gap between when the plan said you'd
   * reach today's rating and when you actually did. More meaningful than
   * points, because points are not linear — 20 points at 1900 is a month's
   * work, 20 points at 1200 is an afternoon.
   */
  weeksVsPlan: number;
  /** Fraction of the journey covered, 0-1, for a progress bar. */
  fractionComplete: number;
}

export interface GoalProgressInput {
  startRating: number;
  goalRating: number;
  currentRating: number;
  goalSetAt: number;
  minutesPerDay: number;
  daysPerWeek: number;
  nowMs?: number;
}

/** Weeks the plan allots to get from `startRating` to `rating`. */
function plannedWeeksTo(
  startRating: number,
  rating: number,
  weeklyHours: number
): number {
  if (weeklyHours <= 0) return Infinity;
  return guidedHoursBetween(startRating, rating) / weeklyHours;
}

/**
 * How the user is doing against the promise they were given at signup.
 *
 * Measured against the ORIGINAL baseline, never re-derived from where they
 * are today: re-baselining would silently move the goalposts every visit and
 * make "behind" impossible to ever report, which would make the whole thing
 * decorative.
 */
export function goalProgress(input: GoalProgressInput): GoalProgress {
  const { startRating, goalRating, currentRating, goalSetAt } = input;
  const now = input.nowMs ?? Date.now();
  const weeklyHours = effectiveWeeklyHours(
    input.minutesPerDay,
    input.daysPerWeek
  );

  const weeksElapsed = Math.max(
    0,
    (now - goalSetAt) / (7 * 24 * 60 * 60 * 1000)
  );
  const expectedRating = Math.round(
    ratingAfterWeeks(startRating, weeksElapsed, weeklyHours)
  );

  // Where the plan said today's rating would arrive, vs when it actually did.
  const plannedWeeksForCurrent = plannedWeeksTo(
    startRating,
    currentRating,
    weeklyHours
  );
  const weeksVsPlan = Number.isFinite(plannedWeeksForCurrent)
    ? plannedWeeksForCurrent - weeksElapsed
    : 0;

  const span = goalRating - startRating;
  const fractionComplete =
    span > 0
      ? Math.max(0, Math.min(1, (currentRating - startRating) / span))
      : 1;

  let pace: GoalPace;
  if (currentRating >= goalRating) pace = "reached";
  // A week either side is noise, not a trend — puzzle ratings move daily.
  else if (weeksVsPlan > 1) pace = "ahead";
  else if (weeksVsPlan < -1) pace = "behind";
  else pace = "on_track";

  return {
    pace,
    expectedRating,
    currentRating,
    goalRating,
    pointsVsPlan: currentRating - expectedRating,
    weeksVsPlan,
    fractionComplete,
  };
}
