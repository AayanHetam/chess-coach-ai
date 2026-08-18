import { projectToGoal } from "./improvementModel";
import { minutesPerDayFor, type TimeCommitment } from "./timeCommitment";

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

export interface GoalPatch {
  goalRating: number;
  goalStartRating: number;
  goalSetAt: number;
  goalTargetDate: number;
  practiceDaysPerWeek: number;
  dailyTimeCommitment: TimeCommitment;
}

export interface GoalPatchInput {
  currentRating?: number;
  goalRating?: number;
  time?: TimeCommitment;
  daysPerWeek?: number;
  /** Injected so callers can stamp deterministically in tests. */
  now?: number;
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
}: GoalPatchInput): GoalPatch | null {
  if (typeof goalRating !== "number") return null;
  if (typeof daysPerWeek !== "number") return null;
  if (!time) return null;
  // No anchor, no promise. Projecting from a stand-in 1500 would produce a date
  // that looks authoritative and means nothing.
  if (typeof currentRating !== "number") return null;

  const minutesPerDay = minutesPerDayFor(time);
  if (!minutesPerDay) return null;

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
  };
}
