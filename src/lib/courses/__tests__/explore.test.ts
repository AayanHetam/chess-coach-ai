// A search box over a graph that pools transpositions. The two things that go
// quietly wrong: the same position listed once per path, and a query for two
// common moves matching the whole course.

import { describe, expect, it } from 'vitest';
import { positionsOf, search, tokens } from '../explore';
import { loadCourse } from '../load';
import { viewFor } from '../view';
import { BANDS } from '@/lib/repertoire/levels';
import type { CourseChapter, CourseNode } from '@/types/course';

const band = (id: string) => BANDS.find(b => b.id === id)!;

const G = (
  spec: Record<string, { us?: string; next?: string; them?: Array<[string, string]>; ch?: number }>
) => {
  const nodes: Record<string, CourseNode> = {};
  for (const [key, v] of Object.entries(spec)) {
    nodes[key] = {
      p: 1,
      w: 1,
      g: 1,
      ch: v.ch ?? 0,
      end: null,
      us: v.us,
      next: v.next,
      them: v.them?.map(([san, to]) => ({ san, to, share: 0.5 })),
    };
  }
  return nodes;
};

const chapter = (at: string, line: string[] = [], i = 0): CourseChapter =>
  ({ i, at, line, title: null, share: 1, cum: 1, nodes: 0 });

describe('positionsOf', () => {
  it('lists a transposition once, by its shortest way in', () => {
    // `end` is reached in two moves down one branch and three down the other.
    const nodes = G({
      root: { us: 'd4', next: 'a' },
      a: { them: [['Nf6', 'b'], ['d5', 'c']] },
      b: { us: 'Bf4', next: 'end' },
      c: { us: 'Bf4', next: 'd' },
      d: { them: [['Nf6', 'end']] },
      end: {},
    });
    const found = positionsOf(nodes, [chapter('root')]);
    const ends = found.filter(p => p.key === 'end');
    expect(ends).toHaveLength(1);
    expect(ends[0].line).toEqual(['d4', 'Nf6', 'Bf4']);
  });

  it('marks the positions we are asked about', () => {
    const nodes = G({ root: { us: 'd4', next: 'a' }, a: { them: [['d5', 'b']] }, b: {} });
    const found = positionsOf(nodes, [chapter('root')]);
    expect(found.find(p => p.key === 'root')!.ours).toBe(true);
    expect(found.find(p => p.key === 'a')!.ours).toBe(false);
  });

  it('stops at the limit rather than walking a whole course into a dialog', () => {
    const course = loadCourse('w-nf3')!;
    const view = viewFor(course, band('strong'));
    const capped = positionsOf(view.nodes, view.chapters, 50);
    expect(capped).toHaveLength(50);
    // Breadth-first, so what survives is the shallow half and not a slice
    // from the middle of one variation.
    expect(Math.max(...capped.map(p => p.line.length))).toBeLessThan(
      Math.max(...positionsOf(view.nodes, view.chapters).map(p => p.line.length))
    );
  });

  // ── Zero by definition ─────────────────────────────────────────────────────
  it('finds nothing in a course with no chapters, and nothing at a missing root', () => {
    expect(positionsOf(G({}), [])).toEqual([]);
    expect(positionsOf(G({}), [chapter('nowhere')])).toEqual([]);
  });
});

describe('tokens', () => {
  it('strips move numbers, because that is what people paste', () => {
    expect(tokens('1.d4 d5 2.Bf4')).toEqual(['d4', 'd5', 'Bf4']);
    expect(tokens('3... Nc6')).toEqual(['Nc6']);
  });

  it('keeps case, because SAN is case-sensitive', () => {
    expect(tokens('Bf4 b4')).toEqual(['Bf4', 'b4']);
  });

  it('is empty for an empty query', () => {
    expect(tokens('')).toEqual([]);
    expect(tokens('   ')).toEqual([]);
    expect(tokens('2.')).toEqual([]);
  });
});

describe('search', () => {
  const positions = [
    { key: 'a', line: ['d4', 'd5', 'Bf4'], chapter: 0, ours: false },
    { key: 'b', line: ['d4', 'Nf6', 'Bf4', 'd5'], chapter: 1, ours: true },
    { key: 'c', line: ['d4', 'd5'], chapter: 0, ours: true },
  ];

  it('matches a run of moves, in order', () => {
    expect(search(positions, 'd5 Bf4').map(p => p.key)).toEqual(['a']);
  });

  it('does not match moves that are merely both present', () => {
    // A bag-of-moves match would return every line in the course for a query
    // of two common moves, ranked by nothing.
    expect(search(positions, 'Bf4 d5').map(p => p.key)).toEqual(['b']);
  });

  it('puts the shallowest hit first', () => {
    expect(search(positions, 'd4').map(p => p.key)).toEqual(['c', 'a', 'b']);
  });

  it('finds nothing for an empty query, rather than everything', () => {
    expect(search(positions, '')).toEqual([]);
    expect(search(positions, 'Qz9')).toEqual([]);
  });
});
