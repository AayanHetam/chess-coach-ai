/**
 * When may the coach be asked a question? (T7, SILENT_SUBSTITUTION_HANDOFF §4.)
 *
 * This used to be one boolean expression inside a 10,000-line component:
 *
 *     analysisActive =
 *       allMoves.length > 0 && engine !== null &&
 *       enginePositions === null && analysisError === null;
 *
 * `engine !== null` is what made it wrong. The composer unlocks when this goes
 * false, and it is false during the entire window before the engine has
 * booted — Stockfish is 7.16 MB, single-threaded in production (COOP is
 * `same-origin-allow-popups`, so `SharedArrayBuffer` is undefined) — and it
 * stays false forever when the engine can never boot at all: WASM
 * unsupported, `/engines/*` blocked by a network filter, worker dead.
 *
 * So the input box invited questions precisely when there was nothing to
 * answer them with, and the reply arrived in the coach's ordinary voice with
 * the engine-backed sections absent rather than hedged.
 *
 * It lives here, as a pure function, because a decision buried in a render
 * body is a decision nobody can test. The three outcomes are distinct and
 * each has to render differently:
 *
 *   - `pending`     — evaluations are coming. Hold the question.
 *   - `unavailable` — evaluations are never coming. Take the question, say so,
 *                     and tell the server so the prompt hedges.
 *   - neither       — evaluations are in hand. Normal operation.
 */
import type { EngineStatus } from "@/hooks/useEngine";

export interface EngineGateInput {
  /** Half-moves in the loaded game. Zero means there is no sweep to wait for. */
  moveCount: number;
  /** Whether the whole-game sweep has produced positions yet. */
  hasEnginePositions: boolean;
  /** Whether the sweep failed. */
  hasAnalysisError: boolean;
  status: EngineStatus;
}

export interface EngineGate {
  /** Evaluations are on their way; the composer stays locked. */
  pending: boolean;
  /**
   * No evaluation is ever arriving. The composer STAYS OPEN — locking someone
   * out permanently behind an "analyzing…" placeholder would be its own lie —
   * but it must say what is missing.
   */
  unavailable: boolean;
}

export function resolveEngineGate(input: EngineGateInput): EngineGate {
  const { moveCount, hasEnginePositions, hasAnalysisError, status } = input;

  // A failed sweep is the same user-visible situation as an engine that never
  // loaded: there will be no evaluations, and the coach must not imply there
  // were.
  const unavailable =
    status === "unsupported" || status === "failed" || hasAnalysisError;

  // Gated on moveCount so an empty board does not read as "analysis in
  // progress" forever: the sweep bails on an empty move list, so
  // `hasEnginePositions` would stay false and the composer stay locked.
  //
  // "idle" counts as pending: it is the first render, before the effect that
  // starts the engine has run. Treating it as available would open the
  // composer for the one tick before loading begins.
  const pending =
    moveCount > 0 &&
    !hasEnginePositions &&
    !unavailable &&
    (status === "idle" || status === "loading" || status === "ready");

  return { pending, unavailable };
}
