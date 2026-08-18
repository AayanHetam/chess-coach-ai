// Running the repertoire screen against your own archive, from the plan page.
//
// Opt-in, never on page load. It costs an archive fetch and an engine pass over
// both colours, and a learning page that quietly spends thirty seconds of
// somebody's connection every time they open it is not a page anyone keeps
// open.
//
// Cached in localStorage because the answer changes on the timescale of a
// repertoire, not of a page view. A player does not acquire a new weakness
// between Tuesday and Wednesday, and re-deriving one from the same games would
// return the same line at the cost of another sixty cloud requests.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthHeader } from '@/lib/auth/getAuthHeader';
import { createCloudProvider } from '@/lib/scout/holeProviders';
import {
  findRepertoireHoles,
  pickTodaysLine,
  REPERTOIRE_DEFAULTS,
  type RepertoireHole,
  type RepertoireReport,
} from '@/lib/learn/repertoireHole';
import type { ScoutGame } from '@/types/scout';

export const REPERTOIRE_CACHE_PREFIX = 'cm.repertoire.v1';
/** A repertoire changes over months. A week is well inside that. */
export const REPERTOIRE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** How much archive to read. Recency weighting handles the rest. */
export const REPERTOIRE_MONTHS = 12;

export type RepertoirePhase = 'idle' | 'fetching' | 'building' | 'ready' | 'error';

export interface RepertoireState {
  phase: RepertoirePhase;
  /** What is happening, in words a player understands. */
  label: string;
  reports: RepertoireReport[];
  /** The single line to put in front of them, or null when there is none. */
  line: RepertoireHole | null;
  error: string | null;
  /** When the cached answer was computed, or null when it is fresh from a run. */
  cachedAt: number | null;
}

export interface CachedRepertoire {
  builtAt: number;
  reports: RepertoireReport[];
}

const IDLE: RepertoireState = {
  phase: 'idle',
  label: '',
  reports: [],
  line: null,
  error: null,
  cachedAt: null,
};

export function cacheKey(platform: string, username: string): string {
  return `${REPERTOIRE_CACHE_PREFIX}:${platform}:${username.toLowerCase()}`;
}

/**
 * A cached answer, or null when there is none, it has expired, or it cannot be
 * parsed.
 *
 * Every failure path returns null rather than throwing. A corrupt cache entry
 * must degrade to "not measured yet", which costs one rebuild — never to an
 * exception, which on this page would take the whole plan down with it.
 */
export function readCache(
  key: string,
  now: number,
  ttlMs: number = REPERTOIRE_TTL_MS
): CachedRepertoire | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRepertoire;
    if (!parsed || typeof parsed.builtAt !== 'number' || !Array.isArray(parsed.reports)) return null;
    if (now - parsed.builtAt > ttlMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: CachedRepertoire): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or disabled localStorage costs a rebuild next time. It must not
    // cost the user their report now.
  }
}

export interface UseRepertoireOptions {
  platform: 'chess.com' | 'lichess';
  username: string | null;
  /** Injectable for tests. */
  fetchGames?: (username: string, platform: string) => Promise<ScoutGame[]>;
  makeProvider?: () => ReturnType<typeof createCloudProvider>;
  now?: () => number;
}

async function defaultFetchGames(username: string, platform: string): Promise<ScoutGame[]> {
  const res = await fetch('/api/scout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
    body: JSON.stringify({ username, platform, months: REPERTOIRE_MONTHS }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Could not read your games.');
  return (data.games ?? []) as ScoutGame[];
}

/**
 * The measured line from your own games, and a way to (re)measure it.
 *
 * Reads the cache on mount so a returning player sees their line immediately;
 * `run()` is what spends the network.
 */
export function useRepertoireHole(options: UseRepertoireOptions) {
  const {
    platform,
    username,
    fetchGames = defaultFetchGames,
    makeProvider = () => createCloudProvider({ minDepth: 20 }),
    now = () => Date.now(),
  } = options;

  const [state, setState] = useState<RepertoireState>(IDLE);
  // Guards a late run from overwriting a newer one, and a resolved promise from
  // setting state on an unmounted page.
  const runId = useRef(0);

  useEffect(() => {
    if (!username) {
      setState(IDLE);
      return;
    }
    const cached = readCache(cacheKey(platform, username), now());
    if (!cached) {
      setState(IDLE);
      return;
    }
    setState({
      phase: 'ready',
      label: '',
      reports: cached.reports,
      line: pickTodaysLine(cached.reports),
      error: null,
      cachedAt: cached.builtAt,
    });
    // `now` and `fetchGames` are defaults recreated per render; including them
    // would re-read the cache on every render and flicker the card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, username]);

  const run = useCallback(async () => {
    if (!username) return;
    const id = ++runId.current;
    const stale = () => runId.current !== id;

    setState(s => ({ ...s, phase: 'fetching', label: 'Reading your games', error: null }));
    try {
      const games = await fetchGames(username, platform);
      if (stale()) return;
      if (games.length === 0) throw new Error('No games found for that account.');

      const provider = makeProvider();
      const reports: RepertoireReport[] = [];
      // Sequentially, and deliberately: the two colours share one provider, and
      // a provider backed by a single engine conversation returns crossed
      // answers when two evaluations are in flight.
      for (const color of ['white', 'black'] as const) {
        if (stale()) return;
        setState(s => ({
          ...s,
          phase: 'building',
          label: `Checking your games as ${color === 'white' ? 'White' : 'Black'}`,
        }));
        reports.push(
          await findRepertoireHoles(games, username, color, provider, REPERTOIRE_DEFAULTS)
        );
      }
      if (stale()) return;

      const builtAt = now();
      writeCache(cacheKey(platform, username), { builtAt, reports });
      setState({
        phase: 'ready',
        label: '',
        reports,
        line: pickTodaysLine(reports),
        error: null,
        cachedAt: null,
      });
    } catch (e) {
      if (stale()) return;
      setState({
        phase: 'error',
        label: '',
        reports: [],
        line: null,
        error: e instanceof Error ? e.message : 'Could not measure your repertoire.',
        cachedAt: null,
      });
    }
  }, [username, platform, fetchGames, makeProvider, now]);

  return { ...state, run };
}
