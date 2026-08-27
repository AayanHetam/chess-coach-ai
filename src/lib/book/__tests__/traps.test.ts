// Traps, and the three ways a list of them could lie.
//
//   1. By being wrong about chess. Every shipped line is replayed on a real
//      board and the trap move must be legal in the position it claims.
//   2. By attributing the mistake to the wrong player. A Caro-Kann blunder is
//      a warning to one side and an opportunity to the other, and merging them
//      tells half the readers the opposite of the truth.
//   3. By presenting noise as a finding. The threshold and the expected
//      false-positive count travel with the data, and are asserted here.

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { loadTraps, trapsForCourse, TRAP_BANDS, resetTrapCache, MAX_TRAPS_SHOWN } from '../traps';
import { BANDS } from '@/lib/repertoire/levels';
import type { Trap } from '@/types/traps';

const DATA = path.join(process.cwd(), 'src/data');
const shipped = () =>
  fs
    .readdirSync(DATA)
    .map(f => /^traps\.(.+)\.json$/.exec(f)?.[1])
    .filter((b): b is string => Boolean(b))
    .sort();

describe('the shipped set and the loadable set', () => {
  it('are the same set, in both directions', () => {
    expect(shipped()).toEqual([...TRAP_BANDS].sort());
  });

  it('covers every band a reader can be put in', () => {
    // A band with no file answers "we found nothing" for a band nobody looked
    // at, and the screen cannot tell those apart from the outside.
    expect([...TRAP_BANDS].sort()).toEqual(BANDS.map(b => b.id).sort());
  });

  it('loads each one, and each says which scale it was cut on', () => {
    resetTrapCache();
    for (const band of TRAP_BANDS) {
      const file = loadTraps(band);
      expect(file, band).not.toBeNull();
      expect(file!.meta.band).toBe(band);
      expect(file!.meta.bandScale, band).toMatch(/^common \(chess\.com\)/);
    }
  });

  it('refuses a band it does not have rather than substituting one', () => {
    expect(loadTraps('nonsense')).toBeNull();
    expect(loadTraps(null)).toBeNull();
  });
});

describe('the chess is real', () => {
  const all: Array<[string, Trap]> = TRAP_BANDS.flatMap(band =>
    loadTraps(band)!.traps.map(t => [band, t] as [string, Trap])
  );

  it('ships at least one trap to test', () => {
    // The control for everything below. A file of zero traps passes every
    // "no trap is wrong" test trivially.
    expect(all.length).toBeGreaterThan(0);
  });

  it('reaches every claimed position by a legal line', () => {
    for (const [band, trap] of all) {
      const board = new Chess();
      for (const san of trap.line) {
        expect(() => board.move(san), `${band}: ${trap.line.join(' ')}`).not.toThrow();
      }
      // And the position is the one the trap says it is, keyed the way the
      // corpus keys it.
      expect(board.fen().split(' ').slice(0, 4).join(' '), `${band}: ${trap.san}`).toBe(trap.fen);
    }
  });

  it('names a move that is legal in the position it is claimed from', () => {
    for (const [band, trap] of all) {
      const board = new Chess();
      trap.line.forEach(san => board.move(san));
      expect(board.moves(), `${band}: ${trap.san} after ${trap.line.join(' ')}`).toContain(trap.san);
    }
  });

  it('attributes the move to whoever is actually on move', () => {
    for (const [band, trap] of all) {
      const board = new Chess();
      trap.line.forEach(san => board.move(san));
      expect(board.turn() === 'w' ? 'white' : 'black', `${band}: ${trap.san}`).toBe(trap.side);
    }
  });

  it('offers alternatives that are also legal there', () => {
    for (const [band, trap] of all) {
      const board = new Chess();
      trap.line.forEach(san => board.move(san));
      const legal = board.moves();
      for (const alt of trap.instead) {
        expect(legal, `${band}: ${alt.san}`).toContain(alt.san);
        // And never the trap move dressed as its own cure.
        expect(alt.san).not.toBe(trap.san);
      }
    }
  });
});

describe('the numbers say what they mean', () => {
  it('keeps only what clears the threshold the file states', () => {
    for (const band of TRAP_BANDS) {
      const file = loadTraps(band)!;
      for (const trap of file.traps) {
        expect(trap.z, `${band}: ${trap.san}`).toBeGreaterThanOrEqual(file.meta.z);
        expect(trap.baseline - trap.score, `${band}: ${trap.san}`).toBeGreaterThanOrEqual(
          file.meta.minEffect - 1e-9
        );
        expect(trap.games).toBeGreaterThanOrEqual(file.meta.minMoveGames);
        expect(trap.share).toBeGreaterThanOrEqual(file.meta.minShare);
      }
    }
  });

  it('carries its own noise floor', () => {
    // A count of traps with no expected-false-positive figure beside it
    // invites the reader to assume the floor is zero. The first version of
    // this scan had no floor and produced a beautiful, entirely spurious
    // gradient across the five bands.
    for (const band of TRAP_BANDS) {
      const file = loadTraps(band)!;
      expect(file.meta.tests, band).toBeGreaterThan(0);
      expect(Number.isFinite(file.meta.expectedFalsePositives), band).toBe(true);
      expect(file.meta.traps).toBe(file.traps.length);
      // The property that actually matters is the RATIO, not an absolute
      // ceiling. This asserted `< 1` until `strong` was rebuilt from 1.9M
      // games: 40,073 tests carry 1.34 expected false positives, which is a
      // bigger number and a far better result, because it sits under 55 real
      // findings. An absolute cap would have failed the good corpus and passed
      // the underpowered one.
      if (file.traps.length > 0) {
        expect(file.meta.expectedFalsePositives / file.traps.length, band).toBeLessThan(0.1);
      }
    }
  });

  it('says no engine was involved, because none was', () => {
    for (const band of TRAP_BANDS) {
      expect(loadTraps(band)!.meta.signal).toMatch(/no engine/i);
    }
  });

  it('finds the traps every beginner book warns about', () => {
    // Named, famous lines, found with no prior knowledge of them: the corpus
    // was searched for "played often and loses" and these fell out. If this
    // ever goes empty, the signal has broken even if the file is still full.
    const lines = loadTraps('beginner')!.traps.map(t => `${t.line.join(' ')}|${t.san}`);
    // Blackburne Shilling: 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nd4 and White grabs on e5.
    expect(lines).toContain('e4 e5 Nf3 Nc6 Bc4 Nd4|Nxe5');
    // Fried Liver: 3.Bc4 Nf6 4.Ng5 d5 5.exd5 and Black recaptures with the knight.
    expect(lines).toContain('e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5|Nxd5');
  });
});

describe('whose mistake it is', () => {
  it('splits the reader’s traps from their opponent’s, and never merges them', () => {
    const white = trapsForCourse('beginner', ['e4'], 'white')!;
    const black = trapsForCourse('beginner', ['e4'], 'black')!;
    // Same corpus, same root, opposite reader: the two lists swap.
    expect(white.yours.map(t => t.san).sort()).toEqual(black.theirs.map(t => t.san).sort());
    expect(white.theirs.map(t => t.san).sort()).toEqual(black.yours.map(t => t.san).sort());
    // And no trap is ever in both halves.
    for (const t of white.yours) expect(white.theirs).not.toContain(t);
  });

  it('only returns traps inside the course it was asked about', () => {
    const italian = trapsForCourse('beginner', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], 'white')!;
    for (const trap of [...italian.yours, ...italian.theirs]) {
      expect(trap.line.slice(0, 5)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
    }
    expect(italian.yours.length + italian.theirs.length).toBeGreaterThan(0);
  });

  it('shows the costliest, not the most statistically certain', () => {
    // Cost is games x score lost: what the mistake actually takes off players
    // at this level. Ranking by `z` would put certainty first, which answers a
    // question about our confidence rather than about their results.
    const t = trapsForCourse('new', ['e4'], 'white')!;
    const cost = (x: { games: number; baseline: number; score: number }) =>
      x.games * (x.baseline - x.score);
    const shown = t.yours.map(cost);
    expect(shown).toEqual([...shown].sort((a, b) => b - a));
    // And the top one really is the costliest in the whole set, not merely the
    // costliest of an arbitrary first five.
    const all = loadTraps('new')!
      .traps.filter(x => x.side === 'white' && x.line[0] === 'e4')
      .map(cost);
    expect(shown[0]).toBe(Math.max(...all));
  });

  it('caps what it shows and reports the total, so nothing is silently cut', () => {
    // A truncated list presented as a complete one is a claim about the
    // opening. `1.e4` carries hundreds of these once the corpus is the full
    // month, and the page has to say which few it picked.
    const t = trapsForCourse('new', ['e4'], 'white')!;
    expect(t.yours.length).toBe(MAX_TRAPS_SHOWN);
    expect(t.totalYours).toBeGreaterThan(MAX_TRAPS_SHOWN);
  });

  it('does not claim a cap it did not apply', () => {
    // The control. A course with few traps must report total === shown, or the
    // screen renders "the 2 costliest of 2".
    const t = trapsForCourse('improving', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], 'white')!;
    expect(t.totalYours).toBe(t.yours.length);
    expect(t.totalTheirs).toBe(t.theirs.length);
  });

  it('returns an empty result for a course with none, and null for a band with no file', () => {
    // The distinction the screen renders differently. "We looked and found
    // nothing" is a fact about the opening; "we did not look" is a fact about
    // us, and a reader takes silence for the first.
    const none = trapsForCourse('beginner', ['g4'], 'white');
    expect(none).not.toBeNull();
    expect(none!.yours).toEqual([]);
    expect(trapsForCourse('nonsense', ['e4'], 'white')).toBeNull();
    expect(trapsForCourse(null, ['e4'], 'white')).toBeNull();
  });
});
