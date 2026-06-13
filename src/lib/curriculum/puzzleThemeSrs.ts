/**
 * Per-theme spaced repetition for puzzle practice. One SM-2 card per theme the
 * user has struggled with (NOT one per puzzle — far fewer cards, ~the same
 * learning value). Reuses the shared `applySm2` core; kept on its own atom so
 * it never collides with the opening-drill SRS (`drillProgressAtom`).
 */

import { atomWithStorage } from "jotai/utils";
import { applySm2, DEFAULT_EASE_FACTOR } from "@/lib/spacedRepetition";

export interface ThemeSrsCard {
  themeId: string;
  easeFactor: number;
  /** Interval in days until the next review. */
  interval: number;
  attempts: number;
  /** Epoch ms of the next due review. */
  nextReview: number;
  lastReviewed: number;
}

export function createCard(themeId: string): ThemeSrsCard {
  return {
    themeId,
    easeFactor: DEFAULT_EASE_FACTOR,
    interval: 0,
    attempts: 0,
    nextReview: 0,
    lastReviewed: 0,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Apply a review outcome (quality 0–5) and schedule the next review. */
export function reviewCard(
  card: ThemeSrsCard,
  quality: number,
  now: number
): ThemeSrsCard {
  const { easeFactor, interval } = applySm2(
    {
      easeFactor: card.easeFactor,
      interval: card.interval,
      attempts: card.attempts,
    },
    quality
  );
  return {
    ...card,
    easeFactor,
    interval,
    attempts: card.attempts + 1,
    lastReviewed: now,
    nextReview: now + interval * DAY_MS,
  };
}

export function isCardDue(card: ThemeSrsCard, now: number): boolean {
  if (card.attempts === 0) return true;
  return now >= card.nextReview;
}

export const puzzleThemeSrsAtom = atomWithStorage<Record<string, ThemeSrsCard>>(
  "chessMastiPuzzleThemeSrs",
  {}
);

/** Theme ids whose card is currently due for review. */
export function dueThemes(
  cards: Record<string, ThemeSrsCard>,
  now: number
): string[] {
  return Object.values(cards)
    .filter((c) => isCardDue(c, now))
    .sort((a, b) => a.nextReview - b.nextReview)
    .map((c) => c.themeId);
}

/** Quality from a drill outcome: solved first-try → 4, solved with help → 3,
 *  missed → 1. (Per-theme granularity; we don't need the full 0–5 nuance.) */
export function qualityFromOutcome(solved: boolean, firstTry: boolean): number {
  if (solved && firstTry) return 4;
  if (solved) return 3;
  return 1;
}
