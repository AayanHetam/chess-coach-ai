import { Chess, type Square, type Color, type PieceSymbol } from "chess.js";
import { rawAttacks, pieceValue, attackersOf, see } from "../utils";
import type { ForkMotif } from "../types";

/**
 * A piece just moved to `movedTo`. Detect a fork: the mover now attacks two
 * or more enemy PIECES it can actually win.
 *
 * WHAT COUNTS AS A TARGET (measured, scripts/eval/motif_detector_recall.ts):
 *  - the king always counts (the check forces the reply);
 *  - pawns never count — "pieces" in the chess sense. A check that also hits
 *    a pawn is a check, and a queen eyeing two pawns is not a fork;
 *  - any other piece counts only if it is winnable: undefended, or worth
 *    more than the forker, or a profitable capture by static exchange.
 *  - a checkmating move is mate, never a fork.
 *
 * Before this filter the detector called ANY two attacked units a fork when
 * one was the king: on 400 Lichess puzzles NOT labeled `fork` it fired a
 * confirmed fork 48% of the time, 90% of them "check + a king-defended pawn"
 * (Qxf7+ hitting Kg8 and g7). With the filter the same set fires 11% while
 * recall on 400 `fork`-labeled puzzles stays at 97.5%.
 */
export function detectFork(
  gameAfter: Chess,
  movedTo: Square,
  movingColor: Color,
): ForkMotif | null {
  const forker = gameAfter.get(movedTo);
  if (!forker) return null;
  if (gameAfter.isCheckmate()) return null;
  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  const forkerValue = pieceValue(forker.type);

  const targets: Array<{ square: Square; piece: PieceSymbol }> = [];
  for (const sq of rawAttacks(gameAfter, movedTo)) {
    const victim = gameAfter.get(sq);
    if (!victim || victim.color !== opponentColor || victim.type === "p") continue;
    if (victim.type === "k") {
      targets.push({ square: sq, piece: victim.type });
      continue;
    }
    const defended = attackersOf(gameAfter, sq, opponentColor).length > 0;
    const winnable =
      !defended || pieceValue(victim.type) > forkerValue || see(gameAfter, sq, movingColor) > 0;
    if (winnable) targets.push({ square: sq, piece: victim.type });
  }

  if (targets.length < 2) return null;

  // Report the two most valuable targets; the second is the conservative
  // harvest (the opponent is granted the save of the dearer one).
  const topTargets = [...targets]
    .sort((a, b) => pieceValue(b.piece) - pieceValue(a.piece))
    .slice(0, 2);
  const harvest = topTargets.filter((t) => t.piece !== "k");
  const unavoidable_loss_cp = harvest.length
    ? pieceValue(harvest[harvest.length - 1].piece)
    : 0;

  // A forker that can be taken for free is not forking anything — flagged as
  // a refutation here and settled by escapability's SEE check.
  const cheapTakers = attackersOf(gameAfter, movedTo, opponentColor).filter(
    (a) => pieceValue(a.piece) < forkerValue,
  );
  const forkerDefenders = attackersOf(gameAfter, movedTo, movingColor);
  const forkerIsHangingFree = cheapTakers.length > 0 && forkerDefenders.length === 0;

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
