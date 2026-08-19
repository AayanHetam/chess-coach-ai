import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  DRILL_TARGET,
  advance,
  createSession,
  decisionPly,
  expectedAt,
  fenAfter,
  isUsersPly,
  reaches,
  startRun,
  steps,
  submitMove,
  type TrainerLine,
  type TrainerState,
} from '@/lib/learn/trainerSession';

/** 1.e4 c5 2.c3 — they play c3 by habit; the engine wants Nf3. */
const WHITE: TrainerLine = {
  moves: ['e4', 'c5', 'c3'],
  color: 'white',
  target: { san: 'Nf3', source: 'engine' },
};

/** 1.d4 Nf6 2.c4 g6 — as Black, so the opponent has the odd plies. */
const BLACK: TrainerLine = {
  moves: ['d4', 'Nf6', 'c4', 'g6'],
  color: 'black',
  target: { san: 'e6', source: 'masters' },
};

/** The engine had no complaint and the masters play what they already play. */
const NO_TARGET: TrainerLine = { moves: ['e4', 'c5', 'c3'], color: 'white' };

/** Play a whole clean drill run, returning the state after it. */
function cleanRun(state: TrainerState, line: TrainerLine): TrainerState {
  let s = state;
  for (let guard = 0; guard < 12 && s.act === 'drill'; guard++) {
    const want = expectedAt(line, s.ply);
    if (!want) break;
    const next = submitMove(s, line, want);
    if (next === s) break;
    // A completed run rewinds to ply 0; stop once we are back at the top.
    if (next.ply <= s.ply && next.act === 'drill') return next;
    s = next;
    if (s.act !== 'drill') return s;
  }
  return s;
}

describe('turn order', () => {
  it('gives White the even plies', () => {
    expect(isUsersPly(WHITE, 0)).toBe(true);
    expect(isUsersPly(WHITE, 1)).toBe(false);
    expect(isUsersPly(WHITE, 2)).toBe(true);
  });

  it('gives Black the odd plies', () => {
    // Getting this backwards produces a session that silently asks the user to
    // play their opponent's moves, and looks entirely plausible doing it.
    expect(isUsersPly(BLACK, 0)).toBe(false);
    expect(isUsersPly(BLACK, 1)).toBe(true);
    expect(isUsersPly(BLACK, 3)).toBe(true);
  });
});

describe('expectedAt', () => {
  it('asks for the line move away from the decision', () => {
    expect(expectedAt(WHITE, 0)).toBe('e4');
  });

  it('asks for the REPLACEMENT at the decision, not the habit', () => {
    expect(decisionPly(WHITE)).toBe(2);
    expect(expectedAt(WHITE, 2)).toBe('Nf3');
    expect(expectedAt(WHITE, 2)).not.toBe('c3');
  });

  it('asks for the habit when there is nothing better to play', () => {
    expect(expectedAt(NO_TARGET, 2)).toBe('c3');
  });

  it('never asks for a move that is not theirs', () => {
    expect(expectedAt(WHITE, 1)).toBeNull();
    expect(expectedAt(BLACK, 0)).toBeNull();
  });
});

describe('createSession', () => {
  it('opens on the decision, with the move not yet made', () => {
    const s = createSession(WHITE);
    expect(s.act).toBe('confront');
    // One ply BEFORE the flagged move: the position they keep reaching, with
    // the choice still open.
    expect(s.fen).toBe(fenAfter(WHITE, 2));
    expect(new Chess(s.fen).turn()).toBe('w');
  });
});

describe('CONFRONT', () => {
  it('records the habit when they play it, and moves on', () => {
    const s = submitMove(createSession(WHITE), WHITE, 'c3');
    expect(s.playedHabit).toBe(true);
    expect(s.confrontMove).toBe('c3');
    expect(s.act).toBe('learn');
  });

  it('does not pretend they erred when they played something else', () => {
    const s = submitMove(createSession(WHITE), WHITE, 'Nf3');
    expect(s.playedHabit).toBe(false);
    expect(s.confrontMove).toBe('Nf3');
    expect(s.act).toBe('learn');
  });

  it('never flashes red at the move they always play', () => {
    // This act exists to replace an accusation with an observation. A red ring
    // on their own habit puts the accusation back.
    const s = submitMove(createSession(WHITE), WHITE, 'c3');
    expect(s.feedback).toBe('none');
  });

  it('ignores an illegal attempt rather than recording it', () => {
    // Kd2, not Qh5: after 1.e4 the e2 square is empty, so Qh5 and Ke2 are both
    // legal here. An "illegal" fixture that is actually legal tests the
    // opposite of what it claims.
    const start = createSession(WHITE);
    expect(submitMove(start, WHITE, 'Kd2')).toBe(start);
  });
});

describe('reaches', () => {
  const start = new Chess().fen();

  it('accepts the move it asked for', () => {
    expect(reaches(start, 'e4', 'e4')).toBe(true);
  });

  it('rejects a different move', () => {
    expect(reaches(start, 'd4', 'e4')).toBe(false);
  });

  it('reports an illegal attempt as no answer at all', () => {
    // Distinct from "wrong": an illegal drag must not cost a drill streak.
    expect(reaches(start, 'Kd2', 'e4')).toBeNull();
  });

  it('grades by position, so two spellings of one move both pass', () => {
    // Compared by resulting POSITION, never by string. Grading a legitimate
    // spelling as wrong is the fastest way for a trainer to lose trust.
    const board = new Chess();
    for (const m of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']) board.move(m);
    const fen = board.fen();
    expect(reaches(fen, 'a6', 'a7a6')).toBe(true);
  });
});

describe('DRILL', () => {
  it('plays the opponent replies so only their own moves are asked for', () => {
    const run = startRun(WHITE);
    expect(run.ply).toBe(0);

    const afterE4 = submitMove(run, WHITE, 'e4');
    // c5 is theirs, not a question: the drill should already be at the decision.
    expect(afterE4.ply).toBe(2);
    expect(afterE4.fen).toBe(fenAfter(WHITE, 2));
  });

  it('starts Black past the opponent first move', () => {
    const run = startRun(BLACK);
    expect(run.ply).toBe(1);
    expect(new Chess(run.fen).turn()).toBe('b');
  });

  it('marks a wrong move without advancing', () => {
    const at = submitMove(startRun(WHITE), WHITE, 'e4');
    const missed = submitMove(at, WHITE, 'c3'); // the habit, which is the error
    expect(missed.feedback).toBe('wrong');
    expect(missed.lastWrong).toBe('c3');
    expect(missed.ply).toBe(at.ply);
    expect(missed.runSpoiled).toBe(true);
  });

  it('does not spoil a run for an illegal drag', () => {
    const at = submitMove(startRun(WHITE), WHITE, 'e4');
    expect(submitMove(at, WHITE, 'Kd2')).toBe(at);
  });

  it('banks a clean run', () => {
    const after = cleanRun(startRun(WHITE), WHITE);
    expect(after.streak).toBe(1);
    expect(after.runs).toBe(1);
    expect(after.act).toBe('drill');
  });

  it('resets the streak when a run was spoiled', () => {
    let s = cleanRun(startRun(WHITE), WHITE);
    expect(s.streak).toBe(1);

    // Second run: miss once, then finish it.
    s = submitMove(s, WHITE, 'e4');
    s = submitMove(s, WHITE, 'c3');
    expect(s.runSpoiled).toBe(true);
    s = submitMove(s, WHITE, 'Nf3');

    // Completed, but not clean: a miss has to cost the streak or the three-run
    // bar means nothing.
    expect(s.streak).toBe(0);
    expect(s.runs).toBe(2);
  });

  it('finishes after three clean runs', () => {
    let s = startRun(WHITE);
    for (let i = 0; i < DRILL_TARGET; i++) s = cleanRun(s, WHITE);
    expect(s.act).toBe('done');
    expect(s.streak).toBe(DRILL_TARGET);
  });

  it('accepts the replacement and rejects the habit at the decision', () => {
    const at = submitMove(startRun(WHITE), WHITE, 'e4');
    expect(submitMove(at, WHITE, 'Nf3').feedback).toBe('correct');
    expect(submitMove(at, WHITE, 'c3').feedback).toBe('wrong');
  });
});

describe('advance', () => {
  it('goes from LEARN into the drill', () => {
    const learn = submitMove(createSession(WHITE), WHITE, 'c3');
    expect(advance(learn, WHITE).act).toBe('drill');
  });

  it('ends the session when there is nothing better to drill', () => {
    // Drilling the move they already play would be busywork dressed as
    // training, and it would imply a correction we never found.
    const learn = submitMove(createSession(NO_TARGET), NO_TARGET, 'c3');
    expect(advance(learn, NO_TARGET).act).toBe('done');
  });
});

describe('steps', () => {
  it('shows three rows when there is something to drill', () => {
    const s = createSession(WHITE);
    const rows = steps(s, WHITE);
    expect(rows.map(r => r.act)).toEqual(['confront', 'learn', 'drill']);
    expect(rows[0].status).toBe('current');
    expect(rows[1].status).toBe('todo');
  });

  it('shows two rows when there is not', () => {
    expect(steps(createSession(NO_TARGET), NO_TARGET).map(r => r.act)).toEqual([
      'confront',
      'learn',
    ]);
  });

  it('marks everything done at the end', () => {
    let s = startRun(WHITE);
    for (let i = 0; i < DRILL_TARGET; i++) s = cleanRun(s, WHITE);
    expect(steps(s, WHITE).every(r => r.status === 'done')).toBe(true);
  });
});
