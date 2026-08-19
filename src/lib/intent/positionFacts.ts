import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { PIECE_VALUE_CP, exchangeValue, materialValue, promotionBonus } from "@/lib/tactics/utils";

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
    const capturedCp = materialValue(move.captured);
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
    const movedValue = Math.min(materialValue(move.piece), MAX_PIECE_CP);
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
 * What becomes of the threat once the check has been answered?
 *
 * A check makes every opponent non-evasion illegal for exactly one ply, so
 * "the threat is illegal now" says nothing on its own. The module used to
 * resolve that by ASSUMING the threat comes straight back, and reported the
 * move as having failed to deal with it. Measured across the founder's twelve
 * games, that assumption was wrong more often than right: of 19 such claims,
 * only 7 held, 6 were flatly false, and 6 depended on which evasion the
 * opponent chose.
 *
 * The founder caught it on game_06 move 34, `Rhxg2+`: the rook lands on g2
 * giving check, which makes `Kf2` illegal — and after two of White's three
 * legal replies it is illegal *forever*, because g2 is now covered. The move
 * answers the threat exactly, and the card said he had ignored it.
 *
 * So: play out every legal evasion and ask whether the threat is available
 * again. `replies === 0` means the move ended the game — it is checkmate or
 * stalemate, and there is no "next move" to threaten anything with. That case
 * produced the worst card of all: `Qxh7#`, the mate that ends game_04, carried
 * a note saying he had failed to deal with `Qf3+`.
 *
 * `unmodelled` counts evasions that give check straight back, where passing is
 * not a position and this cheap test cannot see far enough. They are reported
 * rather than guessed, so callers can decline to claim anything.
 */
export interface ThreatAfterEvasions {
  /** The opponent's legal answers to the check. Zero means the game is over. */
  replies: number;
  /** How many of those leave the threat playable again. */
  returns: number;
  /**
   * Of the returning branches, how many leave the threat MET the moment it is
   * played: the mover can capture the arriving piece without losing material,
   * through a capture that did not exist in the world the threat was priced
   * in. Legal again is not threatening again — the founder's Qxg3+ covers h4,
   * so White's Qh4 lands into Qxh4 down every evasion, and a card still told
   * him he had ignored it. See metByNewCapture.
   */
  met: number;
  /** How many could not be modelled, because the evasion checked us back. */
  unmodelled: number;
}

/**
 * After `fen` (threat side to move), play the threat: can the OTHER side then
 * capture the arriving piece without losing material?
 * Null when the threat is not even legal at `fen`.
 *
 * The first capture is evaluated SIGNED — `exchangeValue`'s outer
 * `max(0, ...)` floor exists because a side may decline an exchange, but it
 * makes "even trade, take it" and "losing, leave it" both read 0. Here the
 * distinction is the whole point: the founder's Qxg3+ meets Qh4 with an EVEN
 * queen trade (profit exactly 0 — met), while QxN into a pawn recapture is
 * -600 (not an answer at all). Recaptures below keep their floors, since
 * those sides can decline.
 *
 * (tactics/utils' `see` was tried first and returns +300 for the losing QxN
 * case — its swap-list prices the wrong piece at each step. Reported
 * separately; nothing in this module uses it.)
 */
function capturableOnArrival(fen: string, threatSan: string): boolean | null {
  try {
    const g = new Chess(fen);
    const mv = g.move(threatSan);
    const to = mv.to as Square;
    const occupant = g.get(to);
    if (!occupant) return false;

    const captures = g.moves({ verbose: true }).filter((m) => m.to === to && m.captured);
    if (captures.length === 0) return false;

    // Cheapest capturer first, priced like exchangeValue prices it.
    const cost = (m: { piece: PieceSymbol; promotion?: string }) =>
      (m.piece === "k" ? PIECE_VALUE_CP.q + 1 : materialValue(m.piece)) - promotionBonus(m.promotion);
    captures.sort((a, b) => cost(a) - cost(b));
    const chosen = captures[0];
    const gained = materialValue(occupant.type) + promotionBonus(chosen.promotion);

    const next = new Chess(g.fen());
    next.move({ from: chosen.from, to: chosen.to, promotion: (chosen.promotion ?? "q") as never });
    const opponent: Color = g.turn() === "w" ? "b" : "w";
    return gained - exchangeValue(next, to, opponent) >= 0;
  } catch {
    return null;
  }
}

export function threatAfterEvasions(
  fenAfter: string,
  threatSan: string,
  fenBefore?: string,
): ThreatAfterEvasions | null {
  try {
    const g = new Chess(fenAfter);
    const replies = g.moves();
    let returns = 0;
    let met = 0;
    let unmodelled = 0;

    // The world the threat was priced in: the mover passes, the opponent plays
    // the threat. If the arriving piece was ALREADY capturable there, the
    // threat's measured value includes that fact and a post-check capture
    // proves nothing. Only a capture our move CREATED counts as meeting it.
    // With no baseline position the distinction cannot be made, and the
    // conservative reading is "possibly met" — the claim built on it fails
    // closed rather than defaulting to the assumption that produced a wrong
    // card.
    const baselineFen = fenBefore ? nullMoveFen(fenBefore) : null;
    const pricedWithCapture = baselineFen ? capturableOnArrival(baselineFen, threatSan) : null;

    for (const reply of replies) {
      const board = new Chess(fenAfter);
      try {
        board.move(reply);
      } catch {
        unmodelled++;
        continue;
      }
      // Hand the move back to the threatening side and ask for the threat.
      const passed = nullMoveFen(board.fen());
      if (!passed) {
        unmodelled++;
        continue;
      }
      if (!isLegalSan(passed, threatSan)) continue;
      returns++;
      if (pricedWithCapture !== true && capturableOnArrival(passed, threatSan) === true) met++;
    }
    return { replies: replies.length, returns, met, unmodelled };
  } catch {
    return null;
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
    return materialValue(move.captured) >= materialValue(move.piece);
  } catch {
    return false;
  }
}
