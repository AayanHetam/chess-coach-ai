import { callLLM, LLMResult } from "@/lib/llmProvider";
import {
  cpToBand,
  isWithinTolerance,
  evalToCp,
  ADJACENT_BAND_TOLERANCE_CP,
} from "./qualitativeBands";
import {
  EVAL_CLAIM_PARSER_SYSTEM,
  buildEvalClaimUserTurn,
} from "./parserPrompts";
import { createTelemetryEvent } from "./telemetry";
import {
  ValidatorResult,
  ValidatorIssue,
  TelemetryEvent,
  ParsedEvalClaim,
  EVAL_NUMERIC_THRESHOLD_CP,
  PARSER_LOW_CONFIDENCE_THRESHOLD,
} from "./types";

export interface EvalClaimOpts {
  llmResponse: string;
  stockfishEval: { cp?: number; mate?: number };
  playerPerspective: "white" | "black";
  fen?: string;
  moveSan?: string;
  correlationId: string;
  numericThresholdCp?: number;
  toleranceCp?: number;
  confidenceThreshold?: number;
  parseCall?: ParserCall;
  /** AbortSignal threaded from withPipelineTimeout. Forwarded to parseCall. */
  signal?: AbortSignal;
}

export type ParserCall = (opts: {
  system: string;
  user: string;
  signal?: AbortSignal;
}) => Promise<{ raw: string; costUsd: number; result?: LLMResult }>;

const HAIKU_INPUT_PRICE_PER_M = 1.0;
const HAIKU_OUTPUT_PRICE_PER_M = 5.0;
const HAIKU_CACHE_READ_PRICE_PER_M = 0.1;

/**
 * Default parser: route through callLLM with cacheSystem on so the
 * EVAL_CLAIM_PARSER_SYSTEM string stays warm. Tests inject a mock to avoid
 * network calls; PR 1.C wires this to live Anthropic.
 */
export const defaultEvalParserCall: ParserCall = async ({ system, user, signal }) => {
  const result = await callLLM({
    tier: "fast",
    system,
    messages: [{ role: "user", content: user }],
    temperature: 0,
    maxTokens: 600,
    cacheSystem: true,
    signal,
  });
  const costUsd = estimateHaikuCost(result);
  return { raw: result.content, costUsd, result };
};

function estimateHaikuCost(r: LLMResult): number {
  const inputUncached = (r.inputTokens - (r.cacheReadTokens ?? 0)) / 1_000_000;
  const cacheRead = (r.cacheReadTokens ?? 0) / 1_000_000;
  const output = r.outputTokens / 1_000_000;
  return (
    inputUncached * HAIKU_INPUT_PRICE_PER_M +
    cacheRead * HAIKU_CACHE_READ_PRICE_PER_M +
    output * HAIKU_OUTPUT_PRICE_PER_M
  );
}

function tryParseClaims(raw: string): ParsedEvalClaim[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced ? fenced[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) return null;
    return parsed as ParsedEvalClaim[];
  } catch {
    return null;
  }
}

function normalizeClaimToWhitePerspective(
  claim: ParsedEvalClaim,
  playerPerspective: "white" | "black"
): ParsedEvalClaim {
  let claimSide: "white" | "black";
  if (claim.perspective === "white") claimSide = "white";
  else if (claim.perspective === "black") claimSide = "black";
  else claimSide = playerPerspective;

  if (claimSide === "white") return claim;

  const flippedBand = flipBand(claim.stated_band);
  return {
    ...claim,
    stated_band: flippedBand,
    stated_cp: claim.stated_cp !== null ? -claim.stated_cp : null,
    perspective: "white",
  };
}

function flipBand(band: ParsedEvalClaim["stated_band"]): ParsedEvalClaim["stated_band"] {
  const map: Record<ParsedEvalClaim["stated_band"], ParsedEvalClaim["stated_band"]> = {
    losing: "winning",
    much_worse: "much_better",
    slightly_worse: "slightly_better",
    equal: "equal",
    slightly_better: "slightly_worse",
    much_better: "much_worse",
    winning: "losing",
  };
  return map[band];
}

/**
 * Stage 3 eval-claim validator. Two checks run; firing on either is a fire.
 *
 * - Numeric: if the parsed claim cites a cp value, fire when
 *   |stated_cp - stockfishCp| > numericThresholdCp.
 * - Qualitative: fire when stated_band ≠ expected_band, unless they're
 *   adjacent and stockfishCp is within toleranceCp of their shared boundary.
 *
 * Skip claims with confidence < threshold (default 0.5 per Aayan 2026-05-11)
 * or claim_class ≠ "evaluative" — those are not assertions.
 */
export async function validateEvalClaim(opts: EvalClaimOpts): Promise<ValidatorResult> {
  const numericThreshold = opts.numericThresholdCp ?? EVAL_NUMERIC_THRESHOLD_CP;
  const tolerance = opts.toleranceCp ?? ADJACENT_BAND_TOLERANCE_CP;
  const confidenceThreshold = opts.confidenceThreshold ?? PARSER_LOW_CONFIDENCE_THRESHOLD;
  const parseCall = opts.parseCall ?? defaultEvalParserCall;

  const baseContext = {
    fen: opts.fen,
    move_san: opts.moveSan,
    player_perspective: opts.playerPerspective,
    correlation_id: opts.correlationId,
  } as const;

  // Skip path: no stockfish ground truth → can't compare LLM eval claims.
  // evalToCp would silently return 0 when both cp and mate are undefined
  // (qualitativeBands.ts:105), causing every non-near-zero LLM claim to fire
  // false-positive eval_mismatch_numeric + eval_mismatch_qualitative against
  // a fabricated "equal" baseline. Return early with a single skip event
  // and zero parser cost.
  //
  // Skip event uses check_name "eval_claim" for telemetry consistency with
  // the "passed" event below (same emit-point semantics: no issue raised,
  // outcome recorded), but fire_reason "no_stockfish_eval" distinguishes it.
  // citationRate.ts counts only fire_reason === "passed", so skip events
  // are correctly excluded from the citation-rate numerator.
  if (opts.stockfishEval.cp === undefined && opts.stockfishEval.mate === undefined) {
    return {
      issues: [],
      passed: true,
      telemetry: [
        createTelemetryEvent({
          check_name: "eval_claim",
          fire_reason: "no_stockfish_eval",
          context: baseContext,
        }),
      ],
      costUsd: 0,
    };
  }

  const stockfishCp = evalToCp(opts.stockfishEval);
  const expectedBand = cpToBand(stockfishCp);

  const issues: ValidatorIssue[] = [];
  const telemetry: TelemetryEvent[] = [];

  const userTurn = buildEvalClaimUserTurn({
    llmResponse: opts.llmResponse,
    playerPerspective: opts.playerPerspective,
    citedMove: opts.moveSan,
  });

  const parsed = await parseCall({ system: EVAL_CLAIM_PARSER_SYSTEM, user: userTurn, signal: opts.signal });
  const claims = tryParseClaims(parsed.raw);

  if (claims === null) {
    telemetry.push(
      createTelemetryEvent({
        check_name: "eval_claim_parser",
        fire_reason: "parser_json_invalid",
        llm_span: opts.llmResponse.slice(0, 200),
        expected: "JSON array",
        actual: parsed.raw.slice(0, 200),
        context: baseContext,
      })
    );
    return { issues, passed: true, telemetry, costUsd: parsed.costUsd };
  }

  for (const rawClaim of claims) {
    if (rawClaim.claim_class !== "evaluative") continue;

    if (rawClaim.confidence < confidenceThreshold) {
      telemetry.push(
        createTelemetryEvent({
          check_name: "eval_claim_parser",
          fire_reason: "parser_low_confidence",
          llm_span: rawClaim.supporting_spans.join(" | "),
          expected: `confidence >= ${confidenceThreshold}`,
          actual: rawClaim.confidence,
          context: baseContext,
        })
      );
      continue;
    }

    const claim = normalizeClaimToWhitePerspective(rawClaim, opts.playerPerspective);
    let fired = false;

    if (claim.stated_cp !== null) {
      const diff = Math.abs(claim.stated_cp - stockfishCp);
      if (diff > numericThreshold) {
        const span = claim.supporting_spans.join(" | ");
        issues.push({
          check_name: "eval_mismatch_numeric",
          severity: "error",
          llm_span: span,
          expected: { cp: stockfishCp },
          actual: { cp: claim.stated_cp },
          detail: `LLM cited ${claim.stated_cp} cp (white perspective); Stockfish says ${stockfishCp} cp. Diff ${diff} > threshold ${numericThreshold}.`,
          parser_confidence: claim.confidence,
        });
        telemetry.push(
          createTelemetryEvent({
            check_name: "eval_mismatch_numeric",
            fire_reason: "numeric_diff_exceeds_threshold",
            llm_span: span,
            expected: { cp: stockfishCp, band: expectedBand },
            actual: { cp: claim.stated_cp, band: claim.stated_band },
            context: baseContext,
          })
        );
        fired = true;
      }
    }

    if (claim.stated_band !== expectedBand) {
      if (!isWithinTolerance(stockfishCp, claim.stated_band, expectedBand, tolerance)) {
        const span = claim.supporting_spans.join(" | ");
        issues.push({
          check_name: "eval_mismatch_qualitative",
          severity: "error",
          llm_span: span,
          expected: { band: expectedBand, cp: stockfishCp },
          actual: { band: claim.stated_band },
          detail: `LLM stated band "${claim.stated_band}" (white perspective); Stockfish at ${stockfishCp} cp is in "${expectedBand}".`,
          parser_confidence: claim.confidence,
        });
        telemetry.push(
          createTelemetryEvent({
            check_name: "eval_mismatch_qualitative",
            fire_reason: "qualitative_band_flip",
            llm_span: span,
            expected: { band: expectedBand, cp: stockfishCp },
            actual: { band: claim.stated_band, cp: claim.stated_cp },
            context: baseContext,
          })
        );
        fired = true;
      }
    }

    if (!fired) {
      telemetry.push(
        createTelemetryEvent({
          check_name: "eval_claim",
          fire_reason: "passed",
          llm_span: claim.supporting_spans.join(" | "),
          expected: { band: expectedBand, cp: stockfishCp },
          actual: { band: claim.stated_band, cp: claim.stated_cp },
          context: baseContext,
        })
      );
    }
  }

  return {
    issues,
    passed: issues.length === 0,
    telemetry,
    costUsd: parsed.costUsd,
  };
}
