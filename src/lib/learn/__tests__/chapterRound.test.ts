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
  DAY_MS,
  currentKey,
  dueCount,
  drillRound,
  drillRounds,
  gradeAsk,
  hasCard,
  isDue,
  isRepeat,
  nextDueAt,
  roundDone,
  roundTally,
  startDrill,
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

// ─────────────────────────────────────────────────────────────────────────────
// DRILL
//
// A drill asks the lot. The one thing that must be true of it, and the reason
// it is not `buildRound` with a flag: it cannot consult `records` at all, or
// "drill this chapter cold" quietly becomes "drill the parts you are bad at",
// which is the session the player already has.
// ─────────────────────────────────────────────────────────────────────────────

describe('drillRound', () => {
  const probes = Array.from({ length: 12 }, (_, i) => probe(`k${i}`));

  it('walks the whole list in order, round by round', () => {
    expect(drillRound(probes, 1).map(p => p.key)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4']);
    expect(drillRound(probes, 2).map(p => p.key)).toEqual(['k5', 'k6', 'k7', 'k8', 'k9']);
    expect(drillRound(probes, 3).map(p => p.key)).toEqual(['k10', 'k11']);
  });

  it('asks the same question of someone who knows everything', () => {
    // THE CONTROL THIS MODE EXISTS FOR. Seed every decision as known: a session
    // would have nothing to ask, and a drill asks exactly what it asked before.
    const known: Records = {};
    for (const p of probes) known[p.key] = { ...blankRecord(p.key), correctness: 2, asks: 3 };
    expect(buildRound(probes, known, 1)).toEqual([]);
    expect(drillRound(probes, 1).map(p => p.key)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4']);
  });

  // ── Zero by definition ──────────────────────────────────────────────────────
  it('has nothing to ask past the end, and nothing to ask about nothing', () => {
    expect(drillRound(probes, 4)).toEqual([]);
    expect(drillRound([], 1)).toEqual([]);
    expect(drillRound(probes, 0).map(p => p.key)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4']);
  });
});

describe('drillRounds', () => {
  it('is the rounds a scope takes, rounded up', () => {
    expect(drillRounds(0)).toBe(0);
    expect(drillRounds(1)).toBe(1);
    expect(drillRounds(5)).toBe(1);
    expect(drillRounds(6)).toBe(2);
    expect(drillRounds(60)).toBe(12);
  });

  it('is never negative', () => {
    expect(drillRounds(-3)).toBe(0);
  });
});

describe('startDrill', () => {
  const probes = Array.from({ length: 7 }, (_, i) => probe(`k${i}`));

  it('opens a round of the drill queue, gradeable exactly like a session', () => {
    const state = startDrill(probes, 2);
    expect(state.round).toBe(2);
    expect(state.timeline).toEqual(['k5', 'k6']);
    expect(state.size).toBe(2);
    expect(currentKey(state)).toBe('k5');
    // A miss re-queues here too: the mode differs in what it asks, never in
    // how it grades.
    const missed = answerRound(state, false);
    expect(missed.timeline).toEqual(['k5', 'k6', 'k5']);
    expect(missed.progress).toBe(0);
  });

  it('is done immediately past the end of the scope', () => {
    expect(roundDone(startDrill(probes, 9))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EARNED REVIEWS
//
// The claim: a 185-line course creates ZERO cards on enrolment, and a player
// who probes it perfectly finishes owing nothing. A curriculum would have made
// 185 cards up front and asked them all back. Everything below is that one
// sentence, made falsifiable.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

describe('a card is earned, never granted', () => {
  it('does not exist until something goes wrong', () => {
    const right = gradeAsk(blankRecord('a'), { right: true, round: 1, at: NOW });
    expect(right.correctness).toBe(2);
    expect(hasCard(right)).toBe(false);
    expect(right.dueAt).toBeUndefined();
    expect(dueCount({ a: right }, NOW + 10 * DAY_MS)).toBe(0);
  });

  it('exists the moment one does', () => {
    const wrong = gradeAsk(blankRecord('a'), { right: false, round: 1, at: NOW });
    expect(hasCard(wrong)).toBe(true);
    expect(wrong.dueAt).toBe(NOW + DAY_MS);
    expect(isDue(wrong, NOW)).toBe(false);
    expect(isDue(wrong, NOW + DAY_MS)).toBe(true);
  });

  it('is earned by a hint too, because a shown move was not recalled', () => {
    const shown = gradeAsk(blankRecord('a'), { right: true, hinted: true, round: 1, at: NOW });
    // The scale calls 3 "correct with difficulty", which would ADVANCE the
    // interval. A decision that had to be shown has not been recalled at all.
    expect(shown.correctness).toBe(-1);
    expect(shown.dueAt).toBe(NOW + DAY_MS);
  });

  it('pushes the date out as a card is answered, and pulls it back on a miss', () => {
    let record = gradeAsk(blankRecord('a'), { right: false, round: 1, at: NOW });
    const first = record.dueAt!;
    record = gradeAsk(record, { right: true, round: 2, at: first });
    const second = record.dueAt!;
    expect(second - first).toBeGreaterThan(DAY_MS);
    record = gradeAsk(record, { right: true, round: 3, at: second });
    expect(record.dueAt! - second).toBeGreaterThan(second - first);
    // And a miss resets it to tomorrow, whatever it had grown to.
    record = gradeAsk(record, { right: false, round: 4, at: record.dueAt! });
    expect(record.dueAt).toBe(record.at + DAY_MS);
  });

  it('never resurrects a card a right answer did not earn', () => {
    // Two right answers in a row on a decision that was never missed. The
    // control that would break if `advance` created a card instead of
    // advancing one.
    let record = gradeAsk(blankRecord('a'), { right: true, round: 1, at: NOW });
    record = gradeAsk(record, { right: true, round: 2, at: NOW + DAY_MS });
    expect(record.correctness).toBe(2);
    expect(record.dueAt).toBeUndefined();
  });
});

describe('a due card comes back', () => {
  const probes = Array.from({ length: 6 }, (_, i) => probe(`k${i}`));

  const owed = (key: string, dueAt: number): ProbeRecord => ({
    ...blankRecord(key),
    correctness: 2,
    asks: 2,
    misses: 1,
    ease: 2.5,
    interval: 6,
    dueAt,
  });

  it('outranks anything never asked', () => {
    // A decision got wrong in March and not seen since is worth more than the
    // next new one. That is what earning a card is FOR.
    const records: Records = { k4: owed('k4', NOW - DAY_MS) };
    expect(buildRound(probes, records, 1, 5, NOW)[0].key).toBe('k4');
  });

  it('is not due before its date, and a clock nobody passed sweeps nothing', () => {
    const records: Records = { k4: owed('k4', NOW + 30 * DAY_MS) };
    expect(buildRound(probes, records, 1, 5, NOW).map(p => p.key)).not.toContain('k4');
    // Zero by definition: without a clock, `now` is 0 and nothing is due.
    const past: Records = { k4: owed('k4', NOW - DAY_MS) };
    expect(buildRound(probes, past, 1, 5).map(p => p.key)).not.toContain('k4');
  });

  it('still comes second to something they got wrong and have not fixed', () => {
    const records: Records = {
      k4: owed('k4', NOW - 90 * DAY_MS),
      k5: { ...blankRecord('k5'), correctness: -1, asks: 1, misses: 1 },
    };
    expect(buildRound(probes, records, 1, 5, NOW).slice(0, 2).map(p => p.key)).toEqual(['k5', 'k4']);
  });
});

describe('nextDueAt', () => {
  it('is the soonest card, or null when nothing is scheduled', () => {
    const a = { ...blankRecord('a'), dueAt: NOW + 5 * DAY_MS };
    const b = { ...blankRecord('b'), dueAt: NOW + DAY_MS };
    expect(nextDueAt({ a, b })).toBe(NOW + DAY_MS);
    expect(nextDueAt({ c: blankRecord('c') })).toBeNull();
    expect(nextDueAt({})).toBeNull();
  });
});
