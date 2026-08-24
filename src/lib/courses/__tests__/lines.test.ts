// The graph is the right shape to store and the wrong shape to read. These are
// about the reading.

import { describe, expect, it } from 'vitest';
import { MAX_LINES_PER_CHAPTER, endWords, evalWords, lineNotes, linesOf, numbered } from '../lines';
import type { CourseNode } from '@/types/course';

const n = (o: Partial<CourseNode> & { p: number }): CourseNode => ({ w: 1, g: 10, ch: 0, end: null, ...o });

describe('linesOf', () => {
  const nodes: Record<string, CourseNode> = {
    A: n({ p: 2, us: 'Nf3', next: 'B', src: 'engine' }),
    B: n({ p: 3, them: [{ san: 'Nf6', share: 0.3, to: 'D' }, { san: 'Nc6', share: 0.7, to: 'C' }] }),
    C: n({ p: 4, us: 'Bb5', next: 'E', src: 'corpus-confirmed' }),
    E: n({ p: 5, end: 'depth', w: 0.7, ev: { cp: 25, d: 40 } }),
    D: n({ p: 4, end: 'wall', w: 0.3, ev: { cp: -10, d: 38 } }),
  };

  it('turns a chapter into variations, most likely first', () => {
    // The fixture lists the RARER reply first, so this fails if the sort goes.
    const { lines } = linesOf({ nodes }, 'A', ['e4', 'e5']);
    expect(lines).toHaveLength(2);
    expect(lines[0].moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(lines[0].weight).toBeCloseTo(0.7, 4);
    expect(lines[1].moves).toEqual(['e4', 'e5', 'Nf3', 'Nf6']);
  });

  it('carries why each line stopped, because the reasons differ', () => {
    const { lines } = linesOf({ nodes }, 'A', []);
    expect(lines.map(l => l.end).sort()).toEqual(['depth', 'wall']);
  });

  it('records where our moves came from, as an audit trail', () => {
    const { lines } = linesOf({ nodes }, 'A', []);
    expect(lines[0].sources.sort()).toEqual(['corpus-confirmed', 'engine']);
  });

  it('says how many lines it is NOT showing, rather than stopping quietly', () => {
    // A list that stops at 60 of 300 claims a completeness it does not have,
    // and nothing else on the page would contradict it.
    const wide: Record<string, CourseNode> = { R: n({ p: 1, them: [] }) };
    for (let i = 0; i < 80; i++) {
      const id = `L${i}`;
      wide[id] = n({ p: 2, end: 'depth', w: 1 / 80 });
      wide.R.them!.push({ san: `x${i}`, share: 1 / 80, to: id });
    }
    const res = linesOf({ nodes: wide }, 'R', []);
    expect(res.lines.length).toBe(MAX_LINES_PER_CHAPTER);
    expect(res.total).toBe(80);
    expect(res.capped).toBe(true);
  });

  it('is not marked capped when it shows everything', () => {
    const res = linesOf({ nodes }, 'A', []);
    expect(res.capped).toBe(false);
    expect(res.total).toBe(res.lines.length);
  });

  it('terminates on a transposition cycle instead of hanging', () => {
    const cyclic: Record<string, CourseNode> = {
      X: n({ p: 1, us: 'a3', next: 'Y' }),
      Y: n({ p: 2, us: 'h3', next: 'X' }),
    };
    expect(() => linesOf({ nodes: cyclic }, 'X', [])).not.toThrow();
    expect(linesOf({ nodes: cyclic }, 'X', []).lines.length).toBeGreaterThan(0);
  });
});

describe('numbered', () => {
  it('numbers from move one, and does not invent a black move', () => {
    expect(numbered(['e4', 'e5', 'Nf3'])).toBe('1.e4 e5 2.Nf3');
  });
});

describe('evalWords', () => {
  it('speaks from the reader s side, not the engine s', () => {
    // Stored White-relative. A Black course that printed "+0.80" as good news
    // would be telling the reader their own position is fine when it is not.
    expect(evalWords(80, 'white')).toBe('slightly better');
    expect(evalWords(80, 'black')).toBe('slightly worse');
  });

  it('never prints a centipawn number', () => {
    for (const cp of [-400, -100, -20, 0, 20, 100, 400]) {
      for (const side of ['white', 'black'] as const) {
        expect(evalWords(cp, side)).not.toMatch(/\d/);
      }
    }
  });

  it('says nothing when there is no evaluation', () => {
    expect(evalWords(null, 'white')).toBeNull();
  });

  it('calls a mate what it is', () => {
    expect(evalWords(99995, 'white')).toBe('winning');
    expect(evalWords(99995, 'black')).toBe('lost');
  });
});

describe('endWords', () => {
  it('does not claim a position is finished when the games simply run out', () => {
    expect(endWords('wall')).toMatch(/past what the games can show/);
    expect(endWords('depth')).toMatch(/your level/);
  });
});

describe('lineNotes', () => {
  const line = (o: Partial<Parameters<typeof lineNotes>[0]> = {}) =>
    ({ moves: [], end: 'depth' as const, weight: 1, cp: 0, sources: ['corpus-confirmed'], ...o });

  it('says nothing about an ordinary line', () => {
    // "balanced · as deep as your level needs · played and engine-checked" on
    // forty consecutive rows is wallpaper, and it buries the rows that differ.
    expect(lineNotes(line(), 'white')).toEqual([]);
  });

  it('speaks up when the position is not balanced', () => {
    expect(lineNotes(line({ cp: 200 }), 'white')).toContain('better for you');
    expect(lineNotes(line({ cp: 200 }), 'black')).toContain('worse for you');
  });

  it('speaks up when the line stopped for a reason other than our own depth', () => {
    expect(lineNotes(line({ end: 'wall' }), 'white')).toContain('past what the games can show');
  });

  it('flags a move we could not check, and one where we overruled popularity', () => {
    expect(lineNotes(line({ sources: ['corpus'] }), 'white')).toContain('most played, not engine-checked');
    expect(lineNotes(line({ sources: ['engine'] }), 'white')).toContain(
      "the engine's choice over the popular move"
    );
  });

  it('prefers the stronger caveat when a line has both', () => {
    expect(lineNotes(line({ sources: ['corpus', 'engine'] }), 'white')).toEqual([
      'most played, not engine-checked',
    ]);
  });
});
