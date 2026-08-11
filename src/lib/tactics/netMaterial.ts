/**
 * Shared net-material helper — ROUND 2 referee refinements (the founder's
 * material-quiescence rule, Aayan 2026-08-10).
 *
 * Replays a PV (SAN list) with chess.js and computes per-ply capture values in
 * STANDARD pawn units (p1 n3 b3 r5 q9 — founder requirement: standard values,
 * chess.js arithmetic only, no LLM judgment anywhere). Used by BOTH:
 *   - checkPvTruncation (refereeChecks.ts): a quoted PV window that stops one
 *     ply before an opponent capture is only suspicious when that capture
 *     takes back equal-or-greater value than the window banked (material
 *     quiescence violated) — a lesser-value give-back after a queen harvest
 *     is normal engine-line bookkeeping, not fabrication (the 13 adjudicated
 *     v2 pv_truncation FPs, net +2..+12 with end evals agreeing);
 *   - the value-aware fork confirmation (motifScope.ts): a fork "refuted" by
 *     a recapture is still narratable when the banked material through the
 *     fork ply plus the fork's conservative harvest survives losing the
 *     forker (v2 spans #1/#3 — Nxf7 forking Qd8+Rh8).
 */
import { Chess, type Color, type PieceSymbol } from "chess.js";

/** Standard piece values in pawn units. King 0 — it is never banked. */
export const PIECE_UNITS: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export interface PvMaterialStep {
  /** SAN as replayed (input token, decorations tolerated by chess.js). */
  san: string;
  mover: Color;
  /** Value captured by this ply in pawn units (0 for quiet moves). */
  capturedValue: number;
  /** Destination square. */
  to: string;
  /** Moving piece type. */
  piece: PieceSymbol;
  /** Captured piece type, or null for a quiet move. */
  captured: PieceSymbol | null;
}

/**
 * Replay `sans` from `fen` and return one material step per successfully
 * replayed ply. Stops at the first illegal/unparseable SAN (the returned
 * array is a prefix of the input — callers treat unreplayed plies as
 * unverifiable and NEVER fire on them; precision first).
 */
export function replayPvMaterial(fen: string, sans: string[]): PvMaterialStep[] {
  const steps: PvMaterialStep[] = [];
  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return steps;
  }
  for (const san of sans) {
    try {
      const mv = game.move(san);
      if (!mv) break;
      steps.push({
        san,
        mover: mv.color,
        capturedValue: mv.captured ? PIECE_UNITS[mv.captured as PieceSymbol] ?? 0 : 0,
        to: mv.to,
        piece: mv.piece as PieceSymbol,
        captured: (mv.captured as PieceSymbol | undefined) ?? null,
      });
    } catch {
      break;
    }
  }
  return steps;
}

/**
 * The claimant's net banked material over steps[from..to] inclusive:
 * captures by the claimant count positive, captures by the opponent count
 * negative. Pawn units.
 */
export function netForClaimant(
  steps: PvMaterialStep[],
  claimant: Color,
  from: number,
  to: number,
): number {
  let net = 0;
  for (let i = Math.max(0, from); i <= to && i < steps.length; i++) {
    net += steps[i].mover === claimant ? steps[i].capturedValue : -steps[i].capturedValue;
  }
  return net;
}
