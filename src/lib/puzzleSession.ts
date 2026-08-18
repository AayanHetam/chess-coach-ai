import { atomWithStorage } from "jotai/utils";
import type { PuzzleContext } from "@/lib/validation/puzzleChatSchemas";

/**
 * Puzzle session history — a "session" is a run of graded puzzles on the
 * Puzzle Coach page. It closes when the user taps Finish or after 15 minutes
 * idle (only if ≥1 puzzle was solved). Closed sessions are persisted so the
 * user can review which puzzles they got right/wrong, how long each took, and
 * re-practice the ones they missed.
 *
 * Storage is client-side localStorage (offline, per-device) AND, for
 * signed-in users, mirrored to Firestore via /api/puzzle-sessions so history
 * is available cross-device. The sessions page merges both by id.
 */

/** One graded puzzle inside a session. Carries the full puzzle payload so a
 *  missed puzzle can be re-practiced later from history. */
export interface SessionResult {
  id: string;
  ratingBefore: number;
  ratingAfter: number;
  solved: boolean;
  theme: string;
  /** Wall-clock time the user spent on this puzzle before it was graded. */
  timeMs: number;
  /** The puzzle itself — needed to replay it from the history view. */
  puzzle: PuzzleContext;
}

export type SessionEndReason = "finished" | "idle" | "closed";

export interface SavedPuzzleSession {
  id: string;
  startedAt: number;
  endedAt: number;
  endReason: SessionEndReason;
  ratingStart: number;
  ratingEnd: number;
  results: SessionResult[];
}

/** Idle window before a session auto-closes (15 minutes). */
export const SESSION_IDLE_MS = 15 * 60 * 1000;

const MAX_SESSIONS = 50;

export const SESSION_STORAGE_KEY = "chessMastiPuzzleSessionHistory";

/** Persisted history of closed sessions, newest first. */
export const puzzleSessionHistoryAtom = atomWithStorage<SavedPuzzleSession[]>(
  SESSION_STORAGE_KEY,
  [],
);

/**
 * Re-practice injection. When the user taps "Practice missed" in history, this
 * is set to the puzzles to drill; the Puzzle Coach page snapshots it on mount,
 * plays through them, then clears it (so a refresh doesn't replay them).
 */
export const puzzlePracticeQueueAtom = atomWithStorage<PuzzleContext[] | null>(
  "chessMastiPuzzlePracticeQueue",
  null,
);

/**
 * What the injected queue IS, for the banner on /puzzles.
 *
 * The queue used to have exactly one producer ("practice missed", from
 * session history) so the banner hardcoded that wording. /analysis now
 * injects generated sets too, and calling a fresh set of fork puzzles
 * "re-practicing missed puzzles" describes something that never happened.
 * Null means the original missed-puzzles flow.
 */
export const puzzlePracticeLabelAtom = atomWithStorage<string | null>(
  "chessMastiPuzzlePracticeLabel",
  null,
);

export function buildSavedSession(
  results: SessionResult[],
  meta: {
    id: string;
    startedAt: number;
    endedAt: number;
    endReason: SessionEndReason;
  },
): SavedPuzzleSession {
  return {
    ...meta,
    ratingStart: results[0]?.ratingBefore ?? 0,
    ratingEnd: results[results.length - 1]?.ratingAfter ?? 0,
    results,
  };
}

/** Prepend a closed session (de-duped by id), capped at MAX_SESSIONS. */
export function appendSession(
  history: SavedPuzzleSession[],
  session: SavedPuzzleSession,
): SavedPuzzleSession[] {
  const withoutDupe = history.filter((s) => s.id !== session.id);
  return [session, ...withoutDupe].slice(0, MAX_SESSIONS);
}

/** Merge two session lists (server + local) by id, newest-first, capped. */
export function mergeSessions(
  primary: SavedPuzzleSession[],
  secondary: SavedPuzzleSession[],
): SavedPuzzleSession[] {
  const byId = new Map<string, SavedPuzzleSession>();
  for (const s of [...primary, ...secondary]) {
    if (!byId.has(s.id)) byId.set(s.id, s);
  }
  return Array.from(byId.values())
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, MAX_SESSIONS);
}

/**
 * Synchronous localStorage append — used from the beforeunload handler where a
 * React/atom state update isn't guaranteed to flush before the tab closes.
 */
export function appendSessionToStorage(session: SavedPuzzleSession): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const hist = Array.isArray(parsed) ? (parsed as SavedPuzzleSession[]) : [];
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(appendSession(hist, session)),
    );
  } catch {
    /* storage full / unavailable — localStorage is best-effort */
  }
}

/**
 * Mirror a closed session to the server for cross-device history. Best-effort:
 * 401 (anon) and network errors are swallowed — localStorage stays the source
 * of truth offline. `keepalive` lets it survive a page-unload close.
 */
export function postSessionToServer(session: SavedPuzzleSession): void {
  if (typeof window === "undefined") return;
  try {
    void fetch("/api/puzzle-sessions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Fetch the signed-in user's server-side sessions (empty for anon/offline). */
export async function fetchServerSessions(): Promise<SavedPuzzleSession[]> {
  try {
    const res = await fetch("/api/puzzle-sessions", { credentials: "include" });
    if (!res.ok) return [];
    const data = (await res.json()) as { sessions?: SavedPuzzleSession[] };
    return Array.isArray(data.sessions) ? data.sessions : [];
  } catch {
    return [];
  }
}

export function sessionSolvedCount(s: SavedPuzzleSession): number {
  return s.results.filter((r) => r.solved).length;
}

export function sessionMissed(s: SavedPuzzleSession): SessionResult[] {
  return s.results.filter((r) => !r.solved);
}

export function sessionNetDelta(s: SavedPuzzleSession): number {
  return s.ratingEnd - s.ratingStart;
}

export function sessionDurationMs(s: SavedPuzzleSession): number {
  return Math.max(0, s.endedAt - s.startedAt);
}

/** "42s" / "3m 12s" / "1h 4m" — compact human duration. */
export function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  if (min < 60) return s ? `${min}m ${s}s` : `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
