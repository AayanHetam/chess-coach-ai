// Server-only reader for the banded opening books.
//
// Read with `fs` rather than imported, so webpack never inlines three megabytes
// of JSON into a bundle. The cost is that the tracer cannot see the dependency
// either, which is why the files are named in `outputFileTracingIncludes` in
// next.config.js — the file Next actually loads. Put them in next.config.ts and
// the route builds clean, deploys clean, and 500s on its first production
// request.
//
// Mirrors repertoire/load.ts deliberately, with ONE difference that matters:
// there is no fallback book. A repertoire map falls back to the Elite corpus
// because a bracket must be shown to somebody, and the map says which corpus it
// is. A book cannot do that. "Players rated 2300+ do not play this" is a
// different sentence from "players at your level do not play this", and serving
// the first while the screen says the second would be a claim about the reader
// that nothing measured. A missing band's book is NO book, and the caller says
// it has no data.

import fs from 'fs';
import path from 'path';
import type { OpeningBook } from '@/types/book';

const books = new Map<string, OpeningBook | null>();

/**
 * The bands with a book of their own.
 *
 * Every id here MUST have a shipped file, and every shipped file MUST be listed
 * — a band listed and not shipped answers "no data" for a reader we do have
 * data for, and a band shipped and not listed is a megabyte nothing ever reads.
 * Existence is not reachability; both directions are asserted in the tests.
 */
export const BOOK_BANDS = ['new', 'beginner', 'improving', 'club', 'strong'] as const;
export type BookBandId = (typeof BOOK_BANDS)[number];

/**
 * The scale every banded book must have been measured on.
 *
 * `bandFor()` buckets a rating `platformRatings.ts` has already normalised onto
 * the chess.com scale. A book banded on raw Lichess Elo would file a Lichess
 * 1200 — a beginner on the common scale — under improving, and every share
 * would look completely reasonable while describing the wrong population.
 */
const REQUIRED_SCALE = 'common (chess.com)';

/**
 * The book for one band, or null.
 *
 * Null for every reason: no such band, no file, an unreadable file, or a file
 * that will not say which scale it was cut on. Never a throw — a missing book
 * costs one panel on /analysis, and a throw there would take the page down.
 */
export function loadOpeningBook(band?: string | null): OpeningBook | null {
  if (!band || !(BOOK_BANDS as readonly string[]).includes(band)) return null;
  const rel = `src/data/opening-book.${band}.json`;
  const cached = books.get(rel);
  if (cached !== undefined) return cached;
  let loaded: OpeningBook | null = null;
  try {
    loaded = JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')) as OpeningBook;
  } catch {
    loaded = null;
  }
  if (loaded && (loaded.meta?.band !== band || !(loaded.meta?.bandScale ?? '').startsWith(REQUIRED_SCALE))) {
    loaded = null;
  }
  books.set(rel, loaded);
  return loaded;
}

/** Test seam. The cache is process-lifetime by design. */
export function resetOpeningBookCache(): void {
  books.clear();
}
