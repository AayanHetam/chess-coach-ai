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
 * How much WORSE our move may answer the threat than the best move we passed
 * over, before the claim stops being about our move at all.
 *
 * The founder's rejection of "Kd8 stops Be2": "there is probably just another
 * move that does the same thing that stockfish prefers in that position."
 * Measured — Kd8 answers Be2 to -189; a6 reaches -423 and Qxe4+ -515. Kd8 is
 * the worst answer of the lot, so Be2's decline is not its doing.
 *
 * Deliberately a tolerance and not a demand for uniqueness: h5 is a real
 * prophylactic move that does NOT uniquely answer Qg4 (f6 also mates), and a
 * gate requiring uniqueness would reject it.
 */
export const PROPHYLAXIS_MAX_ATTRIBUTION_CP = 100;

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
    const rootScore = probe.rootLines[0]?.score;
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
      notes.push("threat is only illegal because the move gives check — not prevention");
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
      attributionCp: attributionOf(probe),
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
      attributionCp: attributionOf(probe),
    };
  }

  // threatAfter is scored FOR THE OPPONENT, so mate > 0 means the threat now
  // MATES US. Reading it sign-blind reported "Rf8 stopped Qxh7+" about the very
  // move that makes Qxh7 checkmate — feeding mate +1 and mate -1 produced
  // byte-identical output.
  if (isMateFor(probe.threatAfter.score)) {
    notes.push("the move turned the threat into a forced mate against us — not prophylaxis");
    return null;
  }
  if (isMateAgainst(probe.threatAfter.score)) {
    // Playing the threat move now loses to mate — but only if the opponent had
    // some way to avoid being mated. This branch returns BEFORE the specificity
    // gate, so it was the one path where "their whole position is lost" still
    // read as "our move stopped this". Found in a dead king-and-pawn ending: a3
    // was carded as stopping Kg5 while White was mated in 20 whatever they
    // played.
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
      attributionCp: attributionOf(probe),
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
    return null;
  }

  // Did the threat get worse than the ALTERNATIVES, or did the opponent's whole
  // position simply get worse? Winning material does the latter to every option
  // they have, and the arithmetic cannot tell the two apart without a baseline.
  const specific = diffCp(probe.opponentBestAfter, probe.threatAfter.score);
  if (specific === null) {
    notes.push("opponent's best reply not measured — cannot tell defence from a general gain");
    return null;
  }
  if (specific < PROPHYLAXIS_MIN_SPECIFIC_CP) {
    notes.push(
      `threat is only ${specific}cp worse than the opponent's best reply — not stopped, ` +
      `the whole position changed`,
    );
    return null;
  }

  // Was it OUR move that did it, or would the moves we passed over have done
  // the same? Only a move that answers the threat at least as well as its
  // alternatives can claim the credit.
  const attribution = attributionOf(probe);
  if (attribution !== null && attribution > PROPHYLAXIS_MAX_ATTRIBUTION_CP) {
    notes.push(
      `moves we did not play answer ${probe.threat.san} ${attribution}cp better — ` +
      `the threat's decline is not this move's doing`,
    );
    return null;
  }

  return {
    threatSan: probe.threat.san,
    scoreBeforeCp: before,
    scoreAfterCp: after,
    swingCp: swing,
    preventedOutright: false,
    defusedMate: false,
    specificCp: specific,
    attributionCp: attribution,
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
 * Returns null when there is nothing comparable to measure against — silence,
 * not a guess.
 */
function attributionOf(probe: IntentProbe): number | null {
  const alts = probe.threatAfterAlternatives;
  if (!alts || alts.length === 0) return null;

  const played = answerQuality(probe.threatAfter?.score, probe.threatStillLegal);

  let best: Answer | null = null;
  for (const a of alts) {
    if (a.ourSan === probe.playedSan) continue;
    const q = answerQuality(a.score, a.stillLegal);
    if (q.rank === 2) continue;
    if (best === null || q.rank < best.rank || (q.rank === best.rank && (q.cp ?? 0) < (best.cp ?? 0))) {
      best = q;
    }
  }
  if (best === null || played.rank === 2) return null;

  // An alternative answers it categorically better (kills it outright) while we
  // merely made it worse: the claim belongs to the move we did not play.
  if (best.rank < played.rank) return Number.MAX_SAFE_INTEGER;
  // We answer it categorically better than anything else: unambiguously ours.
  if (played.rank < best.rank) return -1;
  if (played.cp === null || best.cp === null) return null;
  return played.cp - best.cp;
}

/**
 * What the played move gave up against the best available line.
 *
 * When a forced mate sits on either side of the comparison, the difference is
 * reported categorically rather than in centipawns. Subtracting a mate score
 * from a material score yields things like "COST 30929cp" — a real output from
 * this function before the mate branches existed.
 */
function computeCost(probe: IntentProbe, notes: string[]): CostFact | null {
  const best = probe.rootLines[0];
  if (!best) {
    notes.push("no root lines");
    return null;
  }
  const played = probe.playedScore;
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

/** Did the move force mate? Read from the played move's own score. */
function computeMate(probe: IntentProbe): MateFact | null {
  const sc = probe.playedScore;
  if (!sc || sc.mate === null || sc.mate === undefined || sc.mate <= 0) return null;
  const line = probe.rootLines.find((l) => l.san === probe.playedSan);
  return { inMoves: sc.mate, line: line?.pv ?? [] };
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
  const signals: AnalysisSignals = { threatWasReal: false };
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
  const playedReadable = probe.playedScore !== null && toCp(probe.playedScore) !== null;
  const rootReadable = probe.rootLines.length > 0 && toCp(probe.rootLines[0]?.score) !== null;
  const boardKnown = probe.position !== null;
  if (!playedReadable) notes.push("played move not scored — cannot claim the position is quiet");
  if (!boardKnown) notes.push("board facts unavailable — cannot claim the position is quiet");
  const threatLeftUnsaid = signals.threatWasReal && prophylaxis === null;
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
    cost,
    sharpness,
    quiet: foundNothing && sharpness === "flat" && probe.moverHasPieces,
    urgencySuppressed,
    notes,
  };
}
