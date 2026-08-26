// The sentences, tested as sentences.
//
// This panel makes a claim about a real person's opening in their own game.
// The failures worth guarding are not crashes — they are two different facts
// wearing each other's words, and a green suite would never notice.

import { describe, expect, it } from 'vitest';
import { inMoves, renderBookExit, RANGE } from '../copy';
import type { BookExitResponse } from '@/pages/api/book-exit';
import type { BookExit, BookExitOutcome } from '../bookExit';

const corpus = {
  band: 'improving',
  source: 'Lichess rated blitz and rapid, 2025-11',
  games: 232933,
  maxPly: 14,
  minGames: 10,
  minShare: 0.02,
};

const state = (outcome: BookExitOutcome, over: Partial<BookExit> = {}): BookExitResponse => ({
  band: 'improving',
  corpus,
  exit: {
    outcome,
    ply: 6,
    moveNumber: 4,
    san: 'b4',
    common: [{ san: 'c3', perMille: 640 }],
    depth: 6,
    transposes: false,
    ...over,
  },
});

const words = (state: BookExitResponse): string => {
  const r = renderBookExit(state);
  return r ? [r.label, r.headline, r.detail, r.disclaimer].filter(Boolean).join(' ') : '';
};

describe('units', () => {
  it('never prints a ply', () => {
    // levels.ts said "moves" in its copy over a number that was PLIES for a
    // year, and every band showed half of what it promised. The units bug is
    // invisible to a type checker and to every test that does not read the
    // words, so this reads the words.
    for (const outcome of ['left', 'opponent-left', 'thin', 'in-book'] as const) {
      expect(words(state(outcome)), outcome).not.toMatch(/\bpl(y|ies)\b/i);
    }
    expect(words({ band: null, corpus: null, exit: null })).not.toMatch(/\bpl(y|ies)\b/i);
  });

  it('turns half-moves into moves the way a player counts them', () => {
    expect(inMoves(0)).toMatch(/first move/);
    expect(inMoves(2)).toMatch(/the first move/);
    expect(inMoves(6)).toMatch(/first 3 moves/);
    expect(inMoves(7)).toMatch(/first 3 moves/);
    expect(inMoves(14)).toMatch(/first 7 moves/);
  });

  it('says the move number the reader would say', () => {
    expect(words(state('left', { moveNumber: 7 }))).toMatch(/Move 7/);
  });
});

describe('the outcomes stay apart', () => {
  it('only "left" says the reader played the move', () => {
    const headline = (o: BookExitOutcome) => renderBookExit(state(o))?.headline ?? '';
    expect(headline('left')).toMatch(/you played b4/);
    for (const o of ['opponent-left', 'thin', 'in-book'] as const) {
      expect(headline(o), o).not.toMatch(/you played b4/);
    }
  });

  it('says "no data", not "you left", when the corpus ran out', () => {
    const r = renderBookExit(state('thin'))!;
    expect(r.headline).toMatch(/no data/i);
    // And it says whose fault that is, because a reader will assume it is
    // theirs unless told otherwise.
    expect(r.detail).toMatch(/not a comment on how you played/i);
    expect(r.moves).toEqual([]);
  });

  it('attributes an opponent’s departure to the opponent', () => {
    expect(renderBookExit(state('opponent-left'))!.headline).toMatch(/Your opponent/);
  });

  it('renders nothing at all for a game it could not read', () => {
    expect(renderBookExit(state('unreadable'))).toBeNull();
  });

  it('renders nothing when the band has no book, rather than an empty card', () => {
    // A reader who sees the panel on one game and not the next reads the
    // absence as an answer; an EMPTY card is a louder version of the same
    // mistake.
    expect(renderBookExit({ band: 'improving', corpus: null, exit: null })).toBeNull();
  });
});

describe('what it will not claim', () => {
  it('never calls the move a mistake', () => {
    for (const outcome of ['left', 'opponent-left', 'thin', 'in-book'] as const) {
      // The only permitted use of the word is the denial. Strip it and the
      // vocabulary of blame must be gone entirely.
      const w = words(state(outcome)).replace(/not a mistake/gi, '');
      expect(w, outcome).not.toMatch(/mistake|blunder|inaccura|error|bad move|should have/i);
    }
    // And where a departure IS reported, it says so explicitly.
    expect(words(state('left'))).toMatch(/not a mistake/i);
  });

  it('never states a share it does not have', () => {
    // The book only stores moves at or above its floor, so a move that is not
    // in it was played by SOMETHING under 2% — which could be 1.9% or zero.
    // Printing a number there would be inventing one.
    const w = words(state('left'));
    expect(w).toMatch(/Fewer than 1 in 50/);
    expect(w).not.toMatch(/\b0%|\b0 in \b/);
  });

  it('asks for a rating instead of guessing a band', () => {
    const r = renderBookExit({ band: null, corpus: null, exit: null })!;
    expect(r.headline).toMatch(/Add your rating/);
    // It must not name a band it does not have.
    for (const range of Object.values(RANGE)) {
      expect(`${r.headline} ${r.detail}`).not.toContain(range);
    }
  });

  it('says the book has a floor rather than implying it saw the whole game', () => {
    const r = renderBookExit(state('in-book', { depth: 14 }))!;
    expect(r.detail).toMatch(/stops at move 7/);
  });

  it('calls a transposition a move order, not a departure', () => {
    const r = renderBookExit(state('left', { transposes: true }))!;
    expect(r.detail).toMatch(/move order rather than a departure/);
    // The control: the same outcome without the transposition must not.
    expect(renderBookExit(state('left'))!.detail).not.toMatch(/move order/);
  });
});
