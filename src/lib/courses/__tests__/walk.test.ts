// The reader walks a graph that pools transpositions. Two things can be quietly
// wrong: a walk that will not terminate, and a "forward" that depends on the
// builder's ordering rather than on what people play.

import { describe, expect, it } from 'vitest';
import { branchesOf, defaultBranch, keyOf, principalLine, replay } from '../walk';
import type { CourseNode } from '@/types/course';

const G = (
  spec: Record<string, { us?: string; next?: string; them?: Array<[string, string, number]> }>
) => {
  const nodes: Record<string, CourseNode> = {};
  for (const [key, v] of Object.entries(spec)) {
    nodes[key] = {
      p: 1,
      w: 1,
      g: 1,
      ch: 0,
      end: null,
      us: v.us,
      next: v.next,
      them: v.them?.map(([san, to, share]) => ({ san, to, share })),
    };
  }
  return nodes;
};

describe('replay', () => {
  it('gives the position, its key and the move that made it', () => {
    const r = replay(['d4', 'd5', 'Bf4']);
    expect(r.played).toEqual(['d4', 'd5', 'Bf4']);
    expect(r.lastMove).toEqual({ from: 'c1', to: 'f4' });
    expect(r.key).toBe(keyOf(r.fen));
    expect(r.fen).toContain(' b ');
  });

  // ── Zero by definition ─────────────────────────────────────────────────────
  it('replays nothing into the start position', () => {
    const r = replay([]);
    expect(r.played).toEqual([]);
    expect(r.lastMove).toBeNull();
    expect(r.fen.startsWith('rnbqkbnr/pppppppp')).toBe(true);
  });

  it('stops at an illegal move instead of throwing, and says where it stopped', () => {
    const r = replay(['e4', 'e5', 'Qz9', 'Nf3']);
    expect(r.played).toEqual(['e4', 'e5']);
    // The control: the same list without the bad move goes all the way.
    expect(replay(['e4', 'e5', 'Nf3']).played).toHaveLength(3);
  });
});

describe('branchesOf', () => {
  it('offers one move on our turn, because a repertoire has one answer', () => {
    const nodes = G({ a: { us: 'Bf4', next: 'b' }, b: {} });
    expect(branchesOf(nodes.a, nodes)).toEqual([{ san: 'Bf4', to: 'b', ours: true }]);
  });

  it('offers their replies with their shares', () => {
    const nodes = G({ a: { them: [['Nf6', 'b', 0.6], ['c5', 'c', 0.3]] }, b: {}, c: {} });
    expect(branchesOf(nodes.a, nodes).map(b => b.san)).toEqual(['Nf6', 'c5']);
  });

  it('drops an edge whose child is not in this view, rather than dangling', () => {
    // The band cut trims children. A branch pointing past the boundary would
    // put the reader on a position it cannot render.
    const nodes = G({ a: { them: [['Nf6', 'b', 0.6], ['c5', 'gone', 0.3]] }, b: {} });
    expect(branchesOf(nodes.a, nodes).map(b => b.san)).toEqual(['Nf6']);
    expect(branchesOf(G({ a: { us: 'Bf4', next: 'gone' } }).a, {})).toEqual([]);
  });

  it('has nowhere to go from a position that is not there', () => {
    expect(branchesOf(undefined, {})).toEqual([]);
  });
});

describe('defaultBranch', () => {
  it('is their MOST PLAYED, not the first one listed', () => {
    // `them` is corpus order, which happens to be most-played order today. A
    // reader that depended on that would break the day the builder sorts
    // differently, and nothing would look wrong.
    const branches = [
      { san: 'a6', to: 'x', share: 0.2, ours: false },
      { san: 'Nf6', to: 'y', share: 0.5, ours: false },
    ];
    expect(defaultBranch(branches)?.san).toBe('Nf6');
  });

  it('is our move when it is our turn', () => {
    expect(defaultBranch([{ san: 'Bf4', to: 'x', ours: true }])?.san).toBe('Bf4');
  });

  it('is null at the end of a line', () => {
    expect(defaultBranch([])).toBeNull();
  });
});

describe('principalLine', () => {
  it('follows our move and their most played, alternately', () => {
    const nodes = G({
      a: { us: 'd4', next: 'b' },
      b: { them: [['Nf6', 'c', 0.3], ['d5', 'd', 0.6]] },
      d: { us: 'Bf4', next: 'e' },
      c: { us: 'Nf3' },
      e: {},
    });
    expect(principalLine(nodes, 'a')).toEqual(['d4', 'd5', 'Bf4']);
  });

  it('terminates on a repetition rather than hanging', () => {
    const nodes = G({
      a: { us: 'Nf3', next: 'b' },
      b: { them: [['Nf6', 'c', 1]] },
      c: { us: 'Ng1', next: 'd' },
      d: { them: [['Ng8', 'a', 1]] },
    });
    expect(principalLine(nodes, 'a')).toEqual(['Nf3', 'Nf6', 'Ng1', 'Ng8']);
  });

  it('is empty from a position with nothing under it', () => {
    expect(principalLine(G({ a: {} }), 'a')).toEqual([]);
    expect(principalLine({}, 'missing')).toEqual([]);
  });
});
