// What happens when the same player trains on two devices.
//
// The merge is the whole of the account copy's value, and it has one failure
// mode that a green test suite hides: a union over a store that can DROP things
// resurrects what was dropped. `mergeBrackets` documents that bug for the
// bracket; this file is the proof that the trainer's two stores do not have it.

import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_CARD_BYTES,
  LOCAL_CARD_BYTES,
  mergeCards,
  sanitiseCards,
  trimCards,
  type ReviewCard,
} from '../reviewSchedule';
import { MAX_REPAIRED, mergeRepaired, sanitiseRepaired, type RepairedLine } from '../trainerProgress';

const DAY = 24 * 60 * 60 * 1000;

function card(over: Partial<ReviewCard> & { lineKey: string }): ReviewCard {
  return {
    line: { moves: ['e4', 'c5', 'c3'], color: 'white' },
    label: over.lineKey,
    easeFactor: 2.5,
    interval: 6,
    attempts: 1,
    nextReview: 6 * DAY,
    lastReviewed: 0,
    lapses: 0,
    ...over,
  };
}

const repaired = (lineKey: string, at: number): RepairedLine => ({ lineKey, label: lineKey, at, runs: 3 });

describe('merging two devices’ review schedules', () => {
  it('keeps a card that only one device has ever seen', () => {
    const merged = mergeCards([card({ lineKey: 'a' })], [card({ lineKey: 'b' })]);
    expect(merged.map(c => c.lineKey).sort()).toEqual(['a', 'b']);
  });

  it('keeps the more recently graded copy of a card, from either side', () => {
    const old = card({ lineKey: 'a', lastReviewed: 1 * DAY, interval: 1 });
    const fresh = card({ lineKey: 'a', lastReviewed: 9 * DAY, interval: 30 });
    // Both orders, because a merge that is right in one direction and wrong in
    // the other is a merge whose answer depends on which device pushed first.
    expect(mergeCards([old], [fresh])[0].interval).toBe(30);
    expect(mergeCards([fresh], [old])[0].interval).toBe(30);
  });

  it('breaks a tie on attempts, which only ever goes up', () => {
    const a = card({ lineKey: 'a', lastReviewed: DAY, attempts: 2, interval: 6 });
    const b = card({ lineKey: 'a', lastReviewed: DAY, attempts: 5, interval: 40 });
    expect(mergeCards([a], [b])[0].interval).toBe(40);
    expect(mergeCards([b], [a])[0].interval).toBe(40);
  });

  it('never invents or loses a line', () => {
    const mine = [card({ lineKey: 'a' }), card({ lineKey: 'b' })];
    const theirs = [card({ lineKey: 'b' }), card({ lineKey: 'c' })];
    expect(mergeCards(mine, theirs)).toHaveLength(3);
  });
});

describe('trimming to a budget', () => {
  // A deep card, so the numbers below are the expensive case and not the
  // flattering one.
  const deep = (key: string, nextReview: number) =>
    card({ lineKey: key, nextReview, line: { moves: Array.from({ length: 24 }, () => 'Nxe5'), color: 'white' } });

  it('keeps what is due and drops what is furthest out', () => {
    const cards = [deep('far', 400 * DAY), deep('soon', 1 * DAY), deep('mid', 30 * DAY)];
    // A budget derived from the real serialised size, so the test says what it
    // means — "room for one" — instead of hardcoding a number that silently
    // becomes "room for two" the day a field is added to ReviewCard.
    const roomForOne = JSON.stringify([cards[0]]).length + 1;
    expect(trimCards(cards, roomForOne).map(c => c.lineKey)).toEqual(['soon']);
  });

  it('leaves a schedule that already fits completely alone', () => {
    // The control: without it, a trim that dropped everything would pass the
    // test above.
    const cards = [deep('far', 400 * DAY), deep('soon', DAY)];
    expect(trimCards(cards, LOCAL_CARD_BYTES)).toHaveLength(2);
  });

  it('stays inside the budget it was given', () => {
    const cards = Array.from({ length: 500 }, (_, i) => deep(`k${i}`, i * DAY));
    const kept = trimCards(cards, 10_000);
    expect(JSON.stringify(kept).length).toBeLessThanOrEqual(10_000);
    expect(kept.length).toBeGreaterThan(0);
  });

  it('holds the inequality the merge depends on', () => {
    // THIS IS THE LOAD-BEARING ONE. If the account budget were the smaller of
    // the two, a card trimmed on the account would be pushed straight back up
    // by the device that still holds it, trimmed again, and pushed again —
    // forever, with nothing anywhere reporting an error.
    expect(ACCOUNT_CARD_BYTES).toBeGreaterThan(LOCAL_CARD_BYTES);
  });

  it('does not resurrect a card the device trimmed away', () => {
    // The device holds a window; the account holds the schedule. Pushing the
    // window up must not shrink the account to it.
    const all = Array.from({ length: 40 }, (_, i) => deep(`k${i}`, i * DAY));
    const window = trimCards(all, 3_000);
    expect(window.length).toBeLessThan(all.length);
    const account = trimCards(mergeCards(all, window), ACCOUNT_CARD_BYTES);
    expect(account).toHaveLength(all.length);
  });
});

describe('merging repaired lines', () => {
  it('keeps every line either device has finished', () => {
    const merged = mergeRepaired([repaired('a', 10)], [repaired('b', 20)]);
    expect(merged.map(r => r.lineKey)).toEqual(['b', 'a']);
  });

  it('keeps the later repair of the same line', () => {
    const merged = mergeRepaired([repaired('a', 10)], [repaired('a', 99)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].at).toBe(99);
  });

  it('caps at the same length a single device would, dropping the oldest', () => {
    const mine = Array.from({ length: MAX_REPAIRED }, (_, i) => repaired(`m${i}`, 1000 + i));
    const theirs = Array.from({ length: MAX_REPAIRED }, (_, i) => repaired(`t${i}`, 2000 + i));
    const merged = mergeRepaired(mine, theirs);
    expect(merged).toHaveLength(MAX_REPAIRED);
    // Newest survive. Both copies agree on which those are, so neither can
    // hand the other back something it had already aged out.
    expect(merged.every(r => r.lineKey.startsWith('t'))).toBe(true);
  });
});

describe('sanitising what arrives over the network', () => {
  it('drops a card with no moves rather than opening an empty board', () => {
    expect(sanitiseCards([{ ...card({ lineKey: 'a' }), line: { moves: [], color: 'white' } }])).toEqual([]);
  });

  it('drops a card whose due date is not a real number', () => {
    // NaN passes `typeof === 'number'` and then fails every comparison in
    // silence: the card is never due, never surfaces, and never errors.
    expect(sanitiseCards([card({ lineKey: 'a', nextReview: NaN })])).toEqual([]);
    expect(sanitiseCards([card({ lineKey: 'a', interval: Infinity })])).toEqual([]);
  });

  it('keeps a healthy card', () => {
    // The control. Without it, a sanitiser that returned [] unconditionally
    // would pass every test above.
    expect(sanitiseCards([card({ lineKey: 'a' })])).toHaveLength(1);
  });

  it('fills in a missing label rather than rendering a blank row', () => {
    const [only] = sanitiseCards([{ ...card({ lineKey: 'white:e4 c5' }), label: undefined }]);
    expect(only.label).toBe('white:e4 c5');
  });

  it('accepts nothing at all, from any shape', () => {
    for (const junk of [null, undefined, 'a string', 42, { cards: [] }]) {
      expect(sanitiseCards(junk)).toEqual([]);
      expect(sanitiseRepaired(junk)).toEqual([]);
    }
  });

  it('drops a repaired entry with no timestamp, and keeps a good one', () => {
    const out = sanitiseRepaired([{ lineKey: 'a', label: 'A', at: NaN, runs: 3 }, repaired('b', 5)]);
    expect(out.map(r => r.lineKey)).toEqual(['b']);
  });
});
