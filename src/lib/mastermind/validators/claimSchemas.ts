/**
 * Structured-output claim parsing (PR-CI-3, Contract Inversion plan §3 +
 * review outcome #6 — resequenced from CI-4 into CI-3 by the tech-lead).
 *
 * The Haiku claim parsers (evalClaim / relationalClaim) historically asked
 * for "ONLY a JSON array" in prose and fail-OPEN when the model wraps the
 * array in commentary or emits malformed JSON (audit #4). This module moves
 * them to Anthropic structured outputs (`output_config.format json_schema`,
 * GA on Haiku 4.5): the response is constrained to
 *
 *     { "claims": [ <item schema>... ] }
 *
 * and unwrapped back to the bare-array JSON string the existing parse
 * functions expect — zero changes to downstream claim coercion/validation.
 *
 * Root is an object (not a bare array) for maximum cross-provider
 * compatibility; every object level carries `additionalProperties: false`
 * and a full `required` list (nullable-by-anyOf where the TS type is
 * optional/null) so the same schema is valid under OpenAI's json_schema
 * shape too. Schema compilation is cached server-side for 24h, so only the
 * first call after a schema change pays compile latency.
 *
 * Failure posture is UNCHANGED: if the constrained call itself fails, callLLM
 * throws (after its provider fallback) and the caller's existing
 * parser-failure pass-through applies. If a fallback provider returns
 * unconstrained output, the envelope unwrap falls back to returning the raw
 * text and the downstream parsers keep their lenient handling.
 */
import { callLLM, type LLMResult } from "@/lib/llmProvider";
import type { ParserCall } from "./evalClaim";

// ── Shared schema fragments ─────────────────────────────────────────────────
const nullable = (schema: Record<string, unknown>): Record<string, unknown> => ({
  anyOf: [schema, { type: "null" }],
});

const PIECE_TYPE = { type: "string", enum: ["p", "n", "b", "r", "q", "k"] };
const PIECE_COLOR = { type: "string", enum: ["w", "b"] };
const SAN_ARRAY = { type: "array", items: { type: "string" } };

/** Item schema for ParsedEvalClaim (validators/types.ts) — field-for-field. */
export const EVAL_CLAIM_ITEM_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    stated_band: {
      type: "string",
      enum: [
        "losing",
        "much_worse",
        "slightly_worse",
        "equal",
        "slightly_better",
        "much_better",
        "winning",
      ],
    },
    stated_cp: nullable({ type: "number" }),
    supporting_spans: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
    claim_class: {
      type: "string",
      enum: ["evaluative", "historical", "metaphorical", "conditional"],
    },
    perspective: {
      type: "string",
      enum: ["white", "black", "side_to_move", "ambiguous"],
    },
  },
  required: [
    "stated_band",
    "stated_cp",
    "supporting_spans",
    "confidence",
    "claim_class",
    "perspective",
  ],
  additionalProperties: false,
};

/** Item schema for RelationalClaim (relationalVerify.ts) as coerceClaim reads
 * it. Nulls coerce to undefined in coerceClaim's guards, so requiring every
 * field (nullable) is behavior-neutral. */
export const RELATIONAL_CLAIM_ITEM_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["attack", "capture", "defense", "presence", "line", "pin"] },
    pieceColor: nullable(PIECE_COLOR),
    pieceType: nullable(PIECE_TYPE),
    fromSquare: nullable({ type: "string" }),
    targetSquare: nullable({ type: "string" }),
    pinnedToSquare: nullable({ type: "string" }),
    expectedPiece: nullable({
      type: "object",
      properties: { type: PIECE_TYPE, color: PIECE_COLOR },
      required: ["type", "color"],
      additionalProperties: false,
    }),
    line: nullable(SAN_ARRAY),
    precedingLine: nullable(SAN_ARRAY),
    moveRefPly: nullable({ type: "integer" }),
    rawText: { type: "string" },
  },
  required: [
    "kind",
    "pieceColor",
    "pieceType",
    "fromSquare",
    "targetSquare",
    "pinnedToSquare",
    "expectedPiece",
    "line",
    "precedingLine",
    "moveRefPly",
    "rawText",
  ],
  additionalProperties: false,
};

/** {claims: [...]} envelope around an item schema. */
export function claimsEnvelopeSchema(itemSchema: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "object",
    properties: { claims: { type: "array", items: itemSchema } },
    required: ["claims"],
    additionalProperties: false,
  };
}

/**
 * Unwrap the {claims: [...]} envelope back to the bare-array JSON string the
 * legacy parse functions expect. Falls back to the raw text when the shape
 * isn't the envelope (e.g. the OpenAI fallback returned a bare array) — the
 * downstream parsers keep their lenient handling for that case.
 */
export function unwrapClaimsEnvelope(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { claims?: unknown }).claims)
    ) {
      return JSON.stringify((parsed as { claims: unknown[] }).claims);
    }
  } catch {
    /* not the envelope — return raw for lenient downstream parsing */
  }
  return raw;
}

// Haiku 4.5 pricing (mirrors evalClaim/relationalClaim's local constants).
const HAIKU_INPUT_PRICE_PER_M = 1.0;
const HAIKU_OUTPUT_PRICE_PER_M = 5.0;
const HAIKU_CACHE_READ_PRICE_PER_M = 0.1;
const HAIKU_CACHE_WRITE_PRICE_PER_M = 1.25;

function estimateHaikuCost(r: LLMResult): number {
  return (
    (r.inputTokens / 1_000_000) * HAIKU_INPUT_PRICE_PER_M +
    ((r.cacheReadTokens ?? 0) / 1_000_000) * HAIKU_CACHE_READ_PRICE_PER_M +
    ((r.cacheCreationTokens ?? 0) / 1_000_000) * HAIKU_CACHE_WRITE_PRICE_PER_M +
    (r.outputTokens / 1_000_000) * HAIKU_OUTPUT_PRICE_PER_M
  );
}

/**
 * Build a ParserCall that routes through callLLM with a structured-output
 * envelope schema and unwraps the result to the bare-array string. Same
 * tier/temperature/caching posture as the legacy default parsers.
 */
export function makeStructuredClaimsParserCall(opts: {
  schemaName: string;
  itemSchema: Record<string, unknown>;
  maxTokens: number;
}): ParserCall {
  const outputSchema = {
    name: opts.schemaName,
    schema: claimsEnvelopeSchema(opts.itemSchema),
  };
  return async ({ system, user, signal }) => {
    const result = await callLLM({
      tier: "fast",
      system,
      messages: [{ role: "user", content: user }],
      temperature: 0,
      maxTokens: opts.maxTokens,
      cacheSystem: true,
      signal,
      outputSchema,
    });
    return {
      raw: unwrapClaimsEnvelope(result.content),
      costUsd: estimateHaikuCost(result),
      result,
    };
  };
}
