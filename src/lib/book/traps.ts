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

/**
 * How many of each kind a course page shows.
 *
 * Five, the same sitting `MAX_DUE_AT_ONCE` uses. Once the corpora were rebuilt
 * from the full month, `1.e4` carried 514 traps at the `new` band and 274 at
 * `club` — a page nobody reads and a warning nobody acts on.
 *
 * The cap is a DISPLAY decision and is never silent: `totalYours` and
 * `totalTheirs` carry the full count so the screen can say "the 5 costliest of
 * 274". A truncated list presented as a complete one is the display-cap bug
 * this codebase has already shipped once.
 */
export const MAX_TRAPS_SHOWN = 5;

/**
 * Total score this mistake costs the band, which is how the shown few are
 * chosen.
 *
 * Games played × score lost per game. NOT `z`, which ranks by how certain we
 * are rather than by how much it matters: at the `new` band, ranking by z puts
 * a 728-game line above an 1,158-game one that costs half as much again. And
 * not share alone, which cannot tell a 4% branch of a huge position from a 4%
 * branch of a rare one.
 *
 * It is the same question /plan's weakest-line card asks: what is actually
 * costing you the most.
 */
export const trapCost = (t: Trap): number => t.games * (t.baseline - t.score);

export interface CourseTraps {
  /** Ways the reader themselves loses this opening, costliest first, capped. */
  yours: Trap[];
  /** Ways their OPPONENT loses it — the same data, the opposite lesson. */
  theirs: Trap[];
  /** How many there are in total, so the cap can be stated rather than hidden. */
  totalYours: number;
  totalTheirs: number;
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
  side: 'white' | 'black',
  cap: number = MAX_TRAPS_SHOWN
): CourseTraps | null {
  const file = loadTraps(band);
  if (!file) return null;
  const inCourse = file.traps.filter(t => root.every((san, i) => t.line[i] === san));
  const rank = (list: Trap[]) => [...list].sort((a, b) => trapCost(b) - trapCost(a));
  const yours = rank(inCourse.filter(t => t.side === side));
  const theirs = rank(inCourse.filter(t => t.side !== side));
  return {
    yours: yours.slice(0, Math.max(0, cap)),
    theirs: theirs.slice(0, Math.max(0, cap)),
    totalYours: yours.length,
    totalTheirs: theirs.length,
    tests: file.meta.tests,
    expectedFalsePositives: file.meta.expectedFalsePositives,
    games: file.meta.games,
  };
}

/** Test seam. The cache is process-lifetime by design. */
export function resetTrapCache(): void {
  files.clear();
}
