// Bringing a repaired line back before it rots.
//
// Repairing a line is not the end of it. A habit that took a hundred games to
// build is not undone by three clean runs; it is interrupted by them. Without
// something that brings the line back, the trainer is a one-off and the old
// move returns quietly.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ONE DESIGN DECISION THAT MATTERS HERE
//
// A card stores the whole line, not a pointer to a measurement.
//
// The measurement is what FOUND the line: "you score 31% here across 44 games".
// Once the player fixes it, that finding goes away — the whole point — and the
// hole stops being flagged. If a review needed the measurement to reconstruct
// the drill, then fixing a line would delete its own review, and the better a
// player did, the faster we would forget to check on them. The failure would
// be invisible, because an empty review queue looks exactly like a healthy one.
//
// So a card is self-contained: moves, colour, the replacement move and where it
// came from. A review needs no archive fetch, no engine budget, and no network.
// ─────────────────────────────────────────────────────────────────────────────
//
// Scheduling is SM-2, the same core the puzzle-theme cards use
// (`applySm2` in @/lib/spacedRepetition). Nothing new is invented here.

import { applySm2, DEFAULT_EASE_FACTOR } from '@/lib/spacedRepetition';
import { lineKeyOf } from '@/lib/learn/trainerProgress';
import type { TrainerLine } from '@/lib/learn/trainerSession';

const PREFIX = 'cm.trainer.v1.reviews';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How many due lines we will put in front of someone at once.
 *
 * A review queue that grows without limit stops being a prompt and becomes a
 * debt, and a player looking at "14 lines due" does none of them. Five is a
 * sitting; the rest keep until tomorrow and lose nothing by waiting.
 */
export const MAX_DUE_AT_ONCE = 5;

/**
 * Lapses before we stop calling it a review and send them back through the
 * full repair session.
 *
 * Two failures on the same line is the line telling us the three clean runs
 * did not take. Asking for a third one-run review would be the definition of
 * doing the same thing again and expecting a different result.
 */
export const LAPSES_BEFORE_REPAIR = 2;

export interface ReviewCard {
  lineKey: string;
  /** Self-contained: enough to run the drill with nothing else loaded. */
  line: TrainerLine;
  /** The line as the reader saw it: `1.e4 c5 2.c3`. */
  label: string;
  easeFactor: number;
  /** Days until the next review. */
  interval: number;
  attempts: number;
  /** Epoch ms. */
  nextReview: number;
  lastReviewed: number;
  /** Times this card came back wrong after having been scheduled. */
  lapses: number;
}

function storeKey(account: string): string {
  return `${PREFIX}:${account.toLowerCase()}`;
}

function read(account: string): ReviewCard[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storeKey(account));
    const list: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(list)) return [];
    return list.filter(isCard);
  } catch {
    return [];
  }
}

/**
 * A card we are willing to act on.
 *
 * Validated field by field rather than trusted, because everything downstream
 * puts this straight onto a chessboard: a card with no moves would render an
 * empty drill the player cannot complete or escape.
 */
function isCard(c: unknown): c is ReviewCard {
  if (!c || typeof c !== 'object') return false;
  const x = c as Partial<ReviewCard>;
  return (
    typeof x.lineKey === 'string' &&
    typeof x.nextReview === 'number' &&
    typeof x.interval === 'number' &&
    typeof x.easeFactor === 'number' &&
    typeof x.attempts === 'number' &&
    !!x.line &&
    Array.isArray(x.line.moves) &&
    x.line.moves.length > 0 &&
    x.line.moves.every(m => typeof m === 'string') &&
    (x.line.color === 'white' || x.line.color === 'black')
  );
}

function write(account: string, cards: ReviewCard[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storeKey(account), JSON.stringify(cards));
  } catch {
    // Storage full or disabled costs a schedule, never the session in progress.
  }
}

export function loadCards(account: string): ReviewCard[] {
  return read(account);
}

export function findCard(account: string, lineKey: string): ReviewCard | null {
  return read(account).find(c => c.lineKey === lineKey) ?? null;
}

/**
 * How well the run went, on SM-2's 0-5 scale.
 *
 * A miss in a drill is not a hesitation, it is the wrong move played on the
 * board, so the mapping is stricter than a flashcard's would be. One miss is
 * "got there, did not know it" and keeps the card growing slowly; two is a
 * lapse and resets the interval.
 */
export function qualityFromMisses(misses: number): number {
  if (misses <= 0) return 5;
  if (misses === 1) return 3;
  if (misses === 2) return 2;
  return 1;
}

function schedule(card: ReviewCard, quality: number, now: number): ReviewCard {
  const { easeFactor, interval } = applySm2(
    { easeFactor: card.easeFactor, interval: card.interval, attempts: card.attempts },
    quality
  );
  return {
    ...card,
    easeFactor,
    interval,
    attempts: card.attempts + 1,
    lastReviewed: now,
    nextReview: now + interval * DAY_MS,
    lapses: card.lapses + (quality < 3 ? 1 : 0),
  };
}

function upsert(account: string, card: ReviewCard): ReviewCard[] {
  const next = [card, ...read(account).filter(c => c.lineKey !== card.lineKey)];
  write(account, next);
  return next;
}

/**
 * Start a card the moment a line is repaired.
 *
 * The three clean runs ARE the first review, so the card is created already
 * reviewed rather than immediately due. Creating it due would put the line a
 * player has just finished straight back on their plan, which reads as the
 * trainer not having noticed.
 */
export function scheduleAfterRepair(
  account: string,
  line: TrainerLine,
  label: string,
  misses: number,
  now: number
): ReviewCard {
  const key = lineKeyOf(line);
  const existing = findCard(account, key);
  const base: ReviewCard = existing ?? {
    lineKey: key,
    line,
    label,
    easeFactor: DEFAULT_EASE_FACTOR,
    interval: 0,
    attempts: 0,
    nextReview: 0,
    lastReviewed: 0,
    lapses: 0,
  };
  // Re-repairing refreshes the line itself: the replacement move can have
  // changed since the card was made, and drilling a stale target would teach
  // the wrong move with full confidence.
  const card = schedule({ ...base, line, label }, qualityFromMisses(misses), now);
  upsert(account, card);
  return card;
}

/** Apply a completed review and reschedule. Null if the card is gone. */
export function recordReview(
  account: string,
  lineKey: string,
  misses: number,
  now: number
): ReviewCard | null {
  const card = findCard(account, lineKey);
  if (!card) return null;
  const next = schedule(card, qualityFromMisses(misses), now);
  upsert(account, next);
  return next;
}

/**
 * Lines due now, most overdue first, capped.
 *
 * A card that has lapsed too often is still returned — it is still due — but
 * `needsFullRepair` marks it so the caller sends it through all three acts
 * instead of a single run.
 */
export function dueCards(account: string, now: number, limit = MAX_DUE_AT_ONCE): ReviewCard[] {
  return read(account)
    .filter(c => c.nextReview <= now)
    .sort((a, b) => a.nextReview - b.nextReview)
    .slice(0, Math.max(0, limit));
}

export function needsFullRepair(card: ReviewCard): boolean {
  return card.lapses >= LAPSES_BEFORE_REPAIR;
}

/**
 * When it comes back, in words.
 *
 * Days, not a date: "in 6 days" is a length of time a person can feel, and a
 * date three weeks out is just a string.
 */
export function describeNext(card: ReviewCard, now: number): string {
  const days = Math.round((card.nextReview - now) / DAY_MS);
  if (days <= 0) return 'again today';
  if (days === 1) return 'again tomorrow';
  if (days < 21) return `again in ${days} days`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `again in ${weeks} weeks`;
  return `again in ${Math.round(days / 30)} months`;
}
