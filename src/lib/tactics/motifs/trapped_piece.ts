import { Chess, type Square, type Color, type PieceSymbol } from "chess.js";
import { attackersOf, pieceValue, see } from "../utils";
import type { TrappedPieceMotif } from "../types";

/**
 * A trapped piece: attacked by something CHEAPER than itself, and every legal
 * move it has lands on a square where it is lost. Knights count (the most
 * commonly trapped piece), pawns do not.
 *
 * Why "cheaper attacker": that is what separates trapped from hanging. A
 * knight hit by an equal or dearer piece is either defended (nothing is won)
 * or simply en prise — and "you left it hanging" is the lesson, not "it was
 * trapped". A knight hit by a pawn with nowhere safe to go is lost BECAUSE
 * it cannot move; that is the trap.
 *
 * Flight safety is judged by the exchange the flight starts: a capture that
 * nets material (Nxd8 taking a queen) is an escape, a quiet step onto a
 * pawn-covered square is not, and a square covered only by a dearer piece
 * while the piece stays defended is fine. If the victim's side can remove
 * the cheap attacker for free (Bxg4), nothing is trapped either. A side in
 * check gets no trapped-piece verdicts: with the king to attend to, every
 * piece looks immobile.
 *
 * Measured on Lichess `trappedPiece` puzzles (scripts/eval/
 * motif_detector_recall.ts): the previous detector (bishop-or-better only,
 * "unsafe" = a cheaper attacker on the square) found 17.5%; this one finds
 * ~55% while firing on ~15% of puzzles not carrying the label.
 */
const MIN_TRAPPED_VALUE = 300; // knight or above

/** Material the piece on `pieceSq` nets by playing `move`: what it takes, minus what the enemy then wins back on the landing square. */
function flightNet(game: Chess, move: { to: string; captured?: string }, enemy: Color): number {
  const probe = new Chess(game.fen());
  probe.move(move as Parameters<Chess["move"]>[0]);
  const captured = move.captured ? pieceValue(move.captured as PieceSymbol) : 0;
  const lostBack = attackersOf(probe, move.to as Square, enemy).length > 0
    ? Math.max(0, see(probe, move.to as Square, enemy))
    : 0;
  return captured - lostBack;
}

export function detectTrappedPieces(
  gameAfter: Chess,
  movingColor: Color,
): TrappedPieceMotif[] {
  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  const result: TrappedPieceMotif[] = [];
  // gameAfter has the opponent on move; in check their non-king moves are illegal.
  if (gameAfter.inCheck()) return result;

  for (const row of gameAfter.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== opponentColor || sq.type === "k") continue;
      if (pieceValue(sq.type) < MIN_TRAPPED_VALUE) continue;
      const pieceSq = sq.square as Square;

      const attackers = attackersOf(gameAfter, pieceSq, movingColor);
      const cheap = attackers.filter((a) => pieceValue(a.piece) < pieceValue(sq.type));
      if (cheap.length === 0) continue;
      if (see(gameAfter, pieceSq, movingColor) <= 0) continue;
      // Can the victim's side just remove a cheap attacker for free?
      const removable = cheap.every(
        (a) => attackersOf(gameAfter, a.square, opponentColor).length > 0 && see(gameAfter, a.square, opponentColor) >= 0,
      );
      if (removable) continue;

      const legalMoves = gameAfter.moves({ square: pieceSq, verbose: true });
      const unsafeMap: Array<{ square: Square; threatened_by: Square }> = [];
      const escapeSqs: Square[] = [];
      let safe = false;
      for (const move of legalMoves) {
        const dest = move.to as Square;
        escapeSqs.push(dest);
        if (flightNet(gameAfter, move, movingColor) >= 0) {
          safe = true;
          break;
        }
        const by = attackersOf(gameAfter, dest, movingColor)[0];
        unsafeMap.push({ square: dest, threatened_by: by ? by.square : cheap[0].square });
      }
      if (safe) continue;

      result.push({
        motif: "trapped_piece",
        square: pieceSq,
        piece: sq.type,
        escape_squares_checked: escapeSqs,
        all_unsafe_because: unsafeMap,
        confirmed: true, // attacked for profit with no safe square is the confirmation
        refutation: null,
      });
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
