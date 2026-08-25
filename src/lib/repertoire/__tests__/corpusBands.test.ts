// The corpus is banded on one scale and the player is banded on another.
//
// ─────────────────────────────────────────────────────────────────────────────
// `BANDS` has floors of 800 / 1200 / 1600 / 2000 and those are CHESS.COM
// numbers — `platformRatings.ts` normalises everyone onto that scale and
// `resolveUserRating` returns a number on it. The Lichess dumps carry raw
// Lichess Elo, and the two are far apart: chess.com 1200 is about Lichess 1543.
//
// Bucketing raw Lichess Elo against those floors would put a Lichess 1200 —
// a `beginner` on the common scale — into `improving`, a whole band out. The
// tree would build, the shares would sum to one, and every frequency in the
// product would be measuring a population its own label misnames.
//
// These tests are the guard, and they are all about DRIFT: two tables saying
// the same thing in two languages, in two files, one of which is a build script
// that cannot import the other.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import {
  BAND_FLOORS,
  bandOfCommon,
  bandOfGame,
  bandOfLichess,
  speedOf,
  toCommonScale,
} from '../../../../scripts/openings/lib/bands.mjs';
import { BANDS, bandFor } from '../levels';
import { normalizeRating } from '@/lib/rating/platformRatings';

describe('the two band tables', () => {
  it('have the same bands, in the same order, with the same floors', () => {
    expect(BAND_FLOORS.map((b: { id: string }) => b.id)).toEqual(BANDS.map(b => b.id));
    expect(BAND_FLOORS.map((b: { floor: number }) => b.floor)).toEqual(BANDS.map(b => b.floor));
  });

  it('bucket a common-scale rating identically', () => {
    for (let rating = 0; rating <= 3000; rating += 25) {
      expect(bandOfCommon(rating), `rating ${rating}`).toBe(bandFor(rating).id);
    }
  });

  it('differ only where bandFor has a default and the corpus must not', () => {
    // `bandFor(undefined)` is `improving`, deliberately — being wrong upward
    // costs a player a longer list. A corpus builder handed a game with no
    // rating must DROP it, because guessing would file real games under a band
    // they were not played in.
    expect(bandFor(undefined).id).toBe('improving');
    expect(bandOfCommon(Number.NaN)).toBeNull();
    expect(bandOfLichess(Number.NaN)).toBeNull();
  });
});

describe('the two conversions', () => {
  it('agree at every rating the dumps contain', () => {
    for (let elo = 400; elo <= 3200; elo += 10) {
      expect(toCommonScale(elo, 'lichess'), `lichess ${elo}`).toBe(
        normalizeRating(elo, 'lichess')
      );
    }
  });

  it('leave the common scale alone', () => {
    for (const rating of [700, 1200, 1873, 2400]) {
      expect(toCommonScale(rating, 'chesscom')).toBe(normalizeRating(rating, 'chesscom'));
    }
  });
});

describe('banding a raw Lichess rating', () => {
  /**
   * THE MEASUREMENT. Each of these is a whole band's difference between the
   * naive bucketing and the correct one, and neither would look wrong.
   */
  it('is a band lower than bucketing the raw number would be', () => {
    expect(bandOfLichess(1200)).toBe('beginner');
    // The naive version — floors applied to the raw Elo — would say this:
    expect(bandFor(1200).id).toBe('improving');

    expect(bandOfLichess(1700)).toBe('improving');
    expect(bandFor(1700).id).toBe('club');
  });

  it('puts the boundaries where the anchors put them', () => {
    // Measured off the anchor table, not chosen: these are the raw Lichess
    // ratings at which each common-scale floor is first reached.
    expect(bandOfLichess(1039)).toBe('new');
    expect(bandOfLichess(1040)).toBe('beginner');
    expect(bandOfLichess(1542)).toBe('beginner');
    expect(bandOfLichess(1543)).toBe('improving');
    expect(bandOfLichess(1874)).toBe('improving');
    expect(bandOfLichess(1875)).toBe('club');
    expect(bandOfLichess(2174)).toBe('club');
    expect(bandOfLichess(2175)).toBe('strong');
  });
});

describe('speedOf', () => {
  it('classifies on the estimated duration, not the base clock', () => {
    // 3+2 is blitz and 3+10 is rapid. Using the base alone would file a large
    // slice of the site under the wrong speed.
    expect(speedOf('180+0')).toBe('blitz');
    expect(speedOf('180+2')).toBe('blitz');
    expect(speedOf('180+10')).toBe('rapid');
    expect(speedOf('600+0')).toBe('rapid');
    expect(speedOf('60+0')).toBe('bullet');
    expect(speedOf('1800+0')).toBe('classical');
    expect(speedOf('-')).toBe('correspondence');
  });

  it('has no opinion about a header it cannot read', () => {
    for (const bad of ['', 'abc', '300', undefined, null, 42]) {
      expect(speedOf(bad as unknown as string), String(bad)).toBeNull();
    }
  });
});

describe('bandOfGame', () => {
  const game = (over: Record<string, string>) => ({
    TimeControl: '300+0',
    WhiteElo: '1600',
    BlackElo: '1600',
    ...over,
  });

  it('bands a game both players belong to', () => {
    expect(bandOfGame(game({}))).toBe('improving');
  });

  it('drops a mismatch rather than filing it under either band', () => {
    // A 1200 against a 2100 is not what either band's play looks like: one side
    // is out of their depth and the other is not being tested. Counting it
    // would import the stronger player's repertoire into the weaker's numbers.
    expect(bandOfGame(game({ WhiteElo: '1200', BlackElo: '2100' }))).toBeNull();
    // The control: both inside one band, and it counts.
    expect(bandOfGame(game({ WhiteElo: '1560', BlackElo: '1860' }))).toBe('improving');
  });

  it('takes blitz and rapid, and nothing else', () => {
    expect(bandOfGame(game({ TimeControl: '600+0' }))).toBe('improving');
    for (const tc of ['60+0', '1800+0', '-', 'junk']) {
      expect(bandOfGame(game({ TimeControl: tc })), tc).toBeNull();
    }
  });

  // ── Zero by definition ──────────────────────────────────────────────────────
  it('drops a game with no rating rather than guessing one', () => {
    expect(bandOfGame(game({ WhiteElo: '?' }))).toBeNull();
    expect(bandOfGame(game({ BlackElo: '' }))).toBeNull();
    expect(bandOfGame({ TimeControl: '300+0' } as Record<string, string>)).toBeNull();
  });
});
