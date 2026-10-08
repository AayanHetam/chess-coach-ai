import { LLMResult } from "@/lib/llmProvider";
import { EVAL_CLAIM_ITEM_SCHEMA, makeStructuredClaimsParserCall } from "./claimSchemas";
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

/**
 * A move's own evaluation at the position the claims are about, from a
 * search the route verified (the client's what-if, lib/coach/clientEvals.ts),
 * White-relative, with the review's own number for the move where it has
 * one. A claim bound to the move is checked against these numbers instead
 * of the played move's.
 */
export interface PositionEvalRef {
  /** The move as SAN, as the server derived it. */
  san: string;
  cp?: number;
  mate?: number;
  /** The review's warm number for the move: a second reference, never a difference. */
  review?: { cp?: number; mate?: number };
  /** The move's number and side, so "7... Qxc1" is not this 8. Qxc1. */
  moveNumber?: number;
  color?: "w" | "b";
  /** The game played this SAN at another ply too: a bare "Qxc1" could be either, so only a numbered mention names this move. */
  playedElsewhere?: boolean;
}

export interface EvalClaimOpts {
  llmResponse: string;
  stockfishEval: { cp?: number; mate?: number };
  /**
   * The moves of a verified what-if with their own numbers (one search, one
   * depth). A claim whose spans name exactly one of them is checked against
   * that move's numbers only (claimReferences); the played move (moveSan)
   * keeps the review's number. Claims naming none, or several, are checked
   * against stockfishEval exactly as before. A cold what-if number is never
   * subtracted from a warm one.
   */
  positionEvals?: readonly PositionEvalRef[];
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
const HAIKU_CACHE_WRITE_PRICE_PER_M = 1.25; // 1.25× base input for 5-min TTL

/**
 * Default parser: route through callLLM with cacheSystem on so the
 * EVAL_CLAIM_PARSER_SYSTEM string stays warm. Tests inject a mock to avoid
 * network calls; PR 1.C wires this to live Anthropic.
 *
 * PR-CI-3 (tech-lead decision #6): the call is now STRUCTURED-OUTPUT — the
 * response is constrained to a {claims: ParsedEvalClaim[]} json_schema and
 * unwrapped back to the bare array tryParseClaims expects, killing the
 * fail-open unparseable-JSON class (audit #4). Same tier/temp/caching;
 * schema compilation is server-cached (24h) after the first call.
 */
export const defaultEvalParserCall: ParserCall = makeStructuredClaimsParserCall({
  schemaName: "eval_claims",
  itemSchema: EVAL_CLAIM_ITEM_SCHEMA,
  maxTokens: 600,
});

/**
 * Per Anthropic's Messages API docs, `input_tokens` is the uncached portion
 * (tokens after the last cache breakpoint), NOT the total. Total billable
 * input = input_tokens + cache_read_input_tokens + cache_creation_input_tokens.
 * Each component is priced independently.
 *
 * Exported for direct testing — the validator's ParserCall mock layer bypasses
 * this function in unit tests, so the cost-correctness regression test
 * calls it directly.
 */
export function estimateHaikuCost(r: LLMResult): number {
  const inputUncached = r.inputTokens / 1_000_000;
  const cacheRead = (r.cacheReadTokens ?? 0) / 1_000_000;
  const cacheWrite = (r.cacheCreationTokens ?? 0) / 1_000_000;
  const output = r.outputTokens / 1_000_000;
  return (
    inputUncached * HAIKU_INPUT_PRICE_PER_M +
    cacheRead * HAIKU_CACHE_READ_PRICE_PER_M +
    cacheWrite * HAIKU_CACHE_WRITE_PRICE_PER_M +
    output * HAIKU_OUTPUT_PRICE_PER_M
  );
}

const stripCheck = (san: string) => san.replace(/[+#!?]/g, "");

/**
 * A move named in a claim's text, numbered or not. Castling as O-O or 0-0,
 * never the first half of O-O-O; a bare pawn push only beside a cue, since
 * "d5" is as often a square ("the knight on d5").
 */
const CLAIM_MOVE_RE =
  /(?<![A-Za-z0-9-])(?:(\d{1,3})\s*(\.{1,3})\s*)?((?:[NBRQK][a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?|[O0]-[O0](?:-[O0])?|[a-h]x[a-h][1-8](?:=[NBRQ])?|[a-h][1-8](?:=[NBRQ])?)[+#]?)(?![A-Za-z0-9]|-[O0])/g;
const PAWN_PUSH_RE = /^[a-h][1-8](?:=[NBRQ])?[+#]?$/;
const PAWN_CUE_BEFORE_RE =
  /\b(?:play|plays|played|playing|push|pushes|pushed|pushing|after|with|instead\s+of|rather\s+than|than|not|about|if|then)\s*$/i;
/** A piece move with nothing between the piece and the square but a capture: "Nd2", "Nxd2". */
const BARE_PIECE_RE = /^([NBRQK])x?([a-h][1-8])$/;
const PIECE_DEST_RE = /^([NBRQK])[a-h]?[1-8]?x?([a-h][1-8])/;

interface ClaimMove {
  san: string;
  /** White-relative cp, the review's first where it has one. */
  cps: number[];
  moveNumber?: number;
  color?: "w" | "b";
  playedElsewhere?: boolean;
}

/** The move a token names: by its SAN, or a piece move written without the disambiguation it needs when only one move fits. */
function moveNamed(
  token: string,
  moves: readonly ClaimMove[]
): ClaimMove | undefined {
  const t = stripCheck(token).replace(/0/g, "O");
  const exact = moves.find((m) => stripCheck(m.san) === t);
  if (exact) return exact;
  const k = BARE_PIECE_RE.exec(t);
  if (!k) return undefined;
  const loose = moves.filter((m) => {
    const j = PIECE_DEST_RE.exec(stripCheck(m.san));
    return !!j && j[1] === k[1] && j[2] === k[2];
  });
  return loose.length === 1 ? loose[0] : undefined;
}

/**
 * The numbers a claim is checked against, White-relative cp, and the move
 * it is about. With a what-if, a claim whose spans name exactly one of its
 * moves (the played move included) is about that move and is checked
 * against that move's numbers alone: the review's number for it where the
 * review has one, then the what-if's cold one. A numbered mention names a
 * move only at its own number and side; a bare one names nothing when the
 * game played that SAN elsewhere too. A claim that names none, or more than
 * one ("Rather than 8. Nc7+, 8. Qxc1 leaves White at -0.97", "8. Nc7+ (not
 * 8. Qxc1) loses"), is checked against the review's number for the played
 * move, as before: which move a figure belongs to is not guessed.
 */
function claimReferences(
  claim: ParsedEvalClaim,
  stockfishCp: number,
  positionEvals: readonly PositionEvalRef[] | undefined,
  moveSan: string | undefined
): { cps: number[]; named: string | null } {
  if (!positionEvals || positionEvals.length === 0)
    return { cps: [stockfishCp], named: null };
  const at = positionEvals.find((r) => r.moveNumber !== undefined);
  const moves: ClaimMove[] = positionEvals.map((ref) => {
    const played = !!moveSan && stripCheck(ref.san) === stripCheck(moveSan);
    const review = ref.review ? [evalToCp(ref.review)] : played ? [stockfishCp] : [];
    return {
      san: ref.san,
      cps: [...review, evalToCp(ref)],
      moveNumber: ref.moveNumber,
      color: ref.color,
      playedElsewhere: ref.playedElsewhere,
    };
  });
  if (moveSan && !moves.some((m) => stripCheck(m.san) === stripCheck(moveSan)))
    moves.push({ san: moveSan, cps: [stockfishCp], moveNumber: at?.moveNumber, color: at?.color });

  const text = claim.supporting_spans.join(" | ");
  const named = new Set<ClaimMove>();
  for (const m of Array.from(text.matchAll(CLAIM_MOVE_RE))) {
    const san = m[3];
    const index = m.index ?? 0;
    const number = m[1] ? Number(m[1]) : null;
    if (number === null && PAWN_PUSH_RE.test(san) && !PAWN_CUE_BEFORE_RE.test(text.slice(0, index)))
      continue;
    const side = m[2] && m[2].length >= 2 ? "b" : "w";
    const candidates = moves.filter((c) =>
      number !== null
        ? c.moveNumber === undefined || (c.moveNumber === number && c.color === side)
        : !c.playedElsewhere
    );
    const move = moveNamed(san, candidates);
    if (move) named.add(move);
  }
  if (named.size !== 1) return { cps: [stockfishCp], named: null };
  const bound = Array.from(named)[0];
  return { cps: Array.from(new Set(bound.cps)), named: bound.san };
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
    // 2026-05-30 fix-historical-claims: parser may classify a claim as
    // "historical" (claim about a past position) — game-review prose
    // routinely cites prior positions ("Black was winning at move 24",
    // "you had the bishop pair earlier"). The validator can't verify
    // those against the current FEN; emit a skip event for telemetry
    // visibility, then continue to the next claim. Without this signal
    // we have no observability into how often parser tags historical.
    if (rawClaim.claim_class === "historical") {
      telemetry.push(
        createTelemetryEvent({
          check_name: "eval_claim",
          fire_reason: "skip_historical_claim",
          llm_span: rawClaim.supporting_spans.join(" | "),
          expected: "current-position claim",
          actual: "historical (past-position) claim",
          context: baseContext,
        })
      );
      continue;
    }
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
    // The number this claim is about: the move it is bound to, its review
    // number and its what-if number (claimReferences), else the played
    // move's. Of the move's numbers, the nearest.
    const refs = claimReferences(claim, stockfishCp, opts.positionEvals, opts.moveSan);
    const nearest = (cp: number | null) =>
      cp === null
        ? refs.cps[0]
        : refs.cps.reduce((a, b) => (Math.abs(b - cp) < Math.abs(a - cp) ? b : a));
    const refCp = nearest(claim.stated_cp);
    const refBand = cpToBand(refCp);
    const named = refs.named ? ` (about ${refs.named})` : "";

    if (claim.stated_cp !== null) {
      const diff = Math.abs(claim.stated_cp - refCp);
      if (diff > numericThreshold) {
        const span = claim.supporting_spans.join(" | ");
        issues.push({
          check_name: "eval_mismatch_numeric",
          severity: "error",
          llm_span: span,
          expected: { cp: refCp },
          actual: { cp: claim.stated_cp },
          detail: `LLM cited ${claim.stated_cp} cp (white perspective)${named}; Stockfish says ${refCp} cp. Diff ${diff} > threshold ${numericThreshold}.`,
          parser_confidence: claim.confidence,
        });
        telemetry.push(
          createTelemetryEvent({
            check_name: "eval_mismatch_numeric",
            fire_reason: "numeric_diff_exceeds_threshold",
            llm_span: span,
            expected: { cp: refCp, band: refBand },
            actual: { cp: claim.stated_cp, band: claim.stated_band },
            context: baseContext,
          })
        );
        fired = true;
      }
    }

    // The band fits the number the claim's figure was checked against, or,
    // for a claim with no figure, any of the move's numbers.
    const bandRefs = claim.stated_cp !== null ? [refCp] : refs.cps;
    const bandFits = bandRefs.some((cp) => {
      const band = cpToBand(cp);
      return claim.stated_band === band || isWithinTolerance(cp, claim.stated_band, band, tolerance);
    });
    if (!bandFits) {
      const span = claim.supporting_spans.join(" | ");
      issues.push({
        check_name: "eval_mismatch_qualitative",
        severity: "error",
        llm_span: span,
        expected: { band: refBand, cp: refCp },
        actual: { band: claim.stated_band },
        detail: `LLM stated band "${claim.stated_band}" (white perspective)${named}; Stockfish at ${refCp} cp is in "${refBand}".`,
        parser_confidence: claim.confidence,
      });
      telemetry.push(
        createTelemetryEvent({
          check_name: "eval_mismatch_qualitative",
          fire_reason: "qualitative_band_flip",
          llm_span: span,
          expected: { band: refBand, cp: refCp },
          actual: { band: claim.stated_band, cp: claim.stated_cp },
          context: baseContext,
        })
      );
      fired = true;
    }

    if (!fired) {
      telemetry.push(
        createTelemetryEvent({
          check_name: "eval_claim",
          fire_reason: "passed",
          llm_span: claim.supporting_spans.join(" | "),
          expected: { band: refBand, cp: refCp },
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
