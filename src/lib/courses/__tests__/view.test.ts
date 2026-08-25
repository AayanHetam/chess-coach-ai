// One course, cut to one band.
//
// The cut IS the segregation: a player below a band cannot reach deeper content
// through any path, because it is not in the object they were handed. These
// tests are about the two ways that can be quietly wrong — content leaking past
// the boundary, and a course going empty without saying why.

import { describe, expect, it } from 'vitest';
import { BANDS } from '@/lib/repertoire/levels';
import { countLines, courseVerdict, viewFor } from '../view';
import { loadCourse } from '../load';
import type { Course, CourseNode } from '@/types/course';

const band = (id: string) => BANDS.find(b => b.id === id)!;

const node = (over: Partial<CourseNode> & { p: number; ch: number }): CourseNode => ({
  w: 1,
  g: 1000,
  end: null,
  ...over,
});

/** Root at ply 2, chapters at ply 3, our move at 4, their reply at 5. */
function course(): Course {
  return {
    meta: {
      id: 'c',
      name: 'C',
      root: ['e4', 'e5'],
      side: 'white',
      maxPly: 24,
      minShare: 0.02,
      minGames: 50,
      lines: 4,
      expanded: 9,
      nodes: 9,
      chapters: 2,
      ourNodes: 3,
      evaluated: 9,
      byTermination: {},
      bySource: {},
      level: 'new',
      load: 'light',
      character: 'attack',
      coverage: 'family',
      eco: null,
      corpus: { source: 's', games: 1, maxPlies: 24, sha256: 'x' },
      evals: { source: 'e', licence: 'CC0', covered: 9, of: 9 },
      builtAt: '2026-08-24',
    },
    chapters: [
      { i: 0, at: 'A', line: ['e4', 'e5', 'Nf3'], title: null, share: 0.9, cum: 0.9, nodes: 4 },
      { i: 1, at: 'B', line: ['e4', 'e5', 'Nc3'], title: null, share: 0.1, cum: 1, nodes: 4 },
    ],
    nodes: {
      ROOT: node({ p: 2, ch: -1, them: [{ san: 'Nf3', share: 0.9, to: 'A' }, { san: 'Nc3', share: 0.1, to: 'B' }] }),
      A: node({ p: 3, ch: 0, us: 'Nc6', next: 'A2' }),
      A2: node({ p: 4, ch: 0, them: [{ san: 'Bb5', share: 1, to: 'A3' }] }),
      A3: node({ p: 5, ch: 0, us: 'a6', next: 'A4' }),
      A4: node({ p: 6, ch: 0, them: [{ san: 'Ba4', share: 1, to: 'A5' }] }),
      A5: node({ p: 7, ch: 0, us: 'Nf6', next: 'A6' }),
      A6: node({ p: 8, ch: 0, us: 'Be7', next: 'A7' }),
      A7: node({ p: 12, ch: 0, end: 'depth' }),
      B: node({ p: 3, ch: 1, us: 'Nf6', next: 'B2' }),
      B2: node({ p: 4, ch: 1, them: [{ san: 'f4', share: 1, to: 'B3' }] }),
      B3: node({ p: 5, ch: 1, us: 'd5', next: 'B4' }),
      B4: node({ p: 6, ch: 1, them: [{ san: 'exd5', share: 1, to: 'B5' }] }),
      B5: node({ p: 7, ch: 1, us: 'Nxd5', next: 'B6' }),
      B6: node({ p: 13, ch: 1, end: 'depth' }),
    },
  };
}

describe('viewFor', () => {
  it('never hands out a node deeper than the band', () => {
    // The segregation itself. Not a UI politeness — the deep nodes are absent
    // from the object, so no path through the page can reach them.
    //
    // The fixture deliberately runs to ply 13, so this fails loudly if the cut
    // is removed. An earlier version stopped at the band's own depth and the
    // assertion was vacuously true with the cut deleted.
    for (const id of ['new', 'beginner', 'improving']) {
      const view = viewFor(course(), band(id));
      expect(Object.keys(view.nodes).length).toBeGreaterThan(0);
      for (const n of Object.values(view.nodes)) expect(n.p).toBeLessThanOrEqual(view.maxPly);
    }
    // And something really is being withheld, or the test above proves nothing.
    expect(Object.keys(viewFor(course(), band('new')).nodes).length).toBeLessThan(
      Object.keys(viewFor(course(), band('club')).nodes).length
    );
  });

  it('cuts the line at the boundary and says the boundary is why', () => {
    const view = viewFor(course(), band('new')); // root 2 + depth 4 = ply 6
    expect(view.maxPly).toBe(6);
    const boundary = view.nodes.A4;
    expect(boundary.p).toBe(6);
    expect(boundary.end).toBe('depth');
    // "we stop here" is not "there is nothing here", and the trainer branches on
    // exactly this. The move fields must go too: a node that still carries `us`
    // or `next` is one the trainer will happily play past the boundary.
    expect(boundary.them).toBeUndefined();
    // Our own move at the cap loses its child too, or the trainer plays past it.
    const deeper = viewFor(course(), band('improving')); // root 2 + 8 = ply 10
    const ourBoundary = deeper.nodes.A6; // p 8, child A7 is at ply 12
    expect(ourBoundary.end).toBe('depth');
    expect(ourBoundary.us).toBeUndefined();
    expect(ourBoundary.next).toBeUndefined();
  });

  it('keeps chapters by share until the band has enough, and names the rest', () => {
    const view = viewFor(course(), band('new')); // enoughAt 0.80, first chapter is 0.9
    expect(view.chapters).toHaveLength(1);
    expect(view.covered).toBeCloseTo(0.9, 4);
    expect(view.omitted.chapters).toBe(1);
    expect(view.omitted.share).toBeCloseTo(0.1, 4);
  });

  it('leaves no dangling reply pointing at a node it removed', () => {
    // A reply whose target was cut is a broken edge, and every consumer that
    // walks the graph would hit undefined.
    for (const id of ['new', 'beginner', 'improving', 'club', 'strong']) {
      const view = viewFor(course(), band(id));
      for (const n of Object.values(view.nodes)) {
        for (const r of n.them ?? []) expect(view.nodes[r.to]).toBeDefined();
        if (n.next) expect(view.nodes[n.next]).toBeDefined();
      }
    }
  });

  it('gives every band at least one chapter rather than an empty course', () => {
    const c = course();
    c.chapters = [{ i: 0, at: 'A', line: [], title: null, share: 1, cum: 1, nodes: 4 }];
    expect(viewFor(c, band('new')).chapters).toHaveLength(1);
  });

  it('is monotone: a higher band never shows less', () => {
    // The product guarantee. Every line a beginner learns is a prefix of the
    // line a club player learns, so improving never means unlearning.
    let prev = viewFor(course(), band('new'));
    for (const id of ['beginner', 'improving', 'club', 'strong']) {
      const next = viewFor(course(), band(id));
      expect(next.lines).toBeGreaterThanOrEqual(prev.lines);
      expect(next.chapters.length).toBeGreaterThanOrEqual(prev.chapters.length);
      expect(Object.keys(next.nodes).length).toBeGreaterThanOrEqual(Object.keys(prev.nodes).length);
      prev = next;
    }
  });

  it('measures depth from where the OPENING starts, not from move one', () => {
    // The Najdorf begins at ply 10. Capped absolutely, a club player — depth 12
    // — would be handed two plies of it and told that was the course, while a
    // Caro player got ten. Six openings in the catalogue gave a beginner
    // literally nothing. The band's depth is plies of THIS opening's theory.
    const c = course();
    c.meta.root = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
    c.meta.maxPly = 24;
    const view = viewFor(c, band('club'));
    expect(view.theoryPlies).toBe(band('club').depth);
    expect(view.maxPly).toBe(10 + band('club').depth);
  });

  it('gives a shallow-rooted opening the same amount of its own theory', () => {
    const view = viewFor(course(), band('club')); // root is 2 plies
    expect(view.theoryPlies).toBe(band('club').depth);
  });

  it('never runs past the depth the course was actually built to', () => {
    const c = course();
    c.meta.root = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
    c.meta.maxPly = 14; // built shallower than root + band.depth
    expect(viewFor(c, band('strong')).maxPly).toBe(14);
  });
});

describe('countLines', () => {
  it('counts distinct paths, not the times a node is entered', () => {
    const c = course();
    expect(countLines(c.nodes, ['ROOT'])).toBe(2);
  });

  it('terminates on a transposition cycle instead of hanging', () => {
    const nodes: Record<string, CourseNode> = {
      A: node({ p: 1, ch: 0, us: 'a', next: 'B' }),
      B: node({ p: 2, ch: 0, us: 'b', next: 'A' }),
    };
    expect(countLines(nodes, ['A'])).toBe(0);
  });

  it('treats a node that is not present as one finished line', () => {
    expect(countLines({}, ['MISSING'])).toBe(1);
  });
});

describe('courseVerdict', () => {
  it('tells a player when they have all of it, and how deep that is', () => {
    const view = viewFor(course(), band('strong'));
    expect(courseVerdict(view)).toMatch(/That is all of it at your level/);
    expect(courseVerdict(view)).toMatch(/moves deep/);
  });

  it('otherwise says what the kept chapters are worth', () => {
    expect(courseVerdict(viewFor(course(), band('new')))).toMatch(/90% of what you/);
  });

  it('counts the omitted chapters in English', () => {
    // "The other 1 cover the last 3%" shipped to production for an hour.
    const one = viewFor(course(), band('new')); // 1 of 2 chapters kept
    expect(courseVerdict(one)).toMatch(/The other 1 covers/);
    const c = course();
    c.chapters = [
      { i: 0, at: 'A', line: [], title: null, share: 0.8, cum: 0.8, nodes: 1 },
      { i: 1, at: 'B', line: [], title: null, share: 0.1, cum: 0.9, nodes: 1 },
      { i: 2, at: 'C', line: [], title: null, share: 0.1, cum: 1, nodes: 1 },
    ];
    expect(courseVerdict(viewFor(c, band('new')))).toMatch(/The other 2 cover /);
  });
});

describe('a view crosses the wire', () => {
  /**
   * Next refuses to serialise an explicit `undefined` out of
   * getServerSideProps and 500s the page. Trimming used to set `them` and
   * `next` to `undefined`, which reads identically at every call site and does
   * not survive JSON — the reader 500'd with a message naming a FEN key rather
   * than the line that set it.
   */
  it('has no own property whose value is undefined', () => {
    const view = viewFor(course(), band('beginner'));
    for (const [key, node] of Object.entries(view.nodes)) {
      for (const [field, value] of Object.entries(node)) {
        expect(value, `${key}.${field}`).not.toBeUndefined();
      }
    }
    // The control: the trim really fired on this fixture, so the assertion
    // above was looking at something.
    const trimmed = Object.values(view.nodes).filter(n => n.end === 'depth');
    expect(trimmed.length).toBeGreaterThan(0);
  });

  /**
   * On a real course, because the fixture only ever exercises ONE of the two
   * trims. Mutating `delete trimmed.next` back to `= undefined` failed the
   * fixture test; mutating `delete trimmed.them` SURVIVED it, and a guard that
   * covers one of the two branches it exists for is half a guard.
   */
  it('is JSON-clean on a shipped course, at every band', () => {
    const real = loadCourse('w-london')!;
    let cutReplies = 0;
    for (const id of ['new', 'beginner', 'improving', 'club', 'strong']) {
      const view = viewFor(real, band(id));
      for (const [key, node] of Object.entries(view.nodes)) {
        for (const [field, value] of Object.entries(node)) {
          // NOT `toEqual` against a JSON round-trip: `toEqual` treats a
          // property whose value is `undefined` as absent, so the round-trip
          // assertion passed with the bug in place. Own properties, by name.
          expect(value, `${id}: ${key}.${field}`).not.toBeUndefined();
        }
        const source = real.nodes[key];
        if (source?.them && !node.them) cutReplies++;
      }
    }
    // The reply trim fires 66 times across the five bands on this course, so
    // the assertion above was watching it. The `next`/`us` trim never fires on
    // the London and is covered by the fixture test above, where it does.
    expect(cutReplies).toBeGreaterThan(0);
  });
});
