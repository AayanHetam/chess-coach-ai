import { Chess, type Color, type Square } from "chess.js";
import { PIECE_VALUE_CP } from "@/lib/tactics/utils";

/**
 * The board-derived half of intent — what a move does to the position,
 * independent of any engine score. chess.js only, no search, no LLM.
 *
 * Kept separate from intentFacts.ts on purpose: that module reasons about
 * evaluations, this one reasons about pieces, and the disagreements between
 * them are where the interesting cases live. A queen sacrifice is
 * board-negative and engine-positive, and any design that ranks moves by
 * material alone gets Philidor's legacy exactly backwards.
 */
export interface PositionFacts {
  /** Material taken outright by this move, in centipawns. 0 if not a capture. */
  capturedCp: number;
  /**
   * Net material the move wins or gives up, after the exchange sequence.
   *
   * Positive means it wins material; negative means it OFFERS material. The
   * offer case matters as much as the win: Qg8+ in Philidor's legacy captures
   * nothing at all — it simply puts the queen on a square where it will be
   * taken — so a capture-based measure is blind to the most famous sacrifice
   * in chess. Non-captures are therefore priced by what the opponent can win
   * on the destination square afterwards.
   */
  materialSwingCp: number;
  /** The piece that moved, e.g. "b" for bishop. */
  movedPiece: string;
  /** Was the moving piece attacked on its ORIGIN square before the move? */
  wasAttacked: boolean;
  /** Is it attacked on its DESTINATION square after the move? */
  isAttackedAfter: boolean;
  /**
   * True when the move took a piece out of real danger: attacked where it
   * stood, losing material to stay there, and safe where it went. A defended
   * knight attacked by a queen is attacked but not in danger, and calling that
   * an escape credits the move with a rescue that was never needed.
   */
  escapedAttack: boolean;
  /** Value of the piece that escaped, or 0. */
  escapedValueCp: number;
  /** Does the move give check? */
  givesCheck: boolean;
}

/**
 * Static exchange evaluation by actually playing the capture sequence out.
 *
 * The shared `see` helper in tactics/utils is a simplified approximation and
 * mis-prices the case this module cares most about: it scores Bxg3 in game_02
 * as WINNING a pawn, when fxg3 takes the bishop straight back. That single
 * error reclassified the founder's trap as a material grab.
 *
 * This is the standard recursive formulation — always recapture with the least
 * valuable attacker, and take the option not to recapture when recapturing
 * loses — evaluated on real legal moves so pinned defenders are handled by
 * chess.js rather than by us.
 */
function exchangeValue(position: Chess, target: Square, side: Color, depth = 0): number {
  if (depth > 12) return 0; // pathological positions; exchanges never run this deep
  const occupant = position.get(target);
  if (!occupant || occupant.color === side) return 0;

  // chess.js only generates moves for the side to move, so asking what the
  // OPPONENT could win on a square during our turn silently returns nothing.
  // Hand them the move first. An illegal flip (their king already in check)
  // means the question is not well posed, so the exchange is worth nothing.
  let game = position;
  if (game.turn() !== side) {
    const parts = position.fen().split(" ");
    parts[1] = side;
    parts[3] = "-";
    try {
      game = new Chess(parts.join(" "));
    } catch {
      return 0;
    }
  }

  const captures = game
    .moves({ verbose: true })
    .filter((m) => m.to === target && m.captured);
  if (captures.length === 0) return 0;

  // Least valuable attacker first.
  captures.sort((a, b) => (PIECE_VALUE_CP[a.piece] ?? 0) - (PIECE_VALUE_CP[b.piece] ?? 0));
  const chosen = captures[0];
  const gained = PIECE_VALUE_CP[occupant.type] ?? 0;

  const next = new Chess(game.fen());
  try {
    next.move({ from: chosen.from, to: chosen.to, promotion: (chosen.promotion ?? "q") as never });
  } catch {
    return 0;
  }
  const opponent: Color = side === "w" ? "b" : "w";
  // The opponent recaptures only if it pays; hence max(0, ...).
  return Math.max(0, gained - exchangeValue(next, target, opponent, depth + 1));
}

function attackedBy(game: Chess, square: Square, by: Color): boolean {
  try {
    return game.isAttacked(square, by);
  } catch {
    return false;
  }
}

/**
 * Derive the board facts for one played move.
 * Returns null when the move is not legal in the given position.
 */
export function buildPositionFacts(fenBefore: string, playedSan: string): PositionFacts | null {
  let before: Chess;
  try {
    before = new Chess(fenBefore);
  } catch {
    return null;
  }
  const mover: Color = before.turn();
  const opponent: Color = mover === "w" ? "b" : "w";

  const after = new Chess(fenBefore);
  let move;
  try {
    move = after.move(playedSan);
  } catch {
    return null;
  }

  const to = move.to as Square;
  const from = move.from as Square;
  const capturedCp = move.captured ? (PIECE_VALUE_CP[move.captured] ?? 0) : 0;

  // Captures are priced by the exchange on the target square; quiet moves by
  // what the opponent can win on the square we just moved to.
  const materialSwingCp = move.captured
    ? capturedCp - exchangeValue(after, to, opponent)
    : -exchangeValue(after, to, opponent);

  const wasAttacked = attackedBy(before, from, opponent);
  const isAttackedAfter = attackedBy(after, to, opponent);
  const standingLoss = wasAttacked ? exchangeValue(before, from, opponent) : 0;
  const movedValue = PIECE_VALUE_CP[move.piece] ?? 0;
  const escapedAttack = wasAttacked && standingLoss > 0 && !isAttackedAfter;

  return {
    capturedCp,
    materialSwingCp,
    movedPiece: move.piece,
    wasAttacked,
    isAttackedAfter,
    escapedAttack,
    escapedValueCp: escapedAttack ? movedValue : 0,
    givesCheck: after.isCheck(),
  };
}

/**
 * Was a candidate reply TEMPTING — the kind of move a human plays without
 * calculating? At club level the bait for a trap is almost always a favourable
 * looking capture or a check.
 *
 * Deliberately NOT based on static exchange evaluation. The shared `see`
 * helper is conservative and returns 0 for the real bait in game_02 (fxg3
 * grabbing a bishop with a pawn), which is precisely the move a human takes
 * without thinking. Temptation is about how a move LOOKS to someone counting
 * pieces, so it is priced that way: does it win something worth more than what
 * does the winning?
 */
export function isTemptingReply(fen: string, replySan: string): boolean {
  const probe = new Chess(fen);
  let move;
  try {
    move = probe.move(replySan);
  } catch {
    return false;
  }
  if (probe.isCheck()) return true;
  if (!move.captured) return false;
  const gained = PIECE_VALUE_CP[move.captured] ?? 0;
  const risked = PIECE_VALUE_CP[move.piece] ?? 0;
  return gained >= risked;
}
