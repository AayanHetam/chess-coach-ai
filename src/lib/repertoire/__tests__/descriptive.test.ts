// Descriptive notation, converted by matching against legal moves.
//
// Every chess book written before about 1975 uses it, so nothing in the
// public-domain corpus is readable until this works. The failure that matters
// is not a crash: it is a token that resolves to a LEGAL but WRONG move, which
// desynchronises the rest of the line and attaches a book's prose to a position
// the book was not discussing.

import { describe, expect, it } from 'vitest';
// Plain .mjs, shared with the build script so there is ONE converter rather
// than a copy of it in a script that would drift out of step.
import { convertLine, normalise, playDescriptive, relativeRank, spellings, tokenise } from '../../../../scripts/openings/lib/descriptive.mjs';
import { Chess } from 'chess.js';

const play = (text: string) => convertLine(tokenise(text)).sans;

describe('reading the three notations these books use', () => {
  it('reads compact descriptive (Edward Lasker, 1915)', () => {
    expect(play('1. P-K4, P-K4; 2. Kt-KB3, Kt-QB3; 3. B-Kt5')).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
  });

  it('reads spaced descriptive (Capablanca, 1921)', () => {
    expect(play('1. P - K 4  P - K 3  2. P - Q 4  P - Q 4  3. Kt - Q B 3')).toEqual([
      'e4', 'e6', 'd4', 'd5', 'Nc3',
    ]);
  });

  it('reads the hybrid form, where the destination is already algebraic', () => {
    expect(play('(1) P-d4  P-d5  (2) Kt-f3  Kt-f6')).toEqual(['d4', 'd5', 'Nf3', 'Nf6']);
  });

  it('reads captures, which name pieces rather than squares', () => {
    expect(play('1. P-K4, P-QB4; 2. Kt-KB3, P-Q3; 3. P-Q4, PxP; 4. KtxP')).toEqual([
      'e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4',
    ]);
  });
});

describe('the relative rank, which is what makes descriptive descriptive', () => {
  it('counts from the mover own side', () => {
    // The same square is K4 for White and K5 for Black. Getting this backwards
    // produces legal moves in the wrong half of the board.
    expect(relativeRank('e4', 'w')).toBe(4);
    expect(relativeRank('e4', 'b')).toBe(5);
  });

  it('reads P-K4 as e4 for White and e5 for Black', () => {
    expect(play('1. P-K4, P-K4')).toEqual(['e4', 'e5']);
  });
});

describe('ambiguity', () => {
  it('stops rather than guessing when two legal moves share a description', () => {
    // Knights on b1 and d1 can BOTH reach c3, so "Kt-QB3" names two legal
    // moves. Picking either would attach a book's prose to a position the book
    // was not discussing, and the rest of the line would be wrong too.
    const board = new Chess('4k3/8/8/8/8/8/8/1N1NK3 w - - 0 1');
    const both = board.moves({ verbose: true }).filter(m => m.to === 'c3');
    expect(both).toHaveLength(2);
    expect(playDescriptive(board, 'Kt-QB3')).toBeNull();
    // And nothing was played.
    expect(board.fen()).toBe('4k3/8/8/8/8/8/8/1N1NK3 w - - 0 1');
  });

  it('returns what it managed and stops at the first token it cannot resolve', () => {
    // "B-K9" is shaped like a move and names no square, so it tokenises and
    // then matches nothing. A partial line is still useful; guessing onward is
    // not. (Junk that does not even tokenise, like "Z-Z9", is skipped rather
    // than treated as a stop, which is why this uses a well-formed token.)
    const out = convertLine(tokenise('1. P-K4, P-K4; 2. B-K9, Kt-QB3'));
    expect(out.sans).toEqual(['e4', 'e5']);
    expect(out.converted).toBeLessThan(out.offered);
  });

  it('never produces an illegal position', () => {
    const out = convertLine(tokenise('1. P-Q4, Kt-KB3; 2. P-QB4, P-K3; 3. Kt-QB3, B-Kt5'));
    expect(() => new Chess(out.fen)).not.toThrow();
    expect(out.sans.length).toBeGreaterThanOrEqual(5);
  });
});

describe('spellings', () => {
  it('offers every abbreviation a book of the period might use', () => {
    const board = new Chess();
    board.move('e4');
    board.move('e5');
    board.move('Nf3');
    board.move('Nc6');
    const bb5 = board.moves({ verbose: true }).find(m => m.san === 'Bb5')!;
    const said = spellings(bb5, 'w');
    // Same move, four ways, all of which appear in these books.
    for (const form of ['B-QKT5', 'B-KT5', 'B-QN5', 'B-N5']) expect(said.has(form)).toBe(true);
  });

  it('normalises away the decoration books add', () => {
    expect(normalise('Kt-KB3!')).toBe('KT-KB3');
    expect(normalise('P - K 4')).toBe('P-K4');
  });
});
