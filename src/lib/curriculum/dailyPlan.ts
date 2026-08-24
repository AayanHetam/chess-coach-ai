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
// Re-exported: this module had its own copy of the union, a third definition
// of the same three strings. One source, so a new band cannot be added to two
// of them and silently missed by the third.
import { minutesPerDayFor, type TimeCommitment } from "./timeCommitment";
export type { TimeCommitment };

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
 * A session is no longer only puzzles.
 *
 * Puzzles train calculation and pattern recognition and nothing else. A player
 * who only solves gets sharp at spotting tactics in positions someone has
 * already told them contain one — which is not the skill the game asks for.
 * The two things that move a rating alongside it are reviewing your OWN losses
 * and knowing your openings, so both now appear as first-class daily work.
 *
 * Every task carries its own minute cost, and the costs are subtracted from the
 * SAME budget the user agreed to rather than added on top. Adding work without
 * removing any would quietly break the 30-minute cap — the one thing we
 * promised not to exceed.
 */
export type DailyTaskKind = "puzzles" | "reviews" | "analyze" | "theory";

/**
 * Enough of a measured repertoire hole to write the task with, without pulling
 * the whole report — and its statistics — into the pure planner.
 */
export interface OpeningLineSummary {
  /** Already numbered, e.g. `1.e4 c5 2.c3`. */
  line: string;
  /** Their recency-weighted score in that position, 0–1. */
  score: number;
  /** Their own average in that colour, 0–1. */
  baseline: number;
  /** Games behind it, for the reader. */
  games: number;
  /**
   * The engine's replacement, when it has one worth naming.
   *
   * Absent is a finding, not a gap: a sound move that still loses games means
   * the structure is the problem, and saying so is more useful than inventing
   * an improvement out of a few centipawns.
   */
  betterMove?: string;
}

export interface DailyTask {
  kind: DailyTaskKind;
  label: string;
  detail: string;
  /** Budgeted minutes — what this task is expected to cost. */
  minutes: number;
  /** Puzzle/review count, absent for the non-puzzle tasks. */
  count?: number;
  href?: string;
  /** True when href leaves the product, so the UI can mark it. */
  external?: boolean;
}

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
  /** Today's work, in the order it should be done. */
  tasks: DailyTask[];
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
  /**
   * Whether we can actually reach their games. Telling someone to review their
   * last loss when we have no games to show them is a task they cannot start.
   */
  hasLinkedAccount?: boolean;
  /** True when the quiz recorded openings as something they want to improve. */
  wantsOpenings?: boolean;
  /**
   * The line in the player's OWN games that currently costs them the most,
   * when one has been measured.
   *
   * Passed in rather than computed. This module is pure, and finding it costs
   * an archive fetch and an engine pass — see `src/lib/learn/repertoireHole.ts`.
   * Absent means we have not measured one yet, NOT that there is nothing wrong.
   */
  openingLine?: OpeningLineSummary;
  /**
   * Day number, for rotating the secondary task when only one fits. Injected
   * rather than read from the clock so the generator stays pure and testable.
   */
  dayIndex?: number;
}

/**
 * Minute costs for the non-puzzle work.
 *
 * Puzzles are deliberately NOT priced here. Each band already implies its own
 * rate — 8 minutes for 6 puzzles, 15 for 11, 30 for 20, i.e. 1.33 / 1.36 / 1.5
 * minutes each — so a single shared constant overprices the small bands and
 * pushes them past a budget they used to fit inside. `puzzleMinutesFor` derives
 * the rate from the band instead, which makes "the tasks never exceed the
 * commitment" true by construction rather than by luck.
 */
export const TASK_MINUTES = {
  analyze: 6,
  theory: 6,
} as const;

/** What one puzzle costs in a given band, from that band's own budget. */
export function puzzleMinutesFor(tc: TimeCommitment | undefined): number {
  const size = sessionSizeFor(tc);
  const count = size.newConcept + size.reviews;
  const budget = minutesPerDayFor(tc ?? "10-30");
  return count > 0 ? budget / count : 0;
}

/** Never strip the session down to nothing to make room for the extras. */
const MIN_PUZZLE_MINUTES = 5;

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
  const combined = dedupeThemes([
    ...(measuredWeaknesses ?? []),
    ...(focusThemes ?? []),
  ]);

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

/**
 * Which non-puzzle work fits in today's budget, and in what order.
 *
 * Analysis outranks theory. Reviewing a game you actually lost is feedback
 * about YOUR errors; theory is general knowledge that may not touch the thing
 * currently costing you games. When only one fits, they alternate by day so the
 * lower budgets still see both across a week.
 *
 * Analysis is offered only when an account is linked. Otherwise "review one of
 * your games" is a task with no games behind it — a checkbox the user cannot
 * tick, which is worse than one fewer task.
 */
export function secondaryTasksFor(
  input: DailyPlanInput,
  budgetMinutes: number
): DailyTask[] {
  const analyze: DailyTask = {
    kind: "analyze",
    label: "Review one of your games",
    detail:
      "Your last loss, walked through move by move. The mistakes that cost you rating are in there, and they repeat until you see them.",
    minutes: TASK_MINUTES.analyze,
    href: "/analysis",
  };
  // Their own worst line when we have measured one, and only then. The generic
  // task sends people off-site to guess at which opening to study; the measured
  // one names the position their own results say is costing them games.
  const measured = input.openingLine;
  const pct = (v: number) => Math.round(v * 100);
  const theory: DailyTask = measured
    ? {
        kind: "theory",
        label: `Your weakest line: ${measured.line}`,
        detail: measured.betterMove
          ? `You score ${pct(measured.score)}% here against your own ${pct(measured.baseline)}% average, over ${measured.games} games. The engine would rather you played ${measured.betterMove}.`
          : `You score ${pct(measured.score)}% here against your own ${pct(measured.baseline)}% average, over ${measured.games} games. Your moves are sound — it is the position that does not suit you.`,
        minutes: TASK_MINUTES.theory,
        href: "/plan#opening-line",
      }
    : {
        kind: "theory",
        label: "Build your repertoire",
        detail:
          "Three decisions — one opening as White, one answer to 1.e4, one to 1.d4 — and each one comes with a course built from what people actually play at your level.",
        minutes: TASK_MINUTES.theory,
        href: "/learn",
      };

  const eligible: DailyTask[] = [];
  if (input.hasLinkedAccount) eligible.push(analyze);
  eligible.push(theory);

  // Rotate so the one that fits is not always the same one.
  if ((input.dayIndex ?? 0) % 2 === 1 && eligible.length > 1) {
    eligible.reverse();
  }

  const out: DailyTask[] = [];
  let spent = 0;
  for (const task of eligible) {
    if (budgetMinutes - spent - task.minutes < MIN_PUZZLE_MINUTES) break;
    out.push(task);
    spent += task.minutes;
  }
  return out;
}

/**
 * Goal-driven intensity scales the session when the user's target rating is
 * further ahead than their stated schedule comfortably supports. Capped hard at
 * 1.5x by `sessionSizeMultiplier`: someone chasing +800 points gets the hardest
 * sensible session and an honest timeline, not an eight-times-longer one they
 * never agreed to.
 */
export function buildDailySession(input: DailyPlanInput): DailySession {
  const base = sessionSizeFor(input.dailyTimeCommitment);
  const mult = sessionSizeMultiplier(input.intensityTier ?? "steady");

  const budget = minutesPerDayFor(input.dailyTimeCommitment ?? "10-30");
  const secondary = secondaryTasksFor(input, budget);
  const secondaryMinutes = secondary.reduce((a, t) => a + t.minutes, 0);

  // The extras come OUT of the budget, never on top of it. Without this scale
  // factor a 30-minute commitment would quietly become 42, which is precisely
  // the over-commitment the 30-minute cap exists to prevent.
  const puzzleScale = budget > 0 ? (budget - secondaryMinutes) / budget : 1;

  // FLOOR, not round: Math.round(5 * 1.5) is 8, which is 1.6x the base and
  // quietly breaks the cap the multiplier exists to enforce. Rounding a
  // workload UP past a documented ceiling is the exact over-commitment this is
  // meant to prevent.
  const size = {
    newConcept: Math.max(1, Math.floor(base.newConcept * mult * puzzleScale)),
    reviews: Math.floor(base.reviews * mult * puzzleScale),
    coach: base.coach,
  };
  const newThemes = roundRobin(pickNewThemeCandidates(input), size.newConcept);
  const reviewThemes = input.dueReviewThemes.slice(0, size.reviews);
  const coachInsightTheme =
    size.coach > 0 && newThemes.length > 0 ? newThemes[0] : null;

  // FLOOR the displayed minutes: rounding up could carry the total past the
  // budget the whole scale factor exists to protect.
  const perPuzzle = puzzleMinutesFor(input.dailyTimeCommitment);
  const puzzleCost = (n: number) => Math.max(1, Math.floor(n * perPuzzle));

  const tasks: DailyTask[] = [];
  if (newThemes.length > 0) {
    tasks.push({
      kind: "puzzles",
      label: `${newThemes.length} puzzle${newThemes.length > 1 ? "s" : ""}`,
      detail: "Aimed at the patterns you get wrong most, at your rating.",
      minutes: puzzleCost(newThemes.length),
      count: newThemes.length,
      href: "/puzzles",
    });
  }
  if (reviewThemes.length > 0) {
    tasks.push({
      kind: "reviews",
      label: `${reviewThemes.length} review${reviewThemes.length > 1 ? "s" : ""}`,
      detail: "Themes coming due again — spaced so they stick.",
      minutes: puzzleCost(reviewThemes.length),
      count: reviewThemes.length,
      href: "/puzzles",
    });
  }
  tasks.push(...secondary);

  return {
    newThemes,
    reviewThemes,
    ratingWindow: {
      min: Math.max(0, Math.round(input.liveRating - RATING_WINDOW)),
      max: Math.min(4000, Math.round(input.liveRating + RATING_WINDOW)),
    },
    coachInsightTheme,
    totalPuzzles: newThemes.length + reviewThemes.length,
    tasks,
  };
}
