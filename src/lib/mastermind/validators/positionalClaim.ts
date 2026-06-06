// Positional-claim validator — Stage 9 of the Tactical Grounding Program.
//
// Strong positional claims ("dominating", "decisive advantage", "strategically
// crushing") need multi-source confirmation. The voter computes:
//
//   positional_plan = HIGH    when SF + Lc0 both ≥ +150cp same direction
//                   = MED     when SF ≥ +100cp alone (no Lc0 contradiction)
//                   = LOW     when SF in [+50, +100)cp (weak single-engine)
//                   = NONE    when SF < +50cp OR Lc0 vetoes SF (opposite
//                             direction with |lc0| ≥ 50cp)
//
// Fire condition:
//   regex match AND positional_plan !== "HIGH"
//
// Severity escalation:
//   When Lc0 actively vetoes SF — opposite-direction signal of meaningful
//   magnitude — severity escalates from "warn" to "error". The model is
//   contradicting a multi-source veto: SF says +0.4 for White, Lc0 says
//   -0.8 for White, and the model is still saying "White is dominating."
//
// Tuning note (from handoff): "small advantage" / "slight edge" must NOT
// fire. Regex is restricted to canonically-overstated claims only.
//
// Pure string-scan, costUsd = 0.

import { createTelemetryEvent } from "./telemetry";
import type { ValidatorResult } from "./types";
import type { ConfidenceLevel } from "@/lib/grounding/voter";

export interface PositionalClaimOpts {
  llmResponse: string;
  positional_plan: ConfidenceLevel;
  /** Stockfish eval in centipawns, White-positive perspective. null when unknown. */
  sfCp: number | null;
  /** Lc0 eval in centipawns, same perspective as sfCp. null when not consulted. */
  lc0Cp: number | null;
  fen?: string;
  moveSan?: string;
  playerPerspective?: "white" | "black";
  correlationId: string;
}

/**
 * Strong-positional-claim regex. Word-boundary, case-insensitive.
 *
 * Restricted token list — these are the canonically over-stated phrases:
 * - "strategically winning" / "strategically crushing"
 * - "dominating"
 * - "completely winning" / "completely won" / "completely lost"
 * - "overwhelming advantage"
 * - "decisive advantage" / "decisive edge"
 *
 * Excluded (intentional false-negative): "slight edge", "small advantage",
 * "better position", "active pieces". Coach prose at MED confidence uses
 * these legitimately; firing on them would over-suppress.
 */
const POSITIONAL_TOKEN_REGEX = /\b(?:strategically (?:winning|crushing)|dominating|completely (?:winning|won|lost)|overwhelming advantage|decisive (?:advantage|edge))\b/gi;

interface PositionalMatch {
  raw: string;
  index: number;
}

function collectPositionalMatches(llmResponse: string): PositionalMatch[] {
  const matches: PositionalMatch[] = [];
  const allMatches = Array.from(llmResponse.matchAll(POSITIONAL_TOKEN_REGEX));
  for (const m of allMatches) {
    if (m[0] === undefined || m.index === undefined) continue;
    matches.push({ raw: m[0].toLowerCase(), index: m.index });
  }
  return matches;
}

function contextWindow(llmResponse: string, m: PositionalMatch): string {
  const start = Math.max(0, m.index - 40);
  const end = Math.min(llmResponse.length, m.index + m.raw.length + 40);
  return llmResponse.slice(start, end);
}

/**
 * Returns true when Lc0 actively vetoes Stockfish: opposite-direction signal,
 * with |Lc0| at or above the 50cp meaningfulness threshold.
 *
 * Below 50cp Lc0 is treated as neutral noise (mirrors voter logic in
 * voter.ts positional_plan computation).
 */
function lc0Vetoes(sfCp: number | null, lc0Cp: number | null): boolean {
  if (sfCp === null || lc0Cp === null) return false;
  if (Math.abs(lc0Cp) < 50) return false;
  // Sign mismatch: SF says + and Lc0 says - (or vice versa)
  if (sfCp > 0 && lc0Cp < 0) return true;
  if (sfCp < 0 && lc0Cp > 0) return true;
  return false;
}

/**
 * Validator: scan the LLM response for strong positional-claim language and
 * check against voter positional_plan. Severity escalates when Lc0 actively
 * vetoes SF.
 */
export function validatePositionalClaim(opts: PositionalClaimOpts): ValidatorResult {
  const { llmResponse, positional_plan, sfCp, lc0Cp, fen, moveSan, playerPerspective, correlationId } = opts;

  const matches = collectPositionalMatches(llmResponse);

  // No claims → pass.
  if (matches.length === 0) {
    return {
      issues: [],
      passed: true,
      telemetry: [
        createTelemetryEvent({
          check_name: "positional_claim",
          fire_reason: "passed",
          expected: { no_strong_positional_claim_or_voter_high: true },
          actual: { matched_positional_tokens: 0, positional_plan_confidence: positional_plan },
          context: { fen, move_san: moveSan, player_perspective: playerPerspective, correlation_id: correlationId },
        }),
      ],
      costUsd: 0,
    };
  }

  // Voter says HIGH → claims are grounded.
  if (positional_plan === "HIGH") {
    return {
      issues: [],
      passed: true,
      telemetry: [
        createTelemetryEvent({
          check_name: "positional_claim",
          fire_reason: "passed",
          expected: { positional_plan_confidence: "HIGH" },
          actual: {
            positional_plan_confidence: positional_plan,
            matched_token_count: matches.length,
            sf_cp: sfCp,
            lc0_cp: lc0Cp,
          },
          context: { fen, move_san: moveSan, player_perspective: playerPerspective, correlation_id: correlationId },
        }),
      ],
      costUsd: 0,
    };
  }

  // positional_plan is MED, LOW, or NONE — all matches fire.
  const vetoed = lc0Vetoes(sfCp, lc0Cp);
  const severity: "warn" | "error" = vetoed ? "error" : "warn";

  const issues = matches.map((m) => ({
    check_name: "positional_claim_unsupported" as const,
    severity,
    llm_span: m.raw,
    expected: {
      positional_plan_confidence: "HIGH (SF + Lc0 consensus required for strong positional claim)",
    },
    actual: {
      positional_plan_confidence: positional_plan,
      sf_cp: sfCp,
      lc0_cp: lc0Cp,
      lc0_vetoes_sf: vetoed,
      matched_token: m.raw,
      context_window: contextWindow(llmResponse, m),
    },
    detail: vetoed
      ? `LLM claimed "${m.raw}" but Lc0 actively vetoes Stockfish (sf=${sfCp}, lc0=${lc0Cp}, opposite directions)`
      : `LLM claimed "${m.raw}" with voter positional_plan=${positional_plan} (HIGH required)`,
  }));

  const fire_reason = vetoed
    ? "positional_overclaim_against_lc0_veto"
    : "positional_overclaim_without_voter_high";

  return {
    issues,
    passed: false,
    telemetry: [
      createTelemetryEvent({
        check_name: "positional_claim",
        fire_reason,
        expected: { positional_plan_confidence: "HIGH" },
        actual: {
          positional_plan_confidence: positional_plan,
          sf_cp: sfCp,
          lc0_cp: lc0Cp,
          lc0_vetoes_sf: vetoed,
          matched_token_count: matches.length,
          matched_tokens: matches.map((m) => m.raw),
          severity_escalated: vetoed,
        },
        context: { fen, move_san: moveSan, player_perspective: playerPerspective, correlation_id: correlationId },
      }),
    ],
    costUsd: 0,
  };
}
