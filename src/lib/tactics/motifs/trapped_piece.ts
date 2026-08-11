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

/**
 * ROUND 2 (referee license pool ONLY — never called by detectMotifs, so the
 * voter/prompt inputs and the CI-1 byte-pinned snapshots are untouched):
 * unattacked-but-immobilized pieces count as trapped.
 *
 * The shipped detector misses the adjudicated v2 #27 class (Na8: b6 covered
 * by the a7-pawn, c7 by Kd8) twice over: knights fall under its >= bishop
 * value floor, and its "unsafe" test demands a LOWER-value attacker — a
 * king covering the flight square never qualifies. The extension:
 *   - value floor lowered to the knight (pawns still not coaching-relevant);
 *   - a flight square is covered when a cheaper enemy piece attacks it OR
 *     when ANY enemy piece attacks it and the mover has no defender of the
 *     square (recapture would be free);
 *   - pieces with ZERO legal moves stay excluded — an undeveloped bishop
 *     boxed by its own pawns is not "trapped" in the coaching sense.
 * All flight squares covered => trapped (confirmed; license-only).
 */
const MIN_IMMOBILIZED_VALUE = 300; // knight or above

/**
 * Is `dest` a COVERED flight square for the piece standing on `pieceSq`?
 * Covered = a cheaper enemy piece attacks it, OR any enemy piece attacks it
 * and the owner has no other defender of the square (recapture is free —
 * this is what lets a king or an equal-value piece cover a square).
 */
function flightIsCovered(
  game: Chess,
  pieceSq: Square,
  pieceType: import("chess.js").PieceSymbol,
  pieceColor: Color,
  dest: Square,
): { covered: boolean; by: Square | null } {
  const enemyColor: Color = pieceColor === "w" ? "b" : "w";
  const attackers = attackersOf(game, dest, enemyColor);
  if (attackers.length === 0) return { covered: false, by: null };
  const defenders = attackersOf(game, dest, pieceColor).filter((d) => d.square !== pieceSq);
  const covered =
    attackers.some((a) => pieceValue(a.piece) < pieceValue(pieceType)) || defenders.length === 0;
  return { covered, by: covered ? attackers[0].square : null };
}

export function detectImmobilizedPieces(
  gameAfter: Chess,
  movingColor: Color,
): TrappedPieceMotif[] {
  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  const result: TrappedPieceMotif[] = [];

  for (const row of gameAfter.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== opponentColor) continue;
      if (sq.type === "k") continue; // king mobility is mate/stalemate territory
      if (pieceValue(sq.type) < MIN_IMMOBILIZED_VALUE) continue;

      const pieceSq = sq.square as Square;
      const legalMoves = gameAfter.moves({
        square: pieceSq as import("chess.js").Square,
        verbose: true,
      });
      if (legalMoves.length === 0) continue;

      const unsafeMap: Array<{ square: Square; threatened_by: Square }> = [];
      const escapeSqs: Square[] = [];
      for (const move of legalMoves) {
        const dest = move.to as Square;
        escapeSqs.push(dest);
        const { covered, by } = flightIsCovered(gameAfter, pieceSq, sq.type, opponentColor, dest);
        if (covered && by) unsafeMap.push({ square: dest, threatened_by: by });
      }

      if (unsafeMap.length === escapeSqs.length && escapeSqs.length > 0) {
        result.push({
          motif: "trapped_piece",
          square: pieceSq,
          piece: sq.type,
          escape_squares_checked: escapeSqs,
          all_unsafe_because: unsafeMap,
          confirmed: true,
          refutation: null,
        });
      }
    }
  }

  return result;
}

/**
 * ROUND 2 fix 4b (refutation half — the mobility cross-check's arithmetic):
 * how many SAFE moves does the piece on `pieceSq` have? Safe = the landing
 * square is not covered (see flightIsCovered). The side to move must own
 * the piece (callers turn-flip the FEN, exactly like the referee's
 * mobilityCount). Returns null when no piece stands there.
 */
export function countSafeMoves(game: Chess, pieceSq: Square): number | null {
  const piece = game.get(pieceSq);
  if (!piece) return null;
  const legalMoves = game.moves({ square: pieceSq as import("chess.js").Square, verbose: true });
  let safe = 0;
  for (const move of legalMoves) {
    const dest = move.to as Square;
    if (!flightIsCovered(game, pieceSq, piece.type, piece.color, dest).covered) safe++;
  }
  return safe;
}
