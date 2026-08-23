// Shares must divide by the games that ARRIVED at a position, not by the sum
// of whatever rows survived pruning.
//
// The two are the same number today, because neither builder drops a row — both
// prune whole positions. They stop being the same the moment a deeper tree uses
// a per-position move cap as a size lever, and at that point dividing by the
// row sum turns a 4% branch into a 45% one with every downstream number still
// rendering confidently. These tests pin the behaviour before that change, not
// after it.

import { describe, expect, it } from 'vitest';
// .mjs build scripts, deliberately shared with the builder so the tests run the
// same code the corpus is built with.
import { repliesAt, replyCoverage } from '../../../../scripts/openings/lib/coverage.mjs';
import { parsePlyTiers, truncateMovetext } from '../../../../scripts/process-master-pgn.mjs';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const KEY = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

/** v2: a bare row array. Every tree built so far is this shape. */
const v2 = (rows: unknown[]) => ({ positions: { [KEY]: rows } });
/** v3: rows plus the true arrival count, for when something capped the list. */
const v3 = (t: number, rows: unknown[]) => ({ positions: { [KEY]: { t, m: rows } } });

describe('repliesAt', () => {
  it('reads a v2 tree exactly as before', () => {
    const replies = repliesAt(v2([['e4', 60, 30, 10], ['d4', 40, 20, 10]]), START);
    expect(replies.map((r: { san: string }) => r.san)).toEqual(['e4', 'd4']);
    expect(replies[0].share).toBeCloseTo(0.6, 6);
    expect(replies[1].share).toBeCloseTo(0.4, 6);
  });

  it('gives a v3 tree the same answer when nothing was dropped', () => {
    const rows = [['e4', 60, 30, 10], ['d4', 40, 20, 10]];
    const old = repliesAt(v2(rows), START);
    const now = repliesAt(v3(100, rows), START);
    expect(now).toEqual(old);
  });

  it('divides by arrivals, not by the surviving rows', () => {
    // 1000 games arrived; only the top two rows were kept.
    const replies = repliesAt(v3(1000, [['e4', 60, 30, 10], ['d4', 40, 20, 10]]), START);
    // Dividing by the row sum would call e4 60% of this position. It is 6%.
    expect(replies[0].share).toBeCloseTo(0.06, 6);
    expect(replies[1].share).toBeCloseTo(0.04, 6);
  });

  it('reports how much of the position the rows account for', () => {
    expect(repliesAt(v3(1000, [['e4', 60, 30, 10]]), START)[0].coverage).toBeCloseTo(0.06, 6);
    expect(repliesAt(v2([['e4', 60, 30, 10]]), START)[0].coverage).toBeCloseTo(1, 6);
  });

  it('ignores an arrival count below the row sum rather than making shares exceed 1', () => {
    // A `t` under the rows is corrupt. Trusting it would put e4 at 200%.
    const replies = repliesAt(v3(50, [['e4', 60, 30, 10], ['d4', 40, 20, 10]]), START);
    expect(replies[0].share).toBeCloseTo(0.6, 6);
    expect(replies.every((r: { share: number }) => r.share <= 1)).toBe(true);
  });

  it('says nothing about a position it does not hold', () => {
    expect(repliesAt({ positions: {} }, START)).toEqual([]);
    expect(repliesAt(v2([]), START)).toEqual([]);
    expect(repliesAt(v3(10, []), START)).toEqual([]);
  });
});

describe('replyCoverage', () => {
  it('is the share a truncated list accounts for', () => {
    const all = repliesAt(v2([['e4', 60, 0, 0], ['d4', 30, 0, 0], ['c4', 10, 0, 0]]), START);
    expect(replyCoverage(all)).toBeCloseTo(1, 6);
    expect(replyCoverage(all.slice(0, 2))).toBeCloseTo(0.9, 6);
  });

  it('is zero for an empty list rather than throwing', () => {
    expect(replyCoverage([])).toBe(0);
  });
});

describe('truncateMovetext', () => {
  const GAME = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 O-O';

  it('keeps enough moves to satisfy the ply budget, with slack', () => {
    // 4 plies wanted; cut at move 4 leaves three full moves = six plies.
    const cut = truncateMovetext(GAME, 4);
    expect(cut).toContain('3. Bb5');
    expect(cut).not.toContain('5. O-O');
  });

  it('leaves a game shorter than the budget completely alone', () => {
    expect(truncateMovetext('1. e4 e5', 14)).toBe('1. e4 e5');
  });

  it('cuts on the move number, so a comment cannot smuggle moves past it', () => {
    const withEvals =
      '1. e4 { [%eval 0.24] } e5 { [%eval 0.18] } 2. Nf3 { [%eval 0.2] } Nc6 3. Bb5 a6 4. Ba4';
    const cut = truncateMovetext(withEvals, 4);
    expect(cut).toContain('3. Bb5');
    expect(cut).not.toContain('4. Ba4');
  });

  it('does not lose moves when the marker is absent', () => {
    // No "9." in the text, so nothing is cut rather than everything.
    const short = '1. d4 d5 2. c4';
    expect(truncateMovetext(short, 14)).toBe(short);
  });

  // The property that actually matters. The exact cut point is free to move —
  // ceil vs floor, two moves of slack or three — but truncation must never cost
  // the aggregator a ply it was asked to record, at any budget. Pinning the
  // arithmetic instead of the guarantee let a floor/ceil swap pass unnoticed.
  it.each([1, 2, 3, 4, 6, 8, 12, 13, 14, 20, 24])(
    'still yields %i plies of a long game',
    (maxPlies) => {
      const long = Array.from({ length: 40 }, (_, i) => `${i + 1}. Nf3 Nf6`).join(' ');
      const plies = truncateMovetext(long, maxPlies)
        .replace(/\d+\.+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      expect(plies.length).toBeGreaterThanOrEqual(maxPlies);
    }
  );
});

describe('parsePlyTiers', () => {
  it('raises the threshold with depth', () => {
    const at = parsePlyTiers('0:25,15:50,20:100', 3);
    expect([at(0), at(14), at(15), at(19), at(20), at(24)]).toEqual([25, 25, 50, 50, 100, 100]);
  });

  it('falls back to the flat threshold when no tiers are given', () => {
    expect(parsePlyTiers(undefined, 7)(30)).toBe(7);
    expect(parsePlyTiers('', 7)(30)).toBe(7);
  });

  it('ignores junk rather than silently thresholding at NaN', () => {
    // A NaN threshold compares false against every count, which would keep
    // every position in the tree and look like the flag simply did nothing.
    expect(parsePlyTiers('garbage', 5)(10)).toBe(5);
    expect(parsePlyTiers('0:25,oops,20:100', 5)(20)).toBe(100);
  });

  it('is order-independent in the spec', () => {
    const at = parsePlyTiers('20:100,0:25,15:50', 3);
    expect([at(0), at(16), at(22)]).toEqual([25, 50, 100]);
  });
});
