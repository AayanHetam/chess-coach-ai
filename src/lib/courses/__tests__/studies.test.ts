// A study level that appears when it is not needed is worse than none.
//
// The reference splits every chapter into studies because its chapters are big.
// Ours are not: measured across all 43 courses, a chapter is 4 decisions at the
// `new` band and 10 at `beginner`. Cutting that into three studies of one move
// adds a level of navigation, a screen and a sense of distance, in exchange for
// grouping that carries no information.
//
// So these tests pin the CONDITION as hard as the split.

import { describe, expect, it } from 'vitest';
import {
  ONE_SITTING,
  decisionsUnder,
  planChapter,
  studyTitle,
} from '@/lib/courses/studies';
import { ROUND_SIZE, SITTING_ROUNDS } from '@/lib/learn/chapterRound';
import type { CourseChapter, CourseNode } from '@/types/course';

const chapter = (at: string, line: string[] = []): CourseChapter =>
  ({ i: 0, at, line, title: null, share: 1, cum: 1, nodes: 0 });

/** `ours` = our move here; `theirs` = their replies. */
const G = (spec: Record<string, { p: number; us?: string; next?: string; them?: Array<[string, string, number]> }>) => {
  const nodes: Record<string, CourseNode> = {};
  for (const [key, v] of Object.entries(spec)) {
    nodes[key] = {
      p: v.p, w: 1, g: 1, ch: 0, end: null,
      us: v.us, next: v.next,
      them: v.them?.map(([san, to, share]) => ({ san, to, share })),
    };
  }
  return nodes;
};

describe('ONE_SITTING', () => {
  it('is the trainer\'s own sitting, not a number picked to look tidy', () => {
    expect(ONE_SITTING).toBe(ROUND_SIZE * SITTING_ROUNDS);
    expect(ONE_SITTING).toBe(20);
  });
});

describe('decisionsUnder', () => {
  it('counts positions where WE choose, not their replies', () => {
    const nodes = G({
      a: { p: 1, us: 'e4', next: 'b' },
      b: { p: 2, them: [['c5', 'c', 0.5], ['e5', 'd', 0.5]] },
      c: { p: 3, us: 'Nf3' },
      d: { p: 3, us: 'Nf3' },
    });
    expect(decisionsUnder(nodes, 'a', 10)).toBe(3);
  });

  it('counts a shared position ONCE, because transpositions pool', () => {
    // Both replies lead to the same place. A path count would say 3 and make
    // the chapter look bigger than the work in it.
    const nodes = G({
      a: { p: 1, us: 'e4', next: 'b' },
      b: { p: 2, them: [['c5', 'same', 0.5], ['e5', 'same', 0.5]] },
      same: { p: 3, us: 'Nf3' },
    });
    expect(decisionsUnder(nodes, 'a', 10)).toBe(2);
  });

  it('stops at the depth the band can see', () => {
    const nodes = G({
      a: { p: 1, us: 'e4', next: 'b' },
      b: { p: 2, them: [['c5', 'c', 1]] },
      c: { p: 3, us: 'Nf3', next: 'd' },
      d: { p: 4, them: [['d6', 'e', 1]] },
      e: { p: 5, us: 'd4' },
    });
    expect(decisionsUnder(nodes, 'a', 10)).toBe(3);
    expect(decisionsUnder(nodes, 'a', 3)).toBe(2);
    expect(decisionsUnder(nodes, 'a', 1)).toBe(1);
  });

  // ── Zero by definition ───────────────────────────────────────────────────
  it('counts nothing from a position that is not there', () => {
    expect(decisionsUnder(G({}), 'missing', 10)).toBe(0);
  });

  it('terminates on a cycle rather than hanging', () => {
    // A real risk: the graph is keyed by position and pools transpositions, so
    // a repetition is an edge back to a node already visited.
    const nodes = G({
      a: { p: 1, us: 'Nf3', next: 'b' },
      b: { p: 2, them: [['Nf6', 'c', 1]] },
      c: { p: 3, us: 'Ng1', next: 'd' },
      d: { p: 4, them: [['Ng8', 'a', 1]] },
    });
    expect(decisionsUnder(nodes, 'a', 99)).toBe(2);
  });
});

describe('studyTitle', () => {
  it('numbers from the ply, and names the side that is not us', () => {
    expect(studyTitle('Qxd5', 4, 'white')).toBe('Black plays 2...Qxd5');
    expect(studyTitle('Nf6', 6, 'white')).toBe('Black plays 3...Nf6');
    expect(studyTitle('d4', 3, 'black')).toBe('White plays 2.d4');
  });

  it('names the opponent, never the player', () => {
    // A study is the branch THEY chose. Calling it "you play" would invert the
    // thing the level exists to express.
    expect(studyTitle('e4', 1, 'black')).toContain('White');
    expect(studyTitle('c5', 2, 'white')).toContain('Black');
  });
});

describe('planChapter', () => {
  /**
   * A chapter with `branches` replies, each carrying `each` decisions.
   *
   * Total is `1 + branches * each`: the chapter's OWN move is a decision too,
   * which is easy to forget and was wrong in the first draft of these tests.
   */
  const spread = (branches: number, each: number) => {
    const nodes: Record<string, { p: number; us?: string; next?: string; them?: Array<[string, string, number]> }> = {
      root: { p: 2, us: 'exd5', next: 'fork' },
      fork: { p: 3, them: [] },
    };
    const them: Array<[string, string, number]> = [];
    for (let b = 0; b < branches; b++) {
      const head = `b${b}`;
      them.push([`m${b}`, head, 1 / branches]);
      for (let d = 0; d < each; d++) {
        const key = d === 0 ? head : `b${b}_${d}`;
        nodes[key] = { p: 4 + d * 2, us: `u${d}`, next: `b${b}_${d}_t` };
        nodes[`b${b}_${d}_t`] = {
          p: 5 + d * 2,
          them: d + 1 < each ? [[`r${d}`, `b${b}_${d + 1}`, 1]] : [],
        };
      }
    }
    nodes.fork.them = them;
    return G(nodes);
  };

  // ── The condition, which matters more than the split ─────────────────────
  it('leaves a chapter that fits one sitting FLAT, with no studies at all', () => {
    const nodes = spread(3, 2); // 1 chapter move + 3 x 2 = 7
    const plan = planChapter(nodes, chapter('root'), 99, 'white');
    expect(plan.decisions).toBe(7);
    expect(plan.flat).toBe(true);
    expect(plan.studies).toEqual([]);
  });

  it('splits a chapter that does not', () => {
    const nodes = spread(3, 10); // 1 + 3 x 10 = 31
    const plan = planChapter(nodes, chapter('root'), 99, 'white');
    expect(plan.decisions).toBe(31);
    expect(plan.flat).toBe(false);
    expect(plan.studies).toHaveLength(3);
    expect(plan.studies.every(s => s.decisions === 10)).toBe(true);
  });

  it('the boundary itself is flat — one sitting is one unit', () => {
    // A chapter you can finish in one go does not need cutting into pieces you
    // finish in one go, so the threshold is inclusive. Driven through the
    // explicit `splitAt` rather than by sizing a fixture to land on exactly 20,
    // which cannot be done with an integer number of equal branches.
    const nodes = spread(3, 10); // 31 decisions
    expect(planChapter(nodes, chapter('root'), 99, 'white', 31).flat).toBe(true);
    expect(planChapter(nodes, chapter('root'), 99, 'white', 30).flat).toBe(false);
  });

  it('one study is not a split', () => {
    // Every branch but one empty leaves a single thing. "Study 1 of 1" would be
    // a lie about the shape of the chapter.
    const nodes = spread(1, 30);
    const plan = planChapter(nodes, chapter('root'), 99, 'white');
    expect(plan.decisions).toBe(31);
    expect(plan.flat).toBe(true);
    expect(plan.studies).toEqual([]);
  });

  it('drops a reply with nothing behind it rather than listing an empty study', () => {
    const nodes = spread(3, 10);
    // The node must EXIST and be within depth, or an earlier guard catches it
    // and this never reaches the emptiness check. The first draft pointed at a
    // missing key and the assertion proved nothing — caught by mutation.
    nodes.deadend = { p: 4, w: 1, g: 1, ch: 0, end: null, them: [] };
    nodes.fork.them!.push({ san: 'dead', to: 'deadend', share: 0.01 });
    expect(nodes.deadend).toBeDefined();
    expect(decisionsUnder(nodes, 'deadend', 99)).toBe(0);

    const plan = planChapter(nodes, chapter('root'), 99, 'white');
    expect(plan.studies.map(s => s.id)).not.toContain('dead');
    expect(plan.studies).toHaveLength(3);
  });

  it('orders studies by how often they actually happen', () => {
    const nodes = spread(3, 10);
    nodes.fork.them = [
      { san: 'rare', to: 'b0', share: 0.1 },
      { san: 'common', to: 'b1', share: 0.7 },
      { san: 'mid', to: 'b2', share: 0.2 },
    ];
    const plan = planChapter(nodes, chapter('root'), 99, 'white');
    expect(plan.studies.map(s => s.id)).toEqual(['common', 'mid', 'rare']);
  });

  it('builds a study line that includes our chapter move', () => {
    const nodes = spread(3, 10);
    const plan = planChapter(nodes, chapter('root', ['e4', 'd5']), 99, 'white');
    // chapter line + our move at the chapter root + their reply
    expect(plan.studies[0].line).toEqual(['e4', 'd5', 'exd5', 'm0']);
  });

  it('respects the depth, so a deeper band can split what a shallow one cannot', () => {
    const nodes = spread(3, 10);
    expect(planChapter(nodes, chapter('root'), 99, 'white').flat).toBe(false);
    // Cut the view short and the same chapter becomes one sitting.
    expect(planChapter(nodes, chapter('root'), 6, 'white').flat).toBe(true);
  });

  it('a chapter that is not in the graph is flat and empty, never a throw', () => {
    const plan = planChapter(G({}), chapter('missing'), 99, 'white');
    expect(plan).toEqual({ flat: true, decisions: 0, studies: [] });
  });
});
