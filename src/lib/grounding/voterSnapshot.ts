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
  FETCH_TIMEOUT_MS as TABLEBASE_TIMEOUT_MS,
} from "@/lib/mastermind/lichessTablebase";
import {
  queryChessdb,
  FETCH_TIMEOUT_MS as CHESSDB_TIMEOUT_MS,
  type ChessdbResult,
} from "./chessdb";
import {
  queryLc0,
  shouldCallLc0,
  FETCH_TIMEOUT_MS as LC0_TIMEOUT_MS,
  type Lc0Result,
} from "./lc0";
import {
  queryMaiaAtRating,
  shouldCallMaia,
  FETCH_TIMEOUT_MS as MAIA_TIMEOUT_MS,
  type MaiaProbResult,
} from "./maia";
import { compileVoterResult } from "./voter";
import { detectMotifs } from "@/lib/tactics";
import type { VoterSnapshot } from "@/lib/mastermind/validators";
import { logger } from "@/lib/logging";
import {
  isCircuitOpen,
  recordSuccess,
  recordFailure,
} from "./circuitBreaker";

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
    positionConfidence: voter.positionConfidence,
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
    positionConfidence: voter.positionConfidence,
    maiaProb: input.maiaResult?.prob_plays_best ?? null,
    userRating: input.userRating,
    sfCp: input.stockfishEvalCp,
    sfMate: input.stockfishBestMoveMate,
    lc0Cp: input.lc0Result?.eval_cp ?? null,
    syzygyDtm: normalizeSyzygyDtm(input.tablebaseResult),
  };
}

/**
 * Normalize Lichess's raw `dtm` into the mateInN validator's contract.
 *
 * The validator (validators/mateInN.ts, Fire B) documents `syzygyDtm` as a
 * POSITIVE distance in FULL MOVES, and only tolerates off-by-1. Lichess
 * returns `dtm` raw: signed (negative when the side to move is losing) and in
 * plies. Passing it through unmodified mis-arms Fire B two ways:
 *   - sign: a losing position (dtm < 0) would be compared as if it were the
 *     side-to-move's own mate distance, printing a nonsense "Syzygy DTM is -5".
 *     Ungrounded mate claims in non-winning positions are already caught by
 *     Fire A (mate_in_n confidence === NONE), so we null those out here.
 *   - units: a true "mate in 3" is ~5-6 plies; off-by-1 wouldn't cover it,
 *     producing false positives on CORRECT mate claims (worst failure mode).
 *
 * ceil(dtm/2) converts plies→moves. Confirmed empirically against
 * tablebase.lichess.ovh: a KQ-vs-K win returns position dtm=3 with the best
 * move dtm=-2 — i.e. dtm decrements by exactly 1 per ply (so the unit is
 * plies, signed, side-to-move-relative), and 3 plies = mate in 2 moves =
 * ceil(3/2). The winning side mates on an odd ply, so for dtm>0 the value is
 * odd and (dtm+1)/2 = ceil(dtm/2) is the exact move count; the off-by-1
 * tolerance in Fire B then only ever absorbs the player's own half-move
 * counting, never a units error.
 */
function normalizeSyzygyDtm(tb: TablebaseResult | null): number | null {
  const raw = tb?.dtm;
  if (raw == null || raw <= 0) return null;
  return Math.ceil(raw / 2);
}

export type GroundingFetchStatus =
  | "ok" // responded with grounding data
  | "fail" // gate passed but no grounding obtained (threw, OR resolved null)
  | "skipped" // gated out (shouldCallX / eligibility was false)
  | "circuit_open"; // breaker open after repeated throws — fetch not attempted

interface FetchOutcome<T> {
  value: T | null;
  status: GroundingFetchStatus;
  ms: number;
}

/**
 * Run one gated, breaker-protected, timed grounding fetch. Never rejects.
 *
 * - not gated → { skipped, 0ms } (no fetch)
 * - breaker open → { circuit_open, 0ms } (no fetch; field degrades to null)
 * - fetch throws (timeout / network / 5xx) → recordFailure + { fail }
 * - fetch resolves → recordSuccess + { ok if data else fail }
 *
 * Telemetry "fail" covers both a throw and a clean null (gate wanted grounding,
 * none came back) — that's the existing dashboard semantic. The breaker, by
 * contrast, only counts real failures: a source that resolves null CHEAPLY
 * (unconfigured, or a genuine "no data for this FEN") is responding and must
 * not be tripped out; only one that is actually eating its timeout should be.
 *
 * T2 (SILENT_SUBSTITUTION_HANDOFF §4): that distinction used to be drawn as
 * "threw vs resolved", which made the breaker unreachable. Every client wraps
 * its aborting fetch in `catch { return null }` (chessdb.ts, lc0.ts, maia.ts,
 * lichessTablebase.ts), so a TIMEOUT arrives here as a *successfully resolved
 * null* — `recordSuccess` ran, the consecutive-failure counter reset, and the
 * breaker could never open. During an outage every turn paid the full ~8s
 * ceiling, forever. The unit test that "proved" the breaker worked mocked a
 * rejection: a shape production cannot produce.
 *
 * So classify on ELAPSED TIME instead of on how the value arrived.
 */

/**
 * Should this outcome count as a breaker failure?
 *
 * A null that consumed essentially the whole timeout budget is a timeout,
 * whatever wrapper swallowed it. A null that came back fast is a healthy
 * "no data". Pure, so the rule is testable without simulating a network.
 */
export function isBreakerFailure(
  value: unknown,
  elapsedMs: number,
  timeoutMs: number,
): boolean {
  if (value != null) return false;
  return elapsedMs >= timeoutMs * TIMEOUT_ATTRIBUTION_RATIO;
}

/** How much of the budget a null must consume to be read as a timeout. */
const TIMEOUT_ATTRIBUTION_RATIO = 0.9;

async function fetchWithBreaker<T>(
  key: string,
  gated: boolean,
  nowMs: number,
  timeoutMs: number,
  fetchFn: () => Promise<T | null>,
): Promise<FetchOutcome<T>> {
  if (!gated) return { value: null, status: "skipped", ms: 0 };
  if (isCircuitOpen(key, nowMs)) return { value: null, status: "circuit_open", ms: 0 };
  const start = Date.now();
  try {
    const value = await fetchFn();
    const ms = Date.now() - start;
    if (isBreakerFailure(value, ms, timeoutMs)) recordFailure(key, nowMs);
    else recordSuccess(key);
    return { value, status: value == null ? "fail" : "ok", ms };
  } catch {
    recordFailure(key, nowMs);
    return { value: null, status: "fail", ms: Date.now() - start };
  }
}

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
 * Fetches chessdb / Lc0 / Maia / Syzygy for fenBefore in parallel, each gated
 * by its existing shouldCallX / eligibility check AND a per-source circuit
 * breaker, each fail-open, then packages the results through
 * buildAsyncVoterSnapshot. Wall-clock ceiling is max of the per-client
 * timeouts (~8s, Lc0), not the sum; module-level TTL caches in the client
 * modules make repeat calls for the same FEN within a warm instance ~free.
 *
 * A single slow or down service degrades only its own field to null, which
 * the downstream validators treat as "source not consulted" (see the
 * null-gating notes on buildSyncVoterSnapshot). A full grounding outage
 * yields a snapshot equivalent to the sync builder — silent degradation by
 * design (plan Q7). The circuit breaker (see circuitBreaker.ts) stops a warm
 * instance from re-paying a dead source's full timeout on every turn during a
 * sustained outage: after repeated failures the source is skipped outright.
 *
 * Emits one `stage9_async_grounding_fetched` log line per call with per-source
 * status (ok/empty/fail/skipped/circuit_open) AND per-source latency ms + total
 * fetch ms, so dashboards can track arm rates, source health, and where the
 * latency goes.
 *
 * This function never rejects: fetch errors are caught per-source and
 * detectMotifs errors are caught inside buildAsyncVoterSnapshot.
 */
export async function buildAsyncSnapshotForMove(
  input: AsyncSnapshotForMoveInput,
): Promise<VoterSnapshot> {
  const now = Date.now();
  const bestMoveUci = input.stockfishLines[0]?.pv?.[0] ?? null;

  const lc0Gated = shouldCallLc0(input.stockfishEvalCp, input.stockfishLines);
  const maiaGated = shouldCallMaia(input.userRating ?? undefined, bestMoveUci);
  const tablebaseGated = isTablebaseEligible(input.fenBefore);

  const [chessdb, lc0, maia, tablebase] = await Promise.all([
    fetchWithBreaker("chessdb", true, now, CHESSDB_TIMEOUT_MS, () =>
      queryChessdb(input.fenBefore),
    ),
    fetchWithBreaker("lc0", lc0Gated, now, LC0_TIMEOUT_MS, () =>
      queryLc0(input.fenBefore),
    ),
    fetchWithBreaker("maia", maiaGated, now, MAIA_TIMEOUT_MS, () =>
      queryMaiaAtRating(input.fenBefore, input.userRating!, bestMoveUci!),
    ),
    fetchWithBreaker("tablebase", tablebaseGated, now, TABLEBASE_TIMEOUT_MS, () =>
      fetch_lichess_tablebase(input.fenBefore),
    ),
  ]);

  log.info("stage9_async_grounding_fetched", {
    fen: input.fenBefore,
    move_san: input.moveSan,
    correlation_id: input.correlationId,
    branch: input.branch,
    chessdb_status: chessdb.status,
    chessdb_ms: chessdb.ms,
    lc0_status: lc0.status,
    lc0_ms: lc0.ms,
    maia_status: maia.status,
    maia_ms: maia.ms,
    tablebase_status: tablebase.status,
    tablebase_ms: tablebase.ms,
    total_fetch_ms: Date.now() - now,
  });

  return buildAsyncVoterSnapshot({
    fenBefore: input.fenBefore,
    moveSan: input.moveSan,
    stockfishEvalCp: input.stockfishEvalCp,
    stockfishBestMoveMate: input.stockfishBestMoveMate,
    userRating: input.userRating,
    chessdbResult: chessdb.value,
    lc0Result: lc0.value,
    maiaResult: maia.value,
    tablebaseResult: tablebase.value,
  });
}

// Re-export Chess for callers that need it; some lower-level routes import
// chess.js directly. Listed here as an unused import to keep the dep graph
// transparent — TypeScript erases it from the emitted JS.
export type _ChessUnused = Chess;
