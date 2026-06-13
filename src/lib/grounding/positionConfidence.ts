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
  /** 0–100, for the UI spectrum. Strength of the single strongest verification. */
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
  positional_plan: 0.6,
};

/** Decisive eval (≈4 pawns) is itself strong verification of a "winning" claim. */
const EVAL_FULL_CLARITY_CP = 400;

const ENGINE_VERIFIED_AT = 0.7;
const STRATEGIC_READ_BELOW = 0.35;

/**
 * Compute the verification confidence for a position from the voter's
 * per-claim confidence + Stockfish eval magnitude. Pure, no side effects.
 *
 * Score = the strongest single verification available (max over claim classes
 * of value×authority), OR the eval clarity if a decisive eval alone backs a
 * winning claim — whichever is higher. We take the MAX, not a sum, because one
 * confirmed fork is high-confidence even if everything else is NONE.
 */
export function computePositionConfidence(
  confidence: VoterConfidence,
  sfCp: number | null,
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

  const evalClarity =
    sfCp === null ? 0 : Math.min(Math.abs(sfCp) / EVAL_FULL_CLARITY_CP, 1);
  if (sfCp !== null && Math.abs(sfCp) >= 200) {
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
