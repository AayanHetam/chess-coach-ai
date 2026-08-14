/**
 * Onboarding quiz — static configuration and pure helpers.
 *
 * Declarative step data lives here; the live state machine + branching lives in
 * useOnboardingQuiz.ts. Kept import-light (no React) so it stays unit-testable.
 */

import type { UserProfileUpdates } from "@/lib/firestoreUsers";
import { QUIZ_GOAL_OPTIONS } from "./quizThemes";
import { projectToGoal } from "@/lib/curriculum/improvementModel";

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
  /**
   * Online path (playStyle lichess | chesscom). We ask for the USERNAME, not a
   * rating: the user knows their handle exactly and guesses at their rating,
   * and their real number is one public API call away
   * (src/lib/rating/platformRatings.ts). The lookup runs right after signup.
   */
  username?: string;
  // Self-assessment path (playStyle otb | new):
  selfAssess: Partial<Record<SelfAssessKey, SelfAssessScore>>;
  // Goals (multi-select option keys from QUIZ_GOAL_OPTIONS):
  goals: string[];
  // Daily time budget:
  time?: TimeCommitment;
  /** Target rating — the question the whole plan is built around. */
  goalRating?: number;
  /** Days per week they intend to practise (1-7). */
  daysPerWeek?: number;
  /**
   * Daily reminder opt-in. Pre-checked (see `emptyAnswers`), shown as a visible
   * choice on the final step rather than defaulted silently at signup — this
   * product gates under-13 users and a hidden default-on would be a dark
   * pattern. Aayan's call, 2026-08-10.
   */
  dailyReminder: boolean;
}

export function emptyAnswers(): QuizAnswers {
  return { selfAssess: {}, goals: [], dailyReminder: true, daysPerWeek: 4 };
}

/**
 * Representative minutes/day for each time band, for the improvement model.
 *
 * Midpoints, and the open-ended top band is treated as 45 rather than something
 * heroic: the projection must not quietly assume the most optimistic reading of
 * "30+ min" and hand back a timeline the user cannot hit.
 */
export const MINUTES_PER_DAY: Record<TimeCommitment, number> = {
  "under-10": 8,
  "10-30": 20,
  "30-plus": 45,
};

export function minutesPerDayFor(time: TimeCommitment | undefined): number {
  return time ? MINUTES_PER_DAY[time] : 0;
}

/** Days-per-week choices for the practice-frequency step. */
export const FREQUENCY_OPTIONS: {
  key: number;
  label: string;
  helper: string;
}[] = [
  { key: 2, label: "A couple of days", helper: "When I get a chance." },
  { key: 4, label: "About 4 days", helper: "Most weekdays." },
  { key: 6, label: "Almost every day", helper: "With a rest day." },
];

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

/** Online platforms give us a username to look up; everyone else self-assesses. */
export function usesPlatformPath(playStyle: PlayStyle | undefined): boolean {
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

/**
 * The skill rating the quiz can derive on its own.
 *
 * Returns `undefined` on the platform path — and that is the whole point. We
 * no longer ask those users for a number, so the quiz genuinely does not know
 * one yet; the real rating arrives moments later from the platform lookup.
 *
 * Falling through to `scoreToRating(selfAssessScore(...))` here would be a
 * disaster: an online player answers none of the self-assessment questions, so
 * the score is 0 and every single one of them would be stamped 700 — a
 * fabricated beginner rating, indistinguishable from a real one. That is
 * SILENT_SUBSTITUTION A1 all over again. Absence must stay absence.
 */
export function derivedRating(answers: QuizAnswers): number | undefined {
  if (usesPlatformPath(answers.playStyle)) return undefined;
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

  // Only the self-assessment branch produces a rating the quiz itself knows.
  // The platform branch deliberately writes NOTHING here, leaving the field
  // absent until /api/ratings/lookup supplies the real number. `undefined`
  // is safe all the way down: resolveUserRating skips it and the prompt says
  // "not provided" rather than asserting a guess as fact.
  const selfAssessed = derivedRating(answers);
  if (selfAssessed !== undefined) payload.selfReportedRating = selfAssessed;

  if (usesPlatformPath(answers.playStyle)) {
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
  if (typeof answers.goalRating === "number") payload.goalRating = answers.goalRating;
  if (typeof answers.daysPerWeek === "number") {
    payload.practiceDaysPerWeek = answers.daysPerWeek;
  }

  // The promised date, computed once at signup from the goal and the schedule
  // the user actually agreed to. Stored so /plan can hold them to it rather
  // than silently recomputing a softer target every time they visit.
  if (
    typeof answers.goalRating === "number" &&
    answers.time &&
    typeof answers.daysPerWeek === "number"
  ) {
    const currentRating = derivedRating(answers);
    if (typeof currentRating === "number") {
      const projection = projectToGoal({
        currentRating,
        goalRating: answers.goalRating,
        minutesPerDay: minutesPerDayFor(answers.time),
        daysPerWeek: answers.daysPerWeek,
      });
      if (projection.targetDate) payload.goalTargetDate = projection.targetDate;
    }
  }

  // Always written, both ways: an explicit false is the user declining, which
  // must be recorded rather than left undefined and re-asked.
  payload.reminderPrefs = { enabled: answers.dailyReminder !== false };

  return payload;
}
