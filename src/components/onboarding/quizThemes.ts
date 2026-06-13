/**
 * Single source of truth for the onboarding quiz's "what do you want to
 * improve?" question.
 *
 * Each option maps a plain-English label to:
 *   - `focusThemes`: canonical kebab-case Neo4j `:Theme.id` values. These are
 *     stored on the user profile and passed verbatim to /api/adaptive-puzzles
 *     (which matches `t.id IN $themes` WITHOUT normalizing — so the ids MUST be
 *     exact kebab).
 *   - `studyGoal`:  the coarse 4-value enum the LLM prompt understands
 *     (renderCoachingPrefs in coachChatPrompt.ts). Drives the *prompt*, not the
 *     recommender.
 *
 * Why these specific ids: every focus-theme id below is emitted by
 * scripts/neo4j-loaders/fen-analyzer.mjs, which is what creates the HAS_THEME
 * edges in the graph. Taxonomy roots that the analyzer never emits (e.g.
 * "pawn-tactics") have a Theme node but ZERO puzzle edges, so seeding them
 * would return an empty feed — they are deliberately excluded here.
 *
 * This module is pure data (no client/server-only imports) so it can be shared
 * by the quiz UI and the server-side profilePatchSchema (validation.ts) — the
 * Zod enum is derived from QUIZ_FOCUS_THEME_IDS so the two can never drift.
 */

import type { StudyGoal } from "@/lib/firestoreUsers";

export interface QuizGoalOption {
  /** Stable option key (used as the answer value + React key). */
  key: string;
  /** Plain-English label shown in the quiz. */
  label: string;
  /** Short supporting line shown under the label. */
  helper: string;
  /** Canonical kebab Neo4j theme ids this option seeds (may be empty). */
  focusThemes: string[];
  /** Coarse study goal this option implies for the coach prompt. */
  studyGoal: StudyGoal;
}

export const QUIZ_GOAL_OPTIONS: QuizGoalOption[] = [
  {
    key: "blunders",
    label: "I hang pieces / blunder",
    helper: "Stop losing material for nothing.",
    focusThemes: ["hanging-piece"],
    studyGoal: "tactics",
  },
  {
    key: "forks",
    label: "I miss forks & double attacks",
    helper: "Hit two targets at once.",
    focusThemes: ["fork", "double-attack"],
    studyGoal: "tactics",
  },
  {
    key: "pins",
    label: "Pins & skewers trip me up",
    helper: "Line up and win pieces.",
    focusThemes: ["pin", "skewer"],
    studyGoal: "tactics",
  },
  {
    key: "discovered",
    label: "I overlook discovered attacks",
    helper: "Unleash the piece behind.",
    focusThemes: ["discovered-attack"],
    studyGoal: "tactics",
  },
  {
    key: "back-rank",
    label: "My back rank is weak",
    helper: "Spot and defend the mate.",
    focusThemes: ["back-rank"],
    studyGoal: "tactics",
  },
  {
    key: "king-safety",
    label: "I miss attacks on the king",
    helper: "King safety and mating nets.",
    focusThemes: ["exposed-king", "mating-attack"],
    studyGoal: "tactics",
  },
  {
    key: "sacrifices",
    label: "Sacrifices & combinations",
    helper: "Calculate forcing lines.",
    focusThemes: ["sacrifice"],
    studyGoal: "tactics",
  },
  {
    key: "endgames",
    label: "My endgames fall apart",
    helper: "Convert and hold endings.",
    focusThemes: ["endgame"],
    studyGoal: "endgames",
  },
  {
    key: "pawns",
    label: "Pawn play & promotion",
    helper: "Push passers home.",
    focusThemes: ["promotion", "advanced-pawn"],
    studyGoal: "tactics",
  },
  {
    key: "openings",
    label: "I don't know my openings",
    helper: "Build a reliable repertoire.",
    focusThemes: [],
    studyGoal: "openings",
  },
  {
    key: "general",
    label: "Just general improvement",
    helper: "A balanced training mix.",
    focusThemes: [],
    studyGoal: "tactics",
  },
];

/**
 * Deduped union of every focus-theme id any option can contribute. Used as the
 * allow-list for the server-side Zod enum (validation.ts) and to label
 * weaknesses on the result screen. Frozen tuple so it can seed `z.enum(...)`.
 */
export const QUIZ_FOCUS_THEME_IDS = [
  "hanging-piece",
  "fork",
  "double-attack",
  "pin",
  "skewer",
  "discovered-attack",
  "back-rank",
  "exposed-king",
  "mating-attack",
  "sacrifice",
  "endgame",
  "promotion",
  "advanced-pawn",
] as const;

export type QuizFocusThemeId = (typeof QUIZ_FOCUS_THEME_IDS)[number];

/** Human-readable label per focus-theme id, for the result screen. */
export const FOCUS_THEME_LABELS: Record<QuizFocusThemeId, string> = {
  "hanging-piece": "Hanging pieces",
  fork: "Forks",
  "double-attack": "Double attacks",
  pin: "Pins",
  skewer: "Skewers",
  "discovered-attack": "Discovered attacks",
  "back-rank": "Back-rank tactics",
  "exposed-king": "King safety",
  "mating-attack": "Mating attacks",
  sacrifice: "Sacrifices",
  endgame: "Endgames",
  promotion: "Promotion",
  "advanced-pawn": "Passed pawns",
};

export const MAX_FOCUS_THEMES = QUIZ_FOCUS_THEME_IDS.length;
