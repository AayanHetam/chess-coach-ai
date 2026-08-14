/**
 * Daily-session generator — pure. Given the user's time budget, measured
 * weaknesses, live rating, and which SRS cards are due, it returns the *intents*
 * for today's session (which themes to drill, at what rating window, how many
 * reviews). The UI resolves those intents into actual puzzles via the
 * `by_rating` puzzle endpoint. No network / React here so it unit-tests cleanly.
 */

import { sessionSizeMultiplier, type IntensityTier } from "./improvementModel";
import type { PuzzleStats } from "@/lib/puzzleRating";
import { SYLLABUS, unitForTheme, unitById } from "./syllabus";
import { computeCurriculumProgress, isUnitMastered } from "./mastery";

export type TimeCommitment = "under-10" | "10-30" | "30-plus";

export interface SessionSize {
  newConcept: number;
  reviews: number;
  coach: number;
}

const SIZES: Record<TimeCommitment, SessionSize> = {
  "under-10": { newConcept: 3, reviews: 3, coach: 0 },
  "10-30": { newConcept: 5, reviews: 6, coach: 1 },
  "30-plus": { newConcept: 8, reviews: 12, coach: 2 },
};

export function sessionSizeFor(tc?: TimeCommitment): SessionSize {
  return SIZES[tc ?? "10-30"];
}

const RATING_WINDOW = 120;

function dedupeThemes(themes: string[]): string[] {
  return Array.from(new Set(themes));
}

/**
 * Goal-driven intensity. Scales the session when the user's target rating is
 * further ahead than their stated schedule comfortably supports.
 *
 * Capped hard at 1.5x by `sessionSizeMultiplier`. Someone chasing +800 points
 * does not silently get an eight-times-longer session than the one they agreed
 * to — they get the hardest sensible session and an honest timeline. Quietly
 * inflating a commitment past what someone signed up for is how people quit.
 */
export interface DailySession {
  /** Themes to drill new puzzles from (length === newConcept count). */
  newThemes: string[];
  /** Themes with SRS cards due for review (capped). */
  reviewThemes: string[];
  /** Rating window the UI should fetch puzzles within. */
  ratingWindow: { min: number; max: number };
  /** Theme for the optional "1 coached insight", or null. */
  coachInsightTheme: string | null;
  totalPuzzles: number;
}

export interface DailyPlanInput {
  dailyTimeCommitment?: TimeCommitment;
  /** Set from the user's goal rating vs their schedule; defaults to "steady". */
  intensityTier?: IntensityTier;
  /** Placement-measured weaknesses. Take priority over stated focusThemes. */
  measuredWeaknesses?: string[];
  focusThemes?: string[];
  liveRating: number;
  stats: PuzzleStats;
  /** Theme ids whose SRS card is due, already computed by the caller. */
  dueReviewThemes: string[];
}

/** Round-robin a candidate theme list out to `count` picks (repeats allowed). */
function roundRobin(themes: string[], count: number): string[] {
  if (themes.length === 0 || count <= 0) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(themes[i % themes.length]);
  return out;
}

/** Weakness-first theme selection, falling back to the linear syllabus path. */
function pickNewThemeCandidates(input: DailyPlanInput): string[] {
  const { focusThemes, measuredWeaknesses, stats, liveRating } = input;

  // Measured weaknesses lead: they are an observation of how the player is
  // doing NOW, where focusThemes is what they said they wanted months ago.
  // Combined at READ time so each source keeps its own write semantics —
  // measurements get replaced, preferences persist.
  const combined = dedupeThemes([...(measuredWeaknesses ?? []), ...(focusThemes ?? [])]);

  // 1) Measured/declared weaknesses that map to a not-yet-mastered unit.
  const weak = combined.filter((t) => {
    const unit = unitForTheme(t);
    return unit && !isUnitMastered(unit, stats, liveRating);
  });
  if (weak.length > 0) return weak;

  // 2) The current linear-path unit.
  const progress = computeCurriculumProgress(stats, liveRating);
  if (progress.currentUnitId) {
    const unit = unitById(progress.currentUnitId);
    if (unit) return unit.themes;
  }

  // 3) Everything mastered — keep sharp on the final (endgame) unit.
  return SYLLABUS[SYLLABUS.length - 1].themes;
}

export function buildDailySession(input: DailyPlanInput): DailySession {
  const base = sessionSizeFor(input.dailyTimeCommitment);
  const mult = sessionSizeMultiplier(input.intensityTier ?? "steady");
  // FLOOR, not round: Math.round(5 * 1.5) is 8, which is 1.6x the base and
  // quietly breaks the cap the multiplier exists to enforce. Rounding a
  // workload UP past a documented ceiling is the exact over-commitment this is
  // meant to prevent.
  const size = {
    newConcept: Math.max(1, Math.floor(base.newConcept * mult)),
    reviews: Math.floor(base.reviews * mult),
    coach: base.coach,
  };
  const newThemes = roundRobin(pickNewThemeCandidates(input), size.newConcept);
  const reviewThemes = input.dueReviewThemes.slice(0, size.reviews);
  const coachInsightTheme =
    size.coach > 0 && newThemes.length > 0 ? newThemes[0] : null;

  return {
    newThemes,
    reviewThemes,
    ratingWindow: {
      min: Math.max(0, Math.round(input.liveRating - RATING_WINDOW)),
      max: Math.min(4000, Math.round(input.liveRating + RATING_WINDOW)),
    },
    coachInsightTheme,
    totalPuzzles: newThemes.length + reviewThemes.length,
  };
}
