// Material-win validator — Stage 9 of the Tactical Grounding Program.
//
// The voter computes material_win:
//   HIGH: confirmed win-material motif (fork/skewer/hanging/etc.) + SF strong
//         OR chessdb says "win" AND SF >= +100cp
//   MED:  chessdb says "win" AND SF >= +100cp (with no motif)
//   LOW:  SF >= +200cp on Math.abs(cp) alone
//   NONE: nothing supports a material claim
//
// "Winning material" / "up a piece" / "wins the exchange" are the canonical
// coach dramatization phrases. The model uses them on positions where SF
// says +0.4 ("slight edge") and chessdb has no data — neither of which is
// "winning material" by the voter's definition.
//
// Fire condition:
//   regex match AND (material_win === "NONE" OR material_win === "LOW")
//
// Severity upgrade (sanity check):
//   If the matched phrase is one of the strongest material claims
//   ("winning material" / "wins material" / "material advantage" / "up a piece")
//   AND |sfCp| < 100, severity escalates from "warn" to "error".
//   The engine literally says the material is balanced; this is the model
//   contradicting deterministic ground.
//
// Pure string-scan, costUsd = 0.

import { createTelemetryEvent } from "./telemetry";
import type { ValidatorResult } from "./types";
import type { ConfidenceLevel } from "@/lib/grounding/voter";

export interface MaterialWinOpts {
  llmResponse: string;
  material_win: ConfidenceLevel;
  /** Stockfish eval in centipawns, White-positive perspective. null when unknown. */
  sfCp: number | null;
  fen?: string;
  moveSan?: string;
  playerPerspective?: "white" | "black";
  correlationId: string;
}

/**
 * Material-claim regex. Word-boundary, case-insensitive. Captures:
 * - "winning material" / "wins material"          (the canonical claim)
 * - "up a piece" / "up an exchange" / "up a rook" / etc.
 * - "wins a piece" / "wins the exchange" / etc.
 * - "material advantage"                          (the abstract framing)
 * - "won the exchange"
 *
 * We deliberately do NOT match "up a pawn" alone — being up a pawn is
 * routine coach prose at the engine's +1.0 level, well within MED voter
 * confidence. Same reasoning for "won a pawn".
 *
 * Note: the regex uses non-capturing groups (?:...) for the alternations
 * so the .matchAll output's [0] is the full matched substring.
 */
const MATERIAL_TOKEN_REGEX =
  /\b(?:winning material|wins material|material advantage|up (?:a |an |the )?(?:piece|exchange|rook|queen|knight|bishop)|wins (?:a |an |the )?(?:piece|exchange|rook|queen|knight|bishop)|won (?:a |an |the )?(?:piece|exchange|rook|queen|knight|bishop))\b/gi;

/**
 * Strongest material-claim phrases — these get the sfCp-sanity-check
 * severity upgrade because they're maximally specific.
 */
const STRONG_MATERIAL_PHRASES = new Set<string>([
  "winning material",
  "wins material",
  "material advantage",
  "up a piece",
  "up an exchange",
  "up a rook",
  "up a queen",
  "up piece",
  "up exchange",
  "up rook",
  "up queen",
]);

interface MaterialMatch {
  raw: string;
  index: number;
}

function collectMaterialMatches(llmResponse: string): MaterialMatch[] {
  const matches: MaterialMatch[] = [];
  const allMatches = Array.from(llmResponse.matchAll(MATERIAL_TOKEN_REGEX));
  for (const m of allMatches) {
    if (m[0] === undefined || m.index === undefined) continue;
    matches.push({ raw: m[0].toLowerCase(), index: m.index });
  }
  return matches;
}

function contextWindow(llmResponse: string, m: MaterialMatch): string {
  const start = Math.max(0, m.index - 40);
  const end = Math.min(llmResponse.length, m.index + m.raw.length + 40);
  return llmResponse.slice(start, end);
}

/**
 * Validator: scan the LLM response for material claims and check them
 * against the voter's material_win confidence and Stockfish eval.
 *
 * Fires "material_win_unsupported" for each match when material_win is
 * NONE or LOW. Severity escalates to "error" when the matched phrase is
 * a strong-material claim AND |sfCp| < 100.
 */
export function validateMaterialWin(opts: MaterialWinOpts): ValidatorResult {
  const { llmResponse, material_win, sfCp, fen, moveSan, playerPerspective, correlationId } = opts;

  const matches = collectMaterialMatches(llmResponse);

  // No material claims → pass.
  if (matches.length === 0) {
    return {
      issues: [],
      passed: true,
      telemetry: [
        createTelemetryEvent({
          check_name: "material_win",
          fire_reason: "passed",
          expected: { no_material_claim_or_voter_med_or_high: true },
          actual: { matched_material_tokens: 0, material_win_confidence: material_win },
          context: { fen, move_san: moveSan, player_perspective: playerPerspective, correlation_id: correlationId },
        }),
      ],
      costUsd: 0,
    };
  }

  // Voter says material claim is grounded enough → pass.
  if (material_win === "MED" || material_win === "HIGH") {
    return {
      issues: [],
      passed: true,
      telemetry: [
        createTelemetryEvent({
          check_name: "material_win",
          fire_reason: "passed",
          expected: { material_win_confidence: "MED or HIGH" },
          actual: {
            material_win_confidence: material_win,
            matched_token_count: matches.length,
            sf_cp: sfCp,
          },
          context: { fen, move_san: moveSan, player_perspective: playerPerspective, correlation_id: correlationId },
        }),
      ],
      costUsd: 0,
    };
  }

  // material_win is NONE or LOW → all matches fire.
  const sfAbs = sfCp !== null ? Math.abs(sfCp) : null;
  const sfContradicts = sfAbs !== null && sfAbs < 100;

  let upgradeSeen = false;
  const issues = matches.map((m) => {
    const isStrong = STRONG_MATERIAL_PHRASES.has(m.raw);
    const escalate = isStrong && sfContradicts;
    if (escalate) upgradeSeen = true;
    return {
      check_name: "material_win_unsupported" as const,
      severity: (escalate ? "error" : "warn") as "warn" | "error",
      llm_span: m.raw,
      expected: {
        material_win_confidence: "MED or HIGH",
        sf_cp_abs_min_for_strong_claim: 100,
      },
      actual: {
        material_win_confidence: material_win,
        sf_cp: sfCp,
        sf_abs_cp: sfAbs,
        matched_token: m.raw,
        is_strong_claim: isStrong,
        engine_contradicts: escalate,
        context_window: contextWindow(llmResponse, m),
      },
      detail: escalate
        ? `LLM claimed "${m.raw}" but Stockfish eval |cp|=${sfAbs} contradicts (material is balanced)`
        : `LLM claimed "${m.raw}" without voter material_win >= MED (currently ${material_win})`,
    };
  });

  const fire_reason = upgradeSeen
    ? "material_claim_contradicts_stockfish"
    : "material_claim_without_voter_med_or_high";

  return {
    issues,
    passed: false,
    telemetry: [
      createTelemetryEvent({
        check_name: "material_win",
        fire_reason,
        expected: { material_win_confidence: "MED or HIGH" },
        actual: {
          material_win_confidence: material_win,
          sf_cp: sfCp,
          matched_token_count: matches.length,
          matched_tokens: matches.map((m) => m.raw),
          severity_escalated_count: issues.filter((i) => i.severity === "error").length,
        },
        context: { fen, move_san: moveSan, player_perspective: playerPerspective, correlation_id: correlationId },
      }),
    ],
    costUsd: 0,
  };
}
