// What the trainer was asked to open, and where links to it come from.
//
// Three ways in, and they are genuinely different requests rather than three
// spellings of one:
//
//   today            "give me the line that costs me most"      (no query)
//   ?line=<key>      "give me THIS line"                        (the queue)
//   ?review=<key>    "the scheduled review of this line"        (spaced repetition)
//
// Kept pure and away from the page so the identity rules are testable. The one
// rule that matters: a line's identity is `lineKeyOf`, the SAME string used to
// key a saved session and a review card. A second notion of identity here
// would let a link open a line whose paused session could never be found.

import type { ParsedUrlQuery } from 'querystring';
import { lineKeyOf } from '@/lib/learn/trainerProgress';
import { rankHoles, holeLine, type RepertoireHole } from '@/lib/learn/repertoireHole';
import type { RepertoireReport } from '@/lib/learn/repertoireHole';
import type { SessionMode } from '@/lib/learn/trainerSession';

export type TrainerRequest =
  | { kind: 'today' }
  | { kind: 'line'; lineKey: string }
  | { kind: 'review'; lineKey: string };

function one(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function parseTrainerQuery(query: ParsedUrlQuery): TrainerRequest {
  // A review beats a line when both are present. There is no sensible reading
  // of "review this AND start this fresh", and picking the one that preserves
  // a schedule is the one that loses less.
  const review = one(query.review);
  if (review) return { kind: 'review', lineKey: review };
  const line = one(query.line);
  if (line) return { kind: 'line', lineKey: line };
  return { kind: 'today' };
}

export function modeOf(request: TrainerRequest): SessionMode {
  return request.kind === 'review' ? 'review' : 'repair';
}

/** The link that opens a specific measured line in the trainer. */
export function trainerHref(hole: RepertoireHole): string {
  return `/train/opening?line=${encodeURIComponent(lineKeyOf(holeLine(hole)))}`;
}

/** The link that opens a scheduled review. */
export function reviewHref(lineKey: string, full = false): string {
  // A line that has lapsed too often is not a review any more, so its link
  // opens the full repair session instead. Same drill, all three acts.
  return full
    ? `/train/opening?line=${encodeURIComponent(lineKey)}`
    : `/train/opening?review=${encodeURIComponent(lineKey)}`;
}

export type HoleResolution =
  /** We have the line that was asked for. */
  | { status: 'ready'; hole: RepertoireHole }
  /** A specific line was asked for and the current measurement no longer has it. */
  | { status: 'missing' }
  /** Nothing is measured at all. */
  | { status: 'none' };

/**
 * Which measured hole this request refers to.
 *
 * A named line that is no longer in the measurement resolves to `missing`, NOT
 * to today's line. Silently substituting a different line would put a player
 * through a drill for a position they did not ask about, and the board would
 * be the only clue.
 */
export function resolveHole(
  reports: RepertoireReport[],
  request: TrainerRequest
): HoleResolution {
  const holes = rankHoles(reports);
  if (request.kind === 'today') {
    return holes.length > 0 ? { status: 'ready', hole: holes[0] } : { status: 'none' };
  }
  const found = holes.find(h => lineKeyOf(holeLine(h)) === request.lineKey);
  return found ? { status: 'ready', hole: found } : { status: 'missing' };
}
