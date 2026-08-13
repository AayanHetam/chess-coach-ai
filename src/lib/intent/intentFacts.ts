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
 * How badly the opponent's actual reply must have gone before we call the
 * position a trap. Two pawns keeps it to errors worth talking about; the real
 * case (fxg3 in game_02) cost 447cp.
 */
export const TRAP_MIN_COST_CP = 200;

/** Convert a WHITE-relative engine score to mover-relative. See types.ts. */
export function whiteRelativeToMover(score: IntentScore, mover: "w" | "b"): IntentScore {
  if (mover === "w") return { cp: score.cp, mate: score.mate };
  return {
    cp: score.cp === null ? null : -score.cp,
    mate: score.mate === null ? null : -score.mate,
  };
}

/** Collapse a score to a single comparable centipawn number. */
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
  const a = toCp(rootLines[0].score);
  const b = toCp(rootLines[1].score);
  if (a === null || b === null) return null;
  const gap = a - b;
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
function computeProphylaxis(probe: IntentProbe, notes: string[]): ProphylaxisFact | null {
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

  // Strongest case: the move made the threat impossible, not merely bad.
  if (!probe.threatStillLegal) {
    return {
      threatSan: probe.threat.san,
      scoreBeforeCp: before,
      scoreAfterCp: null,
      swingCp: null,
      preventedOutright: true,
      defusedMate: threatMates,
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
    };
  }

  // Neither side is a mate: a plain centipawn difference is meaningful.
  if (isMate(probe.threatAfter.score)) {
    // The threat move now mates the OPPONENT — comprehensively defused.
    return {
      threatSan: probe.threat.san,
      scoreBeforeCp: before,
      scoreAfterCp: null,
      swingCp: null,
      preventedOutright: false,
      defusedMate: false,
    };
  }
  const after = toCp(probe.threatAfter.score);
  if (after === null || before === null) {
    notes.push("post-move threat score unreadable");
    return null;
  }
  const swing = before - after;
  if (swing < PROPHYLAXIS_MIN_SWING_CP) {
    notes.push(`threat swing ${swing}cp below ${PROPHYLAXIS_MIN_SWING_CP}cp`);
    return null;
  }
  return {
    threatSan: probe.threat.san,
    scoreBeforeCp: before,
    scoreAfterCp: after,
    swingCp: swing,
    preventedOutright: false,
    defusedMate: false,
  };
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
  const playedMated = isMate(played) && (played.mate as number) < 0;
  const playedMates = isMateFor(played);

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

  const bestCp = toCp(best.score);
  const playedCp = toCp(played);
  if (bestCp === null || playedCp === null) {
    notes.push("cost scores unreadable");
    return null;
  }

  // If the played move IS the best move, there is nothing given up. Clamp
  // rather than report a move as better than the best line, which search
  // instability can otherwise produce.
  const loss = Math.max(0, bestCp - playedCp);
  if (loss < COST_MIN_LOSS_CP) {
    notes.push(`loss ${loss}cp below ${COST_MIN_LOSS_CP}cp`);
    return null;
  }
  return { bestSan: best.san, bestCp, playedCp, lossCp: loss, mateChange: null };
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
function computeMaterial(probe: IntentProbe): MaterialFact | null {
  const p = probe.position;
  if (!p || p.materialSwingCp < MATERIAL_MIN_CP) return null;
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
  if (r.actualCp === null || r.bestCp === null) {
    notes.push("opponent reply not scored");
    return null;
  }
  const cost = r.bestCp - r.actualCp;
  if (cost < TRAP_MIN_COST_CP) return null;
  if (!r.tempting) {
    notes.push(`opponent erred ${cost}cp but the move was not tempting — not a trap`);
    return null;
  }
  return { playedSan: r.san, bestSan: r.bestSan, costCp: cost, tempting: true };
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
  const mate = computeMate(probe);
  const material = computeMaterial(probe);
  const trap = computeTrap(probe, notes);
  const escape = computeEscape(probe);
  const prophylaxis = computeProphylaxis(probe, notes);
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
  const foundNothing = purpose === "none" && cost === null;
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
