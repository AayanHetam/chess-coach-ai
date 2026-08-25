// A chapter's decisions, and the guarantee that the machine can ask them.
//
// The property that matters is NOT that `toTrainerLine(p).moves` ends in
// `p.san` — that is true by construction and a test for it would be vacuous.
// It is that the PATH replays to the position we claim: `createSession` builds
// its board by replaying the moves from the start of the game, so if the walk
// accumulated the path wrongly the machine opens on a different position and
// grades the answer against a different move. That is a wrong answer for a
// right move, which is the one failure a trainer does not recover from.

import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { loadCourse, loadCourseIndex } from '@/lib/courses/load';
import { cpForSide, evalWords } from '@/lib/courses/lines';
import { viewFor } from '@/lib/courses/view';
import { BANDS } from '@/lib/repertoire/levels';
import { createSession, submitProbe } from '@/lib/learn/trainerSession';
import {
  MAX_PROBES_PER_CHAPTER,
  probesOf,
  sourceWords,
  toTrainerLine,
  type CourseProbe,
} from '../probes';

const index = loadCourseIndex();

describe('probesOf across every shipped course', () => {
  it('has courses to walk at all', () => {
    // The control for every sweep below: a suite that walked nothing would
    // report zero failures and mean nothing.
    expect(index).not.toBeNull();
    expect(index!.courses.length).toBeGreaterThan(40);
  });

  it('opens the machine on the position it claims, in every course and band', () => {
    let asked = 0;
    const wrongPosition: string[] = [];
    const wrongAnswer: string[] = [];
    const wrongTurn: string[] = [];

    for (const entry of index!.courses) {
      const course = loadCourse(entry.id)!;
      for (const band of BANDS) {
        const view = viewFor(course, band);
        for (const chapter of view.chapters) {
          const { probes } = probesOf(view, chapter.i, course.meta.side);
          for (const probe of probes) {
            asked++;
            const line = toTrainerLine(probe, course.meta.side);
            const session = createSession(line, 'study');
            // The machine replayed the path itself. If it lands somewhere else,
            // the walk built the path wrong.
            if (session.fen !== probe.fen) {
              wrongPosition.push(`${entry.id}/${band.id}/${probe.key}`);
            }
            // And the move we would ask for is graded right.
            const answered = submitProbe(session, line, probe.san);
            if (answered.knewIt !== true) {
              wrongAnswer.push(`${entry.id}/${band.id}/${probe.san}`);
            }
            const toMove = probe.fen.split(' ')[1] === 'w' ? 'white' : 'black';
            if (toMove !== course.meta.side) {
              wrongTurn.push(`${entry.id}/${band.id}/${probe.key}`);
            }
          }
        }
      }
    }

    // THE ZERO. Every one of these counts is zero by definition of a correct
    // walk, and the control above guarantees the sweep actually ran.
    expect(wrongPosition).toEqual([]);
    expect(wrongAnswer).toEqual([]);
    expect(wrongTurn).toEqual([]);
    expect(asked).toBeGreaterThan(5000);
  }, 240_000);

  it('never asks the same position twice in one chapter', () => {
    const duplicated: string[] = [];
    let chapters = 0;

    for (const entry of index!.courses) {
      const course = loadCourse(entry.id)!;
      for (const band of BANDS) {
        const view = viewFor(course, band);
        for (const chapter of view.chapters) {
          chapters++;
          const keys = probesOf(view, chapter.i, course.meta.side).probes.map(p => p.key);
          if (new Set(keys).size !== keys.length) {
            duplicated.push(`${entry.id}/${band.id}/${chapter.i}`);
          }
        }
      }
    }

    expect(duplicated).toEqual([]);
    // The control is only that the sweep ran. Whether the DEDUPE fired cannot
    // be shown from the output — one path is stored per probe, so distinct
    // paths always equals distinct keys and asserting it would be vacuous. The
    // convergence fixture below is what proves the dedupe executes.
    expect(chapters).toBeGreaterThan(200);
  }, 120_000);

  it('reports the cap rather than applying it silently', () => {
    const lying: string[] = [];
    let cappedChapters = 0;

    for (const entry of index!.courses) {
      const course = loadCourse(entry.id)!;
      for (const band of BANDS) {
        const view = viewFor(course, band);
        for (const chapter of view.chapters) {
          const result = probesOf(view, chapter.i, course.meta.side);
          expect(result.probes.length).toBeLessThanOrEqual(MAX_PROBES_PER_CHAPTER);
          if (result.capped) {
            cappedChapters++;
            // Claiming a cap while showing everything would put a false
            // "showing 60 of 60" notice on screen.
            if (result.total <= result.probes.length) lying.push(`${entry.id}/${band.id}/${chapter.i}`);
          } else if (result.total !== result.probes.length) {
            lying.push(`${entry.id}/${band.id}/${chapter.i} total drift`);
          }
        }
      }
    }

    expect(lying).toEqual([]);
    // The control: the cap must actually fire somewhere, or this asserts nothing.
    expect(cappedChapters).toBeGreaterThan(0);
    // Explicit, like its sibling sweeps: this walks 43 courses at 5 bands and
    // runs in ~12s alone but ~23s under full-suite parallel load, which is over
    // the 20s default. A sweep that flakes on machine load teaches the team to
    // re-run rather than to read.
  }, 240_000);

  it('asks every decision in the view, and asks it once', () => {
    // The strongest thing this module claims. Chapters partition the graph, so
    // between them they must cover it: a decision no chapter asks is theory the
    // product holds and can never teach, and nothing on any screen would say so.
    //
    // Uncapped courses only, because the cap is a deliberate omission and is
    // reported separately.
    for (const band of BANDS) {
      let decisions = 0;
      const unreachable: string[] = [];
      const twice: string[] = [];

      for (const entry of index!.courses) {
        const course = loadCourse(entry.id)!;
        const view = viewFor(course, band);
        const asked = new Map<string, number>();
        let capped = false;
        for (const chapter of view.chapters) {
          const result = probesOf(view, chapter.i, course.meta.side);
          if (result.capped) capped = true;
          for (const probe of result.probes) asked.set(probe.key, (asked.get(probe.key) ?? 0) + 1);
        }
        if (capped) continue;

        for (const [key, node] of Object.entries(view.nodes)) {
          if (!node.us) continue;
          // Moves inside the course root are the premise, not a question.
          if (node.p < course.meta.root.length) continue;
          decisions++;
          const times = asked.get(key) ?? 0;
          if (times === 0) unreachable.push(`${entry.id}/${band.id}/${key}`);
          // The shared trunk belongs to every chapter, so a decision sitting on
          // it is legitimately in each chapter's list. There is exactly one in
          // the corpus (Nxd4 in the Scotch) and progress is keyed by position,
          // so it is still only ever answered once.
          if (times > 1 && node.ch !== -1) twice.push(`${entry.id}/${band.id}/${key}`);
        }
      }

      expect(unreachable).toEqual([]);
      expect(twice).toEqual([]);
      expect(decisions).toBeGreaterThan(400);
    }
  }, 240_000);

  it('teaches the trunk decision the chapter walk cannot reach', () => {
    // w-scotch holds the only `ch: -1` decision in the shipped corpus — Nxd4 at
    // ply 6, above every chapter root. A walk that started at the chapter root
    // would drop it, and nothing on any screen would say so.
    const course = loadCourse('w-scotch')!;
    const view = viewFor(course, BANDS.find(b => b.id === 'club')!);
    const trunk = Object.entries(course.nodes).filter(([, n]) => n.ch === -1 && n.us);
    expect(trunk).toHaveLength(1);

    const [trunkKey] = trunk[0];
    const asked = view.chapters.flatMap(c => probesOf(view, c.i, 'white').probes);
    expect(asked.some(p => p.key === trunkKey)).toBe(true);
  });
});

describe('probesOf on a hand-built graph', () => {
  const START = new Chess();
  const key = (c: Chess) => c.fen().split(' ').slice(0, 4).join(' ');
  const after = (...moves: string[]) => {
    const c = new Chess();
    for (const m of moves) c.move(m);
    return key(c);
  };

  it('returns nothing for a chapter that is not there', () => {
    const empty = probesOf(
      { meta: { root: [] } as never, chapters: [], nodes: {} },
      3,
      'white'
    );
    expect(empty).toEqual({ probes: [], total: 0, capped: false });
  });

  it('terminates on a graph that genuinely loops', () => {
    // A REAL cycle, not a node pointing at itself. 1.Nf3 Nf6 2.Ng1 Ng8 returns
    // to the starting position, and `positionKey` drops the move counters, so
    // the fourth node's key IS the first node's key. Every move around the loop
    // is legal, so nothing but the cycle guard stops the walk.
    //
    // The first version of this fixture had one node whose `next` was itself.
    // It terminated — but because replaying the same move from the resulting
    // position is illegal, not because the guard fired. Deleting the guard left
    // it green, which is how a fixture proves nothing.
    const start = key(START);
    const afterNf3 = after('Nf3');
    const afterNf6 = after('Nf3', 'Nf6');
    const afterNg1 = after('Nf3', 'Nf6', 'Ng1');
    expect(after('Nf3', 'Nf6', 'Ng1', 'Ng8')).toBe(start);

    const nodes = {
      [start]: { p: 0, w: 1, g: 100, ch: 0, end: null, us: 'Nf3', next: afterNf3 },
      [afterNf3]: { p: 1, w: 1, g: 100, ch: 0, end: null, them: [{ san: 'Nf6', share: 1, to: afterNf6 }] },
      [afterNf6]: { p: 2, w: 1, g: 100, ch: 0, end: null, us: 'Ng1', next: afterNg1 },
      [afterNg1]: { p: 3, w: 1, g: 100, ch: 0, end: null, them: [{ san: 'Ng8', share: 1, to: start }] },
    } as never;

    const result = probesOf(
      { meta: { root: [] } as never, chapters: [{ i: 0, at: start, line: [], title: null, share: 1, cum: 1, nodes: 4 }], nodes },
      0,
      'white'
    );
    // Two decisions, asked once each, and the call returned at all.
    expect(result.probes.map((p: CourseProbe) => p.san).sort()).toEqual(['Nf3', 'Ng1']);
  });

  it('asks a position once when two replies transpose into it', () => {
    // THE DEDUPE, shown rather than assumed. Two of the opponent's moves reach
    // the same position; it is one thing to learn, so it is one question.
    const root = key(START);
    const viaNf3 = after('Nf3', 'Nf6', 'g3');
    const viaG3 = after('g3', 'Nf6', 'Nf3');
    expect(viaNf3).toBe(viaG3);

    const oneMove = after('d4');
    const nodes = {
      [root]: {
        p: 0, w: 1, g: 100, ch: 0, end: null,
        them: [
          { san: 'Nf3', share: 0.5, to: after('Nf3') },
          { san: 'g3', share: 0.5, to: after('g3') },
        ],
      },
      [after('Nf3')]: { p: 1, w: 0.5, g: 50, ch: 0, end: null, us: 'Nf6', next: after('Nf3', 'Nf6') },
      [after('g3')]: { p: 1, w: 0.5, g: 50, ch: 0, end: null, us: 'Nf6', next: after('g3', 'Nf6') },
      [after('Nf3', 'Nf6')]: {
        p: 2, w: 0.5, g: 50, ch: 0, end: null,
        them: [{ san: 'g3', share: 1, to: viaNf3 }],
      },
      [after('g3', 'Nf6')]: {
        p: 2, w: 0.5, g: 50, ch: 0, end: null,
        them: [{ san: 'Nf3', share: 1, to: viaG3 }],
      },
      [viaNf3]: { p: 3, w: 1, g: 100, ch: 0, end: 'depth', us: 'd5' },
    } as never;

    const { probes, total } = probesOf(
      { meta: { root: [] } as never, chapters: [{ i: 0, at: root, line: [], title: null, share: 1, cum: 1, nodes: 6 }], nodes },
      0,
      'black'
    );
    // Nf6 from two different first moves is two distinct positions; d5 in the
    // transposed position is ONE.
    expect(probes.filter(p => p.san === 'd5')).toHaveLength(1);
    expect(new Set(probes.map(p => p.key)).size).toBe(probes.length);
    expect(total).toBe(probes.length);
    expect(oneMove).toBeTruthy();
  });

  it('still asks a shared node that sits BELOW the chapter root', () => {
    // The chapter walk stops at nodes belonging to another chapter, and must
    // NOT stop at nodes belonging to every chapter. In the shipped corpus every
    // `ch: -1` node happens to sit above its chapter root, so the prefix walk
    // reaches them and this clause is never exercised by real data — deleting
    // it leaves the whole suite green. That is exactly the kind of guard that
    // rots into a lie, so it gets a graph that makes it do something.
    const root = key(START);
    const afterE4 = after('e4');
    const afterE5 = after('e4', 'e5');
    const nodes = {
      [root]: { p: 0, w: 1, g: 100, ch: 0, end: null, us: 'e4', next: afterE4 },
      [afterE4]: { p: 1, w: 1, g: 100, ch: 0, end: null, them: [{ san: 'e5', share: 1, to: afterE5 }] },
      // Shared by every chapter, and below this chapter's root.
      [afterE5]: { p: 2, w: 1, g: 100, ch: -1, end: 'depth', us: 'Nf3' },
    } as never;

    const { probes } = probesOf(
      { meta: { root: [] } as never, chapters: [{ i: 0, at: root, line: [], title: null, share: 1, cum: 1, nodes: 3 }], nodes },
      0,
      'white'
    );
    expect(probes.map((p: CourseProbe) => p.san).sort()).toEqual(['Nf3', 'e4']);
  });

  it('does not ask a decision that belongs to another chapter', () => {
    const root = key(START);
    const afterE4 = after('e4');
    const afterE5 = after('e4', 'e5');
    const nodes = {
      [root]: { p: 0, w: 1, g: 100, ch: 0, end: null, us: 'e4', next: afterE4 },
      [afterE4]: { p: 1, w: 1, g: 100, ch: 0, end: null, them: [{ san: 'e5', share: 1, to: afterE5 }] },
      // Chapter 1's, reachable from chapter 0 by an edge. Chapter 1 asks it.
      [afterE5]: { p: 2, w: 1, g: 100, ch: 1, end: 'depth', us: 'Nf3' },
    } as never;

    const { probes } = probesOf(
      { meta: { root: [] } as never, chapters: [{ i: 0, at: root, line: [], title: null, share: 1, cum: 1, nodes: 3 }], nodes },
      0,
      'white'
    );
    expect(probes.map((p: CourseProbe) => p.san)).toEqual(['e4']);
  });

  it('orders the most likely decision first', () => {
    const root = key(START);
    const afterE4 = after('e4');
    const afterD4 = after('d4');
    const nodes = {
      [root]: {
        p: 0, w: 1, g: 100, ch: 0, end: null,
        them: [
          { san: 'e4', share: 0.2, to: afterE4 },
          { san: 'd4', share: 0.8, to: afterD4 },
        ],
      },
      [afterE4]: { p: 1, w: 0.2, g: 20, ch: 0, end: 'depth', us: 'e5' },
      [afterD4]: { p: 1, w: 0.8, g: 80, ch: 0, end: 'depth', us: 'd5' },
    } as never;
    const { probes } = probesOf(
      { meta: { root: [] } as never, chapters: [{ i: 0, at: root, line: [], title: null, share: 1, cum: 1, nodes: 3 }], nodes },
      0,
      'black'
    );
    expect(probes.map((p: CourseProbe) => p.san)).toEqual(['d5', 'e5']);
  });
});

describe('sourceWords', () => {
  it('says nothing about the ordinary case', () => {
    // 97.6% of decisions are corpus-confirmed. A row printed on 97 cards in a
    // hundred is wallpaper, and lineNotes already wrote that rule down.
    expect(sourceWords('corpus-confirmed')).toBeNull();
  });

  it('speaks up only where the move deviates', () => {
    expect(sourceWords('engine')).toBe("the engine's choice over the popular move");
    expect(sourceWords('corpus')).toBe('most played, not engine-checked');
    expect(sourceWords('setup')).toBe("this system's setup, engine-checked");
  });
});

describe('the evaluation says the same thing twice', () => {
  it('agrees in sign with the words beside it, for both sides', () => {
    // The teach card prints a number and, directly under it, evalWords' reading
    // of the SAME score. They converted independently, so on a black course the
    // number was white-relative and the words were not: "+0.15" above "slightly
    // worse". One conversion now, used by both.
    const better = ['slightly better', 'better for you', 'winning'];
    const worse = ['slightly worse', 'worse for you', 'lost'];

    for (const cp of [-400, -200, -80, -20, 0, 20, 80, 200, 400]) {
      for (const side of ['white', 'black'] as const) {
        const ours = cpForSide(cp, side);
        const words = evalWords(cp, side)!;
        if (better.includes(words)) expect(ours).toBeGreaterThan(0);
        if (worse.includes(words)) expect(ours).toBeLessThan(0);
      }
    }
  });

  it('flips the sign for black and leaves white alone', () => {
    expect(cpForSide(120, 'white')).toBe(120);
    expect(cpForSide(120, 'black')).toBe(-120);
    // THE ZERO: a score of zero is zero from either side, so the conversion
    // cannot invent an advantage for anybody.
    expect(cpForSide(0, 'white')).toBe(0);
    expect(cpForSide(0, 'black')).toBe(-0);
  });
});
