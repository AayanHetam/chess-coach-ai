// A repaired line has to come back, and it has to come back CORRECTLY.
//
// The failure this file exists to prevent is silent: a review queue that is
// empty because scheduling broke looks exactly like a review queue that is
// empty because everything is learned. Nobody reports it, and the feature
// quietly does nothing for months.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LAPSES_BEFORE_REPAIR,
  MAX_DUE_AT_ONCE,
  describeNext,
  dueCards,
  findCard,
  loadCards,
  needsFullRepair,
  qualityFromMisses,
  recordReview,
  scheduleAfterRepair,
} from '@/lib/learn/reviewSchedule';
import { lineKeyOf } from '@/lib/learn/trainerProgress';
import type { TrainerLine } from '@/lib/learn/trainerSession';

const DAY = 24 * 60 * 60 * 1000;
const ME = 'chess.com:lazer_wizard';
const LINE: TrainerLine = {
  moves: ['e4', 'c5', 'c3'],
  color: 'white',
  target: { san: 'Nf3', source: 'engine' },
};
const OTHER: TrainerLine = { moves: ['d4', 'Nf6'], color: 'black' };

function fakeStorage(broken = false) {
  const store: Record<string, string> = {};
  return {
    localStorage: {
      getItem: (k: string) => {
        if (broken) throw new Error('denied');
        return store[k] ?? null;
      },
      setItem: (k: string, v: string) => {
        if (broken) throw new Error('quota');
        store[k] = v;
      },
      removeItem: (k: string) => delete store[k],
    },
    __store: store,
  };
}

beforeEach(() => vi.stubGlobal('window', fakeStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('scheduling after a repair', () => {
  it('does not put a line the player just finished straight back on their plan', () => {
    const card = scheduleAfterRepair(ME, LINE, '1.e4 c5 2.c3', 0, 0);
    expect(card.nextReview).toBeGreaterThan(0);
    // The three clean runs ARE the first review.
    expect(dueCards(ME, 0)).toHaveLength(0);
  });

  it('brings it back later', () => {
    scheduleAfterRepair(ME, LINE, '1.e4 c5 2.c3', 0, 0);
    expect(dueCards(ME, 2 * DAY)).toHaveLength(1);
  });

  it('stores the whole line, so the review survives the finding going away', () => {
    // The measurement stops flagging a line once it is fixed. If a card only
    // held a pointer to it, doing the work would delete the follow-up.
    const card = scheduleAfterRepair(ME, LINE, '1.e4 c5 2.c3', 0, 0);
    expect(card.line.moves).toEqual(['e4', 'c5', 'c3']);
    expect(card.line.color).toBe('white');
    expect(card.line.target?.san).toBe('Nf3');
  });

  it('refreshes the drilled move when a line is repaired again', () => {
    scheduleAfterRepair(ME, LINE, '1.e4 c5 2.c3', 0, 0);
    const moved: TrainerLine = { ...LINE, target: { san: 'd4', source: 'masters' } };
    const card = scheduleAfterRepair(ME, moved, '1.e4 c5 2.c3', 0, DAY);
    // Drilling a stale target would teach the wrong move with full confidence.
    expect(card.line.target?.san).toBe('d4');
    expect(loadCards(ME)).toHaveLength(1);
  });

  it('keeps accounts apart', () => {
    scheduleAfterRepair(ME, LINE, '1.e4 c5 2.c3', 0, 0);
    expect(loadCards('lichess:someone_else')).toHaveLength(0);
  });
});

describe('grading', () => {
  it('is stricter than a flashcard, because a miss is a move played on the board', () => {
    expect(qualityFromMisses(0)).toBe(5);
    expect(qualityFromMisses(1)).toBe(3);
    // Two misses is a lapse, and SM-2 resets anything below 3.
    expect(qualityFromMisses(2)).toBeLessThan(3);
    expect(qualityFromMisses(7)).toBeLessThan(3);
  });

  it('pushes a clean review further out than a scruffy one', () => {
    // SM-2's first two intervals are a fixed ladder (1 day, then 6) and do NOT
    // vary with quality; only the ease factor moves. So the divergence is
    // asserted where it actually exists: immediately in the ease, and in the
    // interval from the third review on. Asserting it one review earlier
    // passes only if someone breaks the algorithm to satisfy the test.
    const run = (misses: number) => {
      vi.stubGlobal('window', fakeStorage());
      scheduleAfterRepair(ME, LINE, 'L', 0, 0);
      const first = recordReview(ME, lineKeyOf(LINE), misses, DAY)!;
      const second = recordReview(ME, lineKeyOf(LINE), misses, 10 * DAY)!;
      return { first, second };
    };
    const clean = run(0);
    const scruffy = run(1);

    expect(clean.first.easeFactor).toBeGreaterThan(scruffy.first.easeFactor);
    expect(clean.first.interval).toBe(scruffy.first.interval);
    expect(clean.second.interval).toBeGreaterThan(scruffy.second.interval);
  });

  it('resets the interval when the line has actually been forgotten', () => {
    scheduleAfterRepair(ME, LINE, 'L', 0, 0);
    recordReview(ME, lineKeyOf(LINE), 0, DAY); // out to ~6 days
    const lapsed = recordReview(ME, lineKeyOf(LINE), 3, 8 * DAY);
    expect(lapsed!.interval).toBe(1);
    expect(lapsed!.lapses).toBe(1);
  });

  it('sends a repeatedly forgotten line back through the full repair', () => {
    scheduleAfterRepair(ME, LINE, 'L', 0, 0);
    let card = findCard(ME, lineKeyOf(LINE))!;
    expect(needsFullRepair(card)).toBe(false);
    for (let i = 0; i < LAPSES_BEFORE_REPAIR; i++) {
      card = recordReview(ME, lineKeyOf(LINE), 3, (i + 1) * DAY)!;
    }
    // Asking for a third one-run review is doing the same thing again and
    // expecting a different result.
    expect(needsFullRepair(card)).toBe(true);
  });

  it('ignores a review of a line it does not hold', () => {
    expect(recordReview(ME, 'white:nonsense', 0, DAY)).toBeNull();
  });
});

describe('the due queue', () => {
  it('shows the most overdue first', () => {
    scheduleAfterRepair(ME, OTHER, 'B', 0, 0);
    scheduleAfterRepair(ME, LINE, 'A', 0, 5 * DAY);
    expect(dueCards(ME, 30 * DAY).map(c => c.label)).toEqual(['B', 'A']);
  });

  it('caps a sitting, so a queue never becomes a debt', () => {
    for (let i = 0; i < MAX_DUE_AT_ONCE + 4; i++) {
      scheduleAfterRepair(ME, { moves: ['e4', 'e5', 'Nf3'].slice(0, 3), color: 'white' }, `L${i}`, 0, 0);
      // Distinct lines, or they would collapse onto one card.
      scheduleAfterRepair(ME, { moves: ['e4', `${'a'}${i}`], color: 'white' } as TrainerLine, `M${i}`, 0, 0);
    }
    expect(dueCards(ME, 90 * DAY).length).toBeLessThanOrEqual(MAX_DUE_AT_ONCE);
  });

  it('is empty rather than throwing when storage is unavailable', () => {
    vi.stubGlobal('window', fakeStorage(true));
    expect(() => scheduleAfterRepair(ME, LINE, 'L', 0, 0)).not.toThrow();
    expect(dueCards(ME, DAY)).toEqual([]);
  });

  it('is inert on the server', () => {
    vi.stubGlobal('window', undefined);
    expect(loadCards(ME)).toEqual([]);
    expect(dueCards(ME, DAY)).toEqual([]);
  });

  it('drops a stored card with no moves rather than opening an empty board', () => {
    const w = fakeStorage();
    w.__store['cm.trainer.v1.reviews:chess.com:lazer_wizard'] = JSON.stringify([
      { lineKey: 'white:x', line: { moves: [], color: 'white' }, nextReview: 0, interval: 1, easeFactor: 2.5, attempts: 1 },
    ]);
    vi.stubGlobal('window', w);
    expect(dueCards(ME, DAY)).toEqual([]);
  });

  it('survives a corrupt store', () => {
    const w = fakeStorage();
    w.__store['cm.trainer.v1.reviews:chess.com:lazer_wizard'] = '{not json';
    vi.stubGlobal('window', w);
    expect(() => loadCards(ME)).not.toThrow();
    expect(loadCards(ME)).toEqual([]);
  });
});

describe('describeNext', () => {
  it('says how long, not what date', () => {
    const at = (days: number) => describeNext({ nextReview: days * DAY } as never, 0);
    expect(at(0)).toMatch(/today/);
    expect(at(1)).toMatch(/tomorrow/);
    expect(at(6)).toMatch(/6 days/);
    expect(at(28)).toMatch(/4 weeks/);
    expect(at(120)).toMatch(/months/);
  });
});
