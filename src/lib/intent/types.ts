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

import type { PositionFacts } from "./positionFacts";

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

  /**
   * Did the played move CAPTURE the piece that would have made the threat?
   *
   * A check makes every opponent non-evasion illegal for one ply, so
   * "the threat is now illegal" is worthless evidence on a checking move —
   * hence the guard that rejects it. But a check that captures the threatening
   * piece prevents the threat permanently, and that guard was silencing those,
   * producing empty cards on 7 of 190 sampled positions under a note that was
   * factually false. Computed with chess.js by the caller; null when unknown.
   */
  threatPieceCaptured: boolean | null;

  /**
   * What happens to the threat once the check has been answered.
   *
   * The guard above rejects "the threat is illegal" as evidence on a checking
   * move, which is right — but it then asserted the opposite, that the threat
   * comes straight back, and reported the move as having ignored it. That is
   * an equally unmeasured claim, and across the founder's games it was wrong
   * more often than right. This field is the measurement: play every legal
   * evasion and see whether the threat is available again.
   *
   * Computed with chess.js by the caller; null when unknown.
   */
  threatEvasions: {
    replies: number;
    returns: number;
    unmodelled: number;
  } | null;

  /**
   * The opponent's BEST move at fenAfter, scored for THEM — the baseline the
   * threat has to be measured against.
   *
   * Without this, "the threat's score fell" cannot be told apart from "the
   * opponent's whole position got worse", and those are different claims. Any
   * move that wins material drags every opponent option down with it. Measured
   * on a recapture (Qxd5 answering a pawn grab): the threat Bb5+ fell 263cp,
   * which cleared the swing bar comfortably — but the opponent's best reply was
   * only 56cp better than the "stopped" threat, i.e. it was never stopped at
   * all. The move won a pawn back and the arithmetic credited it with defence.
   *
   * Null when not measured, in which case no swing-based claim is made.
   *
   * NOTE ON PROVENANCE: this is a Tier 0 number, read out of gameEval, and
   * gameEval is measured on a warm transposition table. It must not be
   * subtracted from a Tier 1 score — see `opponentBestAfterProbed`.
   */
  opponentBestAfter: IntentScore | null;

  /**
   * The same square of information as `opponentBestAfter`, but measured by
   * whatever engine produced `threatAfter`, under the same conditions.
   *
   * Prophylaxis asks whether the threat is now clearly worse than the
   * opponent's alternatives, which is a subtraction. Both operands have to come
   * from the same measurement regime, or the difference is decided by the
   * regime rather than by the move. Across 768 plies of the founder's games,
   * warm-table and cold-table readings of the SAME position agree closely in
   * the middle (median 15cp) and diverge in the tail: 4.2% differ by more than
   * the 150cp bar this subtraction has to clear, and 3.3% disagree about
   * whether a forced mate exists at all.
   *
   * Null when the caller did not pay for the extra search. The relative test is
   * then skipped rather than run on mixed operands: a missing claim is cheaper
   * than a fabricated one.
   */
  opponentBestAfterProbed: IntentScore | null;

  /**
   * The player's best move at fenBefore, re-measured by whatever engine
   * produced `threat`.
   *
   * The "is this a threat at all?" gate values the opponent's free tempo as
   * `threat + rootBest` — one Tier 1 number plus one Tier 0 number. gameEval's
   * root score is read off a warm transposition table; the null-move probe runs
   * on a cold one, so the sum carries the difference between the two engines.
   *
   * Measured: on 60 plies deliberately sampled NEAR the 150cp bar, 12% of the
   * threat/no-threat decisions flip when this operand is measured in the same
   * regime as the threat — about 7.8% of all plies where the gate is live, and
   * they flip in BOTH directions. That is the engine deciding whether the
   * student is told about a threat, rather than the position.
   *
   * Null when the caller did not pay for the extra search, in which case the
   * Tier 0 root score is used and a note records the mixed comparison.
   */
  rootBestProbed: IntentScore | null;

  /**
   * The threat replayed after each of OUR plausible alternatives, scored for
   * the OPPONENT.
   *
   * The founder's rejection of "Kd8 stops Be2" was not that Be2 stayed good —
   * it was "there is probably just another move that does the same thing that
   * stockfish prefers in that position". Measured: Kd8 answered Be2 to -189
   * while a6 reached -423 and Qxe4+ -515. Kd8 was the WORST of the candidates;
   * the threat's decline was not its doing.
   *
   * A move need not be the UNIQUE answer to earn the claim — h5, a genuine
   * prophylactic move, shares the honour with f6, and both answer Qg4 with a
   * forced mate. It must merely not be a worse answer than the moves we passed
   * over. Empty when not measured.
   */
  threatAfterAlternatives: Array<{ ourSan: string; score: IntentScore | null; stillLegal: boolean }>;

  /** Score of the move actually played, measured at fenBefore, for the PLAYER. */
  playedScore: IntentScore | null;

  /** Non-pawn, non-king material for the side to move at fenBefore. */
  moverHasPieces: boolean;

  /** Board-derived facts for the played move. See positionFacts.ts. */
  position: PositionFacts | null;

  /**
   * What the opponent ACTUALLY did next, and what the engine wanted them to do.
   * For game review this is known ground truth — no human model needed to say
   * "they took the bait". Null for the last move of a game.
   */
  opponentReply: {
    san: string;
    /**
     * Score of their actual reply, for THEM. A full IntentScore rather than a
     * number: encoded as centipawns, a mate collapsed into a 30000cp "error",
     * and there was no way for a caller to express "they walked into mate" at
     * all — so Legall's Mate came back either as 30340 centipawns or as
     * nothing.
     */
    actual: IntentScore | null;
    bestSan: string;
    /** Score of their best reply, for THEM. */
    best: IntentScore | null;
    /** Did their reply look like a free capture or a check? */
    tempting: boolean;
    /**
     * Was that same reply even LEGAL before we moved (at the null-move
     * position)? False means our move created the opportunity outright, which
     * is the strongest attribution there is — it is why Bxg3 counts as a trap
     * when the opponent grabs with fxg3, a move that does not exist until the
     * bishop lands on g3. Null when not determined.
     */
    replyExistedBefore: boolean | null;
    /**
     * How bad the same error would have been had we played nothing — measured
     * at the null-move position. A trap is only ours if our move made the
     * mistake available or more costly; without this, a rook-pawn move on the
     * far wing was credited with "setting a trap" for a blunder worth 441cp
     * after it and 436cp without it.
     */
    counterfactualCostCp: number | null;
  } | null;
}

export interface MateFact {
  /** Moves to mate, from the player's side. */
  inMoves: number;
  /** The forcing line as SAN, as far as the engine gave it. */
  line: string[];
}

export interface MaterialFact {
  /** Net centipawns won after the exchange sequence. Always positive here. */
  wonCp: number;
  /** What was taken outright, if anything. */
  capturedCp: number;
}

export interface TrapFact {
  /** The reply the opponent actually chose. */
  playedSan: string;
  /** What the engine wanted them to play instead. */
  bestSan: string;
  /** How much their choice cost them. Null when a mate is involved. */
  costCp: number | null;
  /** Set when the reply walked into a forced mate rather than losing material. */
  walkedIntoMate: boolean;
  /** Whether the losing reply looked like a free capture or a check. */
  tempting: boolean;
}

export interface EscapeFact {
  /** The piece that got out, e.g. "b". */
  piece: string;
  /** Its value in centipawns. */
  valueCp: number;
}

/**
 * Which single thing the move was FOR. Ranked, because most moves do several
 * things at once and only one of them is the point — the founder's Bxd1 both
 * won a queen and incidentally made an opponent move worse, and reporting the
 * second would be true and useless.
 */
export type Purpose =
  | "mate"
  | "material"
  | "trap"
  | "escape"
  | "prophylaxis"
  | "none";

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
  /**
   * How much worse the threat now is than the opponent's BEST reply.
   *
   * This is the claim's real strength. `swingCp` says the threat got worse;
   * this says the threat got worse THAN THE ALTERNATIVES, which is what
   * "stopped it" means. Null when the opponent's best reply was not measured.
   */
  specificCp: number | null;
  /**
   * How much worse OUR move answers the threat than the best move we did not
   * play. Negative or near zero means our move is among the best answers;
   * clearly positive means the threat's decline was not our doing.
   * Null when our alternatives were not measured.
   */
  attributionCp: number | null;
}

/**
 * The opponent's threat that the played move did NOT deal with.
 *
 * The exact mirror of ProphylaxisFact, and the reason it exists: across the
 * founder's twelve games there were 53 positions where the opponent had a
 * forced mate if handed a free move. In 34 the mate survived the move actually
 * played, and in 30 of those the module said nothing whatsoever — including a
 * position where Qg6# was mate-in-one before the move and mate-in-one after it.
 *
 * Every number here was already being measured and then discarded, because the
 * module had vocabulary for "you stopped it" and none for "it is still coming".
 */
export interface UnaddressedThreatFact {
  /** What the opponent is threatening. */
  threatSan: string;
  /** Their score for it if we had passed. Null when that was a mate. */
  scoreBeforeCp: number | null;
  /** Their score for it now. Null when it is a mate. */
  scoreAfterCp: number | null;
  /** True when the threat is a forced mate that is still forced. */
  stillMates: boolean;
  /** Moves to mate, when stillMates. */
  mateInMoves: number | null;
  /** True when the move made the threat BETTER for them than passing would have. */
  madeItWorse: boolean;
  /**
   * Why it counts as unaddressed — the same measurements prophylaxis uses,
   * failing instead of passing.
   */
  reason:
    | "mate-still-forced"
    | "created-a-mate"
    | "threat-still-playable"
    | "barely-changed"
    | "made-it-worse"
    | "only-illegal-due-to-check";
}

/** What a cost looks like when a forced mate is on one side of the comparison. */
export type MateChange = "gave-up-mate" | "allowed-mate" | "gave-up-mate-and-allowed-mate";

export interface CostFact {
  bestSan: string;
  /** Null when the best line was a forced mate. */
  bestCp: number | null;
  /**
   * True when the gap was so large that the engine was scoring a decided game
   * rather than counting material; lossCp is then clamped to DECISIVE_CP and
   * must be narrated as "this loses", never as a pawn count.
   */
  beyondMeasurement?: boolean;
  /** Null when the played move led to a forced mate either way. */
  playedCp: number | null;
  /** best - played, always >= 0. Null when a mate is involved — see mateChange. */
  lossCp: number | null;
  /** Set when a mate entered or left the position; lossCp is null in that case. */
  mateChange: MateChange | null;
}

export type Sharpness = "only-move" | "clearly-best" | "slight-edge" | "flat";

export interface IntentFacts {
  mate: MateFact | null;
  material: MaterialFact | null;
  trap: TrapFact | null;
  escape: EscapeFact | null;
  prophylaxis: ProphylaxisFact | null;
  /**
   * The opponent threat this move failed to deal with. Never set at the same
   * time as `prophylaxis` — a threat either died or it did not.
   */
  unaddressedThreat: UnaddressedThreatFact | null;
  cost: CostFact | null;
  /** The single thing the move was for, chosen by the ranking. */
  purpose: Purpose;
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
