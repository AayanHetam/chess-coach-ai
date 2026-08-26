// What corpus the numbers on screen were measured on, said in one sentence.
//
// `/learn` claims a frequency is "share of YOUR games". That claim is only
// true if the corpus is people at the reader's level, and for most of this
// product's life it was not: every share came from Lichess Elite 2300+, where
// the London is 1.48% and the Najdorf 2.44%. Measured on the improving band
// those invert — London 3.01%, Najdorf 0.21% — a factor of twenty-four in the
// ratio. A 900 was being told the Najdorf was the likelier of the two.
//
// So the sentence is derived from the map's OWN metadata rather than from what
// the caller asked for. A band whose file is missing falls back to the Elite
// map, and the Elite map arrives saying `band: null` — so "people at your
// level" is structurally unable to appear over 2300+ numbers. The failure mode
// this replaces is not a crash; it is a confident, wrong, unfalsifiable claim.

import { BANDS, type Band, type BandId } from './levels';
import type { RepertoireMapMeta } from '@/types/repertoire';

/** The rating window a band covers, on the common (chess.com) scale. */
export function bandRange(id: BandId): string {
  const index = BANDS.findIndex(b => b.id === id);
  if (index < 0) return '';
  const floor = BANDS[index].floor;
  const next = BANDS[index + 1];
  if (!next) return `${floor}+`;
  if (floor === 0) return `under ${next.floor}`;
  return `${floor}–${next.floor - 1}`;
}

export interface Provenance {
  /** One sentence, ready to render. Never empty. */
  sentence: string;
  /** True only when the corpus measures the reader's own, KNOWN, band. */
  matchesReader: boolean;
  games: number;
}

export interface ProvenanceOptions {
  /**
   * Whether the reader's band was measured or assumed.
   *
   * `bandFor(undefined)` returns `improving` — the middle band, deliberately,
   * because guessing low hides the sharp openings from somebody who may want
   * them. That default is defensible for ORDERING the bracket and indefensible
   * for the sentence: "people at your level" over a band nobody measured is
   * the same species of claim as Elite frequencies labelled as yours, just
   * smaller. An unrated reader gets the range and an honest reason for it.
   */
  bandKnown?: boolean;
}

function games(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString('en-US');
}

/**
 * Say where the frequencies came from, relative to the reader.
 *
 * Three cases, and the third is the one that matters: a band with no corpus of
 * its own gets the Elite numbers AND a sentence admitting it, rather than the
 * numbers alone.
 */
export function provenanceOf(
  meta: RepertoireMapMeta | null | undefined,
  band: Band,
  opts: ProvenanceOptions = {}
): Provenance {
  const n = meta?.games ?? 0;
  const count = games(n);
  const corpus = meta?.band as BandId | null | undefined;
  const known = opts.bandKnown !== false;

  if (corpus && corpus === band.id) {
    return {
      sentence: known
        ? `Frequencies from ${count} games by players rated ${bandRange(corpus)} — people at your level.`
        : `Frequencies from ${count} games by players rated ${bandRange(corpus)}, which is where we place you until you add a rating.`,
      matchesReader: known,
      games: n,
    };
  }
  if (corpus) {
    return {
      sentence: `Frequencies from ${count} games by players rated ${bandRange(corpus)}, not your band.`,
      matchesReader: false,
      games: n,
    };
  }
  // No band on the corpus means the Elite tree: strong players only. Said
  // plainly, because the alternative is a number that quietly describes
  // somebody else's opponents.
  return {
    sentence: `Frequencies from ${count} games by players rated 2300+, who meet different openings than you do.`,
    matchesReader: false,
    games: n,
  };
}
