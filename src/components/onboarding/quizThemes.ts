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
  // Five phases/skills rather than individual motifs. The old list named seven
  // specific tactics (forks, pins, hanging pieces…), which asked a beginner to
  // self-diagnose at a granularity they don't have — you cannot pick "pins" as
  // a weakness if you don't yet know what a pin is. Phase-level choices are
  // answerable by anyone, and the placement test measures the motif level far
  // better than self-report ever could.
  {
    key: "tactics",
    label: "Tactics",
    helper: "Spot forks, pins and hanging pieces before they cost you.",
    focusThemes: [
      "hanging-piece",
      "fork",
      "double-attack",
      "pin",
      "skewer",
      "discovered-attack",
      "back-rank",
    ],
    studyGoal: "tactics",
  },
  {
    key: "openings",
    label: "Openings",
    helper: "Get out of the first ten moves with a position you like.",
    // No focus themes: opening puzzles aren't in the theme graph, so seeding
    // any id here would return an empty feed. This shapes the coach prompt,
    // not the puzzle recommender.
    focusThemes: [],
    studyGoal: "openings",
  },
  {
    key: "middlegame",
    label: "Middlegame",
    helper: "Find a plan when nothing is forced.",
    focusThemes: ["exposed-king", "mating-attack", "sacrifice"],
    studyGoal: "middlegame",
  },
  {
    key: "endgame",
    label: "Endgame",
    helper: "Convert winning positions instead of drawing them.",
    focusThemes: ["endgame", "promotion", "advanced-pawn"],
    studyGoal: "endgames",
  },
  {
    key: "general",
    label: "General improvement",
    helper: "A bit of everything — let the coach decide.",
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
