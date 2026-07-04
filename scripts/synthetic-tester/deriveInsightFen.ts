/**
 * Pure ply-derivation + legality guard for insight FENs.
 *
 * An [INSIGHT] header carries a full-move number + color but NOT a FEN. We
 * reconstruct the position BEFORE the played move by replaying the fixture's
 * moveHistory up to (but not including) the played move.
 *
 * OFF-BY-ONE GUARD (the failure mode the user explicitly flagged): a full move
 * is two plies. The 1-indexed ply of the played move is:
 *     ply = color === "w" ? 2*moveNumber - 1 : 2*moveNumber
 * so we replay the first (ply - 1) half-moves to reach fenBefore. The naive
 * `2*moveNumber - 2` is the bug — it lands one ply early and makes the played
 * SAN illegal. Verified empirically against eval-set-50.json: 8.Qb3 derives a
 * fenBefore byte-identical to the eval-set's stored fenBefore, and 7...dxc3 is
 * legal only with the correct formula.
 *
 * LEGALITY IS LOAD-BEARING: a coach can mislabel its own move number (observed
 * once on fx-scotch-gambit#15). If the derived fenBefore doesn't make the
 * played SAN legal, the derivation is wrong and the insight MUST be dropped —
 * never paint a board that contradicts the prose.
 */
import { Chess } from "chess.js";

export function deriveFenBefore(
  moveHistory: string[],
  moveNumber: number,
  color: "w" | "b"
): { fenBefore: string; ply: number } | null {
  const ply = color === "w" ? 2 * moveNumber - 1 : 2 * moveNumber;
  if (ply < 1) return null;
  if (ply - 1 > moveHistory.length) return null; // header overruns history
  const g = new Chess();
  for (let i = 0; i < ply - 1; i++) {
    try {
      // chess.js throws on an illegal/unparseable SAN; older builds returned
      // null. Treat both as a derivation failure.
      const mv = g.move(moveHistory[i]);
      if (!mv) return null;
    } catch {
      return null;
    }
  }
  return { fenBefore: g.fen(), ply };
}

export function isLegalSan(fen: string, san: string): boolean {
  try {
    return !!new Chess(fen).move(san);
  } catch {
    return false;
  }
}
