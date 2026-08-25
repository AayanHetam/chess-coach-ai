// The plumbing around the count, where the two silent failures live:
//
//   1. The platform rename. The profile stores `chesscom`; the scout API takes
//      `chess.com`. Passing the profile's value straight through is a 400 that
//      surfaces as "no games found" — a wrong repertoire built from an empty
//      archive, with an error message that sends the user to check their
//      username instead of the code.
//   2. A handle that matches nothing in the archive. buildYourTree happily
//      returns a tree of zeros for it, and zeros render as "you have never
//      played 1.e4" rather than "we could not find you".

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  YOUR_TREE_TTL_MS,
  archiveAccountFor,
  readTreeCache,
  treeCacheKey,
  writeTreeCache,
} from '@/lib/repertoire/useYourTree';

describe('archiveAccountFor', () => {
  it('translates the profile platform to the one the scout API takes', () => {
    // The whole point. `chesscom` is not `chess.com`.
    expect(
      archiveAccountFor({ primaryPlatform: 'chesscom', chesscomUsername: 'aayan' })
    ).toEqual({ platform: 'chess.com', username: 'aayan' });
    expect(
      archiveAccountFor({ primaryPlatform: 'lichess', lichessUsername: 'aayan' })
    ).toEqual({ platform: 'lichess', username: 'aayan' });
  });

  it('honours the primary platform when both handles exist', () => {
    const both = { chesscomUsername: 'cc-handle', lichessUsername: 'li-handle' };
    expect(archiveAccountFor({ ...both, primaryPlatform: 'lichess' })?.username).toBe('li-handle');
    expect(archiveAccountFor({ ...both, primaryPlatform: 'chesscom' })?.username).toBe('cc-handle');
  });

  it('prefers the primary EVEN when the other handle sorts first internally', () => {
    // The regression this shape exists for: an earlier version returned
    // chess.com from a fallback that fired in exactly the cases the
    // chesscom-primary branch did, so that branch was dead and a mutation
    // deleting it changed nothing. Both branches must now be load-bearing.
    const both = { chesscomUsername: 'cc-handle', lichessUsername: 'li-handle' };
    expect(archiveAccountFor({ ...both, primaryPlatform: 'chesscom' })).toEqual({
      platform: 'chess.com',
      username: 'cc-handle',
    });
    // ...and with no primary at all, the fallback picks the OTHER one, which
    // is what makes the assertion above about the branch and not the order.
    expect(archiveAccountFor(both)?.platform).toBe('lichess');
  });

  it('falls back to whichever handle exists when no primary is set', () => {
    expect(archiveAccountFor({ lichessUsername: 'only-li' })).toEqual({
      platform: 'lichess',
      username: 'only-li',
    });
    expect(archiveAccountFor({ chesscomUsername: 'only-cc' })).toEqual({
      platform: 'chess.com',
      username: 'only-cc',
    });
  });

  it('falls back when the primary platform has no handle stored', () => {
    // Somebody who said "mostly Chess.com" but only ever filled in Lichess.
    // Returning null here would ask for a username we already have.
    expect(
      archiveAccountFor({ primaryPlatform: 'chesscom', lichessUsername: 'li-handle' })
    ).toEqual({ platform: 'lichess', username: 'li-handle' });
  });

  // ── Zero by definition: no handle means no account ───────────────────────
  it('returns null when there is nothing to read', () => {
    expect(archiveAccountFor(null)).toBeNull();
    expect(archiveAccountFor(undefined)).toBeNull();
    expect(archiveAccountFor({})).toBeNull();
    expect(archiveAccountFor({ primaryPlatform: 'lichess' })).toBeNull();
  });

  it('treats a blank or whitespace handle as absent, not as a username', () => {
    // A stored empty string would otherwise be sent to the API and 400, or
    // worse, match a game with a missing username field.
    expect(archiveAccountFor({ lichessUsername: '' })).toBeNull();
    expect(archiveAccountFor({ chesscomUsername: '   ' })).toBeNull();
    expect(archiveAccountFor({ primaryPlatform: 'lichess', lichessUsername: '  ' })).toBeNull();
  });

  it('trims a handle rather than sending the spaces', () => {
    expect(archiveAccountFor({ lichessUsername: ' aayan ' })?.username).toBe('aayan');
  });
});

describe('treeCacheKey', () => {
  it('separates platforms and is case-insensitive on the handle', () => {
    expect(treeCacheKey('lichess', 'Aayan')).toBe(treeCacheKey('lichess', 'aayan'));
    expect(treeCacheKey('lichess', 'aayan')).not.toBe(treeCacheKey('chess.com', 'aayan'));
  });
});

/**
 * Same shape as the hole-finder's cache tests: this module guards
 * `typeof window === 'undefined'`, so a node-environment test with no stub
 * takes the early return and every assertion passes vacuously.
 */
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readTreeCache', () => {
  const key = 'cm.test.tree';
  const tree = { games: { white: 40, black: 40 }, unattributed: 0, from: 1, to: 2, slots: {} };

  it('round-trips a fresh entry', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('window', fakeWindow(store));
    writeTreeCache(key, { builtAt: 1000, tree } as never);
    expect(readTreeCache(key, 1000)?.tree.games.white).toBe(40);
  });

  // ── The control: without a window there is nothing to read ──────────────
  // Stated so the tests below cannot pass by taking the server-side early
  // return, which is exactly how this file failed the first time it ran.
  it('is inert with no window rather than throwing', () => {
    vi.stubGlobal('window', undefined);
    expect(readTreeCache(key, 0)).toBeNull();
    expect(() => writeTreeCache(key, { builtAt: 0, tree } as never)).not.toThrow();
  });

  it('expires exactly at the TTL, not a moment before or after', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('window', fakeWindow(store));
    writeTreeCache(key, { builtAt: 0, tree } as never);
    expect(readTreeCache(key, YOUR_TREE_TTL_MS)).not.toBeNull();
    expect(readTreeCache(key, YOUR_TREE_TTL_MS + 1)).toBeNull();
  });

  it('returns null for every shape it cannot trust, instead of throwing', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('window', fakeWindow(store));
    expect(readTreeCache(key, 0)).toBeNull();

    for (const bad of [
      'not json at all',
      JSON.stringify(null),
      JSON.stringify({ builtAt: 'yesterday', tree }),
      JSON.stringify({ builtAt: 1, tree: null }),
      JSON.stringify({ builtAt: 1, tree: {} }),
      JSON.stringify({ builtAt: 1, tree: { slots: {} } }),
      // The one that would slip through a shallow check and then divide by a
      // string: games present, but not numbers.
      JSON.stringify({ builtAt: 1, tree: { slots: {}, games: { white: '40', black: 2 } } }),
    ]) {
      store[key] = bad;
      expect(readTreeCache(key, 1), `should reject: ${bad}`).toBeNull();
    }
  });

  it('survives a storage that throws on both read and write', () => {
    // Safari private mode, and a full quota. Either must cost a refetch, never
    // the page — this runs while the bracket is on screen.
    vi.stubGlobal('window', fakeWindow({}, true));
    expect(readTreeCache(key, 0)).toBeNull();
    expect(() => writeTreeCache(key, { builtAt: 0, tree } as never)).not.toThrow();
  });
});
