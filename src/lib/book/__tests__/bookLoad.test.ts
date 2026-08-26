// What the loader refuses, and why refusing is the right answer.
//
// A book is a claim about a population. Serving the wrong one is worse than
// serving none, because the screen's sentence — "players at your level" — does
// not change when the file behind it does. Every refusal here degrades to null,
// and the route turns null into "we have no data for your band", which is true.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const readFileSync = vi.fn();
vi.mock('fs', () => ({ default: { readFileSync: (...a: unknown[]) => readFileSync(...a) } }));

import { BOOK_BANDS, loadOpeningBook, resetOpeningBookCache } from '../load';

const good = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    meta: {
      band: 'improving',
      bandScale: 'common (chess.com), converted from lichess',
      source: 'test',
      games: 1,
      maxPly: 14,
      corpusPositions: 1,
      positions: 1,
      minGames: 10,
      minShare: 0.02,
      generatedFrom: 'test',
      shares: 'per mille',
      ...over,
    },
    book: {},
  });

beforeEach(() => {
  resetOpeningBookCache();
  readFileSync.mockReset();
});

describe('which bands are answerable at all', () => {
  it('answers for every band it lists', () => {
    readFileSync.mockImplementation((p: string) => {
      const band = /opening-book\.(.+)\.json$/.exec(p)?.[1];
      return good({ band });
    });
    for (const band of BOOK_BANDS) expect(loadOpeningBook(band), band).not.toBeNull();
  });

  it('refuses a band it does not have, rather than substituting one', () => {
    // Substituting would put one population's numbers under a sentence about
    // another, and nothing downstream could tell.
    readFileSync.mockReturnValue(good());
    expect(loadOpeningBook('nonsense')).toBeNull();
    expect(loadOpeningBook(null)).toBeNull();
    expect(loadOpeningBook(undefined)).toBeNull();
    expect(readFileSync).not.toHaveBeenCalled();
  });
});

describe('what a file has to say about itself', () => {
  it('refuses a file whose band is not the band asked for', () => {
    // A mis-shipped or mis-copied file. Every share in it would look completely
    // reasonable while describing someone else's opponents.
    readFileSync.mockReturnValue(good({ band: 'club' }));
    expect(loadOpeningBook('improving')).toBeNull();
  });

  it('refuses a file that will not say which rating scale it was cut on', () => {
    // BANDS floors are chess.com numbers; the dumps carry raw Lichess Elo. A
    // Lichess 1200 is a beginner on the common scale and would be filed under
    // improving, silently.
    readFileSync.mockReturnValue(good({ bandScale: null }));
    expect(loadOpeningBook('improving')).toBeNull();
    resetOpeningBookCache();
    readFileSync.mockReturnValue(good({ bandScale: 'raw lichess' }));
    expect(loadOpeningBook('improving')).toBeNull();
  });

  it('accepts the file that is right in both respects', () => {
    // The control. Without it, a loader that returned null unconditionally
    // would pass every test above.
    readFileSync.mockReturnValue(good());
    expect(loadOpeningBook('improving')).not.toBeNull();
  });

  it('degrades to null rather than throwing when the file is missing', () => {
    readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(() => loadOpeningBook('improving')).not.toThrow();
    expect(loadOpeningBook('improving')).toBeNull();
  });

  it('does not re-read a file it has already failed on', () => {
    readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    loadOpeningBook('improving');
    loadOpeningBook('improving');
    expect(readFileSync).toHaveBeenCalledTimes(1);
  });
});
