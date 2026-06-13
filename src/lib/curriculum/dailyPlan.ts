/**
 * Daily-session generator — pure. Given the user's time budget, measured
 * weaknesses, live rating, and which SRS cards are due, it returns the *intents*
 * for today's session (which themes to drill, at what rating window, how many
 * reviews). The UI resolves those intents into actual puzzles via the
 * `by_rating` puzzle endpoint. No network / React here so it unit-tests cleanly.
 */

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
  const { focusThemes, stats, liveRating } = input;

  // 1) Measured/declared weaknesses that map to a not-yet-mastered unit.
  const weak = (focusThemes ?? []).filter((t) => {
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
  const size = sessionSizeFor(input.dailyTimeCommitment);
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
