/**
 * Adaptive 20-puzzle placement test — pure engine.
 *
 * The UI drives the loop (it fetches puzzles + collects the user's attempt);
 * this module owns all the math: the fixed theme plan, the per-item Elo update
 * with a fast-converging placement K-schedule, the target rating window, the
 * confidence estimate, and the per-theme strength vector that seeds the
 * curriculum + the profile `focusThemes`.
 *
 * Reuses `calculateNewRating` (with the optional `k` override) so there is no
 * second rating formula. Kept free of React/jotai/network so it unit-tests in
 * the node vitest env.
 */

import { calculateNewRating } from "@/lib/puzzleRating";
import {
  QUIZ_FOCUS_THEME_IDS,
  QuizFocusThemeId,
} from "@/components/onboarding/quizThemes";

export const PLACEMENT_LENGTH = 20;
/** Below this many completed items we don't trust the estimate enough to write it. */
export const PLACEMENT_MIN_TO_FINALIZE = 10;

const RATING_FLOOR = 400;
const RATING_CEIL = 2800;

/** Aggressive early, settling late — converges in 20 items without overshoot. */
export const PLACEMENT_K_SCHEDULE: number[] = [
  80, 80, 70, 70, 60, 60, 50, 50, 40, 40, 35, 35, 30, 30, 25, 25, 20, 20, 20,
  20,
];

/**
 * Fixed 20-slot theme plan over the verified has-edge themes
 * (the six highest-yield fundamentals — fork, pin, hanging-piece, back-rank,
 * mating-attack, discovered-attack — are double-sampled for a stronger signal).
 * (`QUIZ_FOCUS_THEME_IDS`). Fundamentals appear ≥2×; the rest 1×; interleaved
 * so the test never clusters one theme. Deterministic → comparable across users.
 */
export const PLACEMENT_THEME_PLAN: QuizFocusThemeId[] = [
  "fork",
  "hanging-piece",
  "double-attack",
  "pin",
  "skewer",
  "back-rank",
  "mating-attack",
  "exposed-king",
  "discovered-attack",
  "sacrifice",
  "endgame",
  "fork",
  "hanging-piece",
  "promotion",
  "pin",
  "back-rank",
  "mating-attack",
  "advanced-pawn",
  "discovered-attack",
  "fork",
];

export type PlacementConfidence = "low" | "medium" | "high";

export interface PlacementItem {
  theme: string;
  puzzleRating: number;
  solved: boolean;
  /** The rating estimate AFTER applying this item's result. */
  estimateAfter: number;
}

export interface ThemeStrength {
  seen: number;
  solved: number;
  /** solved / seen, 0..1. Lower = weaker. */
  score: number;
}

export interface PlacementResult {
  finalRating: number;
  confidence: PlacementConfidence;
  itemsCompleted: number;
  themeStrength: Record<string, ThemeStrength>;
  /** Weakest themes (missed ≥1), capped, all ∈ QUIZ_FOCUS_THEME_IDS. */
  focusThemes: string[];
  /** True when the estimate ran into a clamp rail (treat result as provisional). */
  hitRail: boolean;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Conservative starting estimate from the onboarding self-report (or 1000). */
export function seedEstimate(selfReportedRating?: number): number {
  const seed =
    typeof selfReportedRating === "number" &&
    Number.isFinite(selfReportedRating)
      ? selfReportedRating
      : 1000;
  return clamp(seed, 600, 2200);
}

/** Target rating window half-width for item `itemIndex` (tightens as we converge). */
export function placementWindow(itemIndex: number): number {
  return itemIndex < 5 ? 250 : 150;
}

/** The theme to serve for a given slot (cycles defensively past the plan length). */
export function planThemeFor(itemIndex: number): string {
  return PLACEMENT_THEME_PLAN[itemIndex % PLACEMENT_THEME_PLAN.length];
}

/** Update the estimate after one item, using the placement K-schedule. */
export function applyPlacementElo(
  estimate: number,
  puzzleRating: number,
  solved: boolean,
  itemIndex: number
): number {
  const k =
    PLACEMENT_K_SCHEDULE[Math.min(itemIndex, PLACEMENT_K_SCHEDULE.length - 1)];
  const next = calculateNewRating(estimate, puzzleRating, solved, 0, k);
  return clamp(next, RATING_FLOOR, RATING_CEIL);
}

/** Confidence from how much the estimate moved over the last 6 items. */
export function computeConfidence(
  history: PlacementItem[]
): PlacementConfidence {
  if (history.length < PLACEMENT_MIN_TO_FINALIZE) return "low";
  const tail = history.slice(-6).map((h) => h.estimateAfter);
  const swing = Math.max(...tail) - Math.min(...tail);
  if (swing < 60) return "high";
  if (swing < 150) return "medium";
  return "low";
}

export function buildThemeStrength(
  history: PlacementItem[]
): Record<string, ThemeStrength> {
  const out: Record<string, ThemeStrength> = {};
  for (const item of history) {
    const cur = out[item.theme] ?? { seen: 0, solved: 0, score: 0 };
    cur.seen += 1;
    cur.solved += item.solved ? 1 : 0;
    out[item.theme] = cur;
  }
  for (const t of Object.keys(out)) {
    out[t].score = out[t].seen > 0 ? out[t].solved / out[t].seen : 0;
  }
  return out;
}

const FOCUS_THEME_SET = new Set<string>(QUIZ_FOCUS_THEME_IDS);

/** Weakest themes the user actually missed (score < 1), capped, enum-safe. */
export function pickFocusThemes(
  themeStrength: Record<string, ThemeStrength>,
  max = 3
): string[] {
  return Object.entries(themeStrength)
    .filter(
      ([theme, s]) => s.seen > 0 && s.score < 1 && FOCUS_THEME_SET.has(theme)
    )
    .sort((a, b) => a[1].score - b[1].score || b[1].seen - a[1].seen)
    .slice(0, max)
    .map(([theme]) => theme);
}

/** Detect a runaway: ≥3 trailing items all solved or all failed (estimate railed). */
function detectRail(history: PlacementItem[]): boolean {
  if (history.length < 3) return false;
  const tail = history.slice(-3);
  const allSolved = tail.every((h) => h.solved);
  const allFailed = tail.every((h) => !h.solved);
  if (!allSolved && !allFailed) return false;
  const last = history[history.length - 1].estimateAfter;
  return (
    (allSolved && last >= RATING_CEIL - 1) ||
    (allFailed && last <= RATING_FLOOR + 1)
  );
}

export function finalizePlacement(
  history: PlacementItem[],
  seed: number
): PlacementResult {
  const itemsCompleted = history.length;
  const finalRating =
    itemsCompleted > 0 ? history[history.length - 1].estimateAfter : seed;
  const themeStrength = buildThemeStrength(history);
  return {
    finalRating,
    confidence: computeConfidence(history),
    itemsCompleted,
    themeStrength,
    focusThemes: pickFocusThemes(themeStrength),
    hitRail: detectRail(history),
  };
}
