import { projectToGoal } from "./improvementModel";
import { minutesPerDayFor, type TimeCommitment } from "./timeCommitment";
import { normalizeRating, type Platform } from "@/lib/rating/platformRatings";

/**
 * The four fields that constitute a goal, built in ONE place.
 *
 * Two callers write them — the onboarding quiz and the /plan goal setter — and
 * they must agree exactly. When the quiz built its own version inline it
 * re-derived the starting rating differently from the number it had just shown
 * the user, so the promise on screen and the promise in Firestore disagreed and
 * /plan rendered nothing at all. Divergence between two copies of this logic is
 * precisely the failure mode; there is now only one copy.
 *
 * Returns null rather than a partial patch when there is no rating to anchor
 * to. A goal whose baseline is missing is not a weaker goal — /plan cannot say
 * "ahead" or "behind" without it, so the card refuses to render and the user
 * gets a promise that silently does nothing.
 */

/** The controls a goal can be set on — the same three the trend panels chart. */
export const GOAL_PERFS = ["bullet", "blitz", "rapid"] as const;
export type GoalPerf = (typeof GOAL_PERFS)[number];

/**
 * One control's goal, in the PLATFORM'S OWN numbers — never normalized.
 * Displayed ratings are always raw (see rating/platformRatings.ts); these are
 * displayed, typed, and drawn on the raw-scale trend panels. `start` is the
 * rating at set time — the per-control analogue of `goalStartRating`.
 */
export interface PerfGoal {
  start: number;
  goal: number;
}

export type PerfGoals = Partial<Record<GoalPerf, PerfGoal>>;

/** Matches the zod window on the PATCH route; a mismatch here would build a
 *  patch the server then rejects, which reads as a dead save button. */
export const MIN_PERF_GOAL = 100;
export const MAX_PERF_GOAL = 3000;
export const MAX_PERF_START = 3500;

function isValidPerfGoal(entry: PerfGoal): boolean {
  return (
    Number.isFinite(entry.start) &&
    Number.isFinite(entry.goal) &&
    entry.start >= MIN_PERF_GOAL &&
    entry.start <= MAX_PERF_START &&
    entry.goal >= MIN_PERF_GOAL &&
    entry.goal <= MAX_PERF_GOAL &&
    entry.goal > entry.start
  );
}

export interface GoalPatch {
  goalRating: number;
  goalStartRating: number;
  goalSetAt: number;
  goalTargetDate: number;
  practiceDaysPerWeek: number;
  dailyTimeCommitment: TimeCommitment;
  /** Per-control targets, when the goal was set control-by-control. */
  perfGoals?: PerfGoals;
}

export interface GoalPatchInput {
  currentRating?: number;
  goalRating?: number;
  time?: TimeCommitment;
  daysPerWeek?: number;
  /** Injected so callers can stamp deterministically in tests. */
  now?: number;
  /**
   * Optional per-control targets, raw platform numbers. If provided, EVERY
   * entry must be valid or the whole patch is refused — dropping one control
   * silently would store a goal the user did not set, and "we kept two of your
   * three goals" is not a thing any screen says.
   */
  perfGoals?: PerfGoals;
}

/**
 * Does this profile carry a goal complete enough for GoalProgressCard to draw?
 *
 * Mirrors that component's own bail-out exactly, and exists so /plan cannot
 * disagree with it. If the page believed a goal was set where the card refuses
 * to render, the user would get neither the card nor the setter that offers to
 * create one — a blank space with no way out, which is strictly worse than the
 * missing card this whole change is fixing.
 */
export interface GoalFields {
  goalRating?: number;
  goalStartRating?: number;
  goalSetAt?: number;
  practiceDaysPerWeek?: number;
  dailyTimeCommitment?: string;
}

/** The same fields, once the predicate has vouched for all of them. */
export interface CompleteGoal {
  goalRating: number;
  goalStartRating: number;
  goalSetAt: number;
  practiceDaysPerWeek: number;
  dailyTimeCommitment: TimeCommitment;
}

// A type predicate rather than a plain boolean, so callers get the narrowing
// too. The alternative was `!` assertions at every use site, which would throw
// away exactly the guarantee this function exists to provide.
export function hasCompleteGoal(
  profile: GoalFields | null | undefined
): profile is CompleteGoal {
  if (!profile) return false;
  return (
    typeof profile.goalRating === "number" &&
    typeof profile.goalStartRating === "number" &&
    typeof profile.goalSetAt === "number" &&
    typeof profile.practiceDaysPerWeek === "number" &&
    !!profile.dailyTimeCommitment &&
    minutesPerDayFor(profile.dailyTimeCommitment as TimeCommitment) > 0
  );
}

export function buildGoalPatch({
  currentRating,
  goalRating,
  time,
  daysPerWeek,
  now,
  perfGoals,
}: GoalPatchInput): GoalPatch | null {
  if (typeof goalRating !== "number") return null;
  if (typeof daysPerWeek !== "number") return null;
  if (!time) return null;
  // No anchor, no promise. Projecting from a stand-in 1500 would produce a date
  // that looks authoritative and means nothing.
  if (typeof currentRating !== "number") return null;

  const minutesPerDay = minutesPerDayFor(time);
  if (!minutesPerDay) return null;

  // Fail closed on the per-control goals: one bad entry refuses the whole
  // patch rather than storing the survivors. The UI mirrors this rule with an
  // inline error on the offending card, so a null here is never a mystery.
  let cleanPerfGoals: PerfGoals | undefined;
  if (perfGoals) {
    const entries = Object.entries(perfGoals) as [GoalPerf, PerfGoal][];
    if (entries.length === 0) return null;
    for (const [perf, entry] of entries) {
      if (!(GOAL_PERFS as readonly string[]).includes(perf)) return null;
      if (!isValidPerfGoal(entry)) return null;
    }
    cleanPerfGoals = Object.fromEntries(
      entries.map(([perf, e]) => [
        perf,
        { start: Math.round(e.start), goal: Math.round(e.goal) },
      ])
    );
  }

  const projection = projectToGoal({
    currentRating,
    goalRating,
    minutesPerDay,
    daysPerWeek,
  });
  // Unreachable at this pace, or the goal is at/below where they already are.
  if (!projection.targetDate) return null;

  return {
    goalRating,
    goalStartRating: currentRating,
    goalSetAt: now ?? Date.now(),
    goalTargetDate: projection.targetDate,
    practiceDaysPerWeek: daysPerWeek,
    dailyTimeCommitment: time,
    ...(cleanPerfGoals ? { perfGoals: cleanPerfGoals } : {}),
  };
}

// ─── Per-control goals → the one overall goal ───────────────────────────────

export interface PerfGoalDraft {
  start?: number;
  goal?: number;
}

export interface PerfGoalPatchInput {
  /**
   * What the user typed, control by control. A control with no goal typed is
   * simply not participating — currents are prefilled from the platform, so
   * "start filled, goal empty" is the resting state of every card, not an
   * error. A goal WITHOUT a start is an error: there is nothing to anchor it.
   */
  drafts: Partial<Record<GoalPerf, PerfGoalDraft>>;
  /**
   * The scale the raw numbers live on. Chess.com IS the calibration scale, so
   * absence (nothing linked, numbers typed by hand) falls back to it — the
   * conservative reading of an unlabelled number, per normalizeRating.
   */
  platform?: Platform;
  /**
   * The control `platformRating` was taken from. When that control
   * participates it stays the overall anchor, so the goal /plan scores against
   * resolveUserRating keeps comparing like with like.
   */
  anchorPerf?: string;
  time?: TimeCommitment;
  daysPerWeek?: number;
  now?: number;
}

/**
 * Build the goal patch from per-control targets.
 *
 * The overall `goalRating`/`goalStartRating` pair every existing reader
 * consumes (GoalProgressCard, the trend forecast, intensity) is derived from
 * ONE anchor control and normalized onto the calibration scale — then the
 * whole thing is delegated to buildGoalPatch, so there is still exactly one
 * place a goal is assembled.
 *
 * Anchor choice: the control the platform rating came from, when it
 * participates; otherwise the participating control with the highest
 * normalized current, which is the same "highest established rating wins"
 * rule selectCalibrationRating already applies.
 */
export function buildPerfGoalPatch({
  drafts,
  platform,
  anchorPerf,
  time,
  daysPerWeek,
  now,
}: PerfGoalPatchInput): GoalPatch | null {
  const scale: Platform = platform ?? "chesscom";

  const participating: [GoalPerf, PerfGoal][] = [];
  for (const perf of GOAL_PERFS) {
    const draft = drafts[perf];
    if (draft?.goal === undefined) continue; // not participating
    if (draft.start === undefined) return null; // a goal with no anchor
    participating.push([perf, { start: draft.start, goal: draft.goal }]);
  }
  if (participating.length === 0) return null;
  if (!participating.every(([, e]) => isValidPerfGoal(e))) return null;

  const anchor =
    participating.find(([perf]) => perf === anchorPerf) ??
    participating.reduce((best, cur) =>
      normalizeRating(cur[1].start, scale) >
      normalizeRating(best[1].start, scale)
        ? cur
        : best
    );

  return buildGoalPatch({
    currentRating: normalizeRating(anchor[1].start, scale),
    goalRating: normalizeRating(anchor[1].goal, scale),
    time,
    daysPerWeek,
    now,
    perfGoals: Object.fromEntries(participating),
  });
}
