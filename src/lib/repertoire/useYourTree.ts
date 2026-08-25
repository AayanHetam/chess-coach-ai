// Reading the player's own archive, on request and never on load.
//
// Modelled on useRepertoireHole, and deliberately much cheaper: that hook runs
// an engine pass over sixty positions to find a WEAKNESS. This one only counts,
// so there is no engine, no cloud evaluation and no model — a fetch and a walk
// over the moves. That is the whole reason it can be offered as a button on a
// page somebody opens to browse.
//
// Opt-in, because it costs an archive fetch. Cached, because a repertoire
// changes on the timescale of months and re-deriving the same answer from the
// same games is a download for nothing.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthHeader } from '@/lib/auth/getAuthHeader';
import { buildYourTree, type YourTree } from '@/lib/repertoire/yourTree';
import type { RepertoireSlot } from '@/types/repertoire';
import type { ScoutGame } from '@/types/scout';

export const YOUR_TREE_PREFIX = 'cm.repertoire.mine.v1';
/** A repertoire changes over months. A week is well inside that. */
export const YOUR_TREE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** How much archive to read. */
export const YOUR_TREE_MONTHS = 12;

export type ArchivePlatform = 'chess.com' | 'lichess';

export interface ArchiveAccount {
  platform: ArchivePlatform;
  username: string;
}

interface UsernameBearing {
  chesscomUsername?: string;
  lichessUsername?: string;
  primaryPlatform?: 'chesscom' | 'lichess';
}

/**
 * The account we can read games from, or null when we have none.
 *
 * The quiz already asks for this at signup and stores it, so for most people
 * there is nothing to ask. Callers prompt only when this returns null — which
 * is the "ask if the string is blank" rule, enforced here rather than
 * remembered at each call site.
 *
 * Note the platform rename: the profile stores `chesscom`, the scout API takes
 * `chess.com`. They have been two different strings since the scout shipped,
 * and passing the profile's value straight through is a 400 that reads like an
 * empty archive.
 */
/**
 * The profile's platform names are not the scout API's.
 *
 * `chesscom` vs `chess.com` has been two strings since the scout shipped, and
 * passing the profile's value through unchanged is a 400 that surfaces as "no
 * games found" — which sends the user to check their username instead of the
 * code, and builds their repertoire off an empty archive in the meantime.
 */
const PROFILE_TO_ARCHIVE: Record<'chesscom' | 'lichess', ArchivePlatform> = {
  chesscom: 'chess.com',
  lichess: 'lichess',
};

export function archiveAccountFor(
  profile: UsernameBearing | null | undefined
): ArchiveAccount | null {
  if (!profile) return null;
  const chesscom = profile.chesscomUsername?.trim();
  const lichess = profile.lichessUsername?.trim();

  // Order here is the fallback order when no primary is set and they have
  // both, and it is frankly arbitrary — nothing in the profile says which
  // archive is more representative of how they play. It is fixed rather than
  // incidental so the same profile always reads the same archive, and so
  // neither primary-platform branch below is shadowed by it.
  const accounts: ArchiveAccount[] = [];
  if (lichess) accounts.push({ platform: 'lichess', username: lichess });
  if (chesscom) accounts.push({ platform: 'chess.com', username: chesscom });
  if (accounts.length === 0) return null;

  // What they told us at signup wins when they have both. It does NOT win when
  // they have no handle for it: someone who said "mostly Chess.com" and only
  // ever filled in Lichess still has a readable archive, and asking them for a
  // username we already hold is the thing this function exists to avoid.
  //
  // A table rather than two `if`s, and that is not style. With two platforms
  // and a fixed fallback order, whichever platform the fallback reaches first
  // has a primary-branch that fires in exactly the cases the fallback would —
  // dead code that no test can distinguish from live code, because deleting it
  // changes no output. Written as one mapping there is no branch to be dead:
  // corrupting an entry (which is the failure that matters, since `chesscom`
  // and `chess.com` are different strings) changes the result either way.
  const wanted = profile.primaryPlatform ? PROFILE_TO_ARCHIVE[profile.primaryPlatform] : null;
  return accounts.find(a => a.platform === wanted) ?? accounts[0];
}

export interface CachedTree {
  builtAt: number;
  tree: YourTree;
}

export function treeCacheKey(platform: string, username: string): string {
  return `${YOUR_TREE_PREFIX}:${platform}:${username.toLowerCase()}`;
}

/**
 * A cached tree, or null when there is none, it has expired, or it will not
 * parse. Every failure returns null rather than throwing: a corrupt entry costs
 * one refetch, and on this page a throw would take the bracket down with it.
 *
 * A tree cached against an older map degrades safely without a fingerprint,
 * because slot ids ARE their move lists — `black:d4 Nf6 Bg5` cannot come to
 * mean a different line. A slot the cache has never heard of reads as
 * unmeasured, which is true, rather than as measured zero, which would not be.
 */
export function readTreeCache(
  key: string,
  now: number,
  ttlMs: number = YOUR_TREE_TTL_MS
): CachedTree | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTree;
    if (!parsed || typeof parsed.builtAt !== 'number') return null;
    const tree = parsed.tree;
    if (!tree || typeof tree !== 'object' || !tree.slots || !tree.games) return null;
    if (typeof tree.games.white !== 'number' || typeof tree.games.black !== 'number') return null;
    if (now - parsed.builtAt > ttlMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeTreeCache(key: string, value: CachedTree): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or disabled store costs a refetch next visit. It must never cost
    // the reader their page.
  }
}

export type TreePhase = 'idle' | 'loading' | 'ready' | 'error';

export interface YourTreeState {
  phase: TreePhase;
  tree: YourTree | null;
  error: string | null;
  /** When a shown tree was built, so the page can say how old it is. */
  builtAt: number | null;
}

const IDLE: YourTreeState = { phase: 'idle', tree: null, error: null, builtAt: null };

export interface UseYourTreeOptions {
  account: ArchiveAccount | null;
  slots: RepertoireSlot[];
  fetchGames?: (account: ArchiveAccount) => Promise<ScoutGame[]>;
  now?: () => number;
}

async function defaultFetchGames(account: ArchiveAccount): Promise<ScoutGame[]> {
  const res = await fetch('/api/scout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
    body: JSON.stringify({
      username: account.username,
      platform: account.platform,
      months: YOUR_TREE_MONTHS,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'Could not read your games.');
  return (data?.games ?? []) as ScoutGame[];
}

export function useYourTree(options: UseYourTreeOptions) {
  const { account, slots, fetchGames = defaultFetchGames, now = () => Date.now() } = options;
  const [state, setState] = useState<YourTreeState>(IDLE);
  // Guards a slow run from overwriting a newer one, and a resolved promise from
  // setting state after the page has gone.
  const runId = useRef(0);
  // Read through a ref so a new slots array identity every render cannot
  // re-trigger the cache effect and flicker the card.
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  const key = account ? treeCacheKey(account.platform, account.username) : null;

  useEffect(() => {
    if (!key) {
      setState(IDLE);
      return;
    }
    const cached = readTreeCache(key, Date.now());
    setState(
      cached
        ? { phase: 'ready', tree: cached.tree, error: null, builtAt: cached.builtAt }
        : IDLE
    );
  }, [key]);

  const run = useCallback(async () => {
    if (!account || !key) return;
    const id = ++runId.current;
    const stale = () => runId.current !== id;

    setState(s => ({ ...s, phase: 'loading', error: null }));
    try {
      const games = await fetchGames(account);
      if (stale()) return;
      const tree = buildYourTree(games, account.username, slotsRef.current);
      // Nothing attributed means the handle is not in any of these games —
      // a rename, a typo, or somebody else's archive. Reported as a failure
      // rather than shown as a tree of confident zeros.
      if (tree.games.white + tree.games.black === 0) {
        throw new Error(
          games.length === 0
            ? 'No games found for that account.'
            : `Found ${games.length} games, but none of them are ${account.username}.`
        );
      }
      const builtAt = now();
      writeTreeCache(key, { builtAt, tree });
      setState({ phase: 'ready', tree, error: null, builtAt });
    } catch (e) {
      if (stale()) return;
      setState({
        phase: 'error',
        tree: null,
        error: e instanceof Error ? e.message : 'Could not read your games.',
        builtAt: null,
      });
    }
  }, [account, key, fetchGames, now]);

  return { ...state, run };
}
