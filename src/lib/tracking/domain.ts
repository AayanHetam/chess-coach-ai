import { getTrackingEnv } from "@/env";
import { logger } from "@/lib/logging";
import { getTrackingSupabase } from "./supabase";

/**
 * Structured domain writers (TRK-3): puzzle attempts and game-analysis
 * sessions. Same contract as the event firehose — gated on TRACKING_ENABLED,
 * and the write can never throw or reject into the caller.
 *
 * These complement (do not replace) the client IndexedDB SRS state; per the
 * plan we start clean at go-live (no backfill). The client wiring that calls
 * these endpoints lands in TRK-4.
 */

const log = logger.child({ module: "tracking-domain" });

export interface PuzzleAttemptInput {
  uid?: string | null;
  anonId?: string | null;
  puzzleId: string;
  source?: string | null;
  fen?: string | null;
  themes?: string[] | null;
  rating?: number | null;
  userMoves?: unknown;
  correct?: boolean | null;
  solvedWithoutHint?: boolean | null;
  hintsUsed?: number;
  msToSolve?: number | null;
  attemptIndex?: number | null;
}

export async function recordPuzzleAttempt(input: PuzzleAttemptInput): Promise<void> {
  if (!getTrackingEnv().enabled) return;
  try {
    const supabase = await getTrackingSupabase();
    const { error } = await supabase.from("puzzle_attempts").insert({
      uid: input.uid ?? null,
      anon_id: input.anonId ?? null,
      puzzle_id: input.puzzleId,
      source: input.source ?? null,
      fen: input.fen ?? null,
      themes: input.themes ?? null,
      rating: input.rating ?? null,
      user_moves: input.userMoves ?? null,
      correct: input.correct ?? null,
      solved_without_hint: input.solvedWithoutHint ?? null,
      hints_used: input.hintsUsed ?? 0,
      ms_to_solve: input.msToSolve ?? null,
      attempt_index: input.attemptIndex ?? null,
    });
    if (error) {
      log.warn("puzzle_attempts insert failed", {
        puzzleId: input.puzzleId,
        error: error.message,
      });
    }
  } catch (err) {
    log.warn("recordPuzzleAttempt threw (swallowed)", {
      puzzleId: input.puzzleId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface AnalysisSessionInput {
  uid?: string | null;
  anonId?: string | null;
  /** ISO client timestamp when the analysis was opened. Defaults to now. */
  startedAt?: string | null;
  /** Terminal state — we record a session once it ends. */
  status: "completed" | "abandoned";
  gamePgn?: string | null;
  movesQueried?: number;
  chatTurns?: number;
  requestId?: string | null;
  /** ISO timestamp the session ended; defaults to server now. */
  endedAt?: string | null;
}

export async function recordAnalysisSession(input: AnalysisSessionInput): Promise<void> {
  if (!getTrackingEnv().enabled) return;
  try {
    const supabase = await getTrackingSupabase();
    const row: Record<string, unknown> = {
      uid: input.uid ?? null,
      anon_id: input.anonId ?? null,
      ended_at: input.endedAt ?? new Date().toISOString(),
      status: input.status,
      game_pgn: input.gamePgn ?? null,
      moves_queried: input.movesQueried ?? 0,
      chat_turns: input.chatTurns ?? 0,
      request_id: input.requestId ?? null,
    };
    // Only override the DB's started_at default when the client supplied one.
    if (input.startedAt) row.started_at = input.startedAt;

    const { error } = await supabase.from("analysis_sessions").insert(row);
    if (error) {
      log.warn("analysis_sessions insert failed", {
        status: input.status,
        error: error.message,
      });
    }
  } catch (err) {
    log.warn("recordAnalysisSession threw (swallowed)", {
      status: input.status,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
