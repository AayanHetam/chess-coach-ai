"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getChessComUserRecentGames } from "@/lib/chessCom";
import { getLichessUserRecentGames } from "@/lib/lichess";
import {
  mergeRecentGames,
  normalizeChessComGame,
  normalizeLichessGame,
  type RecentGame,
} from "./recentGames";

/**
 * The user's recent games, fetched automatically from the platforms on their
 * profile.
 *
 * Nobody tells us they played a game. Both platform fetchers have existed and
 * worked for a long time, and the profile has stored `chesscomUsername` /
 * `lichessUsername` for just as long — but every existing call site made the
 * user type a username into a form first. This connects the two.
 *
 * Both endpoints are public and unauthenticated (chess.com's monthly archive
 * and Lichess's ndjson export), so this runs client-side with no server work
 * and no credentials.
 */

export interface UseRecentGames {
  games: RecentGame[];
  loading: boolean;
  /** Set only when EVERY configured platform failed — see the reducer below. */
  error: string | null;
  /** False when the user has linked no platform; drives the empty state. */
  hasLinkedAccount: boolean;
  refresh: () => void;
}

/**
 * Module-level cache. These are third-party APIs with their own rate limits,
 * and remounting the page must not re-hit them. Short TTL because the whole
 * point is noticing a game the user just finished.
 */
const CACHE_TTL_MS = 3 * 60 * 1000;
const cache = new Map<string, { at: number; games: RecentGame[] }>();

export function useRecentGames(limit = 10): UseRecentGames {
  const { profile } = useAuth();
  const chesscom = profile?.chesscomUsername?.trim() || "";
  const lichess = profile?.lichessUsername?.trim() || "";
  const hasLinkedAccount = Boolean(chesscom || lichess);

  const [games, setGames] = useState<RecentGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    cache.delete(`${chesscom}|${lichess}`);
    setNonce((n) => n + 1);
  }, [chesscom, lichess]);

  useEffect(() => {
    if (!hasLinkedAccount) {
      setGames([]);
      setError(null);
      return;
    }

    const key = `${chesscom}|${lichess}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      setGames(hit.games);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);

    void (async () => {
      const collected: RecentGame[] = [];
      let attempted = 0;
      let failed = 0;

      if (chesscom) {
        attempted++;
        try {
          const raw = await getChessComUserRecentGames(chesscom, ac.signal);
          collected.push(...raw.map((g) => normalizeChessComGame(g, chesscom)));
        } catch {
          failed++;
        }
      }

      if (lichess) {
        attempted++;
        try {
          const raw = await getLichessUserRecentGames(lichess, ac.signal);
          collected.push(...raw.map((g) => normalizeLichessGame(g, lichess)));
        } catch {
          failed++;
        }
      }

      if (ac.signal.aborted) return;

      const merged = mergeRecentGames(collected, limit);
      cache.set(key, { at: Date.now(), games: merged });
      setGames(merged);
      // Only surface an error when NOTHING worked. If one platform is down or
      // the username is a typo, showing the other platform's games silently is
      // the right outcome — a red banner over a working list is noise.
      setError(
        attempted > 0 && failed === attempted
          ? "Couldn't reach your chess platform just now."
          : null
      );
      setLoading(false);
    })();

    return () => ac.abort();
  }, [chesscom, lichess, hasLinkedAccount, limit, nonce]);

  return { games, loading, error, hasLinkedAccount, refresh };
}
