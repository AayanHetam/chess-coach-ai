/**
 * INTENT FACTS — what a move does, computed as a difference between worlds.
 *
 * A single engine line tells you what happens; it never tells you what a move
 * was FOR. Intent is a subtraction: the world where the move was played minus
 * the world where it wasn't. Every fact in this module is such a difference.
 *
 * ── SCORE CONVENTION (read this before touching anything) ──────────────────
 *
 * Every score in this module is MOVER-RELATIVE: positive means good for
 * whoever is to move in the position the score was measured in.
 *
 * This is NOT the convention our gameEval payload uses — Stockfish there
 * reports WHITE-relative cp, which silently inverts every comparison for
 * Black-to-move positions. Callers must convert at the boundary with
 * `whiteRelativeToMover`. Getting this wrong does not throw; it produces
 * confident nonsense, so the conversion is a named function with its own test.
 */

export interface IntentScore {
  /** Centipawns, mover-relative. Null when the line is a forced mate. */
  cp: number | null;
  /** Mate distance in moves, mover-relative sign. Null when not a mate. */
  mate: number | null;
}

export interface EngineLine {
  /** First move of the line in SAN, legal in the position it was searched from. */
  san: string;
  /** Mover-relative score for the position this line was searched from. */
  score: IntentScore;
  /** Principal variation in SAN from the searched position. */
  pv: string[];
  depth: number;
}

/**
 * The engine measurements for one carded position. Assembling this is the
 * caller's job (offline harness now, browser worker later); deriving meaning
 * from it is this module's job, and it is pure.
 */
export interface IntentProbe {
  /** Position before the played move. */
  fenBefore: string;
  /** The move actually played, SAN. */
  playedSan: string;
  /** Position after the played move. */
  fenAfter: string;

  /** Top engine lines at fenBefore, best first, scored for the PLAYER. */
  rootLines: EngineLine[];

  /**
   * Null move at fenBefore: hand the move to the opponent and ask what they
   * would do. Scored for the OPPONENT. Null when not measured.
   */
  threat: EngineLine | null;

  /**
   * The same threat move forced in fenAfter, scored for the OPPONENT.
   * Null when the threat move is no longer legal — which is itself the
   * strongest form of prophylaxis and is reported as such.
   */
  threatAfter: EngineLine | null;

  /**
   * The opponent's SECOND-best free move at fenBefore, scored for them.
   * A threat is a move that is specifically better than their alternatives; a
   * free tempo being generally useful (any developing move in the opening) is
   * not a threat. Null when not measured.
   */
  threatAlternative: EngineLine | null;

  /** Whether the threat move is still legal in fenAfter. */
  threatStillLegal: boolean;

  /** Score of the move actually played, measured at fenBefore, for the PLAYER. */
  playedScore: IntentScore | null;

  /** Non-pawn, non-king material for the side to move at fenBefore. */
  moverHasPieces: boolean;
}

export interface ProphylaxisFact {
  /** The opponent move that the played move defused. */
  threatSan: string;
  /** Threat's value to the opponent if the player had done nothing. Null if it was a mate. */
  scoreBeforeCp: number | null;
  /** Threat's value to the opponent after the played move. Null if now illegal, or a mate. */
  scoreAfterCp: number | null;
  /**
   * scoreBefore - scoreAfter, positive meaning the move reduced the threat.
   * Null whenever a mate score is involved, because a mate is not a quantity
   * of centipawns and subtracting it produces numbers like "309 pawns".
   */
  swingCp: number | null;
  /** True when the move removed the threat move from the position entirely. */
  preventedOutright: boolean;
  /** True when the opponent's free move was a forced mate that the move defused. */
  defusedMate: boolean;
}

/** What a cost looks like when a forced mate is on one side of the comparison. */
export type MateChange = "gave-up-mate" | "allowed-mate" | "gave-up-mate-and-allowed-mate";

export interface CostFact {
  bestSan: string;
  /** Null when the best line was a forced mate. */
  bestCp: number | null;
  /** Null when the played move led to a forced mate either way. */
  playedCp: number | null;
  /** best - played, always >= 0. Null when a mate is involved — see mateChange. */
  lossCp: number | null;
  /** Set when a mate entered or left the position; lossCp is null in that case. */
  mateChange: MateChange | null;
}

export type Sharpness = "only-move" | "clearly-best" | "slight-edge" | "flat";

export interface IntentFacts {
  prophylaxis: ProphylaxisFact | null;
  cost: CostFact | null;
  sharpness: Sharpness | null;
  /**
   * True when nothing concrete was found AND the position is flat: the correct
   * output is "development, nothing tactical here". Suppressed (left false)
   * when the zugzwang guard fires, because in a king-and-pawn position the
   * comparison that produces "quiet" inverts.
   */
  quiet: boolean;
  /** True when the zugzwang guard suppressed a quiet claim. */
  urgencySuppressed: boolean;
  /** Why individual facts were dropped. Diagnostics, never user-facing prose. */
  notes: string[];
}
