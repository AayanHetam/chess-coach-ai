// A catalogue must not look more finished than the product is.
//
// The two failures guarded here are both about honesty of presentation rather
// than arithmetic: a shelf rendered empty (a promise nothing keeps), and a
// course appearing twice so 43 courses read as 20.

import { describe, expect, it } from 'vitest';
import {
  catalogue,
  matches,
  passesFilter,
  progressOf,
  shelves,
  type CatalogueEntry,
  type CourseProgress,
} from '@/lib/courses/catalogue';
import type { CourseIndexEntry } from '@/types/course';

const entry = (over: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  id: 'w-london', name: 'London System', side: 'white', character: 'structure',
  load: 'light', level: 'new', chapters: 6, lines: 120, diagram: ['d4', 'd5', 'Bf4'],
  root: ['d4'],
  blurb: 'The same setup against almost anything.', coverage: 'system', answers: 1,
  ...over,
});

const NONE = new Map<string, CourseProgress>();
const NOBODY = new Set<string>();

describe('catalogue', () => {
  const index: CourseIndexEntry[] = [
    { id: 'w-london', name: 'London System', side: 'white', level: 'new', load: 'light',
      character: 'structure', root: ['d4'], nodes: 1, lines: 2, chapters: 6, evaluated: 1, bytes: 1 },
  ];

  it('joins the generated index with the curated map', () => {
    const [c] = catalogue(index, new Map([['w-london', {
      blurb: 'Same setup, every game.', coverage: 'system' as const,
      diagram: ['d4', 'd5', 'Bf4'], absorbs: 1, slotShare: 1,
    }]]));
    expect(c.blurb).toBe('Same setup, every game.');
    expect(c.answers).toBe(1);
    expect(c.diagram).toEqual(['d4', 'd5', 'Bf4']);
    // The defining line is the course's own, never the diagram's — the diagram
    // walks nine moves deep to find a recognisable picture, which is not what
    // the course is called after.
    expect(c.root).toEqual(['d4']);
  });

  // ── Degradation, not a crash ─────────────────────────────────────────────
  it('falls back to the course root when the map has no entry', () => {
    const [c] = catalogue(index, new Map());
    expect(c.diagram).toEqual(['d4']);
    expect(c.blurb).toBe('');
    // No map entry means no measured coverage, so it claims none rather than
    // defaulting to something flattering.
    expect(c.answers).toBe(0);
  });

  it('falls back when the map entry has an EMPTY diagram', () => {
    const [c] = catalogue(index, new Map([['w-london', {
      blurb: 'x', coverage: 'system' as const, diagram: [], absorbs: 1, slotShare: 1,
    }]]));
    expect(c.diagram).toEqual(['d4']);
  });
});

describe('shelves', () => {
  const london = entry();
  const caro = entry({ id: 'b-caro', name: 'Caro-Kann Defence', side: 'black', answers: 0.47 });
  const kid = entry({ id: 'b-kid', name: "King's Indian", side: 'black', answers: 0.2 });

  // ── The failure this exists to prevent ───────────────────────────────────
  it('omits a shelf with nothing on it rather than rendering it empty', () => {
    const keys = shelves([london], { progress: NONE, mine: NOBODY }).map(s => s.key);
    expect(keys).not.toContain('continue');
    expect(keys).not.toContain('mine');
    expect(keys).not.toContain('black');
    expect(keys).toContain('white');
  });

  it('never shows the same course on both continue and in-your-repertoire', () => {
    const progress = new Map([['b-caro', { started: 2, at: 10, due: 0, nextAt: null }]]);
    const result = shelves([london, caro], { progress, mine: new Set(['b-caro']) });
    const cont = result.find(s => s.key === 'continue')!;
    const mine = result.find(s => s.key === 'mine');
    expect(cont.entries.map(e => e.id)).toEqual(['b-caro']);
    // Present in `mine` too, it would read as two different courses.
    expect(mine).toBeUndefined();
  });

  it('orders continue by most recent, not alphabetically', () => {
    // The recency order here is the REVERSE of the alphabetical one on
    // purpose. The first draft used timestamps that happened to agree with the
    // names, so sorting by name passed the test and the assertion proved
    // nothing — caught by mutating the comparator.
    const progress = new Map([
      ['w-london', { started: 1, at: 99, due: 0, nextAt: null }], // "London System" — later, sorts 2nd by name
      ['b-caro', { started: 1, at: 5, due: 0, nextAt: null }], //    "Caro-Kann"     — earlier, sorts 1st by name
    ]);
    const cont = shelves([london, caro], { progress, mine: NOBODY })
      .find(s => s.key === 'continue')!;
    expect(cont.entries.map(e => e.id)).toEqual(['w-london', 'b-caro']);
    // The control: alphabetically it would be the other way round.
    expect([london, caro].sort((a, b) => a.name.localeCompare(b.name)).map(e => e.id)).toEqual([
      'b-caro',
      'w-london',
    ]);
  });

  it('ranks the answers shelf by measured coverage, high first', () => {
    const ranked = shelves([kid, caro, london], { progress: NONE, mine: NOBODY })
      .find(s => s.key === 'answers')!;
    expect(ranked.ranked).toBe(true);
    expect(ranked.entries.map(e => e.id)).toEqual(['w-london', 'b-caro', 'b-kid']);
  });

  // ── Zero by definition ───────────────────────────────────────────────────
  it('produces no shelves at all from no courses', () => {
    expect(shelves([], { progress: NONE, mine: NOBODY })).toEqual([]);
  });

  it('counts a course with zero started chapters as not started', () => {
    const progress = new Map([['w-london', { started: 0, at: 10, due: 0, nextAt: null }]]);
    const keys = shelves([london], { progress, mine: NOBODY }).map(s => s.key);
    expect(keys).not.toContain('continue');
  });
});

describe('matches', () => {
  const london = entry();

  it('finds a course by name, and by a move somebody would type', () => {
    expect(matches(london, 'london')).toBe(true);
    expect(matches(london, 'Bf4')).toBe(true);
    expect(matches(london, 'setup')).toBe(true);
  });

  it('an empty query matches everything, so the page is never blank', () => {
    expect(matches(london, '')).toBe(true);
    expect(matches(london, '   ')).toBe(true);
  });

  it('does not match something unrelated', () => {
    expect(matches(london, 'najdorf')).toBe(false);
  });
});

describe('passesFilter', () => {
  const london = entry();
  const caro = entry({ id: 'b-caro', side: 'black', load: 'medium' });

  it('all lets everything through', () => {
    expect(passesFilter(london, 'all', NOBODY)).toBe(true);
    expect(passesFilter(caro, 'all', NOBODY)).toBe(true);
  });

  it('splits by side', () => {
    expect(passesFilter(london, 'white', NOBODY)).toBe(true);
    expect(passesFilter(caro, 'white', NOBODY)).toBe(false);
  });

  it('mine is empty when they have chosen nothing, not everything', () => {
    // The dangerous default: an empty bracket must filter to nothing, never
    // fall through to the whole catalogue and imply they own all 43.
    expect(passesFilter(london, 'mine', NOBODY)).toBe(false);
    expect(passesFilter(london, 'mine', new Set(['w-london']))).toBe(true);
  });

  it('least-to-learn is the theory load, not the level', () => {
    expect(passesFilter(london, 'light', NOBODY)).toBe(true);
    expect(passesFilter(caro, 'light', NOBODY)).toBe(false);
  });
});

describe('progressOf', () => {
  it('is zero with no progress at all', () => {
    expect(progressOf(entry(), undefined)).toBe(0);
  });

  it('is a fraction of the chapters', () => {
    expect(progressOf(entry({ chapters: 4 }), { started: 1, at: 0, due: 0, nextAt: null })).toBe(0.25);
  });

  it('cannot exceed one, however stale the stored count', () => {
    expect(progressOf(entry({ chapters: 4 }), { started: 99, at: 0, due: 0, nextAt: null })).toBe(1);
  });

  it('does not divide by zero when a course has no chapters', () => {
    expect(progressOf(entry({ chapters: 0 }), { started: 3, at: 0, due: 0, nextAt: null })).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DUE BACK
//
// Cards are earned: only a miss or a hint creates one. So this shelf is empty
// for a player whose courses have gone well, and empty means NOT RENDERED —
// an encouraging blank state here would be set dressing over a claim.
// ─────────────────────────────────────────────────────────────────────────────

describe('the due shelf', () => {
  const london = entry();
  const caro = entry({ id: 'b-caro', name: 'Caro-Kann Defence', side: 'black', answers: 0.47 });
  const owing = (due: number, at = 10) => ({ started: 2, at, due, nextAt: 1 });

  it('is first on the page when anything is owed', () => {
    const progress = new Map([['b-caro', owing(3)]]);
    const keys = shelves([london, caro], { progress, mine: NOBODY }).map(s => s.key);
    expect(keys[0]).toBe('due');
  });

  // ── Zero by definition ──────────────────────────────────────────────────────
  it('is absent for a player who has not got anything wrong', () => {
    const progress = new Map([['b-caro', { started: 2, at: 10, due: 0, nextAt: null }]]);
    const keys = shelves([london, caro], { progress, mine: NOBODY }).map(s => s.key);
    expect(keys).not.toContain('due');
    // The control: the same course is still on the page, one shelf down.
    expect(keys[0]).toBe('continue');
  });

  it('orders by what is owed, not by when they were last there', () => {
    // The continue shelf is for momentum and is ordered by recency. This one is
    // for debt, and the biggest debt is the one worth opening.
    const progress = new Map([
      ['b-caro', owing(2, 999)],
      ['w-london', owing(9, 1)],
    ]);
    const due = shelves([london, caro], { progress, mine: NOBODY }).find(s => s.key === 'due')!;
    expect(due.entries.map(e => e.id)).toEqual(['w-london', 'b-caro']);
  });

  it('does not repeat an owed course further down the page', () => {
    // 43 courses would otherwise look like 45.
    const progress = new Map([['b-caro', owing(3)]]);
    const found = shelves([london, caro], { progress, mine: new Set(['b-caro']) });
    const cont = found.find(s => s.key === 'continue');
    const ours = found.find(s => s.key === 'mine');
    expect(cont).toBeUndefined();
    expect(ours?.entries.map(e => e.id) ?? []).not.toContain('b-caro');
  });
});
