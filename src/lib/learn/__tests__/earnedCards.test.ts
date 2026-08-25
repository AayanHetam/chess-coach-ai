// A card is EARNED, never granted.
//
// The rule was stated in reviewSchedule.ts's header and enforced nowhere. The
// done-effect on /train/opening branched on the session MODE, so `study` fell
// into the same branch as `repair` and a probe answered RIGHT called
// scheduleAfterRepair — the only place a ReviewCard is ever constructed — and
// then marked the line repaired.
//
// It is worth being precise about the size of that. applySm2 forces
// `interval = 1` when `attempts === 0`, so every one of those cards is due
// TOMORROW. A beginner chapter is ~11 decisions and a club chapter can be 286;
// answering one perfectly would have created a card per decision, all due at
// once, metered out five a day. A queue that grows as you learn is the exact
// failure this mode was written to avoid.

import { describe, expect, it } from 'vitest';
import { earnsCard } from '../reviewSchedule';
import { createSession, submitProbe, type TrainerLine } from '../trainerSession';

const LINE: TrainerLine = {
  moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
  color: 'white',
  target: { san: 'Bb5', source: 'engine' },
};

describe('earnsCard', () => {
  it('is false for a study probe answered right', () => {
    // The zero-by-definition case: they knew it, so the number of things to
    // review is zero. There is no arrangement of the other fields that makes a
    // right answer evidence of a gap.
    const done = submitProbe(createSession(LINE, 'study'), LINE, 'Bb5');
    expect(done.act).toBe('done');
    expect(done.knewIt).toBe(true);
    expect(earnsCard(done)).toBe(false);
  });

  it('is false for a transposition, which is also knowing it', () => {
    const done = submitProbe(createSession(LINE, 'study'), LINE, 'Bf1b5');
    expect(done.knewIt).toBe(true);
    expect(earnsCard(done)).toBe(false);
  });

  it('is true for a study probe answered wrong', () => {
    // The control. Without this the rule could be satisfied by never carding
    // anything, and a test that only asserts the zero would pass on a dead
    // scheduler.
    const missed = submitProbe(createSession(LINE, 'study'), LINE, 'Bc4');
    expect(missed.knewIt).toBe(false);
    expect(earnsCard(missed)).toBe(true);
  });

  it('is still undecided while the probe is unanswered', () => {
    // knewIt is null until they move. Nothing is earned by opening a screen.
    expect(earnsCard(createSession(LINE, 'study'))).toBe(false);
  });

  it('leaves repair and review exactly as they were', () => {
    // A repair earned its card by having had a hole measured in the player's
    // own games, whatever happened in the drill. Guarding it on misses would
    // silently stop scheduling the lines the trainer exists for.
    expect(earnsCard({ mode: 'repair', knewIt: null })).toBe(true);
    expect(earnsCard({ mode: 'repair', knewIt: false })).toBe(true);
    expect(earnsCard({ mode: 'review', knewIt: null })).toBe(true);
  });

  it('does not key on the mode alone', () => {
    // The shape of the original bug: same mode, opposite answers, and the
    // rule must disagree about them.
    const knew = submitProbe(createSession(LINE, 'study'), LINE, 'Bb5');
    const missed = submitProbe(createSession(LINE, 'study'), LINE, 'Bc4');
    expect(knew.mode).toBe(missed.mode);
    expect(earnsCard(knew)).not.toBe(earnsCard(missed));
  });
});
