// The round machine.
//
// The two properties worth pinning are the ones that make the product's claim
// true rather than decorative:
//
//   The round ends on the Nth CORRECT answer, not the Nth question. A round
//   going badly lengthens; one going well is over. The progress dots and the
//   difficulty are the same number.
//
//   A hint can never produce KNOWN. Every other guarantee about the hint stops
//   it reaching an engine; only this one stops it being free.

import { describe, expect, it } from 'vitest';
import type { CourseProbe } from '@/lib/courses/probes';
import {
  ROUND_SIZE,
  answerRound,
  blankRecord,
  buildRound,
  chapterClosed,
  currentKey,
  gradeAsk,
  isRepeat,
  roundDone,
  roundTally,
  startRound,
  type Correctness,
  type ProbeRecord,
  type Records,
} from '../chapterRound';

const probe = (key: string, weight = 1): CourseProbe =>
  ({ key, path: [], san: 'e4', fen: 'x', ply: 0, chapter: 0, weight, games: 1, src: 'corpus-confirmed', next: null }) as CourseProbe;

const at = (key: string, correctness: Correctness, lastRound = 0): ProbeRecord => ({
  ...blankRecord(key),
  correctness,
  lastRound,
});

const records = (...rs: ProbeRecord[]): Records =>
  Object.fromEntries(rs.map(r => [r.key, r]));

describe('buildRound', () => {
  it('asks what they got wrong before what they have never seen', () => {
    const probes = ['u1', 'u2', 'u3', 'm1', 'l1'].map(k => probe(k));
    const round = buildRound(
      probes,
      records(at('m1', -1), at('l1', 1, 0)),
      2,
      5
    );
    // missed, then learning-and-stale, then unseen in likelihood order.
    expect(round.map(p => p.key)).toEqual(['m1', 'l1', 'u1', 'u2', 'u3']);
  });

  it('does not re-ask something it asked this round', () => {
    // A decision fixed in round 2 must not come straight back in round 2.
    const probes = ['l1', 'u1', 'u2'].map(k => probe(k));
    const round = buildRound(probes, records(at('l1', 1, 2)), 2, 2);
    expect(round.map(p => p.key)).toEqual(['u1', 'u2']);
  });

  it('falls back to fresh learning rather than ending a round early', () => {
    const probes = ['l1'].map(k => probe(k));
    expect(buildRound(probes, records(at('l1', 1, 2)), 2, 5).map(p => p.key)).toEqual(['l1']);
  });

  it('never asks the same decision twice in one round', () => {
    const probes = [probe('a'), probe('a'), probe('b')];
    expect(buildRound(probes, {}, 1, 5).map(p => p.key)).toEqual(['a', 'b']);
  });

  it('leaves known decisions out entirely', () => {
    // THE ZERO: the number of already-known decisions in a round is zero, which
    // is what makes the session shrink at all.
    const probes = ['k1', 'k2', 'u1'].map(k => probe(k));
    const round = buildRound(probes, records(at('k1', 2), at('k2', 2)), 3, 5);
    expect(round.map(p => p.key)).toEqual(['u1']);
  });
});

describe('gradeAsk', () => {
  it('takes one cold right answer as knowing it', () => {
    // The thesis. Asking again to prove it is the curriculum behaviour this
    // mode refuses.
    const graded = gradeAsk(blankRecord('a'), { right: true, round: 1, at: 1 });
    expect(graded.correctness).toBe(2);
    expect(graded.misses).toBe(0);
  });

  it('sends a wrong answer to the bottom and counts it', () => {
    const graded = gradeAsk(blankRecord('a'), { right: false, round: 1, at: 1 });
    expect(graded.correctness).toBe(-1);
    expect(graded.misses).toBe(1);
    expect(graded.asks).toBe(1);
  });

  it('promotes one rung after a miss, never two', () => {
    // Fixed once is not owned. It has to come back on a later round.
    const missed = gradeAsk(blankRecord('a'), { right: false, round: 1, at: 1 });
    const fixed = gradeAsk(missed, { right: true, round: 1, at: 1 });
    expect(fixed.correctness).toBe(1);
    const owned = gradeAsk(fixed, { right: true, round: 2, at: 1 });
    expect(owned.correctness).toBe(2);
  });

  it('never lets a hint produce a known decision, from any starting state', () => {
    // EXHAUSTIVE, not a sample. Four starting values crossed with right and
    // wrong: the count of results reaching KNOWN is zero, and there is no
    // combination that could produce one.
    const states: Correctness[] = [0, -1, 1, 2];
    const reachedKnown: string[] = [];
    for (const correctness of states) {
      for (const right of [true, false]) {
        const graded = gradeAsk(at('a', correctness), { right, hinted: true, round: 1, at: 1 });
        if (graded.correctness === 2) reachedKnown.push(`${correctness}/${right}`);
      }
    }
    expect(reachedKnown).toEqual([]);
  });

  it('remembers a hint was taken, past the round it was taken in', () => {
    // Known must never come to mean "was shown", including three rounds later.
    const hinted = gradeAsk(blankRecord('a'), { right: true, hinted: true, round: 1, at: 1 });
    expect(hinted.hinted).toBe(true);
    const later = gradeAsk(hinted, { right: true, round: 2, at: 1 });
    expect(later.hinted).toBe(true);
  });

  it('does not count a hinted right answer as a miss', () => {
    // They did not play a wrong move. It is not knowledge and it is not an
    // error, and the grade a scheduler sees must not pretend otherwise.
    const hinted = gradeAsk(blankRecord('a'), { right: true, hinted: true, round: 1, at: 1 });
    expect(hinted.misses).toBe(0);
    expect(hinted.correctness).toBe(-1);
  });
});

describe('the round ends on correct answers, not on questions', () => {
  const probes = ['a', 'b', 'c', 'd', 'e'].map(k => probe(k));

  it('takes five right answers, whatever it costs', () => {
    let state = startRound(probes, {}, 1);
    expect(state.size).toBe(ROUND_SIZE);
    let asked = 0;
    // Miss the first three, then answer everything.
    while (!roundDone(state)) {
      asked++;
      state = answerRound(state, asked > 3);
    }
    expect(state.progress).toBe(ROUND_SIZE);
    // Five correct plus three misses is eight questions for a five-question
    // round. That IS the mechanic.
    expect(asked).toBe(8);
  });

  it('is over in five when nothing is missed', () => {
    let state = startRound(probes, {}, 1);
    let asked = 0;
    while (!roundDone(state)) {
      asked++;
      state = answerRound(state, true);
    }
    expect(asked).toBe(5);
    expect(state.progress).toBe(5);
  });

  it('re-asks a miss later in the same round, once', () => {
    let state = startRound(probes, {}, 1);
    const first = currentKey(state)!;
    state = answerRound(state, false);
    // Not immediately: it goes to the back, with the rest in between.
    expect(currentKey(state)).not.toBe(first);
    expect(state.timeline[state.timeline.length - 1]).toBe(first);
    expect(isRepeat(state, first)).toBe(true);

    // Reach it again and miss it again: it does NOT come back a third time.
    while (currentKey(state) !== first && !roundDone(state)) state = answerRound(state, true);
    const before = state.timeline.length;
    state = answerRound(state, false);
    expect(state.timeline.length).toBe(before);
  });

  it('ends rather than looping when everything left has been missed twice', () => {
    // THE ZERO-BY-DEFINITION CASE for the loop guard: answer nothing correctly
    // and the number of questions asked is finite. A round that could not end
    // would hang the screen with no error.
    let state = startRound(probes, {}, 1);
    let asked = 0;
    while (!roundDone(state) && asked < 100) {
      asked++;
      state = answerRound(state, false);
    }
    expect(roundDone(state)).toBe(true);
    expect(state.progress).toBe(0);
    expect(asked).toBe(10);
  });

  it('is over before it starts when there is nothing to ask', () => {
    const state = startRound([], {}, 1);
    expect(roundDone(state)).toBe(true);
    expect(currentKey(state)).toBeNull();
  });
});

describe('roundTally', () => {
  const probes = ['a', 'b', 'c', 'd'].map(k => probe(k));

  it('counts the three buckets and the one number that falls', () => {
    const tally = roundTally(probes, records(at('a', 2), at('b', 1), at('c', -1)));
    expect(tally).toEqual({ unseen: 1, learning: 2, known: 1, total: 4, open: 3 });
  });

  it('calls the chapter closed only when everything is known', () => {
    expect(chapterClosed(roundTally(probes, records(at('a', 2), at('b', 2), at('c', 2), at('d', 2))))).toBe(true);
    expect(chapterClosed(roundTally(probes, records(at('a', 2), at('b', 1))))).toBe(false);
    // An empty chapter is not a finished one.
    expect(chapterClosed(roundTally([], {}))).toBe(false);
  });
});
