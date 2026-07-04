/**
 * Shared types for the offline helpfulness eval (the GRADE module).
 *
 * The GRADE scores ONE coach response on a 7-dimension rubric (0-2 each,
 * max 14) using a Claude jury, grounded against engine evidence (the
 * JudgePacket). It composes WITH the deterministic chess.js GATE
 * (relationalScorer's ScoreResult.falseRelationalClaims), which it consumes to
 * drive the dim-1 hard gate; it does NOT replace the GATE.
 *
 * Rubric dimensions (see helpfulnessPrompt.ts for the scoring anchors):
 *   1. Chess correctness   — HARD GATE: 0 here caps total <= 4
 *   2. Diagnostic accuracy — names the specific mistake + why (conditional: N/A when move was best)
 *   3. Insight depth       — the "why" (causal idea tied to THIS position)
 *   4. Actionability       — concrete, position-specific next step
 *   5. Level-appropriateness — vocabulary/depth vs userRating
 *   6. Assistance calibration — surfaces the idea / asks; 0 on line-dump OR withholding
 *   7. Focus & non-redundancy — on the key feature, no padding
 *
 * UNGAMEABLE PROPERTY: empty/terse/vague responses score ~0 on dims 3,4,6,
 * a bare engine-line dump scores 0 on dim 6, padding scores 0 on dim 7 — so
 * "saying less / dumping / padding cannot win". Proven by helpfulnessUngameable.test.ts.
 */
import type { ScoreResult } from "./relationalScorer";
import type { PositionFeatureDelta } from "@/lib/mastermind/featureDelta";
import type { AnyMotif } from "@/lib/tactics";
import type { MoveClassification } from "@/types/enums";

/** Engine evidence about the move played, distilled for the judge. */
export interface StockfishPacket {
  evalBeforeCp: number; // normalizeEval(before), White POV
  evalAfterCp: number; // normalizeEval(after),  White POV
  evalDeltaCpMoverPov: number; // signed loss(-)/gain(+) from the MOVER's POV (drives dim-2)
  bestMoveUci: string;
  bestMoveSan: string;
  // Top-3 lines from the position the move was played in (rank 1 = engine best).
  multiPv: Array<{ rank: number; san: string; scoreCp: number | null; mate: number | null }>;
  classification: MoveClassification;
}

/**
 * The grounding packet that bounds judge hallucination. The judge is told to
 * score the coach response relative to THIS evidence ONLY.
 */
export interface JudgePacket {
  fen: string; // fenBefore (the position the move was played in)
  fenAfter: string;
  movePlayedSan: string;
  movePlayedUci: string;
  playerColor: "w" | "b";
  userRating: number;
  stockfish: StockfishPacket;
  motifs: AnyMotif[]; // detectMotifs(fenBefore, movePlayedSan); only `confirmed` are narratable
  motifTags: string[]; // confirmed motif names, flattened for the prompt
  conceptDelta: PositionFeatureDelta; // compute_feature_delta(fenBefore, fenAfter, {pv: bestPvUci})
  topConcepts: string[]; // top 1-2 non-empty sub-delta labels (e.g. "material b -3", "king safety w +2")
}

export type DimId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** One dimension's score after the judge has been collapsed to an expected value. */
export interface DimScore {
  dim: DimId;
  applicable: boolean; // false => N/A (conditional activation); excluded from maxApplicable
  naReason?: string; // e.g. "move WAS best -> dim2 affirmed"
  expected: number; // probability-weighted EV over {0,1,2}; 0 when not applicable
  probs?: [number, number, number]; // p0,p1,p2 from the judge (clamped, sums ~1)
  rationale: string;
}

/** A single rubric scoring (one judge, or the jury aggregate). */
export interface RubricResult {
  dims: DimScore[];
  rawTotal: number; // sum of applicable EVs
  maxApplicable: number; // 2 * (#applicable dims)
  normalized: number; // rawTotal / maxApplicable, 0..1 (0 when no dims applicable)
  gateApplied: boolean; // dim-1 == 0 (or GATE found a board contradiction) -> cap
  cappedTotal: number; // min(rawTotal, 4) when gateApplied else rawTotal
}

/** The full jury verdict: per-judge results + the gate-composed aggregate. */
export interface JuryResult {
  perJudge: Array<{ model: string; result: RubricResult }>;
  aggregate: RubricResult; // EV-averaged across judges, gate re-applied
  gateInput: ScoreResult; // the chess.js GATE verdict that fed dim-1
  costUsd: number;
}

/** Minimal engine seam buildJudgePacket depends on — lets tests inject a fake. */
export interface EngineLike {
  evaluateMultiPv(
    fen: string,
    depth?: number,
    multiPv?: number
  ): Promise<
    Array<{
      rank: number;
      score: import("./stockfish").EngineScore;
      pvUci: string[];
      bestMoveUci: string;
      depth: number;
    }>
  >;
  evaluate(
    fen: string,
    depth?: number
  ): Promise<{ score: import("./stockfish").EngineScore; depth: number }>;
}
