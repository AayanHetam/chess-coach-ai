// The cache is the only reason this feature is affordable to open twice, and
// every one of its failure paths has to degrade to "not measured yet" rather
// than to an exception. A throw here does not blank a card — it takes the whole
// /plan page down, because this runs during render.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cacheKey,
  readCache,
  writeCache,
  REPERTOIRE_TTL_MS,
  type CachedRepertoire,
} from '@/lib/learn/useRepertoireHole';
import type { RepertoireReport } from '@/lib/learn/repertoireHole';

function fakeWindow(store: Record<string, string> = {}, broken = false) {
  return {
    localStorage: {
      getItem: (k: string) => {
        if (broken) throw new Error('denied');
        return store[k] ?? null;
      },
      setItem: (k: string, v: string) => {
        if (broken) throw new Error('quota exceeded');
        store[k] = v;
      },
    },
  };
}

const report = (over: Partial<RepertoireReport> = {}): RepertoireReport => ({
  color: 'white',
  holes: [],
  baseline: 0.5,
  baselineGames: 400,
  baselineNeff: 400,
  tests: 12,
  threshold: 0.01,
  confirmed: false,
  evaluated: 10,
  unavailable: 0,
  budgetExhausted: false,
  insufficientData: false,
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cacheKey', () => {
  it('is case-insensitive in the handle', () => {
    // chess.com handles are displayed with whatever capitalisation the user
    // typed. Two spellings of one account must not build two reports.
    expect(cacheKey('chess.com', 'RaghavC')).toBe(cacheKey('chess.com', 'raghavc'));
  });

  it('keeps platforms apart', () => {
    expect(cacheKey('chess.com', 'x')).not.toBe(cacheKey('lichess', 'x'));
  });
});

describe('readCache', () => {
  it('round-trips what was written', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('window', fakeWindow(store));
    const key = cacheKey('chess.com', 'me');

    writeCache(key, { builtAt: 1_000, reports: [report()] });
    const got = readCache(key, 1_000);
    expect(got?.builtAt).toBe(1_000);
    expect(got?.reports).toHaveLength(1);
    expect(got?.reports[0].baselineGames).toBe(400);
  });

  it('expires', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('window', fakeWindow(store));
    const key = cacheKey('chess.com', 'me');
    writeCache(key, { builtAt: 0, reports: [report()] });

    // One millisecond inside the window is still a hit; one outside is not.
    expect(readCache(key, REPERTOIRE_TTL_MS - 1)).not.toBeNull();
    expect(readCache(key, REPERTOIRE_TTL_MS + 1)).toBeNull();
  });

  it('treats an unparseable entry as absent rather than throwing', () => {
    vi.stubGlobal('window', fakeWindow({ k: '{not json' }));
    expect(readCache('k', 0)).toBeNull();
  });

  it('rejects an entry of the wrong shape', () => {
    // A previous version of this feature, or a hand-edited devtools value.
    vi.stubGlobal('window', fakeWindow({ k: JSON.stringify({ reports: 'nope' }) }));
    expect(readCache('k', 0)).toBeNull();

    vi.stubGlobal('window', fakeWindow({ k: JSON.stringify({ builtAt: 1 }) }));
    expect(readCache('k', 0)).toBeNull();
  });

  it('survives storage being unavailable in both directions', () => {
    vi.stubGlobal('window', fakeWindow({}, true));
    expect(readCache('k', 0)).toBeNull();
    // A disabled or full localStorage costs a rebuild next time. It must not
    // cost the user the report they just waited for.
    expect(() => writeCache('k', { builtAt: 0, reports: [] } as CachedRepertoire)).not.toThrow();
  });

  it('is inert on the server, where there is no window at all', () => {
    vi.stubGlobal('window', undefined);
    expect(readCache('k', 0)).toBeNull();
    expect(() => writeCache('k', { builtAt: 0, reports: [] })).not.toThrow();
  });
});
