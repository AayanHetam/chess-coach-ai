import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  default: { readFileSync: vi.fn() },
  readFileSync: vi.fn(),
}));

import fs from 'node:fs';
import { pageUrl, positionKey, resetTheoryCache, theoryCorpus, theoryFor } from '../wikibooksTheory';

const ALAPIN = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/2P5/PP1P1PPP/RNBQKBNR b KQkq - 0 2';

const FILE = JSON.stringify({
  source: 'Wikibooks — Chess Opening Theory',
  url: 'https://en.wikibooks.org/wiki/Chess_Opening_Theory',
  licence: 'CC BY-SA 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  builtAt: '2026-08-19',
  positions: {
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/2P5/PP1P1PPP/RNBQKBNR b KQkq -': {
      t: 'Chess Opening Theory/1. e4/1...c5/2. c3',
      n: 'Alapin variation',
      e: 'B22',
      x: 'This is one of the main "anti-Sicilians".',
    },
  },
});

beforeEach(() => {
  resetTheoryCache();
  vi.mocked(fs.readFileSync).mockReturnValue(FILE);
});
afterEach(() => vi.clearAllMocks());

describe('pageUrl', () => {
  it('keeps the slashes and dots that make the URL work', () => {
    // encodeURIComponent would escape the slashes that ARE the book hierarchy
    // and the dots in "1...c5", turning every attribution link into a 404 —
    // and a broken attribution link is a licence problem, not a cosmetic one.
    expect(pageUrl('Chess Opening Theory/1. e4/1...c5/2. c3')).toBe(
      'https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...c5/2._c3'
    );
  });
});

describe('positionKey', () => {
  it('drops the move counters so transpositions share an entry', () => {
    expect(positionKey('8/8/8/8/8/8/8/8 w KQkq - 0 1')).toBe(positionKey('8/8/8/8/8/8/8/8 w KQkq - 9 40'));
  });
});

describe('theoryFor', () => {
  it('finds the page for a position and carries its attribution', () => {
    const t = theoryFor(ALAPIN);
    expect(t?.name).toBe('Alapin variation');
    expect(t?.eco).toBe('B22');
    expect(t?.excerpt).toContain('anti-Sicilians');
    expect(t?.sourceUrl).toBe(
      'https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...c5/2._c3'
    );
    // Both are required by the licence and neither may be optional in the UI.
    expect(t?.licence).toBe('CC BY-SA 4.0');
    expect(t?.licenceUrl).toContain('creativecommons.org');
  });

  it('matches regardless of the move counters', () => {
    // The same position after a different move order carries different counters.
    expect(theoryFor('rnbqkbnr/pp1ppppp/8/2p5/4P3/2P5/PP1P1PPP/RNBQKBNR b KQkq - 4 12')).not.toBeNull();
  });

  it('returns null when the book has nothing, rather than inventing something', () => {
    expect(theoryFor('8/8/8/8/8/8/8/K6k w - - 0 1')).toBeNull();
  });

  it('reads the corpus once, not once per lookup', () => {
    theoryFor(ALAPIN);
    theoryFor(ALAPIN);
    theoryFor(ALAPIN);
    expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledTimes(1);
  });

  it('degrades to no theory when the corpus is missing', () => {
    resetTheoryCache();
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    // A card that loses a paragraph is fine. A card that throws takes /plan
    // down with it, and this runs during a request.
    expect(() => theoryFor(ALAPIN)).not.toThrow();
    expect(theoryFor(ALAPIN)).toBeNull();
    expect(theoryCorpus()).toBeNull();
  });

  it('does not retry a corpus that failed to load', () => {
    resetTheoryCache();
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    theoryFor(ALAPIN);
    theoryFor(ALAPIN);
    // Re-reading a missing megabyte file on every request is a slow way to keep
    // returning the same null.
    expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledTimes(1);
  });

  it('survives a corrupt corpus', () => {
    resetTheoryCache();
    vi.mocked(fs.readFileSync).mockReturnValue('{ not json');
    expect(theoryFor(ALAPIN)).toBeNull();
  });
});

describe('theoryCorpus', () => {
  it('reports what is loaded, for the UI to credit', () => {
    const c = theoryCorpus();
    expect(c?.positions).toBe(1);
    expect(c?.licence).toBe('CC BY-SA 4.0');
    expect(c?.builtAt).toBe('2026-08-19');
  });
});
