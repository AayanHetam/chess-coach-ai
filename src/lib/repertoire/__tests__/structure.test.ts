// Naming a pawn structure is a chess claim, so every case here is a REAL
// position reached by real moves rather than a hand-typed skeleton. A fixture
// built by writing down the pawns I expected would test my expectation, not the
// classifier.
//
// The failure that matters is a confident wrong label. Telling a Dragon player
// they have an isolated queen's pawn hands them the wrong plan for the whole
// middlegame, and it reads exactly as authoritative as a right answer.

import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  classify,
  filesOf,
  isSymmetrical,
  skeletonOf,
  STRUCTURES,
} from '@/lib/repertoire/structure';

/** Play a line out and hand back the position it reaches. */
function after(sans: string[]): string {
  const board = new Chess();
  for (const san of sans) {
    const move = board.move(san);
    if (!move) throw new Error(`illegal: ${san} in ${board.fen()}`);
  }
  return board.fen();
}
const nameAfter = (sans: string[]) => classify(skeletonOf(after(sans)))?.id ?? null;

describe('skeletonOf', () => {
  it('reads the pawns off the start position', () => {
    const sk = skeletonOf(new Chess().fen());
    expect(sk.white).toHaveLength(8);
    expect(sk.black).toHaveLength(8);
    expect(sk.white).toContain('e2');
    expect(sk.black).toContain('e7');
  });

  it('follows a capture', () => {
    // 1.e4 d5 2.exd5 — White's e-pawn is now on d5 and Black has no d-pawn.
    const sk = skeletonOf(after(['e4', 'd5', 'exd5']));
    expect(sk.white).toContain('d5');
    expect(filesOf(sk.white).has('e')).toBe(false);
    expect(filesOf(sk.black).has('d')).toBe(false);
  });

  it('ignores every piece, which is the point', () => {
    const sk = skeletonOf('4k3/8/8/8/3P4/8/8/4K3 w - - 0 1');
    expect(sk.white).toEqual(['d4']);
    expect(sk.black).toEqual([]);
  });

  it('does not throw on a malformed board', () => {
    expect(() => skeletonOf('nonsense')).not.toThrow();
    expect(skeletonOf('nonsense')).toEqual({ white: [], black: [] });
  });
});

describe('classify', () => {
  it('names the Carlsbad, including by an English move order', () => {
    // The position this whole feature was built for: no book names it, and it
    // is a Queen's Gambit Declined Exchange.
    expect(nameAfter(['c4', 'e6', 'Nc3', 'd5', 'd4', 'Nf6', 'cxd5', 'exd5', 'Bg5', 'c6'])).toBe('carlsbad');
    // And the ordinary route to the same structure.
    expect(nameAfter(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'cxd5', 'exd5', 'Bg5', 'c6'])).toBe('carlsbad');
  });

  it('names an isolated queen\'s pawn, on the side that actually has one', () => {
    // Panov-Botvinnik. Black recaptures on d5 with the KNIGHT, so White is left
    // with the isolani on d4 and the open lines that pay for it.
    expect(
      nameAfter(['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'c4', 'Nf6', 'Nc3', 'Nc6', 'Nf3', 'Bg4', 'cxd5', 'Nxd5'])
    ).toBe('iqp-white');
  });

  it('does not call two blocked d-pawns an isolani', () => {
    // 6...exd5 instead: now BOTH d-pawns are isolated and they block each
    // other. Neither can advance, neither file is open, and the plans for an
    // isolated queen's pawn are the opposite of what this position wants. The
    // honest answer is that it is not one of the named structures.
    const id = nameAfter(['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'c4', 'Nf6', 'Nc3', 'e6', 'cxd5', 'exd5']);
    expect(id).not.toBe('iqp-white');
    expect(id).not.toBe('iqp-black');
  });

  it('does NOT call a Dragon an isolated queen\'s pawn', () => {
    // The Dragon has a lone d6 pawn with no c- or e-pawn beside it, which a
    // naive isolani rule matches. It is a Sicilian, and the plans are nothing
    // alike. This test exists because the first version of the rule got it
    // wrong.
    const id = nameAfter(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6']);
    expect(id).not.toBe('iqp-black');
    expect(id).toBe('open-sicilian');
  });

  it('separates the Sicilian structures that share a skeleton', () => {
    const base = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3'];
    // ...e6 is the small centre; ...e5 leaves the hole on d5.
    expect(nameAfter([...base, 'e6'])).toBe('scheveningen');
    expect(nameAfter([...base, 'a6', 'Be2', 'e5'])).toBe('boleslavsky');
  });

  it('names the Maróczy bind ahead of the Sicilian it is', () => {
    // Accelerated Dragon: 5.c4 is the bind. It IS an Open Sicilian too, and the
    // more specific name is the useful one.
    expect(
      nameAfter(['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'g6', 'c4', 'Bg7'])
    ).toBe('maroczy');
  });

  it('names the locked French centre', () => {
    expect(nameAfter(['e4', 'e6', 'd4', 'd5', 'e5', 'c5'])).toBe('french-chain');
  });

  it('names the King\'s Indian chain', () => {
    expect(
      nameAfter(['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5', 'd5'])
    ).toBe('kid-chain');
  });

  it('names the Slav triangle', () => {
    expect(nameAfter(['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'e6'])).toBe('slav-triangle');
  });

  it('names a Stonewall', () => {
    expect(nameAfter(['d4', 'f5', 'g3', 'Nf6', 'Bg2', 'e6', 'Nf3', 'd5'])).toBe('stonewall-black');
  });

  it('says nothing rather than guessing at move two', () => {
    // Almost every early position is still fluid. A confident label here would
    // be a confident label on a position that does not have one yet.
    expect(nameAfter(['e4', 'e5'])).toBeNull();
    expect(nameAfter(['d4', 'Nf6', 'c4', 'e6'])).toBeNull();
    expect(classify(skeletonOf(new Chess().fen()))).toBeNull();
  });

  it('prefers the more specific structure when two rules could fire', () => {
    // A Carlsbad has c6 and d5, which is two thirds of the Slav triangle. It
    // has no e-pawn, and that is the difference that decides the plans.
    const carlsbad = skeletonOf(
      after(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'cxd5', 'exd5', 'Bg5', 'c6'])
    );
    expect(classify(carlsbad)?.id).toBe('carlsbad');
  });
});

describe('the structure table', () => {
  it('has a unique id, a plan for each side, and no empty prose', () => {
    const ids = STRUCTURES.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of STRUCTURES) {
      expect(s.name.length).toBeGreaterThan(2);
      expect(s.summary.length).toBeGreaterThan(30);
      expect(s.white.length).toBeGreaterThan(10);
      expect(s.black.length).toBeGreaterThan(10);
    }
  });
});

describe('isSymmetrical', () => {
  it('is true while nothing has been traded', () => {
    expect(isSymmetrical(skeletonOf(after(['e4', 'e5'])))).toBe(true);
    expect(isSymmetrical(skeletonOf(after(['e4', 'c5'])))).toBe(true);
  });

  it('is false once the files differ', () => {
    expect(isSymmetrical(skeletonOf(after(['e4', 'd5', 'exd5'])))).toBe(false);
  });
});
