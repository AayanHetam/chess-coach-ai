// ─────────────────────────────────────────────────────────────────────────────
// useLichessLiveGame
//
// React state machine + EventSource wiring for Lichess live play. Provides:
//
//   • Authentication state (read from the lichess_user cookie our callback
//     sets after OAuth).
//   • A long-lived "events" SSE to detect game starts / finishes.
//   • A per-game SSE bound to the currently-active game's Board stream.
//   • Actions: seekGame, makeMove (UCI), resign, abort, offerDraw, disconnect.
//
// The hook is deliberately headless — it does NOT know about chess.js, React
// chessboard, or the UI. Consumers derive their display state from `game` and
// `gameState`.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LichessEventStreamMessage,
  LichessGameFull,
  LichessGameState,
  LichessStoredUser,
} from '@/types/lichessLive';

export interface SeekOptions {
  /** Base time in minutes. Lichess accepts ¼, ½, ¾, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 35, 40, 45. */
  time: number;
  /** Increment per move in seconds. */
  increment: number;
  rated?: boolean;
  variant?: 'standard' | 'chess960' | 'crazyhouse' | 'antichess' | 'atomic' | 'horde' | 'kingOfTheHill' | 'racingKings' | 'threeCheck';
  color?: 'random' | 'white' | 'black';
  ratingRange?: string; // e.g. "1200-1800"
}

export type LichessPhase =
  | 'idle'           // connected, not doing anything
  | 'seeking'        // seek created, waiting for pairing
  | 'playing'        // game stream open, game in progress
  | 'finished';      // game over, showing result

export interface UseLichessLiveGame {
  // Auth state
  authenticated: boolean;
  user: LichessStoredUser | null;
  authChecked: boolean;

  // Game state
  phase: LichessPhase;
  game: LichessGameFull | null;      // Full snapshot (set once per game)
  gameState: LichessGameState | null; // Latest delta (moves/clocks/status)
  yourColor: 'white' | 'black' | null;
  streamError: string | null;

  // Actions
  connect: () => void;
  disconnect: () => Promise<void>;
  seekGame: (opts: SeekOptions) => Promise<void>;
  cancelSeek: () => void;
  makeMove: (uci: string) => Promise<boolean>;
  resign: () => Promise<boolean>;
  abort: () => Promise<boolean>;
  offerDraw: () => Promise<boolean>;
  reset: () => void;
}

function readUserCookie(): LichessStoredUser | null {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith('lichess_user='));
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw.split('=').slice(1).join('=')));
  } catch {
    return null;
  }
}

export function useLichessLiveGame(): UseLichessLiveGame {
  // ── Auth state ────────────────────────────────────────────────────────────
  const [user, setUser] = useState<LichessStoredUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    setUser(readUserCookie());
    setAuthChecked(true);
  }, []);

  // ── Game state ────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<LichessPhase>('idle');
  const [game, setGame] = useState<LichessGameFull | null>(null);
  const [gameState, setGameState] = useState<LichessGameState | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  const eventStreamRef = useRef<EventSource | null>(null);
  const gameStreamRef = useRef<EventSource | null>(null);
  // Track the active gameId so we can guard against stale updates.
  const activeGameIdRef = useRef<string | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const yourColor = useMemo<'white' | 'black' | null>(() => {
    if (!game || !user) return null;
    if (game.white?.id?.toLowerCase() === user.id.toLowerCase()) return 'white';
    if (game.black?.id?.toLowerCase() === user.id.toLowerCase()) return 'black';
    return null;
  }, [game, user]);

  const closeGameStream = useCallback(() => {
    gameStreamRef.current?.close();
    gameStreamRef.current = null;
    activeGameIdRef.current = null;
  }, []);

  const closeEventStream = useCallback(() => {
    eventStreamRef.current?.close();
    eventStreamRef.current = null;
  }, []);

  // ── Per-game stream ───────────────────────────────────────────────────────
  const openGameStream = useCallback((gameId: string) => {
    if (activeGameIdRef.current === gameId && gameStreamRef.current) return;
    closeGameStream();
    activeGameIdRef.current = gameId;
    const es = new EventSource(`/api/lichess/game/${gameId}/stream`);
    gameStreamRef.current = es;

    es.onmessage = (ev) => {
      // Guard against stale streams after navigation.
      if (activeGameIdRef.current !== gameId) return;
      try {
        const msg = JSON.parse(ev.data) as LichessGameFull | LichessGameState;
        if (msg.type === 'gameFull') {
          setGame(msg);
          setGameState(msg.state);
          setPhase(msg.state.status === 'started' ? 'playing' : 'finished');
        } else if (msg.type === 'gameState') {
          setGameState(msg);
          if (msg.status !== 'started' && msg.status !== 'created') {
            setPhase('finished');
          }
        }
      } catch (err) {
        console.error('Failed to parse game stream event:', err);
      }
    };

    es.addEventListener('error', () => {
      // EventSource auto-reconnects; we only flag an error if it's closed.
      if (es.readyState === EventSource.CLOSED) {
        setStreamError('Game stream disconnected.');
      }
    });
  }, [closeGameStream]);

  // ── Global event stream ───────────────────────────────────────────────────
  const openEventStream = useCallback(() => {
    if (eventStreamRef.current) return;
    const es = new EventSource('/api/lichess/events/stream');
    eventStreamRef.current = es;

    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as LichessEventStreamMessage;
        switch (msg.type) {
          case 'gameStart':
            // Close the seek stream — the seek is fulfilled.
            seekAbortRef.current?.abort();
            seekAbortRef.current = null;
            setPhase('playing');
            openGameStream(msg.game.id);
            break;
          case 'gameFinish':
            if (activeGameIdRef.current === msg.game.id) {
              setPhase('finished');
            }
            break;
          // Challenges are left for future challenge-inbox UI.
          default:
            break;
        }
      } catch (err) {
        console.error('Failed to parse event stream:', err);
      }
    };

    es.addEventListener('error', () => {
      if (es.readyState === EventSource.CLOSED) {
        setStreamError('Event stream disconnected.');
      }
    });
  }, [openGameStream]);

  // Open the event stream as soon as we know the user is authenticated.
  useEffect(() => {
    if (!user) {
      closeEventStream();
      closeGameStream();
      return;
    }
    openEventStream();
    return () => {
      closeEventStream();
      closeGameStream();
    };
  }, [user, openEventStream, closeEventStream, closeGameStream]);

  // ── Seek stream ref ──────────────────────────────────────────────────────
  const seekAbortRef = useRef<AbortController | null>(null);

  const closeSeekStream = useCallback(() => {
    seekAbortRef.current?.abort();
    seekAbortRef.current = null;
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    window.location.href = '/api/lichess/auth';
  }, []);

  const disconnect = useCallback(async () => {
    closeEventStream();
    closeGameStream();
    closeSeekStream();
    setPhase('idle');
    setGame(null);
    setGameState(null);
    setUser(null);
    try {
      await fetch('/api/lichess/disconnect', { method: 'POST' });
    } catch {
      /* cookie cleared server-side; local state already reset */
    }
  }, [closeEventStream, closeGameStream, closeSeekStream]);

  const seekGame = useCallback(async (opts: SeekOptions) => {
    setStreamError(null);
    setPhase('seeking');

    // Abort any previous seek stream.
    closeSeekStream();
    const abort = new AbortController();
    seekAbortRef.current = abort;

    const params = new URLSearchParams({
      time: String(opts.time),
      increment: String(opts.increment),
      rated: String(opts.rated ?? false),
    });
    if (opts.color && opts.color !== 'random') params.append('color', opts.color);
    if (opts.variant && opts.variant !== 'standard') params.append('variant', opts.variant);

    try {
      const res = await fetch(`/api/lichess/seek?${params.toString()}`, {
        signal: abort.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Seek failed' }));
        setStreamError(data.error ?? 'Seek failed');
        setPhase('idle');
        return;
      }
      // Keep the connection alive in the background by consuming the body.
      // The Lichess seek stays active only while this stream is open.
      // Game start arrives on the event stream; this just keeps the seek alive.
      const reader = res.body?.getReader();
      if (reader) {
        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        } catch {
          // AbortError when cancelled — expected.
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStreamError((err as Error).message || 'Seek failed');
        setPhase('idle');
      }
    }
  }, [closeSeekStream]);

  const cancelSeek = useCallback(() => {
    // Closing the seek stream connection cancels the seek on Lichess's side.
    closeSeekStream();
    setPhase('idle');
  }, [closeSeekStream]);

  const makeMove = useCallback(async (uci: string): Promise<boolean> => {
    const gameId = activeGameIdRef.current;
    if (!gameId) return false;
    const res = await fetch(`/api/lichess/game/${gameId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ move: uci }),
    });
    return res.ok;
  }, []);

  const resign = useCallback(async (): Promise<boolean> => {
    const gameId = activeGameIdRef.current;
    if (!gameId) return false;
    const res = await fetch(`/api/lichess/game/${gameId}/resign`, { method: 'POST' });
    return res.ok;
  }, []);

  const abort = useCallback(async (): Promise<boolean> => {
    const gameId = activeGameIdRef.current;
    if (!gameId) return false;
    const res = await fetch(`/api/lichess/game/${gameId}/abort`, { method: 'POST' });
    return res.ok;
  }, []);

  const offerDraw = useCallback(async (): Promise<boolean> => {
    const gameId = activeGameIdRef.current;
    if (!gameId) return false;
    const res = await fetch(`/api/lichess/game/${gameId}/draw`, { method: 'POST' });
    return res.ok;
  }, []);

  const reset = useCallback(() => {
    closeGameStream();
    setGame(null);
    setGameState(null);
    setPhase('idle');
    setStreamError(null);
  }, [closeGameStream]);

  return {
    authenticated: !!user,
    user,
    authChecked,
    phase,
    game,
    gameState,
    yourColor,
    streamError,
    connect,
    disconnect,
    seekGame,
    cancelSeek,
    makeMove,
    resign,
    abort,
    offerDraw,
    reset,
  };
}
