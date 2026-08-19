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

let map: RepertoireMap | null = null;
let mapFailed = false;
let library: OpeningEntry[] | null = null;
let libraryFailed = false;

function readJson<T>(rel: string): T | null {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')) as T;
}

/** The derived bracket. Null if the corpus is missing, never a throw. */
export function loadRepertoireMap(): RepertoireMap | null {
  if (map || mapFailed) return map;
  try {
    map = readJson<RepertoireMap>('src/data/repertoire-map.json');
  } catch {
    // Flagged, so a missing corpus is not re-read on every request.
    mapFailed = true;
    map = null;
  }
  return map;
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
