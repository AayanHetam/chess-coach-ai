import { Chess, type Square, type Color } from "chess.js";
import { rawAttacks, pieceValue, attackersOf } from "../utils";
import type { ForkMotif } from "../types";

// A piece just moved to `movedTo`. Detect if it now attacks ≥2 enemy pieces
// and at least one is "unavoidable" (can't save both).
export function detectFork(
  gameAfter: Chess,
  movedTo: Square,
  movingColor: Color,
): ForkMotif | null {
  const forker = gameAfter.get(movedTo);
  if (!forker) return null;
  const opponentColor: Color = movingColor === "w" ? "b" : "w";

  const attacked = rawAttacks(gameAfter, movedTo);
  const targets: Array<{ square: Square; piece: import("chess.js").PieceSymbol }> = [];

  for (const sq of attacked) {
    const victim = gameAfter.get(sq);
    if (!victim || victim.color !== opponentColor) continue;
    // Include king too (royal fork)
    targets.push({ square: sq, piece: victim.type });
  }

  if (targets.length < 2) return null;

  const forkerValue = pieceValue(forker.type);
  const totalVictimValue = targets.reduce((s, t) => s + pieceValue(t.piece), 0);

  // Must be profitable: sum of victims > forker's value if forker gets taken
  if (totalVictimValue - forkerValue <= 0) {
    // Edge: if forker is king or the victims include a king, still a fork
    const hasKingTarget = targets.some((t) => t.piece === "k");
    if (!hasKingTarget) return null;
  }

  // Filter to the highest-value targets for the "unavoidable loss" estimate
  const topTargets = [...targets]
    .sort((a, b) => pieceValue(b.piece) - pieceValue(a.piece))
    .slice(0, 2);

  // Unavoidable loss estimate: assume opponent can save only the most valuable target
  const unavoidable_loss_cp =
    topTargets.length >= 2 ? pieceValue(topTargets[1].piece) : pieceValue(topTargets[0].piece);

  // Quick sanity: forker must not itself be hanging for free
  // (if a lower-value enemy piece can take the forker, the fork may not be real)
  const cheapTakers = attackersOf(gameAfter, movedTo, opponentColor).filter(
    (a) => pieceValue(a.piece) < forkerValue,
  );
  const forkerDefenders = attackersOf(gameAfter, movedTo, movingColor);
  const forkerIsHangingFree =
    cheapTakers.length > 0 && forkerDefenders.length === 0;

  return {
    motif: "fork",
    by_piece: forker.type,
    by_square: movedTo,
    targets: topTargets,
    unavoidable_loss_cp,
    confirmed: false, // set by escapability
    refutation: forkerIsHangingFree
      ? { move: `x${movedTo}`, refuted_by: "recapture" }
      : null,
  };
}
