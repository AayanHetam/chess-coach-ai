/**
 * helpfulnessJudge — a single-model Claude judge call for the helpfulness rubric.
 *
 * Reuses the exact Anthropic fetch / cost-gate / usage pattern from
 * relationalExtract.ts. The network call is dependency-injectable (the `call`
 * seam) so tests run with NO network — exactly like relationalScorer's
 * injectable extractor.
 *
 * Probability-weighted scoring: the judge returns probs [p0,p1,p2] per dim; the
 * EV is 0*p0 + 1*p1 + 2*p2. Conditional activation (applicable=false) excludes a
 * dim from maxApplicable. Gate composition: a chess.js GATE board-contradiction
 * forces dim-1 EV to 0 (the deterministic GATE outranks the judge on board
 * facts), which caps the total at 4.
 */
import { HELPFULNESS_SYSTEM_PROMPT, renderJudgeUserContent } from "./helpfulnessPrompt";
import type { CostTracker } from "./costTracker";
import type { ScoreResult } from "./relationalScorer";
import type { JudgePacket, RubricResult, DimScore, DimId } from "./helpfulnessTypes";

export type JudgeModel = "claude-sonnet-4-6" | "claude-haiku-4-5-20251001";

/** The Anthropic request shape (subset we send). */
export interface AnthropicReq {
  model: string;
  max_tokens: number;
  temperature: number;
  system: string;
  messages: Array<{ role: "user"; content: string }>;
}

/** The Anthropic response shape (subset we read). */
export interface AnthropicRes {
  ok: boolean;
  status?: number;
  text: string; // assistant text content
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
}

export interface JudgeArgs {
  apiKey: string;
  model: JudgeModel;
  packet: JudgePacket;
  coachText: string;
  gate: ScoreResult;
  costTracker?: CostTracker;
  /** injectable seam for tests; defaults to the real Anthropic fetch */
  call?: (req: AnthropicReq, apiKey: string) => Promise<AnthropicRes>;
}

const ALL_DIMS: DimId[] = [1, 2, 3, 4, 5, 6, 7];
const MAX_PER_DIM = 2;
const GATE_CAP = 4; // dim-1 == 0 caps total <= 4

/** Default real Anthropic call (same fetch contract as relationalExtract). */
async function realAnthropicCall(req: AnthropicReq, apiKey: string): Promise<AnthropicRes> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, text: "", errorMessage: `${res.status} ${text.slice(0, 200)}` };
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = json.content?.find((b) => b.type === "text")?.text || "";
    return {
      ok: true,
      status: res.status,
      text,
      inputTokens: json.usage?.input_tokens,
      outputTokens: json.usage?.output_tokens,
    };
  } catch (err) {
    return { ok: false, text: "", errorMessage: String(err) };
  }
}

/** Parse the judge's JSON object (fence-strip + first-{/last-} slice, like parseClaims). */
export function parseJudgeJson(text: string): unknown {
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Clamp probs to >=0 and renormalize so they sum to 1; falls back to all-zero EV. */
function evFromProbs(probs: unknown): { ev: number; clamped: [number, number, number] } {
  if (!Array.isArray(probs) || probs.length < 3) return { ev: 0, clamped: [1, 0, 0] };
  let p = probs.slice(0, 3).map((x) => (typeof x === "number" && x >= 0 && Number.isFinite(x) ? x : 0));
  const sum = p[0] + p[1] + p[2];
  if (sum <= 0) p = [1, 0, 0];
  else p = p.map((x) => x / sum);
  const clamped: [number, number, number] = [p[0], p[1], p[2]];
  const ev = 0 * clamped[0] + 1 * clamped[1] + 2 * clamped[2];
  return { ev, clamped };
}

/** Coerce one raw dim object from the judge into a DimScore (no gate logic yet). */
function coerceDim(dim: DimId, raw: unknown): DimScore {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const applicable = o.applicable === false ? false : true;
  const rationale = typeof o.rationale === "string" ? o.rationale : "";
  if (!applicable) {
    return {
      dim,
      applicable: false,
      naReason: typeof o.naReason === "string" ? o.naReason : "marked N/A by judge",
      expected: 0,
      rationale,
    };
  }
  const { ev, clamped } = evFromProbs(o.probs);
  return { dim, applicable: true, expected: ev, probs: clamped, rationale };
}

/** Build a RubricResult from per-dim scores, applying the gate cap. */
export function assembleRubric(dims: DimScore[], gate: ScoreResult, packet: JudgePacket): RubricResult {
  const byDim = new Map<DimId, DimScore>(dims.map((d) => [d.dim, d]));

  const dim1 = byDim.get(1);
  const dim2 = byDim.get(2);

  // ── Gate composition (dim-1 board facts) ──
  // A deterministic chess.js board-contradiction outranks the judge on dim-1.
  const gateContradiction = gate.extractorOk && gate.falseRelationalClaims > 0;
  if (gateContradiction && dim1) {
    dim1.expected = 0;
    dim1.probs = [1, 0, 0];
    dim1.rationale =
      `[GATE] chess.js verifier found ${gate.falseRelationalClaims} board-contradiction(s); dim-1 forced to 0. ` +
      dim1.rationale;
  }

  // ── Dim-2 over-validation cross-check (does NOT override the judge; flags for tuning) ──
  if (dim2 && dim2.applicable && packet.stockfish.evalDeltaCpMoverPov <= -150 && dim2.expected >= 1.5) {
    dim2.rationale =
      `[FLAG] move lost ${Math.abs(packet.stockfish.evalDeltaCpMoverPov)}cp (blunder/mistake) yet dim-2 EV=${dim2.expected.toFixed(2)} — possible over-credit of a blunder-validating response. ` +
      dim2.rationale;
  }

  const applicableDims = dims.filter((d) => d.applicable);
  const rawTotal = applicableDims.reduce((s, d) => s + d.expected, 0);
  const maxApplicable = MAX_PER_DIM * applicableDims.length;
  const normalized = maxApplicable > 0 ? rawTotal / maxApplicable : 0;

  // gateApplied iff dim-1 EV is 0 (whether forced by the GATE or judged 0).
  const gateApplied = (dim1 ? dim1.expected === 0 : false) || gateContradiction;
  const cappedTotal = gateApplied ? Math.min(rawTotal, GATE_CAP) : rawTotal;

  return { dims, rawTotal, maxApplicable, normalized, gateApplied, cappedTotal };
}

export async function judgeResponse(args: JudgeArgs): Promise<RubricResult> {
  const call = args.call ?? realAnthropicCall;
  const userContent = renderJudgeUserContent(args.packet, args.coachText);

  const req: AnthropicReq = {
    model: args.model,
    max_tokens: 1024,
    temperature: 0,
    system: HELPFULNESS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  };

  // Pre-flight cost gate BEFORE the call (same pattern as relationalExtract).
  const estIn = Math.ceil((HELPFULNESS_SYSTEM_PROMPT.length + userContent.length) / 4);
  const estOut = 600;
  if (args.costTracker?.exceedsCap(args.costTracker.estimate(args.model, estIn, estOut))) {
    // Cost-capped: emit an all-N/A rubric so the caller can detect the abort.
    const dims: DimScore[] = ALL_DIMS.map((d) => ({
      dim: d,
      applicable: false,
      naReason: "cost_cap_would_exceed",
      expected: 0,
      rationale: "judge call skipped: cost cap",
    }));
    return assembleRubric(dims, args.gate, args.packet);
  }

  const res = await call(req, args.apiKey);
  args.costTracker?.addUsage(args.model, res.inputTokens ?? estIn, res.outputTokens ?? estOut);

  if (!res.ok) {
    const dims: DimScore[] = ALL_DIMS.map((d) => ({
      dim: d,
      applicable: false,
      naReason: "judge_call_failed",
      expected: 0,
      rationale: res.errorMessage ?? "judge call failed",
    }));
    return assembleRubric(dims, args.gate, args.packet);
  }

  const parsed = parseJudgeJson(res.text) as { dims?: unknown[] } | null;
  const rawDims = Array.isArray(parsed?.dims) ? parsed!.dims! : [];
  const byDim = new Map<number, unknown>();
  for (const rd of rawDims) {
    const d = (rd && typeof rd === "object" ? (rd as Record<string, unknown>).dim : undefined);
    if (typeof d === "number" && d >= 1 && d <= 7) byDim.set(d, rd);
  }

  // Build all 7 dims; any missing from the judge default to applicable-but-0.
  const dims: DimScore[] = ALL_DIMS.map((d) =>
    byDim.has(d)
      ? coerceDim(d, byDim.get(d))
      : { dim: d, applicable: true, expected: 0, probs: [1, 0, 0] as [number, number, number], rationale: "missing from judge output -> 0" }
  );

  return assembleRubric(dims, args.gate, args.packet);
}

// Exposed for unit testing without a network call.
export const __test = { evFromProbs, coerceDim, assembleRubric, parseJudgeJson, realAnthropicCall };
