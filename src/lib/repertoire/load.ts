// Server-only readers for the two committed data files behind /learn.
//
// Both are read with `fs` rather than imported, so webpack never inlines a
// megabyte of JSON into a bundle. The cost of that is that the tracer cannot
// see the dependency either, which is why both files are named in
// `outputFileTracingIncludes` in next.config.js — the file Next actually loads.
// Put them in next.config.ts and the route builds clean, deploys clean, and
// 500s on its first production request.

import fs from 'fs';
import path from 'path';
import type { OpeningEntry, RepertoireMap } from '@/types/repertoire';

/**
 * One cache entry per band, plus one for the default map.
 *
 * `null` in the map means "tried and failed" — the read is not retried on
 * every request. `undefined` means "not tried yet".
 */
const maps = new Map<string, RepertoireMap | null>();
let library: OpeningEntry[] | null = null;
let libraryFailed = false;

/** The bands that have their own corpus. Anything else falls back. */
export const BANDED_MAPS = ['new', 'beginner', 'improving', 'club'] as const;
export type BandedMapId = (typeof BANDED_MAPS)[number];

/**
 * The scale every banded corpus must have been measured on.
 *
 * `bandFor()` buckets a rating `platformRatings.ts` has already normalised
 * onto the chess.com scale. A corpus banded on raw Lichess Elo would file a
 * Lichess 1200 — a beginner on the common scale — under improving, and every
 * frequency downstream would look completely reasonable while describing the
 * wrong population. So a banded file that does not say which scale it used is
 * not trusted: it is refused here and the caller gets the Elite map, which is
 * honest about being the Elite map.
 */
const REQUIRED_SCALE = 'common (chess.com)';

function readJson<T>(rel: string): T | null {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')) as T;
}

function fileFor(band: string | null | undefined): string {
  return band && (BANDED_MAPS as readonly string[]).includes(band)
    ? `src/data/repertoire-map.${band}.json`
    : 'src/data/repertoire-map.json';
}

/** A banded file must be the band it was asked for, on the scale we band on. */
function trustworthy(candidate: RepertoireMap, band: string): boolean {
  if (candidate.meta?.band !== band) return false;
  return (candidate.meta?.bandScale ?? '').startsWith(REQUIRED_SCALE);
}

/**
 * The derived bracket, measured on the corpus closest to the caller's band.
 *
 * Null if no corpus is readable at all, never a throw. A band with no file of
 * its own — or a file that fails the scale check — degrades to the Elite map
 * rather than to nothing, and the map it returns always states which corpus it
 * actually is. Nothing downstream has to remember whether a fallback happened.
 */
export function loadRepertoireMap(band?: string | null): RepertoireMap | null {
  const rel = fileFor(band);
  const cached = maps.get(rel);
  if (cached !== undefined) return cached ?? fallback(rel);
  let loaded: RepertoireMap | null = null;
  try {
    loaded = readJson<RepertoireMap>(rel);
  } catch {
    loaded = null;
  }
  if (loaded && rel !== 'src/data/repertoire-map.json' && !trustworthy(loaded, band as string)) {
    loaded = null;
  }
  maps.set(rel, loaded);
  return loaded ?? fallback(rel);
}

/** The Elite map, for a band whose own file is missing or untrusted. */
function fallback(rel: string): RepertoireMap | null {
  return rel === 'src/data/repertoire-map.json' ? null : loadRepertoireMap(null);
}

/** Test seam. The caches are process-lifetime by design. */
export function resetRepertoireMapCache(): void {
  maps.clear();
}

/** SAN moves out of PGN movetext. */
export function sansOfPgn(pgn: string | null): string[] {
  if (!pgn) return [];
  return pgn
    .replace(/\d+\.(\.\.)?/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Every named opening, for the searchable library. */
export function loadOpeningLibrary(): OpeningEntry[] {
  if (library || libraryFailed) return library ?? [];
  try {
    const raw = readJson<Array<{ name: string; eco: string | null; pgn: string | null }>>(
      'src/data/openings.json'
    );
    library = (raw ?? [])
      .filter(o => o.pgn)
      .map(o => ({ name: o.name, eco: o.eco ?? null, pgn: o.pgn, moves: sansOfPgn(o.pgn) }));
  } catch {
    libraryFailed = true;
    library = null;
  }
  return library ?? [];
}
