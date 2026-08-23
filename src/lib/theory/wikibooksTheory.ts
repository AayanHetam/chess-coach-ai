// Opening theory for a position, from the Wikibooks book "Chess Opening Theory".
//
// SERVER ONLY. The data file is read from disk with `fs`, the same way the
// master corpus is: importing a megabyte of JSON into a page bundle is how this
// repo has broken Vercel builds before.
//
// The text is CC BY-SA 4.0 and is stored and served VERBATIM. Share-alike
// attaches to adapted material, so an unmodified excerpt shown with attribution
// is a quotation and touches nothing else here — the moment anything paraphrases
// or summarises it, that derived text falls under share-alike. Nothing on this
// path may hand the excerpt to a model.
//
// Built by scripts/openings/build-wikibooks-theory.mjs.

import fs from 'node:fs';
import path from 'node:path';
import type { OpeningTheory, TheoryCorpusInfo } from '@/types/theory';

export type { OpeningTheory, TheoryCorpusInfo };

export interface TheoryEntry {
  /** Wikibooks page title — the attribution link. */
  t: string;
  /** Opening name, when the page declares one. */
  n?: string;
  /** ECO code, when the page declares one. */
  e?: string;
  /** The excerpt, verbatim. */
  x: string;
}

export interface TheoryFile {
  source: string;
  url: string;
  licence: string;
  licenceUrl: string;
  builtAt: string;
  positions: Record<string, TheoryEntry>;
}

/** Drop the counters so transpositions share a key. Mirrors positionStats. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/**
 * A Wikibooks page title to its URL.
 *
 * Spaces become underscores; everything else is left alone deliberately.
 * `encodeURIComponent` would escape the slashes that make up the book's
 * hierarchy and the dots in "1...c5", turning every link into a 404.
 */
export function pageUrl(title: string): string {
  return `https://en.wikibooks.org/wiki/${title.replace(/ /g, '_')}`;
}

let cache: TheoryFile | null = null;
let loadFailed = false;

function load(): TheoryFile | null {
  if (cache) return cache;
  if (loadFailed) return null;
  try {
    const file = path.join(process.cwd(), 'src/data/wikibooks-theory.json');
    cache = JSON.parse(fs.readFileSync(file, 'utf8')) as TheoryFile;
    return cache;
  } catch {
    // A missing or corrupt corpus means no theory, never a broken page. This
    // is an enrichment on top of a measurement that is already complete.
    loadFailed = true;
    return null;
  }
}

/** Theory for a position, or null when the book has nothing for it. */
export function theoryFor(fen: string): OpeningTheory | null {
  const data = load();
  if (!data) return null;
  const entry = data.positions[positionKey(fen)];
  if (!entry) return null;
  return {
    name: entry.n,
    eco: entry.e,
    excerpt: entry.x,
    sourceUrl: pageUrl(entry.t),
    sourceTitle: entry.t,
    licence: data.licence,
    licenceUrl: data.licenceUrl,
  };
}

export function theoryCorpus(): TheoryCorpusInfo | null {
  const data = load();
  if (!data) return null;
  return {
    positions: Object.keys(data.positions).length,
    source: data.source,
    url: data.url,
    licence: data.licence,
    builtAt: data.builtAt,
  };
}

/** Test seam: drop the memoised corpus. */
export function resetTheoryCache(): void {
  cache = null;
  loadFailed = false;
}
