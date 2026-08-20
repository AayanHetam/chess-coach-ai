// "This is enough, stop working on openings."
//
// That sentence is the most useful thing on the page and the most dangerous.
// Said too early it sends a player into games with a hole a prepared opponent
// will find every time; said too late it keeps somebody grinding theory when
// tactics would have gained them two hundred points.
//
// The other thing guarded here is the separation of LEVEL from LOAD. Collapsing
// them into one difficulty score makes the King's Indian unrecommendable to the
// players it suits best, which is the exact mistake this model exists to avoid.

import { describe, expect, it } from 'vitest';
import {
  BANDS,
  bandFor,
  levelFit,
  nextBand,
  sufficiency,
  verdict,
  withinCeiling,
} from '@/lib/repertoire/levels';

const band = (id: string) => BANDS.find(b => b.id === id)!;

describe('bandFor', () => {
  it('places a rating in its band', () => {
    expect(bandFor(450).id).toBe('new');
    expect(bandFor(900).id).toBe('beginner');
    expect(bandFor(1350).id).toBe('improving');
    expect(bandFor(1800).id).toBe('club');
    expect(bandFor(2400).id).toBe('strong');
  });

  it('puts a boundary rating in the higher band', () => {
    expect(bandFor(800).id).toBe('beginner');
    expect(bandFor(799).id).toBe('new');
  });

  it('guesses the middle for an unrated player, not the bottom', () => {
    // Guessing "beginner" hides the sharp openings from somebody who may well
    // want them. Being wrong upward only costs a longer list.
    expect(bandFor(undefined).id).toBe('improving');
    expect(bandFor(null).id).toBe('improving');
    expect(bandFor(Number.NaN).id).toBe('improving');
  });

  it('asks for less the lower the band', () => {
    for (let i = 1; i < BANDS.length; i++) {
      expect(BANDS[i].depth).toBeGreaterThanOrEqual(BANDS[i - 1].depth);
      expect(BANDS[i].enoughAt).toBeGreaterThanOrEqual(BANDS[i - 1].enoughAt);
    }
  });

  it('runs out at the top', () => {
    expect(nextBand(band('new'))?.id).toBe('beginner');
    expect(nextBand(band('strong'))).toBeNull();
  });
});

describe('level and load are separate axes', () => {
  const kid = { load: 'heavy' as const, level: 'beginner' as const };
  const pirc = { load: 'light' as const, level: 'improving' as const };

  it('recommends a heavy opening to a beginner when it suits them', () => {
    // The King's Indian: enormous theory, one plan. A single difficulty score
    // would bury it, and it is one of the best 1.d4 answers at that level.
    expect(levelFit(kid, band('beginner'))).toBeGreaterThan(0);
  });

  it('still says the heavy one is heavy', () => {
    // Suiting the level and being cheap to learn are different claims, and the
    // card has to make both of them.
    expect(withinCeiling(kid, band('beginner'))).toBe(false);
  });

  it('ranks a light opening that needs understanding BELOW a heavy one that does not', () => {
    // The Pirc is almost no theory and you concede the centre on purpose; the
    // King's Indian is a mountain of theory and one plan. For a beginner the
    // King's Indian is the better bet, and only an ordering that keeps level
    // and load apart can say so.
    expect(levelFit(pirc, band('beginner'))).toBeLessThan(levelFit(kid, band('beginner')));
    // And it is still the cheaper of the two to learn, which the card says.
    expect(withinCeiling(pirc, band('beginner'))).toBe(true);
    expect(withinCeiling(kid, band('beginner'))).toBe(false);
  });

  it('warns only on a real stretch, not on one band', () => {
    // Almost every sound opening sits a band above somebody. Flagging that
    // turned every option in the 1.d4 list red for a 700, which hid the two
    // that would genuinely have cost them a year.
    const oneUp = { load: 'medium' as const, level: 'improving' as const };
    const twoUp = { load: 'heavy' as const, level: 'club' as const };
    expect(levelFit(oneUp, band('beginner'))).toBeGreaterThan(0);
    expect(levelFit(twoUp, band('beginner'))).toBeLessThan(0);
  });

  it('warns harder the further above the player an opening is', () => {
    const najdorf = { load: 'heavy' as const, level: 'club' as const };
    expect(levelFit(najdorf, band('improving'))).toBeGreaterThan(levelFit(najdorf, band('beginner')));
  });

  it('never rules anything out', () => {
    // A ranking, not a filter. A motivated 900 who wants the Najdorf gets it.
    const najdorf = { load: 'heavy' as const, level: 'club' as const };
    expect(Number.isFinite(levelFit(najdorf, band('new')))).toBe(true);
  });
});

describe('sufficiency', () => {
  it('is not enough while a real hole is left', () => {
    const s = sufficiency(0.6, band('beginner'));
    expect(s.enough).toBe(false);
    expect(s.shortBy).toBeCloseTo(0.25, 3);
  });

  it('is enough below 100%, because the tail never comes up', () => {
    // At 900 the twelfth-most-common branch will not appear all year, and
    // demanding every slot be filled would mean nobody is ever finished.
    const s = sufficiency(0.86, band('beginner'));
    expect(s.enough).toBe(true);
    expect(s.shortBy).toBe(0);
  });

  it('asks a stronger player for more of the same repertoire', () => {
    // 0.86 finishes a beginner and does not finish a club player.
    expect(sufficiency(0.86, band('beginner')).enough).toBe(true);
    expect(sufficiency(0.86, band('club')).enough).toBe(false);
  });

  it('names the rating it will carry them to', () => {
    expect(sufficiency(0.9, band('beginner')).goodUntil).toBe(1200);
    expect(sufficiency(0.99, band('strong')).goodUntil).toBeNull();
  });
});

describe('verdict', () => {
  it('says how much is missing when it is not finished', () => {
    expect(verdict(0.5, band('improving'))).toMatch(/Not finished/i);
    expect(verdict(0.5, band('improving'))).toMatch(/40/);
  });

  it('tells a finished player to stop', () => {
    const said = verdict(0.95, band('beginner'));
    expect(said).toMatch(/enough/i);
    expect(said).toMatch(/1200/);
  });

  it('admits where our depth runs out rather than claiming completeness', () => {
    // Titled players are not the audience, and pretending otherwise is the
    // one claim on this page that a strong player would instantly disbelieve.
    expect(verdict(0.99, band('strong'))).toMatch(/move fourteen/i);
  });
});

describe('ordering above the band', () => {
  it('puts two bands above ahead of three', () => {
    // A flat penalty tied them and let catalogue order decide, which is not a
    // claim about chess.
    const twoUp = { load: 'medium' as const, level: 'improving' as const };
    const threeUp = { load: 'heavy' as const, level: 'club' as const };
    expect(levelFit(twoUp, band('new'))).toBeGreaterThan(levelFit(threeUp, band('new')));
    // Both are still flagged.
    expect(levelFit(twoUp, band('new'))).toBeLessThan(0);
  });
});
