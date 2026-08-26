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
//
// ─────────────────────────────────────────────────────────────────────────────
// WHERE THE CARDS LIVE
//
// localStorage is the fast path and the account is the copy that survives the
// device — the same split `bracketStore.ts` uses, for the same reason. A review
// schedule is months of accumulated evidence about one player, and losing it to
// a new phone means being asked to re-learn lines already learnt.
//
// TRIMMING IS WHY THE MERGE IS NOT A PLAIN UNION.
//
// Both copies are budgeted: localStorage shares a ~5 MB origin budget with
// course progress, and a Firestore document stops at 1 MiB. When a budget
// bites, `trimCards` drops the cards due FURTHEST out — the ones the scheduler
// itself says are best known — and never a due one.
//
// A union merge over a store that can drop things resurrects what was dropped.
// That is the bug `mergeBrackets` documents, and it is avoided here by making
// the account budget strictly larger than the device budget: a card the device
// trimmed is still on the account, and comes back on the next pull, before it
// is due. The device holds a WINDOW on the schedule, not the schedule.
// ─────────────────────────────────────────────────────────────────────────────

import { applySm2, DEFAULT_EASE_FACTOR } from '@/lib/spacedRepetition';
import { lineKeyOf } from '@/lib/learn/trainerProgress';
import type { TrainerLine, TrainerState } from '@/lib/learn/trainerSession';

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

/**
 * What a schedule may cost on this device, in bytes of serialised card.
 *
 * Measured: a card runs 308 bytes at 6 plies and 581 at 24, so this is roughly
 * 700 of the deepest cards. localStorage gives an origin about 5 MB and course
 * progress already measures 1.2 MB for a six-course repertoire and 4.2 MB for
 * all forty-three, so the schedule takes a small, fixed share and the biggest
 * consumer cannot starve it.
 */
export const LOCAL_CARD_BYTES = 400_000;

/**
 * What a schedule may cost on the account.
 *
 * A Firestore document stops at 1 MiB including field names and overhead, so
 * this leaves headroom for the repaired list and the envelope.
 *
 * IT MUST STAY LARGER THAN `LOCAL_CARD_BYTES`. The merge is a union, and the
 * only thing stopping it from resurrecting a trimmed card is that the account
 * never trims one the device still holds. Narrow this below the local budget
 * and two devices will churn a card back and forth forever.
 */
export const ACCOUNT_CARD_BYTES = 700_000;

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
  // FINITE, not merely `typeof === 'number'`. NaN passes a typeof check and
  // then fails every comparison silently: `nextReview: NaN` is never `<= now`,
  // so the card is never due and never surfaces, and nothing anywhere errors.
  return (
    typeof x.lineKey === 'string' &&
    Number.isFinite(x.nextReview) &&
    Number.isFinite(x.interval) &&
    Number.isFinite(x.easeFactor) &&
    Number.isFinite(x.attempts) &&
    !!x.line &&
    Array.isArray(x.line.moves) &&
    x.line.moves.length > 0 &&
    x.line.moves.every(m => typeof m === 'string') &&
    (x.line.color === 'white' || x.line.color === 'black')
  );
}

/**
 * Write the schedule, and say whether it landed.
 *
 * It used to swallow the failure with "storage full costs a schedule, never the
 * session in progress". The first half is true and the second half is the
 * problem: a schedule is the whole point of finishing a drill, and losing one
 * silently means the line rots while the screen says it is handled. The caller
 * now gets the answer and /train/opening says so.
 */
function write(account: string, cards: ReviewCard[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(storeKey(account), JSON.stringify(cards));
    return true;
  } catch {
    return false;
  }
}

/**
 * Serialised size of one card, which is the quantity the two budgets are
 * actually spent in. Counting cards instead would be a proxy: a 24-ply strong
 * course line is nearly twice the size of a 6-ply one, measured.
 */
function bytesOf(card: ReviewCard): number {
  // +1 for the comma or bracket this card costs inside the array.
  return JSON.stringify(card).length + 1;
}

/**
 * The schedule that fits in a budget, due soonest first.
 *
 * What gets dropped is decided by `nextReview`, so the cards kept are exactly
 * the cards the player is about to see. A dropped card is one the scheduler
 * placed weeks or months out, which is its own statement that the line is
 * known — and on a signed-in account it is not lost at all, only out of this
 * device's window until it comes due.
 */
export function trimCards(cards: ReviewCard[], budgetBytes: number): ReviewCard[] {
  const ordered = [...cards].sort((a, b) => a.nextReview - b.nextReview);
  const kept: ReviewCard[] = [];
  let spent = 2; // the enclosing `[]`
  for (const card of ordered) {
    const size = bytesOf(card);
    if (spent + size > budgetBytes) break;
    spent += size;
    kept.push(card);
  }
  return kept;
}

/**
 * Everything either copy knows, one card per line, newest grade winning.
 *
 * `lastReviewed` is the stamp because it is set on every schedule — a card is
 * created already reviewed, so there is no card with a zero here. Attempts
 * breaks a tie, since it only ever goes up.
 */
export function mergeCards(mine: ReviewCard[], theirs: ReviewCard[]): ReviewCard[] {
  const byKey = new Map<string, ReviewCard>();
  for (const card of [...mine, ...theirs]) {
    const held = byKey.get(card.lineKey);
    if (!held) {
      byKey.set(card.lineKey, card);
      continue;
    }
    const newer =
      card.lastReviewed !== held.lastReviewed
        ? card.lastReviewed > held.lastReviewed
        : card.attempts > held.attempts;
    if (newer) byKey.set(card.lineKey, card);
  }
  return Array.from(byKey.values()).sort((a, b) => a.nextReview - b.nextReview);
}

/**
 * Cards we are willing to act on, from anywhere — storage, or the network.
 *
 * Shared with the server so a document written by an old client cannot put a
 * card with no moves onto a chessboard.
 */
export function sanitiseCards(parsed: unknown): ReviewCard[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isCard).map(c => ({
    lineKey: c.lineKey,
    line: { moves: [...c.line.moves], color: c.line.color, ...(c.line.target ? { target: c.line.target } : {}) },
    label: typeof c.label === 'string' ? c.label : c.lineKey,
    easeFactor: c.easeFactor,
    interval: c.interval,
    attempts: c.attempts,
    nextReview: c.nextReview,
    lastReviewed: Number.isFinite(c.lastReviewed) ? c.lastReviewed : 0,
    lapses: Number.isFinite(c.lapses) ? c.lapses : 0,
  }));
}

/** Replace the whole schedule on this device, trimmed to the device budget. */
export function saveCards(account: string, cards: ReviewCard[]): boolean {
  return write(account, trimCards(cards, LOCAL_CARD_BYTES));
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

function upsert(account: string, card: ReviewCard): boolean {
  return saveCards(account, [card, ...read(account).filter(c => c.lineKey !== card.lineKey)]);
}

/**
 * A card, and whether this device managed to keep it.
 *
 * The second field exists because the first one used to be the whole answer,
 * and a caller holding a perfectly good `ReviewCard` had no way to know the
 * write had been dropped on the floor.
 */
export interface ScheduleResult {
  card: ReviewCard | null;
  savedLocally: boolean;
}

/**
 * Start a card the moment a line is repaired.
 *
 * The three clean runs ARE the first review, so the card is created already
 * reviewed rather than immediately due. Creating it due would put the line a
 * player has just finished straight back on their plan, which reads as the
 * trainer not having noticed.
 */
/**
 * Did finishing this session earn a review card?
 *
 * The rule this module's header states, made checkable. A card is EARNED,
 * never granted: a STUDY probe answered right is evidence there is no gap, so
 * it schedules nothing. Enrolling in a hundred-decision chapter and answering
 * all hundred correctly must leave the queue exactly as empty as it was.
 *
 * Repair and review are unaffected. A repair session earned its card by having
 * had a hole measured in the player's own games, whatever the drill misses
 * were, and a review re-grades a card that already exists.
 *
 * Keyed on the ANSWER, not the mode. Branching on the mode is what let study
 * fall into the repair branch and mint a card for a correct answer.
 */
export function earnsCard(state: Pick<TrainerState, 'mode' | 'knewIt'>): boolean {
  if (state.mode !== 'study') return true;
  return state.knewIt === false;
}

export function scheduleAfterRepair(
  account: string,
  line: TrainerLine,
  label: string,
  misses: number,
  now: number
): ScheduleResult {
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
  return { card, savedLocally: upsert(account, card) };
}

/** Apply a completed review and reschedule. A null card means it is gone. */
export function recordReview(
  account: string,
  lineKey: string,
  misses: number,
  now: number
): ScheduleResult {
  const card = findCard(account, lineKey);
  // No card is not a failed write. The line was reviewed off a schedule that
  // is no longer here — cleared storage, another device — and there is nothing
  // to grade, which is a different thing from having failed to store a grade.
  if (!card) return { card: null, savedLocally: true };
  const next = schedule(card, qualityFromMisses(misses), now);
  return { card: next, savedLocally: upsert(account, next) };
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
