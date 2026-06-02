import { Chess, type Square, type Color } from "chess.js";
import { attackersOf, pieceValue } from "../utils";
import type { TrappedPieceMotif } from "../types";

// A trapped piece has no safe escape square.
// Only worth flagging for high-value pieces (≥ rook) — a trapped pawn is not coaching-relevant.
const MIN_TRAPPED_VALUE = 330; // bishop or above

export function detectTrappedPieces(
  gameAfter: Chess,
  movingColor: Color,
): TrappedPieceMotif[] {
  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  const result: TrappedPieceMotif[] = [];

  for (const row of gameAfter.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== opponentColor) continue;
      if (pieceValue(sq.type) < MIN_TRAPPED_VALUE) continue;

      const pieceSq = sq.square as Square;
      const legalMoves = gameAfter.moves({ square: pieceSq as import("chess.js").Square, verbose: true });
      if (legalMoves.length === 0) continue; // no moves = pinned or already trapped

      const unsafeMap: Array<{ square: Square; threatened_by: Square }> = [];
      const escapeSqs: Square[] = [];

      for (const move of legalMoves) {
        const dest = move.to as Square;
        escapeSqs.push(dest);
        const threateningAtks = attackersOf(gameAfter, dest, movingColor);

        // A square is "unsafe" if moving there results in the piece being captured for free
        // (i.e., there is a lower-value attacker, or SEE ≥ piece value after the move)
        const isUnsafe = threateningAtks.some(
          (atk) => pieceValue(atk.piece) < pieceValue(sq.type),
        );

        if (isUnsafe) {
          unsafeMap.push({
            square: dest,
            threatened_by: threateningAtks[0].square,
          });
        }
      }

      // Truly trapped only if ALL escape squares are unsafe
      if (unsafeMap.length === escapeSqs.length && escapeSqs.length > 0) {
        result.push({
          motif: "trapped_piece",
          square: pieceSq,
          piece: sq.type,
          escape_squares_checked: escapeSqs,
          all_unsafe_because: unsafeMap,
          confirmed: true, // all squares unsafe = confirmed
          refutation: null,
        });
      }
    }
  }

  return result;
}
