/**
 * THE UNGAMEABLE-BY-TERSENESS PROOF (spec §4.3).
 *
 * Two variants:
 *  (a) Logic-level guarantee — ALWAYS RUNS, no network. Proves the AGGREGATION
 *      makes terseness/dumping/padding lose BY CONSTRUCTION. The stubbed `call`
 *      is a deterministic stand-in scorer that applies the rubric's own rules to
 *      the response text (empty -> 0 on dims 3/4/6; line-dump -> 0 on dim 6;
 *      padding -> 0 on dim 7). Monotonicity: rich beats terse, line-dump, padded.
 *  (b) Live calibration — skipIf(!ANTHROPIC_API_KEY). Same 4 responses through
 *      the real 2-model jury on the frozen packet; asserts the same inequalities
 *      with looser tolerances. Run manually / nightly, NOT in PR CI.
 *
 * Both use the frozen fixture (precomputed packet) so neither needs a Stockfish
 * binary.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { juryGrade } from "../helpfulnessJury";
import type { AnthropicReq, AnthropicRes } from "../helpfulnessJudge";
import type { JudgePacket, DimId } from "../helpfulnessTypes";
import type { ScoreResult } from "../relationalScorer";
import { CostTracker } from "../costTracker";

// ── load the frozen fixture (packet + 4 responses) ──
const FIXTURE = JSON.parse(
  readFileSync(join("scripts", "synthetic-tester", "fixtures", "helpfulness", "ungameable_queen_drop.json"), "utf8")
) as {
  packet: JudgePacket;
  responses: { terse: string; lineDump: string; padded: string; rich: string };
};
const PACKET = FIXTURE.packet;
const RESPONSES = FIXTURE.responses;

const CLEAN_GATE: ScoreResult = {
  extractorOk: true,
  totalClaims: 0,
  falseRelationalClaims: 0,
  trueClaims: 0,
  unverifiable: 0,
  details: [],
};

// ── (a) deterministic stand-in scorer ──────────────────────────────────────
// Extracts the coach response + word count from the rendered userContent (the
// judge sees exactly this), then encodes the rubric's anchors as probability
// distributions. This is intentionally mechanical: the point is to prove that
// when the rubric rules ARE applied, the aggregation makes saying-less lose.

function extractResponseFromUserContent(content: string): { text: string; wordCount: number } {
  const wcMatch = content.match(/Coach response word count:\s*(\d+)/);
  const wordCount = wcMatch ? parseInt(wcMatch[1], 10) : 0;
  const idx = content.indexOf("Coach response:");
  const after = idx >= 0 ? content.slice(idx + "Coach response:".length) : content;
  const text = after.replace(/Return the JSON object\.\s*$/i, "").trim();
  return { text, wordCount };
}

const p0 = (): [number, number, number] => [1, 0, 0]; // EV 0
const p2 = (): [number, number, number] => [0, 0, 1]; // EV 2
const p1 = (): [number, number, number] => [0, 1, 0]; // EV 1

/** Feature flags computed from the response text (the rubric's input signals). */
function features(text: string, wordCount: number) {
  const lower = text.toLowerCase();
  const isEmpty = wordCount === 0 || text === "(empty response)";
  const isTerse = wordCount <= 5; // "Bad move." etc.
  // Line-dump: dominated by a SAN move sequence presented as fiat (move numbers + SAN, no teaching prose).
  const sanTokens = (text.match(/\b(?:[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?)\b/g) || []).length;
  const isLineDump = sanTokens >= 4 && wordCount <= 30 && /\d\.\s*[NBRQKOa-h]/.test(text);
  // Padding: long + low unique-content density (repeated tokens).
  const tokens = lower.split(/\s+/).filter(Boolean);
  const uniqueRatio = tokens.length > 0 ? new Set(tokens).size / tokens.length : 1;
  const isPadded = wordCount > 180 && uniqueRatio < 0.5;
  // Rich: gives the why (open file / free / mate), a concrete alt (Rh8+/best move), a nudge (question/"whenever").
  const namesWhy = /(open d-file|for free|threw away|forced mate|takes it|hang)/.test(lower);
  const givesAlt = /(rh8|instead, play|best move|forcing check)/.test(lower);
  const hasNudge = /(whenever|slow down|look for|ask yourself|\?)/.test(lower);
  return { isEmpty, isTerse, isLineDump, isPadded, uniqueRatio, namesWhy, givesAlt, hasNudge };
}

/** The deterministic stand-in judge: rubric anchors as a probability table. */
function standInDims(text: string, wordCount: number) {
  const f = features(text, wordCount);

  // dim 1 (chess correctness): none of these responses make an illegal/contradicting
  // claim, so correctness is fine (the GATE is clean) -> EV high.
  const dim1 = p2();

  // dim 2 (diagnostic accuracy): rich names the specific mistake; terse/padded are vague;
  // line-dump shows the line but doesn't diagnose. Move was a mistake here (applicable).
  const dim2 = f.namesWhy ? p2() : f.isLineDump ? p1() : p0();

  // dim 3 (insight depth, the "why"): 0 for empty/terse/line-dump/padded; high for rich.
  const dim3 = f.namesWhy && !f.isPadded ? p2() : f.isEmpty || f.isTerse || f.isLineDump || f.isPadded ? p0() : p1();

  // dim 4 (actionability): concrete next step. rich gives Rh8+/best move; others don't.
  const dim4 = f.givesAlt && !f.isPadded ? p2() : f.isEmpty || f.isTerse || f.isPadded ? p0() : p1();

  // dim 5 (level-appropriateness): neutral; rich is well-pitched, others terse/padded.
  const dim5 = f.namesWhy ? p2() : p1();

  // dim 6 (assistance calibration): 0 if dumps the engine line as fiat OR withholds (terse/empty).
  const dim6 = f.isLineDump ? p0() : f.isEmpty || f.isTerse ? p0() : f.hasNudge && f.namesWhy ? p2() : p1();

  // dim 7 (focus & non-redundancy): 0 for padding; high for tight rich; ok for terse (short, on point-ish).
  const dim7 = f.isPadded ? p0() : f.isLineDump ? p1() : f.namesWhy ? p2() : p1();

  const probsByDim: Record<DimId, [number, number, number]> = {
    1: dim1, 2: dim2, 3: dim3, 4: dim4, 5: dim5, 6: dim6, 7: dim7,
  };
  return ([1, 2, 3, 4, 5, 6, 7] as DimId[]).map((dim) => ({
    dim,
    applicable: true,
    probs: probsByDim[dim],
    rationale: "stand-in",
  }));
}

function standInCall(): (req: AnthropicReq, apiKey: string) => Promise<AnthropicRes> {
  return async (req) => {
    const userContent = req.messages[0].content;
    const { text, wordCount } = extractResponseFromUserContent(userContent);
    return {
      ok: true,
      status: 200,
      text: JSON.stringify({ dims: standInDims(text, wordCount) }),
      inputTokens: 100,
      outputTokens: 50,
    };
  };
}

async function gradeWithStandIn(coachText: string) {
  return juryGrade({
    apiKey: "unused",
    packet: PACKET,
    coachText,
    gate: CLEAN_GATE,
    call: standInCall(),
  });
}

function dimEV(dims: { dim: DimId; expected: number }[], dim: DimId): number {
  return dims.find((d) => d.dim === dim)?.expected ?? -1;
}

describe("(a) ungameable-by-terseness — logic-level guarantee (no network)", () => {
  it("TERSE response scores ~0 on dims 3, 4, 6", async () => {
    const jr = await gradeWithStandIn(RESPONSES.terse);
    const dims = jr.aggregate.dims;
    expect(dimEV(dims, 3)).toBeCloseTo(0, 6);
    expect(dimEV(dims, 4)).toBeCloseTo(0, 6);
    expect(dimEV(dims, 6)).toBeCloseTo(0, 6);
    expect(jr.aggregate.cappedTotal).toBeLessThan(6);
  });

  it("LINE-DUMP response scores ~0 on dim 6 (engine line as fiat, no teaching)", async () => {
    const jr = await gradeWithStandIn(RESPONSES.lineDump);
    expect(dimEV(jr.aggregate.dims, 6)).toBeCloseTo(0, 6);
  });

  it("PADDED response scores ~0 on dim 7 (repetition / low unique-content density)", async () => {
    const jr = await gradeWithStandIn(RESPONSES.padded);
    expect(dimEV(jr.aggregate.dims, 7)).toBeCloseTo(0, 6);
  });

  it("RICH response scores >= 1.5 on dims 3, 4, 6 and cappedTotal >= 10", async () => {
    const jr = await gradeWithStandIn(RESPONSES.rich);
    const dims = jr.aggregate.dims;
    expect(dimEV(dims, 3)).toBeGreaterThanOrEqual(1.5);
    expect(dimEV(dims, 4)).toBeGreaterThanOrEqual(1.5);
    expect(dimEV(dims, 6)).toBeGreaterThanOrEqual(1.5);
    expect(jr.aggregate.cappedTotal).toBeGreaterThanOrEqual(10);
  });

  it("MONOTONICITY: rich beats terse, line-dump, and padded — saying less / dumping / padding cannot win", async () => {
    const [rich, terse, dump, padded] = await Promise.all([
      gradeWithStandIn(RESPONSES.rich),
      gradeWithStandIn(RESPONSES.terse),
      gradeWithStandIn(RESPONSES.lineDump),
      gradeWithStandIn(RESPONSES.padded),
    ]);
    expect(rich.aggregate.cappedTotal).toBeGreaterThan(terse.aggregate.cappedTotal);
    expect(rich.aggregate.cappedTotal).toBeGreaterThan(dump.aggregate.cappedTotal);
    expect(rich.aggregate.cappedTotal).toBeGreaterThan(padded.aggregate.cappedTotal);
  });
});

// ── (b) live calibration — only with a real key; not in PR CI ───────────────
const LIVE = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!LIVE)("(b) ungameable-by-terseness — live 2-model jury calibration", () => {
  it(
    "real jury: terse dims 3+4+6 sum < 1.0; rich sum > 4.0; rich beats terse/dump/padded",
    async () => {
      const apiKey = process.env.ANTHROPIC_API_KEY!;
      const cost = new CostTracker(2.0);
      const grade = (text: string) => juryGrade({ apiKey, packet: PACKET, coachText: text, gate: CLEAN_GATE, costTracker: cost });

      const rich = await grade(RESPONSES.rich);
      const terse = await grade(RESPONSES.terse);
      const dump = await grade(RESPONSES.lineDump);
      const padded = await grade(RESPONSES.padded);

      const sum346 = (jr: typeof rich) =>
        dimEV(jr.aggregate.dims, 3) + dimEV(jr.aggregate.dims, 4) + dimEV(jr.aggregate.dims, 6);

      expect(sum346(terse)).toBeLessThan(1.0);
      expect(sum346(rich)).toBeGreaterThan(4.0);
      expect(rich.aggregate.cappedTotal).toBeGreaterThan(terse.aggregate.cappedTotal);
      expect(rich.aggregate.cappedTotal).toBeGreaterThan(dump.aggregate.cappedTotal);
      expect(rich.aggregate.cappedTotal).toBeGreaterThan(padded.aggregate.cappedTotal);
    },
    180_000
  );
});
