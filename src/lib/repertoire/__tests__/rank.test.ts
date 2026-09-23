// The ladder over the coverage number.
//
// The one property that matters: the top rung IS the band's enough line. A
// ladder that said "Battle ready" a point early would be the verdict sentence
// and the rank badge disagreeing on the same card.

import { describe, expect, it } from 'vitest';
import { BANDS, sufficiency } from '@/lib/repertoire/levels';
import { pointsToNext, rankFor, RANK_NAMES } from '@/lib/repertoire/rank';

const band = (id: string) => BANDS.find(b => b.id === id)!;

describe('rankFor', () => {
  it('starts on a blank board and climbs to battle ready', () => {
    const b = band('beginner'); // enough at 0.85
    expect(rankFor(0, b).tier).toBe(0);
    expect(rankFor(0.01, b).tier).toBe(1);
    expect(rankFor(0.34, b).tier).toBe(2); // 0.4 x 0.85
    expect(rankFor(0.64, b).tier).toBe(3); // 0.75 x 0.85
    expect(rankFor(0.85, b).tier).toBe(4);
    expect(rankFor(1, b).name).toBe(RANK_NAMES[4]);
  });

  it('is battle ready exactly when the band says the repertoire is enough', () => {
    for (const b of BANDS) {
      for (let c = 0; c <= 1.0001; c += 0.01) {
        expect(rankFor(c, b).tier === 4).toBe(sufficiency(c, b).enough);
      }
    }
  });

  it('scales the rungs to the band rather than to fixed percentages', () => {
    // 60% is nearly there for somebody starting out (enough at 80%) and only
    // half built for a strong club player (enough at 93%).
    expect(rankFor(0.6, band('new')).tier).toBe(3);
    expect(rankFor(0.6, band('club')).tier).toBe(2);
  });

  it('names the next rung worth climbing to, never the rung you are on', () => {
    const b = band('new');
    expect(rankFor(0, b).nextName).toBe(RANK_NAMES[2]);
    expect(rankFor(0.1, b).nextName).toBe(RANK_NAMES[2]);
    expect(rankFor(0.5, b).nextName).toBe(RANK_NAMES[3]);
    expect(rankFor(0.7, b).nextName).toBe(RANK_NAMES[4]);
    expect(rankFor(0.9, b).nextName).toBeNull();
  });

  it('counts the points to the next rung and stops at the top', () => {
    const b = band('new'); // half at 0.32, near at 0.6, enough at 0.8
    expect(pointsToNext(0, b)).toBe(32);
    expect(pointsToNext(0.5, b)).toBe(10);
    expect(pointsToNext(0.79, b)).toBe(1);
    expect(pointsToNext(0.8, b)).toBeNull();
  });

  it('treats a broken number as nothing rather than throwing on the page', () => {
    expect(rankFor(Number.NaN, band('club')).tier).toBe(0);
    expect(rankFor(-1, band('club')).tier).toBe(0);
    expect(rankFor(7, band('club')).tier).toBe(4);
  });
});
