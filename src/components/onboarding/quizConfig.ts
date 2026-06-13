/**
 * Onboarding quiz — static configuration and pure helpers.
 *
 * Declarative step data lives here; the live state machine + branching lives in
 * useOnboardingQuiz.ts. Kept import-light (no React) so it stays unit-testable.
 */

import type { UserProfileUpdates } from "@/lib/firestoreUsers";
import { QUIZ_GOAL_OPTIONS } from "./quizThemes";

// localStorage keys ───────────────────────────────────────────────────────────
// Draft = in-progress answers (resumable, never persisted to Firestore).
// Flush = the one payload written to the profile after auth completes.
export const DRAFT_STORAGE_KEY = "cm_onboarding_draft_v1";
export const FLUSH_STORAGE_KEY = "cm_onboarding_quiz_v1";

// Answer model ──────────────────────────────────────────────────────────────
export type PlayStyle = "lichess" | "chesscom" | "otb" | "new";
export type TimeCommitment = "under-10" | "10-30" | "30-plus";
export type SelfAssessScore = 0 | 1 | 2;
export type SelfAssessKey = "years" | "spot" | "tournaments";

export interface QuizAnswers {
  playStyle?: PlayStyle;
  // Online-rating path (playStyle lichess | chesscom):
  rating?: number;
  username?: string;
  // Self-assessment path (playStyle otb | new):
  selfAssess: Partial<Record<SelfAssessKey, SelfAssessScore>>;
  // Goals (multi-select option keys from QUIZ_GOAL_OPTIONS):
  goals: string[];
  // Daily time budget:
  time?: TimeCommitment;
}

export function emptyAnswers(): QuizAnswers {
  return { selfAssess: {}, goals: [] };
}

// Step 1 — how do you currently play? ──────────────────────────────────────
export const PLAY_STYLE_OPTIONS: {
  key: PlayStyle;
  label: string;
  helper: string;
}[] = [
  {
    key: "lichess",
    label: "Mostly on Lichess",
    helper: "I have a Lichess rating.",
  },
  {
    key: "chesscom",
    label: "Mostly on Chess.com",
    helper: "I have a Chess.com rating.",
  },
  {
    key: "otb",
    label: "Over the board",
    helper: "Clubs, school, or casual in-person.",
  },
  {
    key: "new",
    label: "New or just for fun",
    helper: "Still learning the ropes.",
  },
];

/** Online platforms ask for a numeric rating; everyone else self-assesses. */
export function usesRatingPath(playStyle: PlayStyle | undefined): boolean {
  return playStyle === "lichess" || playStyle === "chesscom";
}

// Self-assessment branch (3 questions, additive 0–6 → band) ─────────────────
export const SELF_ASSESS_QUESTIONS: {
  key: SelfAssessKey;
  question: string;
  options: { label: string; score: SelfAssessScore }[];
}[] = [
  {
    key: "years",
    question: "How long have you played seriously?",
    options: [
      { label: "Less than a year", score: 0 },
      { label: "1–3 years", score: 1 },
      { label: "3+ years", score: 2 },
    ],
  },
  {
    key: "spot",
    question: "Can you spot a fork or a pin before it happens?",
    options: [
      { label: "Rarely", score: 0 },
      { label: "Sometimes", score: 1 },
      { label: "Usually", score: 2 },
    ],
  },
  {
    key: "tournaments",
    question: "Have you played rated games (online or OTB)?",
    options: [
      { label: "Not really", score: 0 },
      { label: "A few online", score: 1 },
      { label: "Yes, regularly", score: 2 },
    ],
  },
];

// Step — daily time commitment ──────────────────────────────────────────────
export const TIME_OPTIONS: {
  key: TimeCommitment;
  label: string;
  helper: string;
}[] = [
  { key: "under-10", label: "Under 10 min / day", helper: "Quick daily reps." },
  { key: "10-30", label: "10–30 min / day", helper: "A steady habit." },
  { key: "30-plus", label: "30+ min / day", helper: "I'm here to grind." },
];

// Rating + band helpers ──────────────────────────────────────────────────────
// Representative ratings sit COMFORTABLY inside the coach's deriveSkillTier
// bands (<1000 / 1000–1599 / ≥1600) so the self-assessment maps cleanly.
export const REPRESENTATIVE_RATING = {
  beginner: 700,
  intermediate: 1300,
  advanced: 1750,
} as const;

export function selfAssessScore(answers: QuizAnswers): number {
  const sa = answers.selfAssess;
  return (sa.years ?? 0) + (sa.spot ?? 0) + (sa.tournaments ?? 0);
}

/** 0–1 → 700, 2–4 → 1300, 5–6 → 1750. */
export function scoreToRating(score: number): number {
  if (score <= 1) return REPRESENTATIVE_RATING.beginner;
  if (score <= 4) return REPRESENTATIVE_RATING.intermediate;
  return REPRESENTATIVE_RATING.advanced;
}

export type SkillBand = "Beginner" | "Intermediate" | "Advanced";

/** Mirrors deriveSkillTier() breakpoints so the result screen's band matches
 *  the tier the coach will actually use. */
export function bandLabel(rating: number): SkillBand {
  if (rating < 1000) return "Beginner";
  if (rating < 1600) return "Intermediate";
  return "Advanced";
}

export function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/** The skill rating the quiz derives, regardless of branch. */
export function derivedRating(answers: QuizAnswers): number {
  if (usesRatingPath(answers.playStyle) && typeof answers.rating === "number") {
    return answers.rating;
  }
  return scoreToRating(selfAssessScore(answers));
}

/** Canonical kebab focus-theme ids implied by the selected goals. */
export function derivedFocusThemes(answers: QuizAnswers): string[] {
  const selected = QUIZ_GOAL_OPTIONS.filter((o) =>
    answers.goals.includes(o.key)
  );
  return dedupe(selected.flatMap((o) => o.focusThemes));
}

/**
 * Build the single profile patch written after auth. Mirrors the
 * handleSaveUsernames discipline: omit empty/undefined keys so we never clobber
 * an existing value with a blank, and only include studyGoals when the quiz
 * actually derived some (a theme-only re-take won't wipe manually-set goals).
 */
export function buildPayload(answers: QuizAnswers): UserProfileUpdates {
  const payload: UserProfileUpdates = {};

  payload.selfReportedRating = derivedRating(answers);

  if (usesRatingPath(answers.playStyle)) {
    payload.primaryPlatform = answers.playStyle as "lichess" | "chesscom";
    const username = answers.username?.trim();
    if (username) {
      if (answers.playStyle === "lichess") payload.lichessUsername = username;
      else payload.chesscomUsername = username;
    }
  }

  const focusThemes = derivedFocusThemes(answers);
  if (focusThemes.length > 0) payload.focusThemes = focusThemes;

  const selected = QUIZ_GOAL_OPTIONS.filter((o) =>
    answers.goals.includes(o.key)
  );
  const studyGoals = dedupe(selected.map((o) => o.studyGoal));
  if (studyGoals.length > 0) payload.studyGoals = studyGoals;

  if (answers.time) payload.dailyTimeCommitment = answers.time;

  return payload;
}
