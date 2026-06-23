import { atomWithStorage } from "jotai/utils";
import type { PuzzleContext } from "@/lib/validation/puzzleChatSchemas";

/**
 * Puzzle session history — a "session" is a run of graded puzzles on the
 * Puzzle Coach page. It closes when the user taps Finish or after 15 minutes
 * idle (only if ≥1 puzzle was solved). Closed sessions are persisted so the
 * user can review which puzzles they got right/wrong, how long each took, and
 * re-practice the ones they missed.
 *
 * Storage is client-side localStorage (mirrors puzzleStatsAtom /
 * puzzleResumeAtom) — no server round-trip, available offline, per-device.
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

export type SessionEndReason = "finished" | "idle";

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

/** Persisted history of closed sessions, newest first. */
export const puzzleSessionHistoryAtom = atomWithStorage<SavedPuzzleSession[]>(
  "chessMastiPuzzleSessionHistory",
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

/** Prepend a closed session, capped at MAX_SESSIONS. */
export function appendSession(
  history: SavedPuzzleSession[],
  session: SavedPuzzleSession,
): SavedPuzzleSession[] {
  return [session, ...history].slice(0, MAX_SESSIONS);
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
