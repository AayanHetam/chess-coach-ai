import { Chess, type Square, type Color } from "chess.js";
import { attackersOf, see, pieceValue } from "../utils";
import type { HangingPieceMotif } from "../types";

// Detect enemy pieces that are attacked and under-defended after the move.
// "Hanging" = SEE (attacker perspective) ≥ 0.
// Excludes the piece we just captured (already gone) and the king.
export function detectHangingPieces(
  gameAfter: Chess,
  movingColor: Color,
): HangingPieceMotif[] {
  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  const result: HangingPieceMotif[] = [];

  for (const row of gameAfter.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== opponentColor || sq.type === "k") continue;
      const target = sq.square as Square;

      const atks = attackersOf(gameAfter, target, movingColor);
      if (atks.length === 0) continue;

      const defs = attackersOf(gameAfter, target, opponentColor);
      const seeValue = see(gameAfter, target, movingColor);
      if (seeValue <= 0) continue; // not profitable to capture

      result.push({
        motif: "hanging_piece",
        square: target,
        piece: sq.type,
        attackers: atks,
        defenders: defs,
        see_value_cp: seeValue,
        confirmed: true, // SEE ≥ 0 is the confirmation by definition
        refutation: null,
      });
    }
  }

  return result;
}
