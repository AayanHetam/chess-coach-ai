import type {
  EscapeFact,
  MateChange,
  MaterialFact,
  MateFact,
  Purpose,
  TrapFact,
  CostFact,
  EngineLine,
  IntentFacts,
  IntentProbe,
  IntentScore,
  ProphylaxisFact,
  Sharpness,
  UnaddressedThreatFact,
} from "./types";

/**
 * Mate scores have to be comparable with centipawn scores to subtract them.
 * A mate is worth more than any material advantage, and a shorter mate is
 * worth more than a longer one, so mate-in-N maps to MATE_CP - N.
 */
export const MATE_CP = 30000;

/**
 * How much the threat's value must fall before we say the move stopped it.
 *
 * Calibrated against the one case with a known answer: h5 in game_02 drove
 * White's Qg4 from +180 to -966, a swing of 1146. A threshold well below that
 * catches the clear cases; anything under 150cp is inside the noise band
 * between a real defusal and the engine simply preferring a different move
 * order, so we stay silent there rather than assert a weak claim.
 */
export const PROPHYLAXIS_MIN_SWING_CP = 150;

/**
 * How far the threat must move IN THE OPPONENT'S FAVOUR before we say our move
 * made it stronger.
 *
 * Symmetric with PROPHYLAXIS_MIN_SWING_CP above, and for the same reason. The
 * founder, on two cards claiming his move made a threat stronger: "the evals
 * should be the same because the position that occurs should be the same a few
 * moves after the move." They were the same, to within measurement error.
 *
 * This label used to fire on `swing < 0` — any negative value at all. The swing
 * is a difference between two DIFFERENT positions (with and without our move),
 * each scored by its own search, and it is nothing like stable enough to read a
 * sign off. Measured like-for-like on the three cards he was shown, at
 * increasing depth:
 *
 *   game_10 20.Qh3    d14 -29   d16 -28   d18 -12   d20  +7   d22  +6   d24 +13
 *   game_11 40.Ra6    d14  -8   d16 -25   d18  -3   d20 +43   d22 -151  d24 -333
 *   game_12 14...d5   d14 -20   d16 -43   d18   0   d20 -16   d22  -7   d24 -17
 *
 * The first flips sign at depth 20 and stays flipped; the second flips twice.
 * At fixed depth the same swing moves ~25cp purely from legitimate measurement
 * choices (MultiPV 1 vs 2, restricted vs unrestricted). Every instance the
 * module had ever labelled sat between 9 and 43cp — entirely inside that.
 *
 * Requiring the same magnitude in both directions is the point: we already
 * refuse to say "your move stopped this" below 150cp, and saying "your move
 * STRENGTHENED this" is no cheaper a claim.
 */
export const THREAT_STRENGTHENED_MIN_CP = PROPHYLAXIS_MIN_SWING_CP;

/**
 * How much a free tempo must be worth to the opponent before their best
 * null-move reply counts as a THREAT at all.
 *
 * The null move always returns some move, even when the opponent has nothing
 * going on — it is simply their least-bad option. Any decent move by the player
 * then makes that option look worse, which reads as prophylaxis against a
 * threat that never existed. Observed live: fxg3 in game_02 "stopped" Qb7,
 * where a free tempo was worth only 60cp to the opponent and Qb7 was losing
 * both before and after.
 *
 * Value of a free tempo = (opponent's score with a free move) - (what they
 * could expect anyway, i.e. the negation of the player's best score). Below
 * this bar the opponent has no threat and we say nothing.
 */
export const THREAT_MIN_TEMPO_VALUE_CP = 150;

/**
 * How much worse the threat must be than the opponent's BEST reply before we
 * say the move stopped it.
 *
 * A falling threat score is not evidence on its own. Winning material drags
 * every one of the opponent's options down together, so the threat "falls"
 * while remaining exactly as good as anything else they have. Measured at
 * depth 16 on the founder's games:
 *
 *   h5   (real prophylaxis)      threat 969cp worse than their best reply
 *   Qxd5 (a recapture)           threat  56cp worse — i.e. still fine for them
 *
 * The recapture cleared the 150cp swing bar with 263cp and was carded as
 * "played to stop Bb5+". It was played to take a pawn back.
 */
export const PROPHYLAXIS_MIN_SPECIFIC_CP = 150;

/**
 * How BAD the threat must be for the opponent after our move.
 *
 * Specificity — "is the threat worse than their best reply" — turned out to
 * punish exactly the moves that work best. A crushing move drags every one of
 * the opponent's options down together, so the RELATIVE gap collapses even as
 * the threat is comprehensively refuted. Measured: g6 drove Bxd8 from +467 to
 * -464, a 931cp collapse the founder confirmed as real prophylaxis, yet it
 * scored only 139cp against White's best reply and was rejected — the same
 * arithmetic that correctly rejects a recapture, applied to the opposite chess.
 *
 * Absolute position separates them where relative position cannot:
 *
 *   g6   (confirmed)   threat ends at -464  — playing it now loses
 *   Re1  (confirmed)   threat ends at -384  — playing it now loses
 *   h5   (confirmed)   threat ends at -969  — playing it now loses badly
 *   Qxd5 (a recapture) threat ends at  -21  — still perfectly playable
 *
 * One pawn, matching the other "worth mentioning" floors in this file.
 */
export const PROPHYLAXIS_THREAT_MUST_END_BELOW_CP = -100;

/**
 * The share of the available refutation our move must capture before the
 * threat's decline may be called OUR MOVE'S doing.
 *
 * The founder's rejection of "Kd8 stops Be2": "there is probably just another
 * move that does the same thing that stockfish prefers in that position."
 * The first gate built on that ruling was an absolute centipawn margin
 * (played-answer minus best-alternative-answer, bar 250), and on clean data
 * the founder's own rulings order the WRONG way round under it: h5, confirmed,
 * sits 341cp short of its best alternative; Kd8, rejected, only 311cp short.
 * No absolute bar keeps one and rejects the other, because an absolute margin
 * is applied to refutations of wildly different size.
 *
 * The founder chose the gate's shape on 2026-08-18: a SHARE of the refutation
 * actually available — captured / (captured + shortfall), where captured is
 * how far the threat fell under our move and shortfall is how much further the
 * best passed-over move would have taken it.
 *
 * All five of the founder's rulings, under that shape:
 *
 *   g6    CONFIRMED   957 of 1030cp    92.9%
 *   h5    CONFIRMED   1112 of 1453cp   76.5%
 *   Re1   CONFIRMED   383 of 600cp     63.8%
 *   Kd8   REJECTED    312 of 623cp     50.1%
 *   f5    CONFIRMED   incomparable (its alternatives END the threat — no
 *                     same-scale subtraction exists; the gate does not run)
 *
 * The rulings force the bar into (50.1%, 63.8%]. It is set at the MIDPOINT of
 * that window, equal distance from the closest confirmed and the closest
 * rejected ruling, so a small measurement wobble on either flips nothing.
 * Two points bound each edge — move it as ground truth grows, never past
 * either edge.
 */
export const PROPHYLAXIS_MIN_REFUTATION_SHARE = 0.57;

/** Spread between best and second-best that separates the sharpness buckets. */
export const SHARPNESS_ONLY_MOVE_CP = 150;
export const SHARPNESS_CLEARLY_BEST_CP = 50;
export const SHARPNESS_SLIGHT_EDGE_CP = 20;

/**
 * Below this the played move did not give up anything worth narrating.
 *
 * Measured across 77 real positions: the 50-99cp band contained EIGHT ordinary
 * moves (castling at 61cp, a developing Bb5 at 98cp) and ZERO of the 25 moves
 * the coach actually carded as mistakes — every one of those cost a full pawn
 * or more. A half-pawn floor therefore bought nothing and cost credibility, so
 * it sits at one pawn.
 */
export const COST_MIN_LOSS_CP = 100;

/** Net material below a pawn is not what a move was "for". */
export const MATERIAL_MIN_CP = 100;

/**
 * Above this the engine is describing a decided game, not a material count.
 *
 * Stockfish happily reports +8308 in a won king-and-pawn ending. Subtracted,
 * that produced "this move cost you 7513 centipawns" — seventy-five pawns,
 * about a move in a position with two pawns on the board. Measured over 2,196
 * root evaluations from the founder's twelve games: the 99th percentile is
 * 1281cp and only 0.14% exceed 2000, so the bound discards almost nothing while
 * keeping every number the coach says inside the range where centipawns still
 * mean material.
 */
export const DECISIVE_CP = 2000;

/**
 * Below this the game is already gone, and an unaddressed threat is not news.
 *
 * The founder ruled on all seven positions where a forced mate survived the
 * move played. Exactly one was worth saying, and the separation was clean:
 *
 *   game_04  WORTH IT   best move available was Qd4+, mate in 17 — winning
 *   game_11  no         best was -673
 *   game_02  no         best was mate in 3 AGAINST
 *   game_02  no         best was mate in 1 AGAINST  ("a3 is as good as Rf1")
 *   game_09  no         best was mate in 12 AGAINST
 *   game_12  no         best was -1472
 *   game_12  no         best was mate in 4 AGAINST
 *
 * In their words: "the game is already decided, not much can be done and pretty
 * much everything leads to mate — resignable position". Against the one keeper:
 * "the game is not already decided as black is winning before the blunder".
 *
 * -300 is not a new number: it is this repo's existing LOST band from
 * cardWorthiness.evalBand, which the card-selection path already uses to decide
 * what is worth a student's attention.
 */
export const ALREADY_LOST_CP = -300;

/**
 * The SAME bar, applied to the opponent.
 *
 * The founder's rule — "the game is already decided, not much can be done" —
 * cuts both ways, and only one direction was implemented. Measured on their
 * games: at move 49 of game_12 the player was +1631 and the module reported
 * they had failed to deal with Kg4, a move worth -1429 TO THE OPPONENT. Naming
 * a threat by somebody who is already lost is the mirror of naming one against
 * a player who is already lost, and it is just as useless to a student.
 *
 * The null move always returns SOMETHING; in a won position that something is
 * simply the least-bad way to keep losing.
 */
export const OPPONENT_ALREADY_LOST_CP = -300;

/**
 * How badly the opponent's actual reply must have gone before we call the
 * position a trap. Two pawns keeps it to errors worth talking about; the real
 * case (fxg3 in game_02) cost 447cp.
 */
export const TRAP_MIN_COST_CP = 200;

/**
 * How much WORSE the opponent's error must be because of our move before we
 * call it our trap. Without this, a far-wing rook-pawn move was credited with
 * baiting a blunder that was worth 436cp in the world where it was never
 * played and 441cp in the world where it was.
 */
export const TRAP_MIN_ATTRIBUTION_CP = 100;

/**
 * Side-channel from the analysis passes to the "is this position quiet" gate.
 *
 * A pass can decline to make a claim for two very different reasons: it looked
 * and there was nothing there, or it found something real and could not narrate
 * it safely. Only the first justifies telling a student the position is dull.
 */
interface AnalysisSignals {
  /** The opponent had a genuine threat, whether or not we claimed prophylaxis. */
  threatWasReal: boolean;
  /**
   * The threat the move failed to deal with. Set at exactly the points where a
   * prophylaxis claim is rejected BECAUSE the threat survived — as opposed to
   * the points where it is rejected because we could not measure something, or
   * because someone else's move deserves the credit.
   */
  unaddressed: UnaddressedThreatFact | null;
}

/** Record that the opponent's threat survived the move. */
function unaddressed(
  probe: IntentProbe,
  reason: UnaddressedThreatFact["reason"],
  opts: { stillMates?: boolean; madeItWorse?: boolean } = {},
): UnaddressedThreatFact {
  const after = probe.threatAfter?.score ?? null;
  return {
    threatSan: probe.threat!.san,
    scoreBeforeCp: isMate(probe.threat!.score) ? null : toCp(probe.threat!.score),
    scoreAfterCp: isMate(after) ? null : toCp(after),
    stillMates: opts.stillMates ?? false,
    mateInMoves: opts.stillMates && after?.mate != null ? Math.abs(after.mate) : null,
    madeItWorse: opts.madeItWorse ?? false,
    reason,
  };
}

/** Convert a WHITE-relative engine score to mover-relative. See types.ts. */
export function whiteRelativeToMover(score: IntentScore, mover: "w" | "b"): IntentScore {
  if (mover === "w") return { cp: score.cp, mate: score.mate };
  return {
    cp: score.cp === null ? null : -score.cp,
    mate: score.mate === null ? null : -score.mate,
  };
}

/**
 * THE ONLY WAY TO SUBTRACT TWO SCORES.
 *
 * Returns null whenever a mate is on either side, because a mate is not a
 * quantity of centipawns. An audit found four sites that subtract scores; two
 * had hand-written mate guards, one had the wrong predicate, and one had none
 * at all — producing "that reply cost them 30340 centipawns" on Legall's Mate.
 * Per-site discipline failed at four of four unguarded opportunities, so the
 * hazard lives here instead of at each call site.
 */
export function diffCp(
  a: IntentScore | null | undefined,
  b: IntentScore | null | undefined,
): number | null {
  if (!a || !b) return null;
  if (isMate(a) || isMate(b)) return null;
  if (a.cp === null || a.cp === undefined || b.cp === null || b.cp === undefined) return null;
  return a.cp - b.cp;
}

/**
 * Collapse a score to one comparable number.
 *
 * LOSSY and unsafe for subtraction — mate maps into the centipawn range, so a
 * difference of two collapsed mates is a meaningless number that reads as
 * pawns. Use it for ordering and display only; use diffCp to subtract.
 */
export function toCp(score: IntentScore | null | undefined): number | null {
  if (!score) return null;
  if (score.mate !== null && score.mate !== undefined) {
    const n = Math.abs(score.mate);
    return score.mate > 0 ? MATE_CP - n : -(MATE_CP - n);
  }
  return score.cp ?? null;
}

function classifySharpness(rootLines: EngineLine[]): Sharpness | null {
  if (rootLines.length < 2) return null;
  const first = rootLines[0].score;
  const second = rootLines[1].score;

  // Mate distances are not centipawns. Collapsing them made mate-in-1 beside
  // mate-in-16 read as "flat" — two positions that are both "mate in 1" got
  // opposite labels depending on whether the runner-up also happened to mate.
  if (isMateFor(first)) {
    if (!isMateFor(second)) return "only-move";
    const da = Math.abs(first.mate as number);
    const db = Math.abs(second.mate as number);
    return db - da >= 2 ? "only-move" : "flat";
  }
  if (isMate(first) || isMate(second)) return null;

  const gap = diffCp(first, second);
  if (gap === null) return null;
  if (gap >= SHARPNESS_ONLY_MOVE_CP) return "only-move";
  if (gap >= SHARPNESS_CLEARLY_BEST_CP) return "clearly-best";
  if (gap >= SHARPNESS_SLIGHT_EDGE_CP) return "slight-edge";
  return "flat";
}

/** Does this score express a forced mate rather than a material count? */
export function isMate(score: IntentScore | null | undefined): boolean {
  return !!score && score.mate !== null && score.mate !== undefined;
}
/** A forced mate FOR the side the score belongs to. */
function isMateFor(score: IntentScore | null | undefined): boolean {
  return isMate(score) && (score!.mate as number) > 0;
}
/** A forced mate AGAINST the side the score belongs to. mate 0 = already mated. */
function isMateAgainst(score: IntentScore | null | undefined): boolean {
  return isMate(score) && (score!.mate as number) <= 0;
}

/**
 * Did the played move defuse what the opponent wanted?
 *
 * `threat` is the opponent's best move when handed a free tempo at fenBefore,
 * scored for the opponent. `threatAfter` is that same move forced in fenAfter,
 * also scored for the opponent. Both are measured from the opponent's side, so
 * a fall between them is the played move's doing.
 *
 * The two positions differ only in what the player did — pass versus play the
 * move — which is exactly the counterfactual we want.
 */
function computeProphylaxis(
  probe: IntentProbe,
  notes: string[],
  signals: AnalysisSignals,
): ProphylaxisFact | null {
  if (!probe.threat) {
    notes.push("no threat probe");
    return null;
  }

  const threatMates = isMateFor(probe.threat.score);
  const before = isMate(probe.threat.score) ? null : toCp(probe.threat.score);

  // Is this a threat at all, or just the opponent's least-bad move?
  //
  // A forced mate is always a threat and needs no arithmetic. Otherwise measure
  // what a free tempo is worth to them: their null-move score minus what they
  // could expect anyway (the negation of the player's best score). Mate scores
  // are excluded from that subtraction entirely — mixing them in produced
  // values like -28437cp, which decided the gate by mate distance rather than
  // by chess.
  if (!threatMates) {
    if (before === null) {
      notes.push("opponent is being mated in the null line — no threat of theirs to stop");
      return null;
    }
    // BOTH OPERANDS FROM ONE REGIME. `before` is the null-move probe's number,
    // measured on a cold transposition table; gameEval's root score is read off
    // a warm one. Adding them makes the sum carry the difference between two
    // engines. Sampled on 60 plies near the 150cp bar, 12% of the
    // threat/no-threat decisions flip when this operand is measured alongside
    // the threat instead — about 7.8% of all plies where this gate is live, and
    // in both directions.
    const rootScore = probe.rootBestProbed ?? probe.rootLines[0]?.score;
    if (!probe.rootBestProbed && probe.rootLines[0]) {
      notes.push("free tempo valued across measurement regimes — no same-regime root score");
    }
    if (!rootScore || isMate(rootScore)) {
      notes.push("cannot value the opponent's tempo against a mate score");
      return null;
    }
    const playerBest = toCp(rootScore);
    if (playerBest === null) {
      notes.push("cannot value the opponent's tempo: no root score");
      return null;
    }
    const tempoValue = before + playerBest;
    if (tempoValue < THREAT_MIN_TEMPO_VALUE_CP) {
      notes.push(`free tempo worth only ${tempoValue}cp to opponent — no threat`);
      return null;
    }
  }
  // Is the OPPONENT already lost? Then their best try is not a threat, it is
  // the least-bad way to keep losing, and the tempo arithmetic above cannot
  // tell the difference: a player who is +16 makes every opponent option look
  // like it "gains" a tempo.
  if (!threatMates && before !== null && before <= OPPONENT_ALREADY_LOST_CP) {
    notes.push(
      `the opponent is lost anyway (${before}cp with a free move) — their best try is not a threat`,
    );
    return null;
  }

  // Past this point the opponent genuinely had something. Every later return is
  // "we will not narrate it", never "there was nothing here".
  signals.threatWasReal = true;

  // Strongest case: the move made the threat impossible, not merely bad.
  //
  // A CHECK makes every opponent non-evasion illegal for exactly one ply, so
  // this branch used to fire on every check by construction — a royal fork
  // whose point was winning a rook was reported as "played to stop Bxg2".
  // Illegality caused by check is not prevention.
  //
  // But a check that CAPTURES the threatening piece prevents the threat
  // permanently, and the guard was silencing those: it fired on 7 of 190 sampled
  // positions, in each case emitting an empty card under a note that was
  // factually false. Capturing the piece that would have made the move is real,
  // durable prevention no matter what else the move does.
  if (!probe.threatStillLegal && probe.threatPieceCaptured !== true) {
    if (probe.position === null) {
      // The guard cannot tell a check from a capture without board facts, and
      // optional-chaining through a null position quietly disabled it.
      notes.push("cannot tell whether the threat is only illegal due to check — board facts missing");
      return null;
    }
    if (probe.position.givesCheck) {
      // "Illegal because of the check" is not prevention — but nor is it proof
      // that the threat survives, which is what this branch used to assert.
      // Both are claims about the same unmeasured thing. Measure it: play out
      // the evasions and see whether the threat is available again.
      const ev = probe.threatEvasions;
      if (!ev) {
        notes.push("threat illegal under check, and the evasions were not modelled — saying nothing");
        return null;
      }
      if (ev.replies === 0) {
        // Checkmate or stalemate. There is no next move to threaten with, and
        // this branch was captioning game_04's final `Qxh7#` with a claim that
        // he had failed to deal with `Qf3+`.
        notes.push("the move ended the game — there is no threat left to answer");
        return null;
      }
      if (ev.returns === ev.replies && ev.met > 0) {
        // Legal again is NOT threatening again. The threat comes back down
        // every reply, but in at least one branch it lands into a capture the
        // played move itself created (SEE >= 0, absent from the null-move
        // world the threat was priced in). The founder's Qxg3+: the queen
        // lands on g3 covering h4, so Qh4 is met by Qxh4 down every evasion —
        // and the card said he had ignored it. Whether the capture fully
        // neutralizes the threat needs an engine; whether we may claim he
        // IGNORED it does not: we may not.
        notes.push(
          `threat returns after every reply but this move meets it with a capture that did not exist before ` +
            `(${ev.met} of ${ev.returns} branches) — not claiming either way`,
        );
        return null;
      }
      if (ev.returns === ev.replies) {
        notes.push("threat is only illegal because the move gives check — it returns after every reply");
        signals.unaddressed = unaddressed(probe, "only-illegal-due-to-check");
        return null;
      }
      if (ev.returns === 0 && ev.unmodelled === 0) {
        // The threat never comes back down ANY legal reply: the check ended it
        // permanently, which is what `Rhxg2+` was doing to `Kf2` when a card
        // told the founder he had ignored it. The founder ruled on 2026-08-18:
        // CREDIT IT, but only when the move is itself sound — a blunder must
        // never be praised for a side effect. Soundness is same-search only
        // (see sameSearchLossCp); when it cannot be measured, no credit.
        const loss = sameSearchLossCp(probe);
        if (loss !== null && loss < COST_MIN_LOSS_CP) {
          return {
            threatSan: probe.threat.san,
            scoreBeforeCp: before,
            scoreAfterCp: null,
            swingCp: null,
            preventedOutright: true,
            defusedMate: threatMates,
            specificCp: null,
            attributionCp: attributionMargin(probe),
          };
        }
        notes.push(
          loss === null
            ? "the check ends the threat for good, but the move is not measurably near the engine's best — not crediting"
            : `the check ends the threat for good, but the move itself loses ${loss}cp — a side effect of an unsound move earns no credit`,
        );
        return null;
      }
      // The threat comes back down some evasions and not others, or an
      // evasion could not be modelled: the claim depends on a choice the
      // opponent has not made yet. That earns neither "you ignored it" nor
      // credit for stopping it.
      notes.push(
        `threat returns after ${ev.returns} of ${ev.replies} replies` +
          (ev.unmodelled ? ` (${ev.unmodelled} unmodelled)` : "") +
          " — not claiming it was ignored",
      );
      return null;
    }
  }
  if (!probe.threatStillLegal) {
    return {
      threatSan: probe.threat.san,
      scoreBeforeCp: before,
      scoreAfterCp: null,
      swingCp: null,
      preventedOutright: true,
      defusedMate: threatMates,
      // No centipawn comparison exists when the threat is gone from the board.
      specificCp: null,
      attributionCp: attributionMargin(probe),
    };
  }

  if (!probe.threatAfter) {
    notes.push("threat still legal but not re-measured");
    return null;
  }

  // A mate that is still a mate afterwards was not defused.
  if (threatMates) {
    if (isMateFor(probe.threatAfter.score)) {
      notes.push("threatened mate survives the move");
      signals.unaddressed = unaddressed(probe, "mate-still-forced", { stillMates: true });
      return null;
    }
    return {
      threatSan: probe.threat.san,
      scoreBeforeCp: null,
      scoreAfterCp: isMate(probe.threatAfter.score) ? null : toCp(probe.threatAfter.score),
      swingCp: null,
      preventedOutright: false,
      defusedMate: true,
      specificCp: null,
      attributionCp: attributionMargin(probe),
    };
  }

  // threatAfter is scored FOR THE OPPONENT, so mate > 0 means the threat now
  // MATES US. Reading it sign-blind reported "Rf8 stopped Qxh7+" about the very
  // move that makes Qxh7 checkmate — feeding mate +1 and mate -1 produced
  // byte-identical output.
  if (isMateFor(probe.threatAfter.score)) {
    notes.push("the move turned the threat into a forced mate against us — not prophylaxis");
    signals.unaddressed = unaddressed(probe, "created-a-mate", { stillMates: true, madeItWorse: true });
    return null;
  }
  if (isMateAgainst(probe.threatAfter.score)) {
    // Playing the threat move now loses to mate — but only if the opponent had
    // some way to avoid being mated. This branch returns BEFORE the specificity
    // gate, so it was the one path where "their whole position is lost" still
    // read as "our move stopped this". Found in a dead king-and-pawn ending: a3
    // was carded as stopping Kg5 while White was mated in 20 whatever they
    // played.
    if (probe.opponentBestAfter === null) {
      // isMateAgainst(null) is false, so a missing baseline used to fall
      // straight through the guard below and return the full fact — the exact
      // null collapse the guard was added to kill, one field over. types.ts
      // documents opponentBestAfter as "null when not measured" (fromGameEval
      // leaves it null when the ply+1 evaluation timed out), and an unmeasured
      // baseline cannot tell a stopped threat from a position that was lost
      // anyway. Decline; never default.
      notes.push(
        "their best reply was never measured — cannot tell a stopped threat from a position that was lost anyway",
      );
      return null;
    }
    if (isMateAgainst(probe.opponentBestAfter)) {
      notes.push("the opponent is being mated whatever they play — the move did not stop this");
      return null;
    }
    return {
      threatSan: probe.threat.san,
      scoreBeforeCp: before,
      scoreAfterCp: null,
      swingCp: null,
      preventedOutright: false,
      defusedMate: false,
      specificCp: null,
      attributionCp: attributionMargin(probe),
    };
  }
  const swing = diffCp(probe.threat.score, probe.threatAfter.score);
  const after = isMate(probe.threatAfter.score) ? null : toCp(probe.threatAfter.score);
  if (swing === null || before === null) {
    notes.push("post-move threat score unreadable");
    return null;
  }
  if (swing < PROPHYLAXIS_MIN_SWING_CP) {
    notes.push(`threat swing ${swing}cp below ${PROPHYLAXIS_MIN_SWING_CP}cp`);
    // A swing far enough NEGATIVE means the move made their threat better for
    // them — a different card from "nothing much changed". It needs the same
    // evidence as the positive claim; see THREAT_STRENGTHENED_MIN_CP.
    //
    // This comment has now quoted two worked examples that did not survive
    // measurement, which is itself the lesson. The first (Ra6 2196 → 2706) came
    // from a sweep whose null-move searches shared a transposition table with
    // the real ones. The second (the same Ra6, cleanly re-measured at 521 → 542)
    // was a 21cp difference inside a ±25cp noise floor, and its sign flips with
    // search depth. No worked example is quoted here now because the corpus
    // contains none that clears the bar — which is the honest state.
    signals.unaddressed = swing <= -THREAT_STRENGTHENED_MIN_CP
      ? unaddressed(probe, "made-it-worse", { madeItWorse: true })
      : unaddressed(probe, "barely-changed");
    return null;
  }

  // Did the threat get worse than the ALTERNATIVES, or did the opponent's whole
  // position simply get worse? Winning material does the latter to every option
  // they have, and the arithmetic cannot tell the two apart without a baseline.
  // A threat can die in two different ways, and each catches cases the other
  // misses — measured on positions the founder ruled on:
  //
  //   ABSOLUTE  playing it now simply loses.   g6 drove Bxd8 to -464.
  //   RELATIVE  it is now clearly worse than   f5 left hxg5 301cp adrift of
  //             anything else they have.        Black's best.
  //
  // Requiring ABSOLUTE alone rejected f5 by 20cp. Requiring RELATIVE alone
  // rejected g6, because a crushing move drags every opponent option down
  // together and the relative gap collapses. Either is sufficient; a recapture
  // that restored material (Qxd5: threat ends at -21, only 56cp off their best)
  // satisfies neither, which is what separates it from both of the above.
  const threatEndsAt = toCp(probe.threatAfter.score);
  if (threatEndsAt === null) {
    notes.push("post-move threat score unreadable");
    return null;
  }
  // The baseline MUST be the one measured alongside threatAfter. gameEval's
  // copy of this number is depth 16 on a warm transposition table; a Tier 1
  // prober reads depth 16 on a cold one. Across 768 plies of the founder's
  // games those two readings of the SAME position agree closely in the middle
  // (median 15cp), but 4.2% differ by more than the 150cp bar below and 3.3%
  // disagree about whether a forced mate exists — so a mixed subtraction is
  // sometimes measuring the engine rather than the move. When the
  // same-regime baseline was not paid for, the relative route is skipped
  // entirely rather than run on mixed operands.
  const specific = diffCp(probe.opponentBestAfterProbed, probe.threatAfter.score);
  const nowLoses = threatEndsAt <= PROPHYLAXIS_THREAT_MUST_END_BELOW_CP;
  const nowInferior = specific !== null && specific >= PROPHYLAXIS_MIN_SPECIFIC_CP;
  if (probe.opponentBestAfterProbed === null && probe.opponentBestAfter !== null) {
    notes.push("relative threat test skipped — no same-regime baseline was measured");
  }
  if (!nowLoses && !nowInferior) {
    notes.push(
      `the threat still scores ${threatEndsAt}cp for them` +
      (specific === null ? "" : ` and is only ${specific}cp off their best`) +
      ` — playable, so it was not stopped`,
    );
    signals.unaddressed = unaddressed(probe, "threat-still-playable");
    return null;
  }

  // Was it OUR move that did it, or would the moves we passed over have done
  // the same? Only a move that answers the threat at least as well as its
  // alternatives can claim the credit.
  const attribution = attributionOf(probe);
  if (attribution.kind === "measured") {
    // Share of the available refutation this move captured. `captured` is how
    // far the threat fell under our move; `marginCp` is how much further the
    // best passed-over move would have taken it, measured on the same scale
    // (attributionOf guarantees that). Their sum is the refutation available.
    //
    // A share, not an absolute margin: an absolute bar cannot hold the
    // founder's rulings, because h5 (confirmed) falls 341cp short of ITS best
    // alternative while Kd8 (rejected) falls only 311cp short of its much
    // smaller one. See PROPHYLAXIS_MIN_REFUTATION_SHARE.
    const captured = before - threatEndsAt;
    const available = captured + attribution.marginCp;
    if (available > 0 && captured / available < PROPHYLAXIS_MIN_REFUTATION_SHARE) {
      notes.push(
        `this move answered ${captured}cp of the ${available}cp refutation available ` +
        `(${Math.round((captured / available) * 100)}%) — the threat's decline is mostly not this move's doing`,
      );
      return null;
    }
  }

  return {
    threatSan: probe.threat.san,
    scoreBeforeCp: before,
    scoreAfterCp: after,
    swingCp: swing,
    preventedOutright: false,
    defusedMate: false,
    specificCp: specific,
    attributionCp: attribution.kind === "measured" ? attribution.marginCp : null,
  };
}

/**
 * How well a move answers the threat, as a rank plus a score.
 *
 * Scores here are the OPPONENT's, so LOWER is a better answer. Some answers are
 * not on the centipawn scale at all — making the threat illegal, or meeting it
 * with a forced mate — and collapsing those into centipawns to subtract them is
 * the mistake `diffCp` exists to prevent. So answers are compared by rank
 * first and only by arithmetic within the same rank.
 */
type Answer = { rank: 0 | 1 | 2; cp: number | null };
const ANSWER_UNRANKED: Answer = { rank: 2, cp: null };

/** The margin as a plain number for the fact, or null when incomparable. */
function attributionMargin(probe: IntentProbe): number | null {
  const a = attributionOf(probe);
  return a.kind === "measured" ? a.marginCp : null;
}

function answerQuality(score: IntentScore | null | undefined, stillLegal: boolean): Answer {
  if (!stillLegal) return { rank: 0, cp: null }; // threat is impossible: perfect answer
  if (isMateAgainst(score)) return { rank: 0, cp: null }; // playing it now loses to mate
  if (isMate(score)) return ANSWER_UNRANKED; // mate FOR them — not an answer at all
  const cp = toCp(score ?? null);
  return cp === null ? ANSWER_UNRANKED : { rank: 1, cp };
}

/**
 * Attribution: how much WORSE our move answers the threat than the best move we
 * passed over. Positive means alternatives did it better.
 *
 * Returns a VERDICT, never a sentinel number. An earlier version returned
 * Number.MAX_SAFE_INTEGER to mean "an alternative answered it categorically
 * better", and that value reached both a stored fact and a user-facing note —
 * "moves we did not play answer Qg4 9007199254740991cp better". Producing
 * absurd numbers in text a student reads is the exact failure this module
 * exists to prevent, so the incomparable cases are now a separate case of the
 * return type rather than a magic value.
 *
 * Answers are only compared arithmetically when they are on the SAME scale.
 * Our move making the threat score -926 and an alternative making it illegal
 * are both effective answers; ranking one categorically above the other killed
 * h5, a genuine prophylactic move, because f6 happened to refute Qg4 outright.
 */
type Attribution =
  | { kind: "measured"; marginCp: number }
  | { kind: "incomparable" }
  | { kind: "unknown" };

function attributionOf(probe: IntentProbe): Attribution {
  const alts = probe.threatAfterAlternatives;
  if (!alts || alts.length === 0) return { kind: "unknown" };

  const played = answerQuality(probe.threatAfter?.score, probe.threatStillLegal);
  if (played.rank === 2) return { kind: "unknown" };

  // Only alternatives on the same scale as our move can be subtracted from it.
  let best: number | null = null;
  let sawOtherScale = false;
  for (const a of alts) {
    if (a.ourSan === probe.playedSan) continue;
    const q = answerQuality(a.score, a.stillLegal);
    if (q.rank === 2) continue;
    if (q.rank !== played.rank) { sawOtherScale = true; continue; }
    if (q.cp === null) continue;
    if (best === null || q.cp < best) best = q.cp;
  }
  if (best === null) return sawOtherScale ? { kind: "incomparable" } : { kind: "unknown" };
  if (played.cp === null) return { kind: "unknown" };
  return { kind: "measured", marginCp: played.cp - best };
}

/**
 * What the played move gave up against the best available line.
 *
 * When a forced mate sits on either side of the comparison, the difference is
 * reported categorically rather than in centipawns. Subtracting a mate score
 * from a material score yields things like "COST 30929cp" — a real output from
 * this function before the mate branches existed.
 */
/**
 * The played move's score, preferring the value measured IN THE SAME SEARCH as
 * the root lines.
 *
 * `probe.playedScore` is defined as "the score of the move actually played,
 * measured at fenBefore, for the PLAYER" — but on the game-review path it is
 * derived from the evaluation of the position the move PRODUCED, which is a
 * different search of a different position. When the played move is one of the
 * MultiPV lines, the engine has already scored it inside the same search that
 * produced `rootLines[0]`, and that is the number the subtraction wants.
 *
 * This is not a nicety. `cost` is `rootLines[0] - played`, so when the student
 * plays THE ENGINE'S OWN TOP MOVE the answer must be exactly zero. Measured on
 * the 285 such plies across the founder's twelve games, the two-search version
 * gives a median of 1cp but a p99 of 113cp and a maximum of 148cp — and five of
 * them cleared COST_MIN_LOSS_CP, so the review charged the student more than a
 * pawn for playing the best move on the board. Taking both operands from one
 * search makes those exactly zero by construction, not by threshold.
 *
 * Falls back to the separate measurement for the ~33% of moves outside the top
 * three, where no same-search number exists. Those are moves the engine ranked
 * below its third choice, so the loss is large and the noise is a small part of
 * it.
 */
function playedScoreOf(probe: IntentProbe): IntentScore | null {
  const inSameSearch = probe.rootLines.find((l) => l.san === probe.playedSan);
  return inSameSearch ? inSameSearch.score : probe.playedScore;
}

/**
 * How far the played move sits below the engine's best, SAME SEARCH ONLY.
 *
 * This deliberately does not fall back to `probe.playedScore` the way
 * `playedScoreOf` does: that fallback is a different search of a different
 * position, and a soundness verdict built on a cross-regime subtraction is the
 * exact class of error PR #331 removed. A move outside the MultiPV lines was
 * ranked below the engine's third choice, which already answers "is this move
 * at or near the best?" with no — so null here means "not measurably near the
 * best", and callers must decline whatever claim needed the soundness.
 */
function sameSearchLossCp(probe: IntentProbe): number | null {
  const best = probe.rootLines[0];
  if (!best) return null;
  const inSameSearch = probe.rootLines.find((l) => l.san === probe.playedSan);
  if (!inSameSearch) return null;
  const b = toCp(best.score);
  const p = toCp(inSameSearch.score);
  if (b === null || p === null) return null;
  return Math.max(0, b - p);
}

function computeCost(probe: IntentProbe, notes: string[]): CostFact | null {
  const best = probe.rootLines[0];
  if (!best) {
    notes.push("no root lines");
    return null;
  }
  const played = playedScoreOf(probe);
  if (!played) {
    notes.push("played move not scored");
    return null;
  }

  const bestMates = isMateFor(best.score);
  const bestMated = isMateAgainst(best.score);
  const playedMated = isMateAgainst(played);
  const playedMates = isMateFor(played);

  // The mate was already forced against us before we moved, so nothing was
  // "allowed". Playing a move that ties the engine's own best line in a lost
  // position was being reported as allowing a forced mate.
  if (bestMated && playedMated) {
    notes.push("mate was already forced before this move");
    return null;
  }

  if (bestMates || playedMated) {
    let mateChange: MateChange;
    if (bestMates && playedMated) mateChange = "gave-up-mate-and-allowed-mate";
    else if (bestMates) {
      // Still mating, just possibly slower — not a cost worth narrating.
      if (playedMates) {
        notes.push("both lines mate; no material cost");
        return null;
      }
      mateChange = "gave-up-mate";
    } else mateChange = "allowed-mate";

    return {
      bestSan: best.san,
      bestCp: isMate(best.score) ? null : toCp(best.score),
      playedCp: isMate(played) ? null : toCp(played),
      lossCp: null,
      mateChange,
    };
  }

  const rawLoss = diffCp(best.score, played);
  const bestCp = toCp(best.score);
  const playedCp = toCp(played);
  if (rawLoss === null || bestCp === null || playedCp === null) {
    notes.push("cost scores unreadable");
    return null;
  }

  // If the played move IS the best move, there is nothing given up. Clamp
  // rather than report a move as better than the best line, which search
  // instability can otherwise produce.
  const loss = Math.max(0, rawLoss);
  if (loss < COST_MIN_LOSS_CP) {
    notes.push(`loss ${loss}cp below ${COST_MIN_LOSS_CP}cp`);
    return null;
  }
  // Past DECISIVE_CP the engine is scoring a decided game rather than counting
  // material, and the difference stops being a number a student can use.
  if (loss > DECISIVE_CP) {
    notes.push(`loss ${loss}cp is beyond measurement — reported as decisive`);
    return {
      bestSan: best.san,
      bestCp,
      playedCp,
      lossCp: DECISIVE_CP,
      mateChange: null,
      beyondMeasurement: true,
    };
  }
  return { bestSan: best.san, bestCp, playedCp, lossCp: loss, mateChange: null, beyondMeasurement: false };
}

/**
 * Did the move force mate?
 *
 * DELIBERATELY NOT `playedScoreOf`. That helper exists so a SUBTRACTION gets
 * both operands from one search, which is what `cost` needs. "Is this mate" is
 * not a subtraction, and the two measurements resolve mates differently: the
 * MultiPV root search splits its effort across three moves, while the
 * evaluation of the position the move produced spends all of it on one line.
 *
 * Both directions are real, and both were observed on the founder's games:
 *
 *   game_11 ply 89 a1=Q   root line +807, produced position MATE IN 13
 *   game_02 ply 59 Re6#   root line #1, produced position has no evaluation
 *                         at all — it is checkmate, so there are no lines
 *
 * The second is why four checkmating moves — the last move of four of his
 * games, and the most narratable move in any game — reported nothing. So this
 * takes a mate from EITHER measurement, preferring the shorter when both find
 * one. A forced mate the engine has found is a claim about the tree, not a
 * difference between two noisy numbers, so there is nothing to average.
 */
function computeMate(probe: IntentProbe): MateFact | null {
  const inSearch = probe.rootLines.find((l) => l.san === probe.playedSan)?.score ?? null;
  const produced = probe.playedScore;
  const mateIn = (s: IntentScore | null): number | null =>
    s && typeof s.mate === "number" && s.mate > 0 ? s.mate : null;
  const a = mateIn(inSearch);
  const b = mateIn(produced);
  if (a === null && b === null) return null;
  const inMoves = a === null ? b! : b === null ? a : Math.min(a, b);
  const line = probe.rootLines.find((l) => l.san === probe.playedSan);
  return { inMoves, line: line?.pv ?? [] };
}

/**
 * Did the move win material?
 *
 * Priced from the board, not the engine, and deliberately NOT used to rank a
 * sacrifice: Philidor's legacy throws a queen and mates, so material is
 * negative there and the mate rule above has already claimed the move.
 */
function computeMaterial(probe: IntentProbe, notes: string[]): MaterialFact | null {
  const p = probe.position;
  if (!p) return null;

  // A recapture must be priced across BOTH plies of the exchange. Pricing only
  // our side of it carded 50 of 59 recaptures in a master-game sweep as
  // material wins; suppressing recaptures outright then went too far the other
  // way and reported taking a queen back as nothing at all, on a position it
  // went on to call quiet.
  if (p.isRecapture) {
    if (p.recaptureNetCp === null) {
      notes.push("recapture with the previous capture's value unknown — cannot price it");
      return null;
    }
    if (p.recaptureNetCp < MATERIAL_MIN_CP) {
      notes.push(`recapture nets ${p.recaptureNetCp}cp — restores material rather than winning it`);
      return null;
    }
    return { wonCp: p.recaptureNetCp, capturedCp: p.capturedCp };
  }

  if (p.materialSwingCp < MATERIAL_MIN_CP) return null;
  return { wonCp: p.materialSwingCp, capturedCp: p.capturedCp };
}

/**
 * Did the opponent walk into something?
 *
 * No human model needed: for game review the reply is ground truth. We only
 * call it a trap when the losing reply was TEMPTING — a capture that looks
 * free, or a check — otherwise it is just an opponent error that happened to
 * follow our move, and crediting it to the move would be flattery.
 */
function computeTrap(probe: IntentProbe, notes: string[]): TrapFact | null {
  const r = probe.opponentReply;
  if (!r) return null;

  // Without a score for their BEST reply there is no baseline, so "their move
  // was an error" is unsupported — they may have been losing whatever they
  // played. walkedIntoMate used to reach the trap claim on `actual` alone.
  if (!r.best) {
    notes.push("opponent's best reply not scored — no baseline to call their move an error");
    return null;
  }

  const walkedIntoMate = isMateAgainst(r.actual) && !isMateAgainst(r.best);
  const costCp = diffCp(r.best, r.actual);

  if (!walkedIntoMate) {
    if (costCp === null) {
      notes.push("opponent reply not scored, or a mate makes the difference meaningless");
      return null;
    }
    if (costCp < TRAP_MIN_COST_CP) return null;
  }

  if (!r.tempting) {
    notes.push("opponent erred but the move was not tempting — not a trap");
    return null;
  }

  // Did OUR move have anything to do with it? The same blunder may have been
  // available anyway — a far-wing rook-pawn move was once credited with baiting
  // a blunder worth 436cp in the world where it was never played.
  //
  // This gate must FAIL CLOSED. Written as `counterfactualCostCp !== null` it
  // silently vanished whenever the field was absent or the comparison involved
  // a mate, reverting to exactly the flattery it was added to stop — including
  // on `walkedIntoMate`, which skipped it unconditionally and so credited our
  // move with a mate that was already forced before we played.
  if (r.replyExistedBefore === false) {
    // Our move created the opportunity: the reply was not even legal until we
    // played. That is the strongest possible attribution and needs no
    // arithmetic — it is why the real Bxg3/fxg3 trap qualifies.
    return { playedSan: r.san, bestSan: r.bestSan, costCp, walkedIntoMate, tempting: true };
  }
  if (r.counterfactualCostCp === null || r.counterfactualCostCp === undefined) {
    notes.push(
      "no counterfactual for the opponent's error — cannot tell our trap from a blunder " +
      "they would have made anyway",
    );
    return null;
  }
  if (walkedIntoMate) {
    // A mate is not a quantity of centipawns, so the cp counterfactual cannot
    // price it. What it CAN tell us is whether the same reply was already a
    // serious error before our move; if it was, the mate was coming regardless.
    if (r.counterfactualCostCp >= TRAP_MIN_COST_CP) {
      notes.push(
        `their reply already cost ${r.counterfactualCostCp}cp without our move — not our trap`,
      );
      return null;
    }
  } else if (costCp !== null) {
    const attributable = costCp - r.counterfactualCostCp;
    if (attributable < TRAP_MIN_ATTRIBUTION_CP) {
      notes.push(
        `opponent error was worth ${r.counterfactualCostCp}cp without our move too — not our trap`,
      );
      return null;
    }
  }

  return { playedSan: r.san, bestSan: r.bestSan, costCp, walkedIntoMate, tempting: true };
}

/** Did the move take a piece out of real danger? */
function computeEscape(probe: IntentProbe): EscapeFact | null {
  const p = probe.position;
  if (!p || !p.escapedAttack || p.escapedValueCp < MATERIAL_MIN_CP) return null;
  return { piece: p.movedPiece, valueCp: p.escapedValueCp };
}

/**
 * Derive what a move did. Pure — all engine work happens before this is called.
 */
export function computeIntentFacts(probe: IntentProbe): IntentFacts {
  const notes: string[] = [];
  const signals: AnalysisSignals = { threatWasReal: false, unaddressed: null };
  const mate = computeMate(probe);
  const material = computeMaterial(probe, notes);
  const trap = computeTrap(probe, notes);
  const escape = computeEscape(probe);
  const prophylaxis = computeProphylaxis(probe, notes, signals);
  const cost = computeCost(probe, notes);
  const sharpness = classifySharpness(probe.rootLines);

  // Most moves do several things; only one is the point. Ranked highest-stakes
  // first, so a queen sacrifice that mates is reported as the mate and a
  // capture that incidentally worsens an opponent option is reported as the
  // capture. Prophylaxis speaks last because it is the weakest claim and the
  // one that most easily attaches itself to moves played for other reasons.
  const purpose: Purpose =
    mate ? "mate"
    : material ? "material"
    : trap ? "trap"
    : escape ? "escape"
    : prophylaxis ? "prophylaxis"
    : "none";

  // "Nothing tactical here" is only safe to say when we found nothing AND the
  // position itself is flat. In a king-and-pawn position the comparison that
  // produces flatness inverts under zugzwang, so we decline to claim quiet
  // rather than risk calling a critical pawn ending dull.
  // "Nothing tactical here" is an ASSERTION, so it needs positive evidence that
  // we looked and found nothing — never merely the absence of a finding. Every
  // clause below is a way the module can end up empty-handed while the position
  // is in fact sharp, and each one was observed:
  //
  //  - playedScore present but unreadable. The gate tested the CONTAINER
  //    (`!== null`), so `{cp: null, mate: null}` sailed through and a move that
  //    was never really scored was called quiet.
  //  - board facts missing entirely. material, escape and the check guard are
  //    ALL derived from probe.position; with it null the module has no board
  //    information at all, yet still claimed the position was dull.
  //  - a real threat that we declined to narrate. Bailing out of a prophylaxis
  //    claim after the tempo gate has already confirmed a genuine threat means
  //    something IS happening — saying "nothing tactical here" is then the
  //    opposite of the truth.
  // Deliberately NOT playedScoreOf(): this is a completeness check on the
  // probe's own field, and letting a root line stand in for a missing
  // playedScore would rescue exactly the probe this guard exists to refuse.
  const playedReadable = probe.playedScore !== null && toCp(probe.playedScore) !== null;
  const rootReadable = probe.rootLines.length > 0 && toCp(probe.rootLines[0]?.score) !== null;
  const boardKnown = probe.position !== null;
  if (!playedReadable) notes.push("played move not scored — cannot claim the position is quiet");
  if (!boardKnown) notes.push("board facts unavailable — cannot claim the position is quiet");
  // A threat is only worth naming if the player still had a game to lose. Told
  // "you did not deal with this" in a resignable position, a student learns
  // nothing — and on one lost ending this fired on 25 consecutive plies.
  const bestAvailable = probe.rootLines[0]?.score ?? null;
  const alreadyLost =
    bestAvailable !== null &&
    (isMateAgainst(bestAvailable) ||
      (!isMate(bestAvailable) && (toCp(bestAvailable) ?? 0) <= ALREADY_LOST_CP));
  if (alreadyLost && signals.unaddressed) {
    notes.push("the game was already lost before this move — an unmet threat is not news");
    signals.unaddressed = null;
  }

  const threatLeftUnsaid = signals.threatWasReal && prophylaxis === null;
  if (signals.unaddressed) {
    notes.push(`the opponent still threatens ${signals.unaddressed.threatSan}`);
  }
  if (threatLeftUnsaid) {
    notes.push("a real threat was found but not narrated — cannot claim the position is quiet");
  }

  const evidenceComplete = playedReadable && rootReadable && boardKnown && !threatLeftUnsaid;
  const foundNothing = purpose === "none" && cost === null && evidenceComplete;
  const urgencySuppressed = foundNothing && sharpness === "flat" && !probe.moverHasPieces;
  if (urgencySuppressed) notes.push("quiet claim suppressed: zugzwang guard");

  return {
    mate,
    material,
    trap,
    escape,
    purpose,
    prophylaxis,
    // Belt and braces. Every site that sets signals.unaddressed returns null
    // immediately after, so a successful prophylaxis claim cannot coexist with
    // one today — this guard is deliberately unreachable and exists to keep the
    // invariant true if a future rejection path stops returning early. It is
    // NOT covered by a mutation test, because there is no way to reach it.
    unaddressedThreat: prophylaxis ? null : signals.unaddressed,
    cost,
    sharpness,
    quiet: foundNothing && sharpness === "flat" && probe.moverHasPieces,
    urgencySuppressed,
    notes,
  };
}
