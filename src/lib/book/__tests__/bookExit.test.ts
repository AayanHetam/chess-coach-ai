// Five answers, and none of them may print as another.
//
// This function says something about a real person's game, so the tests that
// matter are the ones that separate "you went off the beaten path" from "we
// have no data here" and from "your opponent went first". Any two of those
// collapsing into one is a false statement about the reader, not a bug they
// would ever see reported.

import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { bookExit, positionKey } from '../bookExit';
import type { OpeningBook } from '@/types/book';

/**
 * A book built from real positions rather than made-up keys.
 *
 * Hand-written keys would let the walk and the fixture agree on a FEN neither
 * chess.js nor the build script would ever produce.
 */
function bookOf(lines: Array<{ moves: string[]; alternatives?: Record<number, Array<[string, number]>> }>, maxPly = 14): OpeningBook {
  const book: OpeningBook['book'] = {};
  for (const { moves, alternatives } of lines) {
    const board = new Chess();
    moves.forEach((san, i) => {
      const key = positionKey(board.fen());
      const rows = alternatives?.[i] ?? [];
      const merged = [[san, 700] as [string, number], ...rows.filter(r => r[0] !== san)];
      book[key] = [...(book[key] ?? []), ...merged].filter(
        (r, idx, all) => all.findIndex(o => o[0] === r[0]) === idx
      );
      board.move(san);
    });
  }
  return {
    meta: {
      band: 'improving',
      bandScale: 'common (chess.com), converted from lichess',
      source: 'test',
      games: 1000,
      maxPly,
      corpusPositions: Object.keys(book).length,
      positions: Object.keys(book).length,
      minGames: 10,
      minShare: 0.02,
      generatedFrom: 'test',
      shares: 'per mille',
    },
    book,
  };
}

const ITALIAN = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6'];

describe('leaving the book', () => {
  const book = bookOf([{ moves: ITALIAN }]);

  it('names the move, and says it as a move number rather than a ply', () => {
    // Ply 6 is White's fourth move. A player counts moves; nobody counts plies.
    const exit = bookExit(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'], 'white', book);
    expect(exit.outcome).toBe('left');
    expect(exit.ply).toBe(6);
    expect(exit.moveNumber).toBe(4);
    expect(exit.san).toBe('b4');
  });

  it('says what the band plays there instead, with its share', () => {
    const exit = bookExit(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'], 'white', book);
    expect(exit.common[0]).toEqual({ san: 'c3', perMille: 700 });
  });

  it('blames the OPPONENT when it was their move', () => {
    // The reader is White; ply 5 is Black's. Reporting this as the reader
    // leaving book would tell them they went off theory in a position they
    // never had the move in.
    const exit = bookExit(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Qh4'], 'white', book);
    expect(exit.outcome).toBe('opponent-left');
    expect(exit.moveNumber).toBe(3);
  });

  it('reads the same game the other way round when the reader is Black', () => {
    // The control for the one above: identical moves, opposite reader, and the
    // outcome must swap. Without it, `outcome` could be hardcoded either way.
    const exit = bookExit(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Qh4'], 'black', book);
    expect(exit.outcome).toBe('left');
  });

  it('reports the first exit, not the deepest', () => {
    const exit = bookExit(['e4', 'e5', 'Nf3', 'Nc6', 'Na3', 'Bc5', 'c3'], 'white', book);
    expect(exit.ply).toBe(4);
    expect(exit.san).toBe('Na3');
  });
});

describe('the answers that are NOT an exit', () => {
  it('says "thin", not "left", when the corpus never described the position', () => {
    // A book that knows only 1.e4. After 1...e5 there is no measurement at all,
    // and calling that a book exit would tell a player they went off theory
    // for playing the most common reply in chess.
    const book = bookOf([{ moves: ['e4'] }]);
    const exit = bookExit(['e4', 'e5', 'Nf3'], 'white', book);
    expect(exit.outcome).toBe('thin');
    expect(exit.common).toEqual([]);
  });

  it('says nothing left the book when the game stays inside it', () => {
    const book = bookOf([{ moves: ITALIAN }]);
    const exit = bookExit(ITALIAN, 'white', book);
    expect(exit.outcome).toBe('in-book');
    expect(exit.ply).toBe(-1);
    expect(exit.san).toBeNull();
  });

  it('stops claiming anything past the depth the corpus reaches', () => {
    // The book is cut at four plies. A fifth move cannot have "left" it —
    // there was never anything there to leave. Reporting a book exit at the
    // corpus wall would turn a data boundary into a fact about the player.
    const book = bookOf([{ moves: ITALIAN }], 4);
    const exit = bookExit([...ITALIAN, 'd4'], 'white', book);
    expect(exit.outcome).toBe('in-book');
    expect(exit.depth).toBe(4);
  });

  it('refuses to read an illegal game rather than calling it theory', () => {
    const book = bookOf([{ moves: ITALIAN }]);
    const exit = bookExit(['e4', 'e5', 'Qxh8'], 'white', book);
    expect(exit.outcome).toBe('unreadable');
  });

  it('keeps all five outcomes distinct on the same fixture', () => {
    // The collapse this whole file exists to prevent, asserted directly.
    // 1.d4 is in book as an alternative and nothing after it is, which is what
    // makes a "thin" position reachable without deviating first.
    const book = bookOf([{ moves: ITALIAN, alternatives: { 0: [['d4', 250]] } }], 6);
    const outcomes = new Set([
      bookExit(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Qf6'], 'white', book).outcome,
      bookExit(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Qf6'], 'black', book).outcome,
      bookExit(['d4', 'd5'], 'white', book).outcome,
      bookExit(ITALIAN.slice(0, 6), 'white', book).outcome,
      bookExit(['e4', 'Qxh8'], 'white', book).outcome,
    ]);
    expect(outcomes).toEqual(new Set(['left', 'opponent-left', 'thin', 'in-book', 'unreadable']));
  });
});

describe('transpositions', () => {
  it('says so when a rare move rejoins a line the book knows', () => {
    // 1.Nf3 d5 2.d4 and 1.d4 d5 2.Nf3 are the same position. If 1.Nf3 is below
    // the book's floor, the move left the beaten path and the GAME did not,
    // and "you left theory" is true of one and false of the other.
    const book = bookOf([{ moves: ['d4', 'd5', 'Nf3', 'Nf6'] }, { moves: ['Nf3', 'd5', 'd4', 'Nf6'] }]);
    // Rebuild without the 1.Nf3 root entry, so the first move is off-book.
    delete book.book[positionKey(new Chess().fen())];
    book.book[positionKey(new Chess().fen())] = [['d4', 700]];
    const exit = bookExit(['Nf3', 'd5', 'd4'], 'white', book);
    expect(exit.outcome).toBe('left');
    expect(exit.transposes).toBe(true);
  });

  it('does not claim a transposition for a move that leaves for good', () => {
    // The control. Without it, `transposes` could be hardcoded true.
    const book = bookOf([{ moves: ITALIAN }]);
    const exit = bookExit(['a4'], 'white', book);
    expect(exit.transposes).toBe(false);
  });
});

describe('what the book stores versus what it shows', () => {
  it('counts a move as in book however far down the list it ranks', () => {
    // A display cap leaking into the membership test would call a move played
    // by 3% of the band an exit purely because six others are more popular.
    // That is a false accusation about a real person's game.
    const book = bookOf([
      {
        moves: ['e4'],
        alternatives: {
          0: [['d4', 200], ['c4', 40], ['Nf3', 30], ['b3', 20], ['g3', 20], ['f4', 20]],
        },
      },
    ]);
    expect(bookExit(['f4'], 'white', book).outcome).not.toBe('left');
  });

  it('shows only the top three, so a panel is readable', () => {
    const book = bookOf([
      {
        moves: ['e4'],
        alternatives: {
          0: [['d4', 200], ['c4', 40], ['Nf3', 30], ['b3', 20], ['g3', 20], ['f4', 20]],
        },
      },
    ]);
    expect(bookExit(['h4'], 'white', book).common).toHaveLength(3);
  });
});
