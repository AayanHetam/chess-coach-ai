// Verification-confidence score — the shared backbone of calibrated hedging.
//
// See MASTERMIND_CONTEXT/PR_CALIBRATED_HEDGING_PLAN.md. This is the single
// source of truth consumed by:
//   - CH-1: the prompt confidence ladder (how strongly the model may assert)
//   - CH-2: the regen decision (only a fixable overclaim on a low-verification
//           position is worth one regeneration)
//   - CH-3: the user-facing confidence spectrum / disclaimer
//
// CRITICAL framing (Aayan's false-flag fear): this measures **how much of the
// position the engines can verify**, NOT how good the coach's analysis is. A
// brilliant strategic read on a quiet position scores low here — because the
// POSITION offers little to verify, not because the analysis is weak. It is a
// property of the position, computed from the voter snapshot, independent of
// anything the LLM wrote. The UI must therefore present a low score as
// "this is judgment territory, less of it is hard-verified" — a *different kind*
// of analysis, never a worse one.

import type { ConfidenceLevel, VoterConfidence } from "./voter";

/**
 * Verification "mode" for a position — NOT a quality grade.
 * - engine_verified: a confirmed tactic / forced mate / tablebase result /
 *   decisive eval backs the factual claims. Hard truth available.
 * - mixed: some verifiable signal (a clear edge or a medium positional read).
 * - strategic_read: little the engines can confirm — quiet, balanced,
 *   judgment-driven. Honest "less verified", explicitly not "lower quality".
 */
export type VerificationLevel = "engine_verified" | "mixed" | "strategic_read";

export interface PositionConfidence {
  level: VerificationLevel;
  /**
   * Verification COVERAGE, 0–100 — how much of the position the engines can
   * confirm, NOT advantage size or analysis quality. A tablebase draw scores
   * 100 (fully verified — it IS a known draw), a dead-equal quiet position
   * scores ~0. CH-3 must render this as engine-verified-vs-judgment, never as a
   * quality/advantage bar (a confirmed draw is not a "strong" position).
   */
  score: number;
  /** Human-readable reasons that drove the score (for the UI + telemetry). */
  drivers: string[];
}

const CONF_VALUE: Record<ConfidenceLevel, number> = {
  HIGH: 1.0,
  MED: 0.6,
  LOW: 0.3,
  NONE: 0,
};

// Authority weight per claim class — how *verifiable* a HIGH in that class is.
// user_visibility is intentionally excluded: it describes the user, not the
// position's verifiability. tactical_motif/endgame_wdl are not on VoterSnapshot
// but ARE on the full VoterConfidence, so they're handled when present.
const CLAIM_WEIGHT: Partial<Record<keyof VoterConfidence, number>> = {
  endgame_wdl: 1.0, // Syzygy = mathematically perfect
  mate_in_n: 0.95,
  tactical_motif: 0.9, // confirmed by the deterministic detector
  material_win: 0.75,
  // 0.72 so a two-engine HIGH consensus (positional_plan HIGH fires only when
  // SF AND Lc0 independently agree on direction, both ≥150cp — see voter.ts)
  // clears ENGINE_VERIFIED_AT. Under-claiming that as "mixed/hedge" is the
  // over-hedge failure mode; two independent engines agreeing IS hard signal.
  positional_plan: 0.72,
};

/** Decisive eval (≈4 pawns) is itself strong verification of a "winning" claim. */
const EVAL_FULL_CLARITY_CP = 400;

const ENGINE_VERIFIED_AT = 0.7;
const STRATEGIC_READ_BELOW = 0.35;

/**
 * cp magnitude at/above which the eval is reported as a driver. Aligned with the
 * level math: an eval contributes to a non-strategic_read score once
 * evalClarity ≥ STRATEGIC_READ_BELOW, i.e. |sfCp| ≥ 0.35×400 = 140. Below this
 * the eval genuinely didn't move the needle and the quiet-position driver fits.
 */
const EVAL_DRIVER_MIN_CP = STRATEGIC_READ_BELOW * EVAL_FULL_CLARITY_CP;

/**
 * Compute the verification confidence for a position from the voter's
 * per-claim confidence + Stockfish eval magnitude. Pure, no side effects.
 *
 * Score = the strongest single verification available (max over claim classes
 * of value×authority), OR the eval clarity if a decisive eval alone backs a
 * winning claim — whichever is higher. We take the MAX, not a sum, because one
 * confirmed fork is high-confidence even if everything else is NONE.
 *
 * `sfMate` (Stockfish forced-mate distance, either sign) is decisive on its own:
 * a forced mate is the single most verifiable thing in chess. It MUST be passed
 * because when Stockfish reports a mate it sets `cp` to null (cp and mate are
 * mutually exclusive on a line), so without this a real forced mate would score
 * as a quiet position and the coach would be told to hedge it.
 */
export function computePositionConfidence(
  confidence: VoterConfidence,
  sfCp: number | null,
  sfMate: number | null = null,
): PositionConfidence {
  const drivers: string[] = [];

  let claimScore = 0;
  for (const [claim, weight] of Object.entries(CLAIM_WEIGHT) as Array<
    [keyof VoterConfidence, number]
  >) {
    const level = confidence[claim];
    if (level === undefined) continue;
    const s = CONF_VALUE[level] * weight;
    if (s > claimScore) claimScore = s;
    if (level === "HIGH" || level === "MED") {
      drivers.push(`${claim}=${level}`);
    }
  }

  // A forced mate is maximal verification regardless of how the voter graded
  // mate_in_n (which is about mate-distance exactness, not existence).
  const forcedMate = sfMate !== null && sfMate !== 0;
  const evalClarity = forcedMate
    ? 1
    : sfCp === null
      ? 0
      : Math.min(Math.abs(sfCp) / EVAL_FULL_CLARITY_CP, 1);
  if (forcedMate) {
    drivers.push(`forced mate (M${Math.abs(sfMate as number)})`);
  } else if (sfCp !== null && Math.abs(sfCp) >= EVAL_DRIVER_MIN_CP) {
    drivers.push(`eval ${sfCp > 0 ? "+" : ""}${(sfCp / 100).toFixed(1)}`);
  }

  const score01 = Math.max(claimScore, evalClarity);

  const level: VerificationLevel =
    score01 >= ENGINE_VERIFIED_AT
      ? "engine_verified"
      : score01 < STRATEGIC_READ_BELOW
        ? "strategic_read"
        : "mixed";

  if (drivers.length === 0) {
    drivers.push("quiet position — no forcing tactics or decisive eval");
  }

  return { level, score: Math.round(score01 * 100), drivers };
}

/**
 * One-line, user-safe disclaimer for a low-verification position. Framed as
 * verification *type*, never as a quality warning. Empty string when the
 * position is well-verified (no disclaimer needed).
 */
export function confidenceDisclaimer(pc: PositionConfidence): string {
  switch (pc.level) {
    case "strategic_read":
      return "This is a quiet, judgment-driven position — more of this read is strategic interpretation than engine-verified fact.";
    case "mixed":
      return "";
    case "engine_verified":
      return "";
  }
}
