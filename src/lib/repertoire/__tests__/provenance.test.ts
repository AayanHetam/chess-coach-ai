import { describe, expect, it } from 'vitest';
import { bandRange, provenanceOf } from '../provenance';
import { BANDS, bandFor } from '../levels';
import type { RepertoireMapMeta } from '@/types/repertoire';

function meta(over: Partial<RepertoireMapMeta> = {}): RepertoireMapMeta {
  return {
    source: 'test',
    games: 232_933,
    band: null,
    bandScale: null,
    openings: 3690,
    gapMaxPly: 3,
    gapMinShare: 0.02,
    steerPly: 8,
    otherFirstMoves: 0.05,
    ...over,
  };
}

describe('bandRange', () => {
  it('opens the lowest band and leaves the highest unbounded', () => {
    expect(bandRange('new')).toBe('under 800');
    expect(bandRange('strong')).toBe('2000+');
  });

  it('reads its numbers off BANDS rather than restating them', () => {
    // The ranges must be the bands. Written out by hand they would drift the
    // first time a floor moved, and drift silently: a sentence saying
    // "1200-1599" over a corpus banded at some other boundary is wrong in a
    // way nothing on the page contradicts.
    for (let i = 0; i < BANDS.length - 1; i++) {
      // The lowest band is worded "under 800" rather than "0-799", so it
      // names the ceiling itself; every other band names the last rating
      // inside it. Both are read off the NEXT band's floor, which is the
      // point of the assertion.
      const ceiling = BANDS[i + 1].floor;
      expect(bandRange(BANDS[i].id)).toContain(String(i === 0 ? ceiling : ceiling - 1));
    }
  });
});

describe('provenanceOf', () => {
  const improving = bandFor(1400);

  it('claims the reader’s level only when the corpus is the reader’s band', () => {
    const p = provenanceOf(meta({ band: 'improving' }), improving);
    expect(p.matchesReader).toBe(true);
    expect(p.sentence).toContain('people at your level');
    expect(p.sentence).toContain('1200–1599');
  });

  // The one that matters. A band whose file is missing falls back to the Elite
  // map, and the fallback must not inherit the claim the band would have made.
  // This is the whole reason the sentence is derived from the corpus metadata
  // instead of from the band that was asked for.
  it('never claims the reader’s level over the Elite corpus', () => {
    const p = provenanceOf(meta({ band: null }), improving);
    expect(p.matchesReader).toBe(false);
    expect(p.sentence).not.toContain('your level');
    expect(p.sentence).toContain('2300+');
  });

  it('names the other band when the corpus is some band that is not the reader’s', () => {
    const p = provenanceOf(meta({ band: 'club' }), improving);
    expect(p.matchesReader).toBe(false);
    expect(p.sentence).toContain('not your band');
    expect(p.sentence).toContain('1600–1999');
  });

  // Zero by construction: no corpus at all cannot produce a sentence that
  // claims one. There is no band and no game count to be right about.
  it('says something true when there is no corpus', () => {
    const p = provenanceOf(null, improving);
    expect(p.matchesReader).toBe(false);
    expect(p.games).toBe(0);
    expect(p.sentence).not.toContain('your level');
  });

  it('rounds game counts without inventing precision', () => {
    expect(provenanceOf(meta({ band: 'improving', games: 232_933 }), improving).sentence).toContain('233k');
    expect(provenanceOf(meta({ band: 'improving', games: 3_439_091 }), improving).sentence).toContain('3.4M');
  });
});

describe('an unrated reader', () => {
  const assumed = bandFor(undefined);

  // R11. `bandFor(undefined)` returns the MIDDLE band, and does so on purpose:
  // guessing low hides the sharp openings from somebody who may well want
  // them. What is fine for ordering a bracket is not fine for a sentence.
  // "People at your level" over a band nobody measured is the same species of
  // claim as Elite frequencies labelled as the reader's own.
  it('is never told the corpus is people at their level', () => {
    const p = provenanceOf(meta({ band: assumed.id }), assumed, { bandKnown: false });
    expect(p.matchesReader).toBe(false);
    expect(p.sentence).not.toContain('your level');
    expect(p.sentence).toContain('until you add a rating');
    // Still says which population it IS. Withholding the range would trade one
    // unsupported claim for no information at all.
    expect(p.sentence).toContain(bandRange(assumed.id));
  });

  it('is told plainly when the band IS known', () => {
    const p = provenanceOf(meta({ band: assumed.id }), assumed, { bandKnown: true });
    expect(p.matchesReader).toBe(true);
    expect(p.sentence).toContain('people at your level');
  });
});
