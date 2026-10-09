/**
 * Turn 1 off the critical path (pathway 4.8a).
 *
 * The review's own grounding fetches (chessdb, Lc0 and Maia, launched by
 * `beginCoachContract` in builder.ts) used to hold the whole review until the
 * slowest of them answered or timed out: 6 s for a hung chessdb, 8 s for a
 * hung Lc0, cache hits included. With `COACH_TURN1_EARLY_STREAM` on, the
 * fetches go through the per-source breaker, the grounding-free half of the
 * contract is computed while they are in flight, and the model's turn is
 * built from what has answered `TURN1_GROUNDING_WAIT_MS` after launch. A
 * source still in flight reads as unavailable in the prompt, the way its
 * timeout reads without the flag, and reaches the referee later through the
 * enforced stream's `refereeContract`.
 */

/** `COACH_TURN1_EARLY_STREAM=1|true|yes|on` (server, read per call, off until its flip). */
export function isTurn1EarlyStream(): boolean {
  const v = (process.env.COACH_TURN1_EARLY_STREAM ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * How long the prompt waits for the grounding fetches, counted from their
 * launch. A placeholder until a day of production `slowestOkMs` readings
 * sets it before the flip (the p90 of each source that answers, capped at
 * 3000).
 */
export const TURN1_GROUNDING_WAIT_MS = 1500;

/**
 * `COACH_TURN1_LEAN_TABLE=1|true|yes|on` (server, read per call, off until
 * its flip, pathway 4.8b). With it on, the verbalizer's projection of the
 * move table keeps a row's better move but drops its engine line on a ply
 * with no insight (`projectMoveTable` in serialize.ts). The contract object
 * and every licence pool are unchanged.
 */
export function isTurn1LeanTable(): boolean {
  const v = (process.env.COACH_TURN1_LEAN_TABLE ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
