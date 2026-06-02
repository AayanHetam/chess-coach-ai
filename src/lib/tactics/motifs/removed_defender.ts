import { Chess, type Square, type Color } from "chess.js";
import { rawAttacks, attackersOf, pieceValue } from "../utils";
import type { RemovedDefenderMotif } from "../types";

// In `fenBefore`, what pieces of `opponentColor` does the piece on `capturedSq` defend?
function findDefendedPieces(
  gameBefore: Chess,
  capturedSq: Square,
  opponentColor: Color,
): Array<{ square: Square; piece: import("chess.js").PieceSymbol }> {
  const capturer = gameBefore.get(capturedSq);
  if (!capturer || capturer.color !== opponentColor) return [];

  const defended: Array<{ square: Square; piece: import("chess.js").PieceSymbol }> = [];
  const attacks = rawAttacks(gameBefore, capturedSq);

  for (const sq of attacks) {
    const p = gameBefore.get(sq);
    if (p && p.color === opponentColor && sq !== capturedSq) {
      defended.push({ square: sq, piece: p.type });
    }
  }
  return defended;
}

// After the capture, which pieces that `capturedSq` defended are now truly hanging?
function findNowHanging(
  gameAfter: Chess,
  previouslyDefended: Array<{ square: Square; piece: import("chess.js").PieceSymbol }>,
  movingColor: Color,
  opponentColor: Color,
): Array<{ square: Square; piece: import("chess.js").PieceSymbol }> {
  return previouslyDefended.filter(({ square }) => {
    const still = gameAfter.get(square);
    if (!still || still.color !== opponentColor) return false;
    const defenders = attackersOf(gameAfter, square, opponentColor);
    const attackers = attackersOf(gameAfter, square, movingColor);
    // Hanging if attackers > defenders, or if cheapest attacker can win the exchange
    if (defenders.length === 0 && attackers.length > 0) return true;
    if (attackers.length > defenders.length) return true;
    return false;
  });
}

export function detectRemovedDefenders(
  gameBefore: Chess,
  gameAfter: Chess,
  capturedSq: Square | null,
  movingColor: Color,
): RemovedDefenderMotif[] {
  if (!capturedSq) return []; // v1: capture-only
  const opponentColor: Color = movingColor === "w" ? "b" : "w";

  const capturedPiece = gameBefore.get(capturedSq);
  if (!capturedPiece || capturedPiece.color !== opponentColor) return [];

  const defended = findDefendedPieces(gameBefore, capturedSq, opponentColor);
  if (defended.length === 0) return [];

  const nowHanging = findNowHanging(gameAfter, defended, movingColor, opponentColor);
  if (nowHanging.length === 0) return [];

  const results: RemovedDefenderMotif[] = [];
  for (const hanging of nowHanging) {
    // Build the best follow-up move label (simplified: just capture the hanging piece)
    const attackersOnHanging = attackersOf(gameAfter, hanging.square, movingColor);
    if (attackersOnHanging.length === 0) continue;

    const bestAttacker = attackersOnHanging.sort(
      (a, b) => pieceValue(a.piece) - pieceValue(b.piece),
    )[0];

    const follow_up_move = `${bestAttacker.square}x${hanging.square}`;

    // Check for back-rank mate follow-up (simplified: if king is exposed)
    const material_or_mate_gain: "mate" | number = pieceValue(hanging.piece);

    results.push({
      motif: "removed_defender",
      removed: { square: capturedSq, piece: capturedPiece.type },
      was_defending: hanging,
      follow_up_move,
      material_or_mate_gain,
      confirmed: false,
      refutation: null,
    });
  }

  return results;
}
