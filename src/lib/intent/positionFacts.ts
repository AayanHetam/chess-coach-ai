import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
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

/** A king is never material. PIECE_VALUE_CP.k is a "never trade this" sentinel. */
const MAX_PIECE_CP = PIECE_VALUE_CP.q;

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
   * in chess.
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
   * stood, losing material to stay there, and safe where it went.
   *
   * A king walking out of check is NOT an escape. It is forced, it rescues no
   * material, and treating it as one produced "saved a piece worth 999.99
   * pawns" on 31 of 31 check evasions in a master-game sweep.
   */
  escapedAttack: boolean;
  /** Value of the piece that escaped, or 0. Never exceeds a queen. */
  escapedValueCp: number;
  /** Does the move give check? */
  givesCheck: boolean;
  /**
   * True when this move recaptures on the square the opponent just captured on.
   * A recapture usually restores equality rather than winning material: reading
   * a destination-square exchange value as "material won" carded 50 of 59
   * recaptures in a master-game sweep as wins.
   */
  isRecapture: boolean;
  /**
   * Net material across BOTH plies of an exchange: what we just took, minus
   * what they took from us to provoke it, minus what they can win back.
   *
   * Suppressing every recapture outright was the first fix and it was too
   * blunt. A recapture is usually even — but when the opponent takes a pawn
   * with their queen, taking the queen back is a genuine 800cp win, and the
   * blanket suppression reported it as nothing at all and then went on to call
   * the position quiet. Null when the value of their capture is unknown, in
   * which case no material claim is made either way.
   */
  recaptureNetCp: number | null;
}

/** Value of a piece, with the king's sentinel kept out of material maths. */
function valueOf(piece: PieceSymbol | string | undefined): number {
  if (!piece || piece === "k") return 0;
  return PIECE_VALUE_CP[piece as PieceSymbol] ?? 0;
}

/** What a promotion adds beyond the pawn that bought it. */
function promotionBonus(promotion: string | undefined): number {
  if (!promotion) return 0;
  return (PIECE_VALUE_CP[promotion as PieceSymbol] ?? 0) - PIECE_VALUE_CP.p;
}

/**
 * Static exchange evaluation, played out on real legal moves.
 *
 * Two hazards this has to avoid, both of which were live defects found by an
 * adversarial audit:
 *
 *  - The KING is not capturable material. chess.js happily generates
 *    "Rxe1" capturing a king on the turn-flipped position this function builds,
 *    and PIECE_VALUE_CP.k is 99999 — so an unguarded recursion priced every
 *    check evasion at 999.99 pawns, then re-parsed a kingless board and threw.
 *  - A PROMOTION is worth more than the piece standing on the target square.
 *    Pricing only the occupant inverted the sign of rook-winning promotions.
 */
function exchangeValue(position: Chess, target: Square, side: Color, depth = 0): number {
  if (depth > 12) return 0; // pathological positions; exchanges never run this deep
  const occupant = position.get(target);
  if (!occupant || occupant.color === side) return 0;
  // A king can be attacked but never won.
  if (occupant.type === "k") return 0;

  // chess.js only generates moves for the side to move, so asking what the
  // OPPONENT could win on a square during our turn silently returns nothing.
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

  let captures;
  try {
    captures = game.moves({ verbose: true }).filter((m) => m.to === target && m.captured);
  } catch {
    return 0;
  }
  if (captures.length === 0) return 0;

  // Least valuable attacker — but ranked by what the capture is WORTH to the
  // recapturing side, not by the bare piece value. Two traps here, both of
  // which produced sign-flipped material claims:
  //
  //  - valueOf() maps the king to 0 so that a king is never counted as material
  //    won. Reused as a sort key that made the king the cheapest attacker, so a
  //    king recapture was always chosen over a pawn that captures and PROMOTES.
  //    Because the promotion tie-break only ran on an exact value tie, it never
  //    fired: a move losing 400cp was reported as winning 400cp.
  //  - The promotion bonus belongs in the key itself, not in the tie-break.
  const cost = (m: { piece: PieceSymbol; promotion?: string }) =>
    (m.piece === "k" ? PIECE_VALUE_CP.q + 1 : valueOf(m.piece)) - promotionBonus(m.promotion);
  captures.sort((a, b) => cost(a) - cost(b));
  const chosen = captures[0];
  const gained = valueOf(occupant.type) + promotionBonus(chosen.promotion);

  let next: Chess;
  try {
    next = new Chess(game.fen());
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
 * Can the opponent win the pawn on `square` by an EN PASSANT capture?
 *
 * chess.js `isAttacked` is en-passant blind by specification, and the exchange
 * recursion matches captures by destination — but an e.p. capture lands on the
 * empty square BEHIND the pawn it removes. So a pawn that hangs only to e.p.
 * otherwise reads as completely safe.
 */
function enPassantVictimCp(game: Chess, square: Square, by: Color): number {
  try {
    if (game.turn() !== by) return 0;
    const victim = game.get(square);
    if (!victim || victim.type !== "p" || victim.color === by) return 0;
    const ep = game
      .moves({ verbose: true })
      .find((m) => m.flags.includes("e") && m.to[0] === square[0]);
    return ep ? PIECE_VALUE_CP.p : 0;
  } catch {
    return 0;
  }
}

/**
 * Derive the board facts for one played move.
 *
 * Returns null when the move is not legal in the position. It must NEVER
 * throw — 17 of 716 master-game moves crashed an earlier version out of a
 * function documented to return null.
 *
 * `opponentLastCaptureSquare` is what separates a recapture from a material win.
 */
export function buildPositionFacts(
  fenBefore: string,
  playedSan: string,
  opponentLastCaptureSquare?: string | null,
  /** Centipawn value of the piece the opponent took on that square, if known. */
  opponentLastCaptureValueCp?: number | null,
): PositionFacts | null {
  try {
    const before = new Chess(fenBefore);
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
    const capturedCp = valueOf(move.captured);
    const promoBonus = promotionBonus(move.promotion);

    // What the opponent can win back on the square we landed on — including
    // the en passant capture that isAttacked cannot see.
    const recoverable = Math.max(
      exchangeValue(after, to, opponent),
      enPassantVictimCp(after, to, opponent),
    );
    const materialSwingCp = capturedCp + promoBonus - recoverable;

    const wasAttacked =
      attackedBy(before, from, opponent) || enPassantVictimCp(before, from, opponent) > 0;
    const isAttackedAfter =
      attackedBy(after, to, opponent) || enPassantVictimCp(after, to, opponent) > 0;

    // A king is never "losing material by standing there" — it is in check,
    // which is a different fact, and its moves are forced rather than chosen.
    const isRecapture = !!opponentLastCaptureSquare && move.to === opponentLastCaptureSquare;
    const isKing = move.piece === "k";
    const standingLoss = !isKing && wasAttacked ? exchangeValue(before, from, opponent) : 0;
    const movedValue = Math.min(valueOf(move.piece), MAX_PIECE_CP);
    const escapedAttack = !isKing && wasAttacked && standingLoss > 0 && !isAttackedAfter;

    return {
      capturedCp,
      materialSwingCp,
      movedPiece: move.piece,
      wasAttacked,
      isAttackedAfter,
      escapedAttack,
      escapedValueCp: escapedAttack ? movedValue : 0,
      givesCheck: after.isCheck(),
      isRecapture,
      recaptureNetCp:
        isRecapture && typeof opponentLastCaptureValueCp === "number"
          ? materialSwingCp - opponentLastCaptureValueCp
          : null,
    };
  } catch {
    // Any unexpected chess.js behaviour degrades to "we do not know" — never a
    // throw, and never a confident number.
    return null;
  }
}

/**
 * The position with the move handed to the opponent — "what if we passed?".
 * Null when passing is not a position: you cannot pass out of check.
 */
export function nullMoveFen(fen: string): string | null {
  try {
    const g = new Chess(fen);
    if (g.isCheck()) return null;
    const parts = fen.split(" ");
    parts[1] = parts[1] === "w" ? "b" : "w";
    parts[3] = "-";
    const flipped = parts.join(" ");
    const probe = new Chess(flipped);
    return probe.moves().length > 0 ? flipped : null;
  } catch {
    return null;
  }
}

/** Is this SAN move legal in this position? Never throws. */
export function isLegalSan(fen: string, san: string): boolean {
  try {
    const g = new Chess(fen);
    g.move(san);
    return true;
  } catch {
    return false;
  }
}

/**
 * Did the played move CAPTURE the piece that would have delivered the threat?
 *
 * The threat is a move the opponent would play if handed a free tempo, so its
 * origin square is where the threatening piece stands. Taking that piece
 * prevents the threat permanently — as opposed to a check, which merely makes
 * every non-evasion illegal for a single ply.
 *
 * Returns null when either move cannot be read, so callers can tell "no" from
 * "we could not tell".
 */
export function didCaptureThreatPiece(
  fenBefore: string,
  playedSan: string,
  threatSan: string,
): boolean | null {
  try {
    const passed = nullMoveFen(fenBefore);
    if (!passed) return null;
    const threatBoard = new Chess(passed);
    let threatMove;
    try {
      threatMove = threatBoard.move(threatSan);
    } catch {
      return null;
    }
    const ourBoard = new Chess(fenBefore);
    let ourMove;
    try {
      ourMove = ourBoard.move(playedSan);
    } catch {
      return null;
    }
    if (!ourMove.captured) return false;
    // An en passant capture removes a pawn that is NOT on the landing square:
    // it sits on the destination FILE at the capturing pawn's ORIGIN rank,
    // which holds for both colours without a side test.
    const takenSquare = ourMove.flags.includes("e")
      ? `${ourMove.to[0]}${ourMove.from[1]}`
      : ourMove.to;
    return takenSquare === threatMove.from;
  } catch {
    return null;
  }
}

/**
 * Was a candidate reply TEMPTING — the kind of move a human plays without
 * calculating? At club level the bait for a trap is almost always a
 * favourable-looking capture or a check.
 *
 * Deliberately NOT based on static exchange evaluation: temptation is about how
 * a move LOOKS to someone counting pieces, not what it is worth. Must never
 * throw — its sibling returns null for bad input and callers treat the pair
 * alike.
 */
export function isTemptingReply(fen: string, replySan: string): boolean {
  try {
    const probe = new Chess(fen);
    let move;
    try {
      move = probe.move(replySan);
    } catch {
      return false;
    }
    if (probe.isCheck()) return true;
    if (!move.captured) return false;
    return valueOf(move.captured) >= valueOf(move.piece);
  } catch {
    return false;
  }
}
