// The course catalogue: what to put on a shelf, and in what order.
//
// ─────────────────────────────────────────────────────────────────────────────
// Pure on purpose. The index is read with `fs` (load.ts) and the blurbs come
// off the repertoire map, so the JOIN happens on the server — but every
// decision about what belongs on which shelf is arithmetic over plain objects,
// and lives here where it can be tested without a filesystem or a browser.
//
// WHAT IS NOT HERE, AND WHY
//
// The reference design carries a "Skills Courses" shelf and a "Coming Soon"
// shelf. We have neither: all 43 courses are openings, and there is no list of
// courses we have committed to building. Rendering an empty "Skills" rail, or a
// "Coming Soon" rail populated with things nobody has promised, would be set
// dressing — the page would look more finished than the product is, which is
// the one thing a catalogue must never do.
// ─────────────────────────────────────────────────────────────────────────────

import type { CourseIndexEntry } from '@/types/course';
import type { Character, CoverageKind, TheoryLoad } from '@/types/repertoire';

/** One course, joined with what the repertoire map knows about it. */
export interface CatalogueEntry {
  id: string;
  name: string;
  side: 'white' | 'black';
  character: Character;
  load: TheoryLoad;
  level: string;
  chapters: number;
  lines: number;
  /** SAN from the start to a position the opening is RECOGNISABLE from. */
  diagram: string[];
  /** The line that DEFINES the course, for the caption under its name. */
  root: string[];
  /** Authored, never generated. Empty when the map has none. */
  blurb: string;
  coverage: CoverageKind;
  /**
   * Share of the games they will actually play that this course answers alone.
   *
   * The share of the slot it sits in, times what it absorbs of that slot. Both
   * measured. NOT a quality score, and the Open Sicilian is the case that
   * proves it: the most important Sicilian course on the shelf scores 0.005,
   * because it commits a move and leaves five more decisions. It is bottom of
   * this ranking and it is not the worst course.
   */
  answers: number;
}

/** What the player has done, keyed by course id. */
export interface CourseProgress {
  /** Chapters with at least one answered position. */
  started: number;
  /** Most recent activity, epoch ms, for ordering the "continue" shelf. */
  at: number;
  /**
   * Decisions in this course whose review date has come.
   *
   * Cards are EARNED — only a miss or a hint creates one — so this is zero for
   * a course that has gone well, and that zero is the claim rather than an
   * empty state to fill.
   */
  due: number;
  /** The soonest card in this course, epoch ms, or null when none is scheduled. */
  nextAt: number | null;
}

export interface Shelf {
  key: string;
  title: string;
  /** One line under the title. Null when the title says everything. */
  note: string | null;
  /** Show 1-2-3 numerals behind the tiles, as a ranked shelf. */
  ranked?: boolean;
  entries: CatalogueEntry[];
}

/** Join the generated index with the curated map. Missing map data degrades. */
export function catalogue(
  index: CourseIndexEntry[],
  meta: Map<
    string,
    {
      blurb: string;
      coverage: CoverageKind;
      diagram: string[];
      absorbs: number;
      slotShare: number;
    }
  >
): CatalogueEntry[] {
  return index.map(course => {
    const extra = meta.get(course.id);
    return {
      id: course.id,
      name: course.name,
      side: course.side,
      character: course.character as Character,
      load: course.load as TheoryLoad,
      level: course.level,
      chapters: course.chapters,
      lines: course.lines,
      // The course's own root is the fallback. It is a worse diagram — every
      // Sicilian drawn from `["e4","c5"]` looks identical — but a board is
      // better than a blank tile, and this only fires if the map lost an entry.
      diagram: extra?.diagram?.length ? extra.diagram : course.root,
      root: course.root,
      blurb: extra?.blurb ?? '',
      coverage: extra?.coverage ?? 'move',
      answers: extra ? extra.slotShare * extra.absorbs : 0,
    };
  });
}

/** Free-text match over the things a person would actually type. */
export function matches(entry: CatalogueEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    entry.name.toLowerCase().includes(q) ||
    entry.blurb.toLowerCase().includes(q) ||
    // "e4", "c6", "Nf3" — people search by move at least as often as by name.
    entry.diagram.join(' ').toLowerCase().includes(q) ||
    entry.id.toLowerCase().includes(q)
  );
}

export type FilterId = 'all' | 'white' | 'black' | 'mine' | 'light';

export const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'white', label: 'White openings' },
  { id: 'black', label: 'Black openings' },
  { id: 'mine', label: 'In your repertoire' },
  { id: 'light', label: 'Least to learn' },
];

export function passesFilter(
  entry: CatalogueEntry,
  filter: FilterId,
  mine: ReadonlySet<string>
): boolean {
  switch (filter) {
    case 'white':
      return entry.side === 'white';
    case 'black':
      return entry.side === 'black';
    case 'mine':
      return mine.has(entry.id);
    case 'light':
      return entry.load === 'light';
    default:
      return true;
  }
}

const byName = (a: CatalogueEntry, b: CatalogueEntry) => a.name.localeCompare(b.name);

/**
 * The shelves, in reading order.
 *
 * A shelf with nothing on it is omitted rather than rendered empty. An empty
 * rail is a promise the product has not kept, and four of them make a
 * catalogue look abandoned.
 */
export function shelves(
  entries: CatalogueEntry[],
  opts: {
    progress: ReadonlyMap<string, CourseProgress>;
    /** Course ids the player has chosen in their bracket. */
    mine: ReadonlySet<string>;
  }
): Shelf[] {
  const { progress, mine } = opts;

  // ── Due back, and it goes FIRST.
  //
  // A card exists only because a decision was missed or shown, so this shelf is
  // empty for a player whose courses have gone well — and empty means the shelf
  // is not rendered at all rather than an encouraging blank state. When it is
  // not empty it is the most specific thing the page can say: not "here are 43
  // courses" but "you owe these eleven decisions, in this one".
  //
  // Most owed first, not most recent. The continue shelf is for momentum and is
  // ordered by when you were last here; this one is for debt, and the biggest
  // debt is the one worth opening.
  const owed = entries
    .filter(e => (progress.get(e.id)?.due ?? 0) > 0)
    .sort((a, b) => (progress.get(b.id)?.due ?? 0) - (progress.get(a.id)?.due ?? 0));
  const owedIds = new Set(owed.map(e => e.id));

  const started = entries
    .filter(e => (progress.get(e.id)?.started ?? 0) > 0 && !owedIds.has(e.id))
    .sort((a, b) => (progress.get(b.id)?.at ?? 0) - (progress.get(a.id)?.at ?? 0));
  // Both shelves count as started for the purposes of not repeating a course
  // further down the page.
  const startedIds = new Set(Array.from(owedIds).concat(started.map(e => e.id)));

  const out: Shelf[] = [
    {
      key: 'due',
      title: 'Due back',
      note: 'Decisions you have missed before. Nothing is here that you have not got wrong.',
      entries: owed,
    },
    {
      key: 'continue',
      title: 'Pick up where you left off',
      note: null,
      entries: started,
    },
    {
      key: 'mine',
      title: 'In your repertoire',
      note: 'The courses behind the openings you chose on Learn.',
      // Already-started courses are one shelf up. Repeating them here would
      // make a catalogue of 43 courses look like a catalogue of 20.
      entries: entries.filter(e => mine.has(e.id) && !startedIds.has(e.id)).sort(byName),
    },
    {
      key: 'answers',
      title: 'Answers the most on its own',
      note: 'Share of your games each one covers without needing a second course.',
      ranked: true,
      entries: [...entries].sort((a, b) => b.answers - a.answers).slice(0, 8),
    },
    {
      key: 'white',
      title: 'White openings',
      note: null,
      entries: entries.filter(e => e.side === 'white').sort(byName),
    },
    {
      key: 'black',
      title: 'Black openings',
      note: null,
      entries: entries.filter(e => e.side === 'black').sort(byName),
    },
  ];
  return out.filter(shelf => shelf.entries.length > 0);
}

/** Percent of a course's chapters they have opened, 0-1. */
export function progressOf(entry: CatalogueEntry, progress: CourseProgress | undefined): number {
  if (!progress || entry.chapters <= 0) return 0;
  return Math.min(1, progress.started / entry.chapters);
}
