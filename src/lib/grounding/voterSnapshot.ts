// VoterSnapshot builder — Stage 9 of the Tactical Grounding Program.
//
// Builds the small struct that the four claim-class validators
// (user_visibility, positional_claim, mate_in_n, material_win) need to
// enforce suppression rules against a given LLM response.
//
// Two builders ship in this module:
//
//   buildSyncVoterSnapshot — uses ONLY synchronously-available data
//   (motifs from chess.js + Stockfish cp/mate). No network calls, no
//   async grounding (chessdb / Lc0 / Maia / Syzygy). Designed for the
//   in-route pipeline call site where we don't want to block on async
//   grounding inside the regenerate timeout budget.
//
//     Effect on the four validators:
//     - userVisibility:    no-ops (maiaProb = null)
//     - positionalClaim:   runs at degraded confidence (sfCp only,
//                          positional_plan derived without Lc0 input)
//     - mateInN:           runs against sfMate only (mate_in_n falls to
//                          LOW when SF mate present, NONE otherwise)
//     - materialWin:       runs against sfCp (material_win HIGH only when
//                          a confirmed motif AND sfStrong)
//
//   buildAsyncVoterSnapshot — full snapshot using the real voter with
//   chessdb / Lc0 / Maia / Syzygy already-fetched results passed in.
//   Async only because it consumes pre-fetched async results, not
//   because it makes calls itself.
//
// Both wrap the same compileVoterResult call shape — the difference is
// purely which inputs are populated.

import type { Chess } from "chess.js";
import type { AnyMotif } from "@/lib/tactics/types";
import {
  fetch_lichess_tablebase,
  isTablebaseEligible,
  type TablebaseResult,
} from "@/lib/mastermind/lichessTablebase";
import { queryChessdb, type ChessdbResult } from "./chessdb";
import { queryLc0, shouldCallLc0, type Lc0Result } from "./lc0";
import { queryMaiaAtRating, shouldCallMaia, type MaiaProbResult } from "./maia";
import { compileVoterResult } from "./voter";
import { detectMotifs } from "@/lib/tactics";
import type { VoterSnapshot } from "@/lib/mastermind/validators";
import { logger } from "@/lib/logging";

const log = logger.child({ module: "stage9-grounding" });

export interface SyncSnapshotInput {
  fenBefore: string;
  moveSan: string;
  /** Stockfish eval for the position before the move. White-positive. */
  stockfishEvalCp: number | null;
  stockfishBestMoveMate: number | null;
  /** User's Elo rating; null when unknown. Used downstream by userVisibility for threshold tuning. */
  userRating: number | null;
}

/**
 * Build a VoterSnapshot using only synchronously-available data — motifs
 * from chess.js + Stockfish cp/mate. No network calls. Designed to be
 * called immediately before runValidationPipeline so we don't block on
 * async grounding sources within the regenerate timeout.
 *
 * The returned snapshot has maiaProb / lc0Cp / syzygyDtm all null. The
 * downstream validators handle null gracefully:
 * - userVisibility no-ops on maiaProb=null
 * - positionalClaim runs but never escalates severity (no Lc0 veto detectable)
 * - mateInN doesn't run the distance check (syzygyDtm=null)
 * - materialWin runs normally
 *
 * Errors in detectMotifs are caught — a malformed FEN/SAN should not
 * crash the validator pipeline. On error, the snapshot still ships with
 * an empty motif list (voter will report tactical_motif=NONE).
 */
export function buildSyncVoterSnapshot(input: SyncSnapshotInput): VoterSnapshot {
  let motifs: AnyMotif[] = [];
  try {
    motifs = detectMotifs(input.fenBefore, input.moveSan);
  } catch {
    // Non-critical — empty motif list still produces a valid snapshot.
  }

  const voter = compileVoterResult({
    motifs,
    chessdbResult: null,
    lc0Result: null,
    maiaResult: null,
    stockfishEvalCp: input.stockfishEvalCp,
    stockfishBestMoveMate: input.stockfishBestMoveMate,
  });

  return {
    confidence: {
      user_visibility: voter.confidence.user_visibility,
      positional_plan: voter.confidence.positional_plan,
      mate_in_n: voter.confidence.mate_in_n,
      material_win: voter.confidence.material_win,
    },
    maiaProb: null,
    userRating: input.userRating,
    sfCp: input.stockfishEvalCp,
    sfMate: input.stockfishBestMoveMate,
    lc0Cp: null,
    syzygyDtm: null,
  };
}

export interface AsyncSnapshotInput extends SyncSnapshotInput {
  /** Pre-fetched chessdb result; null when not called. */
  chessdbResult: ChessdbResult | null;
  /** Pre-fetched Lc0 result; null when not called. */
  lc0Result: Lc0Result | null;
  /** Pre-fetched Maia result; null when not called. */
  maiaResult: MaiaProbResult | null;
  /** Pre-fetched Syzygy tablebase result; null when out of tablebase range. */
  tablebaseResult: TablebaseResult | null;
}

/**
 * Full-power snapshot builder — wraps compileVoterResult with all four
 * async grounding sources passed in by the caller (chessdb, Lc0, Maia,
 * Syzygy). The caller is responsible for the fetches; this helper just
 * packages the results into the validator snapshot shape.
 *
 * Use this when the route has already fetched the async grounding for
 * other reasons (e.g., the per-mistake voter run in buildGameContext).
 */
export function buildAsyncVoterSnapshot(input: AsyncSnapshotInput): VoterSnapshot {
  let motifs: AnyMotif[] = [];
  try {
    motifs = detectMotifs(input.fenBefore, input.moveSan);
  } catch {
    // see buildSyncVoterSnapshot rationale
  }

  const voter = compileVoterResult({
    motifs,
    chessdbResult: input.chessdbResult,
    lc0Result: input.lc0Result,
    maiaResult: input.maiaResult,
    tablbaseResult: input.tablebaseResult,
    stockfishEvalCp: input.stockfishEvalCp,
    stockfishBestMoveMate: input.stockfishBestMoveMate,
  });

  return {
    confidence: {
      user_visibility: voter.confidence.user_visibility,
      positional_plan: voter.confidence.positional_plan,
      mate_in_n: voter.confidence.mate_in_n,
      material_win: voter.confidence.material_win,
    },
    maiaProb: input.maiaResult?.prob_plays_best ?? null,
    userRating: input.userRating,
    sfCp: input.stockfishEvalCp,
    sfMate: input.stockfishBestMoveMate,
    lc0Cp: input.lc0Result?.eval_cp ?? null,
    syzygyDtm: input.tablebaseResult?.dtm ?? null,
  };
}

export type GroundingFetchStatus = "ok" | "fail" | "skipped";

export interface AsyncSnapshotForMoveInput {
  fenBefore: string;
  moveSan: string;
  /**
   * Stockfish eval for the position BEFORE the move (same contract as
   * SyncSnapshotInput). All grounding sources are fetched for fenBefore, so
   * mixing in an after-move eval here would make lc0AgreesWithSf compare
   * evals of two different positions.
   */
  stockfishEvalCp: number | null;
  stockfishBestMoveMate: number | null;
  /**
   * Full SF candidate lines for fenBefore. Drives shouldCallLc0 gating
   * (top-2 closeness) and supplies Maia's bestMoveUci via lines[0].pv[0].
   * Pass [] when unavailable — Lc0 and Maia are then skipped.
   */
  stockfishLines: Array<{ cp?: number | null; mate?: number | null; pv?: string[] }>;
  userRating: number | null;
  correlationId?: string;
  /** Route-branch tag for the stage9_async_grounding_fetched telemetry line. */
  branch?: string;
}

/**
 * Fetch-orchestrating snapshot builder — Stage 9 v2 (async grounding).
 *
 * Fetches chessdb / Lc0 / Maia / Syzygy for fenBefore in parallel (each
 * gated by its existing shouldCallX / eligibility check, each fail-open via
 * `.catch(() => null)`), then packages the results through
 * buildAsyncVoterSnapshot. Wall-clock ceiling is max of the per-client
 * timeouts (~8s, Lc0), not the sum; module-level TTL caches in the client
 * modules make repeat calls for the same FEN within a warm instance ~free.
 *
 * A single slow or down service degrades only its own field to null, which
 * the downstream validators treat as "source not consulted" (see the
 * null-gating notes on buildSyncVoterSnapshot). A full grounding outage
 * yields a snapshot equivalent to the sync builder — silent degradation by
 * design (plan Q7).
 *
 * Emits one `stage9_async_grounding_fetched` log line per call with
 * per-source ok/fail/skipped status + total fetch ms, so dashboards can
 * track how often each source is actually arming the validators.
 *
 * This function never rejects: fetch errors are caught per-source and
 * detectMotifs errors are caught inside buildAsyncVoterSnapshot.
 */
export async function buildAsyncSnapshotForMove(
  input: AsyncSnapshotForMoveInput,
): Promise<VoterSnapshot> {
  const t0 = Date.now();
  const bestMoveUci = input.stockfishLines[0]?.pv?.[0] ?? null;

  const lc0Gated = shouldCallLc0(input.stockfishEvalCp, input.stockfishLines);
  const maiaGated = shouldCallMaia(input.userRating ?? undefined, bestMoveUci);
  const tablebaseGated = isTablebaseEligible(input.fenBefore);

  const [chessdbResult, lc0Result, maiaResult, tablebaseResult] = await Promise.all([
    queryChessdb(input.fenBefore).catch(() => null),
    lc0Gated ? queryLc0(input.fenBefore).catch(() => null) : Promise.resolve(null),
    maiaGated
      ? queryMaiaAtRating(input.fenBefore, input.userRating!, bestMoveUci!).catch(() => null)
      : Promise.resolve(null),
    tablebaseGated
      ? fetch_lichess_tablebase(input.fenBefore).catch(() => null)
      : Promise.resolve(null),
  ]);

  const statusOf = (
    gated: boolean,
    result: unknown,
  ): GroundingFetchStatus => (!gated ? "skipped" : result ? "ok" : "fail");

  log.info("stage9_async_grounding_fetched", {
    fen: input.fenBefore,
    move_san: input.moveSan,
    correlation_id: input.correlationId,
    branch: input.branch,
    chessdb_status: statusOf(true, chessdbResult),
    lc0_status: statusOf(lc0Gated, lc0Result),
    maia_status: statusOf(maiaGated, maiaResult),
    tablebase_status: statusOf(tablebaseGated, tablebaseResult),
    total_fetch_ms: Date.now() - t0,
  });

  return buildAsyncVoterSnapshot({
    fenBefore: input.fenBefore,
    moveSan: input.moveSan,
    stockfishEvalCp: input.stockfishEvalCp,
    stockfishBestMoveMate: input.stockfishBestMoveMate,
    userRating: input.userRating,
    chessdbResult,
    lc0Result,
    maiaResult,
    tablebaseResult,
  });
}

// Re-export Chess for callers that need it; some lower-level routes import
// chess.js directly. Listed here as an unused import to keep the dep graph
// transparent — TypeScript erases it from the emitted JS.
export type _ChessUnused = Chess;
