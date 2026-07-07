/**
 * Relational-claim validator (Lever 2, Phase 2).
 *
 * Decomposes the coach's natural-language output into atomic relational claims
 * (attack / capture / defense / presence / line / pin) via a Haiku parser call,
 * then verifies each claim against the chess.js board oracle. Any claim the
 * oracle marks "contradicted" fires an issue and triggers regeneration.
 *
 * Claims marked "unverifiable" (partial information, battery, etc.) are
 * pass-through — they are NOT board-contradictions. The verifier is conservative
 * so the validator never suppresses true coaching content.
 *
 * Scope (task 9): gated by the same runPositionValidators flag as the eval-claim
 * and feature-citation validators — only runs when a single FEN is the anchor
 * (position_analysis category). Game-review multi-position support (fenMap) is
 * task 10 (position-anchoring fix).
 */
import {
  verifyRelationalClaim,
  describePosition,
  type RelationalClaim,
  type RelationKind,
} from "@/lib/relational/relationalVerify";
import { createTelemetryEvent } from "./telemetry";
import { RELATIONAL_CLAIM_ITEM_SCHEMA, makeStructuredClaimsParserCall } from "./claimSchemas";
import type { ValidatorResult, ValidatorIssue, TelemetryEvent } from "./types";
import type { ParserCall } from "./evalClaim";

// ---------------------------------------------------------------------------
// Parser LLM call (Haiku, same tier as other parser calls)
// ---------------------------------------------------------------------------

const EXTRACTION_SYSTEM = `You extract VERIFIABLE chess claims from a coach's analysis of one position.

You are given the exact piece inventory. Output ONLY a JSON array (no prose, no code fences) of claim objects. Each claim object:
{
  "kind": "attack" | "capture" | "defense" | "presence" | "line" | "pin",
  "pieceColor": "w" | "b",
  "pieceType": "p"|"n"|"b"|"r"|"q"|"k",
  "fromSquare": "e2",
  "targetSquare": "h7",
  "pinnedToSquare": "e1",
  "expectedPiece": {"type":"b","color":"b"},
  "line": ["Bxh7+","Kxh7","Qh5+"],
  "precedingLine": ["e4","e5"],
  "rawText": "the exact phrase you extracted this from"
}

RULES:
- Map words to squares using the supplied inventory. If you cannot pin down the square or color unambiguously, OMIT the claim. Never guess.
- "capture": piece can take an enemy piece on a square.
- "attack"/"threat": piece attacks/threatens/hits a square.
- "defense"/"protects"/"guards": friendly piece defends the piece on a square. NOT for pins.
- "pin": piece immobilizes/freezes/pins/skewers — moving it would expose a valuable piece behind.
  Extract: { "kind":"pin", "pieceColor":<pinner color>, "fromSquare":<pinner sq if named>, "targetSquare":<pinned piece sq>, "pinnedToSquare":<behind piece sq if named>, ... }
- "presence": specific piece sits on a specific square.
- "line": concrete move sequence (SAN).

CRITICAL:
- Claims about the current position only (no past moves). Do NOT set precedingLine to already-played game moves.
- A piece being ON a square is not an attack/defense claim.
- SKIP vague/evaluative statements ("White is better", "good development") — not board-checkable.
- Output [] if there are no concrete checkable claims.`;

const FILE_SQ = /^[a-h][1-8]$/;
const VALID_TYPES = new Set(["p", "n", "b", "r", "q", "k"]);
const VALID_KINDS = new Set<RelationKind>(["attack", "capture", "defense", "presence", "line", "pin"]);

function coerceClaim(raw: unknown): RelationalClaim | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = o.kind as RelationKind;
  if (!VALID_KINDS.has(kind)) return null;

  const sq = (v: unknown): string | undefined =>
    typeof v === "string" && FILE_SQ.test(v) ? v : undefined;
  const color = (v: unknown): "w" | "b" | undefined => (v === "w" || v === "b" ? v : undefined);
  const pieceType = (v: unknown) =>
    typeof v === "string" && VALID_TYPES.has(v) ? (v as RelationalClaim["pieceType"]) : undefined;

  const claim: RelationalClaim = {
    kind,
    rawText: typeof o.rawText === "string" ? o.rawText : "",
    fromSquare: sq(o.fromSquare) as RelationalClaim["fromSquare"],
    targetSquare: sq(o.targetSquare) as RelationalClaim["targetSquare"],
    pieceType: pieceType(o.pieceType),
    pieceColor: color(o.pieceColor),
    pinnedToSquare: sq(o.pinnedToSquare) as RelationalClaim["pinnedToSquare"],
  };

  if (typeof o.moveRefPly === "number" && Number.isInteger(o.moveRefPly) && o.moveRefPly > 0)
    claim.moveRefPly = o.moveRefPly;
  if (Array.isArray(o.line))
    claim.line = o.line.filter((m): m is string => typeof m === "string");
  if (Array.isArray(o.precedingLine))
    claim.precedingLine = o.precedingLine.filter((m): m is string => typeof m === "string");
  if (o.expectedPiece && typeof o.expectedPiece === "object") {
    const ep = o.expectedPiece as Record<string, unknown>;
    const t = pieceType(ep.type);
    const cc = color(ep.color);
    if (t && cc) claim.expectedPiece = { type: t, color: cc };
  }

  // Reject claims missing required fields.
  if (kind === "line" && (!claim.line || claim.line.length === 0)) return null;
  if (kind === "presence" && (!claim.targetSquare || !claim.expectedPiece)) return null;
  if (
    (kind === "attack" || kind === "capture" || kind === "defense") &&
    (!claim.targetSquare || !claim.pieceColor)
  )
    return null;
  if (kind === "pin" && (!claim.targetSquare || !claim.pieceColor)) return null;
  // Drop self-referential claims (from === target).
  if (
    (kind === "attack" || kind === "capture" || kind === "defense") &&
    claim.fromSquare &&
    claim.fromSquare === claim.targetSquare
  )
    return null;

  return claim;
}

function parseClaims(text: string): RelationalClaim[] {
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr: unknown = JSON.parse(body.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr.map(coerceClaim).filter((c): c is RelationalClaim => c !== null);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Default parser (Haiku, cacheSystem on to warm the extraction prompt)
//
// PR-CI-3 (tech-lead decision #6): STRUCTURED-OUTPUT — the response is
// constrained to a {claims: RelationalClaim[]} json_schema and unwrapped to
// the bare array parseClaims expects, killing the fail-open unparseable-JSON
// class (audit #4). Same tier/temp/caching as before.
// ---------------------------------------------------------------------------

export const defaultRelationalParserCall: ParserCall = makeStructuredClaimsParserCall({
  schemaName: "relational_claims",
  itemSchema: RELATIONAL_CLAIM_ITEM_SCHEMA,
  maxTokens: 1024,
});

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface RelationalClaimOpts {
  llmResponse: string;
  /** FEN of the position being discussed. If absent, validator is a no-op. */
  fen?: string;
  /**
   * Optional ply → FEN map for multi-position responses (game_review).
   * When a claim carries `moveRefPly`, the verifier resolves
   * `fenMap[moveRefPly] ?? fen` so historical claims are checked against
   * the board at the move they reference, not the final position.
   * Mirrors the scorer's Phase 0.5 ply-anchoring approach.
   */
  fenMap?: Record<number, string>;
  correlationId: string;
  parseCall?: ParserCall;
  signal?: AbortSignal;
}

/**
 * Validates the coach's response for relational hallucinations.
 *
 * Uses Haiku to extract structured claims from natural language, then verifies
 * each claim against the chess.js board oracle (the same oracle that Lever 1
 * uses to build the input-side facts block).
 *
 * "Contradicted" claims → ValidatorIssue (triggers regeneration).
 * "Unverifiable" claims → pass-through (conservative, no false positives).
 * "Holds" claims → pass-through (true coaching content).
 */
export async function validateRelationalClaim(
  opts: RelationalClaimOpts,
): Promise<ValidatorResult> {
  const parseCall = opts.parseCall ?? defaultRelationalParserCall;

  const baseContext = {
    fen: opts.fen,
    correlation_id: opts.correlationId,
  } as const;

  // No FEN → nothing to verify.
  if (!opts.fen) {
    return {
      issues: [],
      passed: true,
      telemetry: [
        createTelemetryEvent({
          check_name: "relational_claim",
          fire_reason: "no_fen_to_verify",
          expected: {},
          actual: {},
          context: baseContext,
        }),
      ],
      costUsd: 0,
    };
  }

  const inventory = describePosition(opts.fen);
  const userTurn = `Position (FEN): ${opts.fen}\n${inventory}\n\nCoach analysis:\n${opts.llmResponse}\n\nExtract the verifiable claims as a JSON array.`;

  let raw: string;
  let costUsd = 0;

  try {
    const parsed = await parseCall({ system: EXTRACTION_SYSTEM, user: userTurn, signal: opts.signal });
    raw = parsed.raw;
    costUsd = parsed.costUsd;
  } catch {
    // Parser failure → pass-through (don't suppress coach output on infra error).
    return {
      issues: [],
      passed: true,
      telemetry: [
        createTelemetryEvent({
          check_name: "relational_claim",
          fire_reason: "parser_json_invalid",
          expected: {},
          actual: { error: "parser_call_threw" },
          context: baseContext,
        }),
      ],
      costUsd: 0,
    };
  }

  const claims = parseClaims(raw);

  const issues: ValidatorIssue[] = [];
  const telemetry: TelemetryEvent[] = [];

  for (const claim of claims) {
    const claimFen =
      (claim.moveRefPly != null && opts.fenMap?.[claim.moveRefPly]) || opts.fen!;
    const result = verifyRelationalClaim(claim, claimFen);

    if (result.verdict === "contradicted") {
      issues.push({
        check_name: "relational_claim_contradicted",
        severity: "error",
        llm_span: claim.rawText,
        expected: { verdict: "holds" },
        actual: { verdict: "contradicted", reason: result.reason },
        detail: `Relational claim contradicted by chess.js oracle: "${claim.rawText}" — ${result.reason}`,
      });
      telemetry.push(
        createTelemetryEvent({
          check_name: "relational_claim_contradicted",
          fire_reason: "relational_claim_contradicted",
          expected: { verdict: "holds" },
          actual: { verdict: "contradicted", claim_kind: claim.kind, reason: result.reason },
          context: { ...baseContext, fen: claimFen },
        }),
      );
    }
  }

  if (issues.length === 0) {
    telemetry.push(
      createTelemetryEvent({
        check_name: "relational_claim",
        fire_reason: "passed",
        expected: { relational_claims_all_hold: true },
        actual: { claims_checked: claims.length },
        context: baseContext,
      }),
    );
  }

  return {
    issues,
    passed: issues.length === 0,
    telemetry,
    costUsd,
  };
}

// Exposed for unit testing the claim parser without an API call.
export const __test = { parseClaims, coerceClaim };
