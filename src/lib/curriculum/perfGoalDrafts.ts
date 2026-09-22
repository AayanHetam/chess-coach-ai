/**
 * The per-control goal form, as TEXT — one shared source of truth for the two
 * surfaces that now ask the question.
 *
 * It used to be asked in exactly one place (/plan's goal setter) and could keep
 * its parsing inline. It is now asked twice: once in the onboarding quiz, where
 * new accounts set their goals, and once on /profile, where every account can
 * change them afterwards. Two hand-written copies of "what counts as a valid
 * rating pair" is the same trap `goalPatch` exists to close — the quiz would
 * accept a pair the profile rejects, or draw a promise the builder then refuses
 * to store.
 *
 * Deliberately React-free so the rules are unit-tested as plain functions; the
 * inputs that render them live in components/goals/PerfGoalFields.tsx.
 */

import {
  GOAL_PERFS,
  MAX_PERF_GOAL,
  MAX_PERF_START,
  MIN_PERF_GOAL,
  type GoalPerf,
  type PerfGoalDraft,
  type PerfGoals,
} from "./goalPatch";
import { intensityTier, projectToGoal } from "./improvementModel";
import { minutesPerDayFor, type TimeCommitment } from "./timeCommitment";
import { normalizeRating, type Platform } from "@/lib/rating/platformRatings";

/** One control's two fields, exactly as typed. Strings, so a half-entered
 *  "14" is a legal intermediate state rather than the number fourteen. */
export interface PerfDraftFields {
  start: string;
  goal: string;
}

export type PerfDrafts = Record<GoalPerf, PerfDraftFields>;

export const PERF_LABEL: Record<GoalPerf, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
};

export function emptyPerfDrafts(): PerfDrafts {
  return {
    bullet: { start: "", goal: "" },
    blitz: { start: "", goal: "" },
    rapid: { start: "", goal: "" },
  };
}

/** Seed the form from goals already stored, so "change my goal" opens on the
 *  numbers the user last committed to rather than on a blank slate. */
export function perfDraftsFromGoals(goals: PerfGoals | undefined): PerfDrafts {
  const drafts = emptyPerfDrafts();
  if (!goals) return drafts;
  for (const perf of GOAL_PERFS) {
    const existing = goals[perf];
    if (existing) {
      drafts[perf] = {
        start: String(existing.start),
        goal: String(existing.goal),
      };
    }
  }
  return drafts;
}

/** Digits only — this is a rating, not free text. */
export function sanitizeRatingInput(value: string): string {
  return value.replace(/[^\d]/g, "").slice(0, 4);
}

/** "" → undefined; anything non-numeric → NaN, which the builder refuses. */
export function parseRatingField(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return Number(trimmed);
}

/**
 * The inline complaint for one control, or null when it is fine.
 *
 * A control with no goal typed is simply not participating: currents are
 * prefilled from the linked account, so "start filled, goal empty" is the
 * resting state of every card and must never read as an error.
 */
export function perfCardError(draft: PerfDraftFields): string | null {
  const start = parseRatingField(draft.start);
  const goal = parseRatingField(draft.goal);
  if (goal === undefined) return null; // not participating
  if (start === undefined)
    return "Add your current rating to anchor this goal.";
  if (!Number.isFinite(start) || !Number.isFinite(goal))
    return "Ratings are plain numbers, like 1500.";
  if (start < MIN_PERF_GOAL || start > MAX_PERF_START)
    return `Current rating should be between ${MIN_PERF_GOAL} and ${MAX_PERF_START}.`;
  if (goal < MIN_PERF_GOAL || goal > MAX_PERF_GOAL)
    return `Goals go up to ${MAX_PERF_GOAL} here.`;
  if (goal <= start) return `Set a goal above ${start} to aim upward.`;
  return null;
}

export function perfDraftErrors(
  drafts: PerfDrafts
): Partial<Record<GoalPerf, string>> {
  const out: Partial<Record<GoalPerf, string>> = {};
  for (const perf of GOAL_PERFS) {
    const error = perfCardError(drafts[perf]);
    if (error) out[perf] = error;
  }
  return out;
}

/** Every participating control passes its own check. */
export function perfDraftsClean(drafts: PerfDrafts): boolean {
  return Object.keys(perfDraftErrors(drafts)).length === 0;
}

/** Has the user actually aimed at anything? */
export function anyPerfGoalSet(drafts: PerfDrafts): boolean {
  return GOAL_PERFS.some(
    (perf) => parseRatingField(drafts[perf].goal) !== undefined
  );
}

/** The numeric shape `buildPerfGoalPatch` consumes. */
export function parsePerfDrafts(
  drafts: PerfDrafts
): Partial<Record<GoalPerf, PerfGoalDraft>> {
  const out: Partial<Record<GoalPerf, PerfGoalDraft>> = {};
  for (const perf of GOAL_PERFS) {
    out[perf] = {
      start: parseRatingField(drafts[perf].start),
      goal: parseRatingField(drafts[perf].goal),
    };
  }
  return out;
}

/**
 * Fill in the CURRENT side from ratings read off the linked platform — but
 * never over a number already there. The current rating is the user's to
 * correct; we only save them the typing. Returns the same object when nothing
 * changed so callers can skip a re-render.
 */
export function prefillCurrents(
  drafts: PerfDrafts,
  currents: Partial<Record<GoalPerf, number | undefined>>
): PerfDrafts {
  let changed = false;
  const next = { ...drafts };
  for (const perf of GOAL_PERFS) {
    const current = currents[perf];
    if (current === undefined) continue;
    if (next[perf].start !== "") continue;
    next[perf] = { ...next[perf], start: String(current) };
    changed = true;
  }
  return changed ? next : drafts;
}

// ─── Pace check ─────────────────────────────────────────────────────────────

/**
 * Is the goal reachable at the schedule the user just agreed to?
 *
 * `"unreachable"` also explains a refused patch: `buildGoalPatch` returns null
 * when the projection has no target date, so without this the save button
 * would simply be dead with no reason given. Returns null when there is not
 * yet enough to judge — a silence, never a reassuring "ok".
 */
export type GoalPace = "ok" | "hard" | "unreachable";

export function pacePerfGoals({
  drafts,
  platform,
  time,
  daysPerWeek,
}: {
  drafts: PerfDrafts;
  platform?: Platform;
  time?: TimeCommitment;
  daysPerWeek?: number;
}): GoalPace | null {
  if (!time || !daysPerWeek) return null;
  if (!perfDraftsClean(drafts) || !anyPerfGoalSet(drafts)) return null;
  const minutesPerDay = minutesPerDayFor(time);
  if (!minutesPerDay) return null;

  // Chess.com IS the calibration scale, so an unlabelled number falls back to
  // it — the conservative reading, per normalizeRating.
  const scale = platform ?? "chesscom";
  const parsed = parsePerfDrafts(drafts);
  let unreachable = false;
  let hard = false;
  for (const perf of GOAL_PERFS) {
    const draft = parsed[perf];
    if (draft?.goal === undefined || draft.start === undefined) continue;
    const projection = projectToGoal({
      currentRating: normalizeRating(draft.start, scale),
      goalRating: normalizeRating(draft.goal, scale),
      minutesPerDay,
      daysPerWeek,
    });
    if (projection.status !== "ok") unreachable = true;
    else if (intensityTier(projection.intensity) === "hard") hard = true;
  }
  if (unreachable) return "unreachable";
  if (hard) return "hard";
  return "ok";
}

/** "an hour" reads as the promise the option made; "60 min" reads like a
 *  rounding artefact. */
export function practiceMinutesLabel(
  time: TimeCommitment | undefined
): string | undefined {
  const minutes = time ? minutesPerDayFor(time) : undefined;
  if (minutes === undefined || minutes === 0) return undefined;
  return minutes >= 60 ? "an hour" : `${minutes} min`;
}
