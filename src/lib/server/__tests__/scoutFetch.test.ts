import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  fetchOpponentGames,
  __resetScoutCacheForTesting,
} from '@/lib/server/scoutFetch';

// Minimal Lichess ndjson fixture — one game per line.
const LICHESS_NDJSON_LINE = JSON.stringify({
  id: 'abc123',
  winner: 'white',
  moves: 'e4 e5 Nf3 Nc6 Bb5 a6',
  players: {
    white: { user: { name: 'WhitePlayer' }, rating: 1800 },
    black: { user: { name: 'BlackPlayer' }, rating: 1750 },
  },
  speed: 'blitz',
  status: 'mate',
  lastMoveAt: 1700000000000,
});

function mockLichessFetch(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: true,
    text: async () => LICHESS_NDJSON_LINE,
  } as Response);
}

describe('scoutFetch: cache module-scoping', () => {
  beforeEach(() => {
    __resetScoutCacheForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('first call hits network; second call with same args returns cached: true and skips fetch', async () => {
    const fetchSpy = mockLichessFetch();
    vi.stubGlobal('fetch', fetchSpy);

    const first = await fetchOpponentGames('testuser_cache_hit', 'lichess', 3);
    expect(first.cached).toBeUndefined();
    expect(first.games).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const second = await fetchOpponentGames('testuser_cache_hit', 'lichess', 3);
    expect(second.cached).toBe(true);
    expect(second.games).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // No new fetch — cache hit.
  });

  it('different (username, platform, months) tuples are isolated in the cache', async () => {
    const fetchSpy = mockLichessFetch();
    vi.stubGlobal('fetch', fetchSpy);

    await fetchOpponentGames('user_a', 'lichess', 3);
    await fetchOpponentGames('user_b', 'lichess', 3);
    await fetchOpponentGames('user_a', 'lichess', 6); // different months
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // Re-request first tuple — should be cached.
    const cached = await fetchOpponentGames('user_a', 'lichess', 3);
    expect(cached.cached).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('username casing normalized in cache key (LRU-safe across case variations)', async () => {
    const fetchSpy = mockLichessFetch();
    vi.stubGlobal('fetch', fetchSpy);

    await fetchOpponentGames('CaseTest', 'lichess', 3);
    const sameUserDifferentCase = await fetchOpponentGames('casetest', 'lichess', 3);
    expect(sameUserDifferentCase.cached).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('payload shape matches the pre-extraction /api/scout response contract', async () => {
    const fetchSpy = mockLichessFetch();
    vi.stubGlobal('fetch', fetchSpy);

    const payload = await fetchOpponentGames('shapecheck', 'lichess', 3);

    expect(payload).toMatchObject({
      username: 'shapecheck',
      platform: 'lichess',
      totalGames: 1,
    });
    expect(payload.dateRange).toMatchObject({
      from: 1700000000000,
      to: 1700000000000,
    });
    expect(payload.games[0]).toMatchObject({
      id: 'abc123',
      platform: 'lichess',
      result: '1-0',
      timeClass: 'blitz',
      termination: 'checkmate',
      whiteUsername: 'WhitePlayer',
      blackUsername: 'BlackPlayer',
      whiteRating: 1800,
      blackRating: 1750,
    });
  });

  it('fetch failure surfaces as thrown error (preserves route 500-path behavior)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false } as Response);
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      fetchOpponentGames('not_a_real_user_xyz', 'lichess', 3),
    ).rejects.toThrow(/not found/);
  });
});
