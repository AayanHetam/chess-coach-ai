// Server-only reader for the banded trap files.
//
// Read with `fs` rather than imported, and named in `outputFileTracingIncludes`
// in next.config.js — the file Next actually loads. Put an entry in
// next.config.ts and the page builds clean, deploys clean, and quietly renders
// nothing in production.
//
// NO FALLBACK BAND. "This is how players rated 2300+ lose the Italian" is a
// different sentence from "this is how players at your level lose it", and the
// screen only ever says the second.

import fs from 'fs';
import path from 'path';
import type { Trap, TrapFile } from '@/types/traps';

const files = new Map<string, TrapFile | null>();

/**
 * The bands with a trap file.
 *
 * Every id here MUST have a shipped file and every shipped file MUST be listed.
 * A band listed and not shipped answers "we found nothing" for a band we never
 * looked at; a band shipped and not listed is a file nothing ever reads.
 * Existence is not reachability, and only a both-directions test catches it.
 */
export const TRAP_BANDS = ['new', 'beginner', 'improving', 'club', 'strong'] as const;

const REQUIRED_SCALE = 'common (chess.com)';

/** One band's traps, or null if there is no trustworthy file for it. */
export function loadTraps(band?: string | null): TrapFile | null {
  if (!band || !(TRAP_BANDS as readonly string[]).includes(band)) return null;
  const rel = `src/data/traps.${band}.json`;
  const cached = files.get(rel);
  if (cached !== undefined) return cached;
  let loaded: TrapFile | null = null;
  try {
    loaded = JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')) as TrapFile;
  } catch {
    loaded = null;
  }
  if (loaded && (loaded.meta?.band !== band || !(loaded.meta?.bandScale ?? '').startsWith(REQUIRED_SCALE))) {
    loaded = null;
  }
  files.set(rel, loaded);
  return loaded;
}

export interface CourseTraps {
  /** Ways the reader themselves loses this opening. */
  yours: Trap[];
  /** Ways their OPPONENT loses it — the same data, the opposite lesson. */
  theirs: Trap[];
  /** How many decisions were tested to find them, so zero can be read. */
  tests: number;
  expectedFalsePositives: number;
  games: number | null;
}

/**
 * The traps that live inside one course, split by whose mistake they are.
 *
 * SPLIT, never merged. A move the reader plays and loses to is a warning; the
 * same move played by their opponent is an opportunity. One list would tell a
 * Caro-Kann player that a Caro-Kann blunder is theirs.
 *
 * Null when the band has no file at all, which the caller must render
 * differently from an empty result: "we did not look" and "we looked and found
 * nothing" are different answers, and a reader takes silence for the second.
 */
export function trapsForCourse(
  band: string | null | undefined,
  root: string[],
  side: 'white' | 'black'
): CourseTraps | null {
  const file = loadTraps(band);
  if (!file) return null;
  const inCourse = file.traps.filter(t => root.every((san, i) => t.line[i] === san));
  return {
    yours: inCourse.filter(t => t.side === side),
    theirs: inCourse.filter(t => t.side !== side),
    tests: file.meta.tests,
    expectedFalsePositives: file.meta.expectedFalsePositives,
    games: file.meta.games,
  };
}

/** Test seam. The cache is process-lifetime by design. */
export function resetTrapCache(): void {
  files.clear();
}
