import { describe, it, expect } from "vitest";
import { judgeResponse, __test, type AnthropicReq, type AnthropicRes } from "../helpfulnessJudge";
import { juryGrade, aggregateRubrics } from "../helpfulnessJury";
import { MoveClassification } from "@/types/enums";
import type { JudgePacket, DimId } from "../helpfulnessTypes";
import type { ScoreResult } from "../relationalScorer";
import type { PositionFeatureDelta } from "@/lib/mastermind/featureDelta";

// ── tiny fixture packet (no engine needed; fields the judge/gate logic reads) ──
const EMPTY_DELTA: PositionFeatureDelta = {
  fenBefore: "",
  fenAfter: "",
  resolutionFen: "",
  resolutionReason: "no-pv",
  materialDelta: { white: 0, black: 0 },
  pawnStructureDelta: {
    doubledPawnsChange: { white: 0, black: 0 },
    isolatedPawnsChange: { white: 0, black: 0 },
    passedPawnsGained: { white: [], black: [] },
    passedPawnsLost: { white: [], black: [] },
    openFilesGained: [],
    openFilesLost: [],
    semiOpenFilesGained: { white: [], black: [] },
    semiOpenFilesLost: { white: [], black: [] },
  },
  kingSafetyDelta: { white: 0, black: 0 },
  pieceActivityDelta: { gainedActive: [], lostActive: [], newlyTrapped: [] },
  hangingPiecesDelta: { newlyHanging: [], nowDefended: [] },
  threatsDelta: { newThreats: [], resolvedThreats: [], carriedOverThreats: [] },
  isEmptyDelta: true,
};

function packet(overrides: Partial<JudgePacket["stockfish"]> = {}): JudgePacket {
  return {
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    movePlayedSan: "e4",
    movePlayedUci: "e2e4",
    playerColor: "w",
    userRating: 1500,
    stockfish: {
      evalBeforeCp: 40,
      evalAfterCp: 40,
      evalDeltaCpMoverPov: 0,
      bestMoveUci: "e2e4",
      bestMoveSan: "e4",
      multiPv: [{ rank: 1, san: "e4", scoreCp: 40, mate: null }],
      classification: MoveClassification.Okay,
      ...overrides,
    },
    motifs: [],
    motifTags: [],
    conceptDelta: EMPTY_DELTA,
    topConcepts: [],
  };
}

const CLEAN_GATE: ScoreResult = {
  extractorOk: true,
  totalClaims: 0,
  falseRelationalClaims: 0,
  trueClaims: 0,
  unverifiable: 0,
  details: [],
};

/** Stub `call` that returns a fixed dims JSON, optionally per-model. */
function stubCall(byModel: (model: string) => unknown): (req: AnthropicReq, apiKey: string) => Promise<AnthropicRes> {
  return async (req) => ({
    ok: true,
    status: 200,
    text: JSON.stringify(byModel(req.model)),
    inputTokens: 100,
    outputTokens: 50,
  });
}

/** Build a dims payload where each dim gets uniform probs. */
function dimsAll(probs: [number, number, number], applicable = true) {
  const dims = ([1, 2, 3, 4, 5, 6, 7] as DimId[]).map((dim) => ({ dim, applicable, probs, rationale: "x" }));
  return { dims };
}

describe("EV math (evFromProbs)", () => {
  it("computes 0*p0 + 1*p1 + 2*p2", () => {
    expect(__test.evFromProbs([1, 0, 0]).ev).toBe(0);
    expect(__test.evFromProbs([0, 1, 0]).ev).toBe(1);
    expect(__test.evFromProbs([0, 0, 1]).ev).toBe(2);
    expect(__test.evFromProbs([0, 0.5, 0.5]).ev).toBeCloseTo(1.5, 6);
  });

  it("renormalizes probs that do not sum to 1", () => {
    const { ev, clamped } = __test.evFromProbs([0, 2, 2]); // sum=4 -> [0,0.5,0.5]
    expect(clamped[1]).toBeCloseTo(0.5, 6);
    expect(ev).toBeCloseTo(1.5, 6);
  });

  it("treats negative / NaN probs as 0 and falls back to EV 0 when all invalid", () => {
    expect(__test.evFromProbs([-1, 0, 0]).ev).toBe(0);
    expect(__test.evFromProbs([0, 0, 0]).ev).toBe(0); // sum 0 -> [1,0,0]
  });
});

describe("judgeResponse (stubbed call) — single model", () => {
  it("scores all-2 dims to rawTotal 14, max 14, normalized 1", async () => {
    const r = await judgeResponse({
      apiKey: "unused",
      model: "claude-sonnet-4-6",
      packet: packet(),
      coachText: "rich analysis",
      gate: CLEAN_GATE,
      call: stubCall(() => dimsAll([0, 0, 1])),
    });
    expect(r.rawTotal).toBeCloseTo(14, 6);
    expect(r.maxApplicable).toBe(14);
    expect(r.normalized).toBeCloseTo(1, 6);
    expect(r.gateApplied).toBe(false);
    expect(r.cappedTotal).toBeCloseTo(14, 6);
  });

  it("excludes an N/A dim from maxApplicable", async () => {
    // dim 2 N/A; the other 6 score 2 each -> rawTotal 12, max 12.
    const r = await judgeResponse({
      apiKey: "unused",
      model: "claude-sonnet-4-6",
      packet: packet(),
      coachText: "x",
      gate: CLEAN_GATE,
      call: stubCall(() => ({
        dims: ([1, 2, 3, 4, 5, 6, 7] as DimId[]).map((dim) =>
          dim === 2
            ? { dim, applicable: false, naReason: "affirmed best", rationale: "best move" }
            : { dim, applicable: true, probs: [0, 0, 1], rationale: "x" }
        ),
      })),
    });
    const dim2 = r.dims.find((d) => d.dim === 2)!;
    expect(dim2.applicable).toBe(false);
    expect(dim2.expected).toBe(0);
    expect(r.maxApplicable).toBe(12);
    expect(r.rawTotal).toBeCloseTo(12, 6);
    expect(r.normalized).toBeCloseTo(1, 6);
  });
});

describe("gate composition (dim-1 board facts)", () => {
  it("forces dim-1 to 0 and caps total <= 4 when the GATE found a contradiction", async () => {
    const dirtyGate: ScoreResult = { ...CLEAN_GATE, falseRelationalClaims: 1 };
    const r = await judgeResponse({
      apiKey: "unused",
      model: "claude-sonnet-4-6",
      packet: packet(),
      coachText: "claims a queen captures a piece it can't reach",
      gate: dirtyGate,
      // judge would have given everything 2
      call: stubCall(() => dimsAll([0, 0, 1])),
    });
    const dim1 = r.dims.find((d) => d.dim === 1)!;
    expect(dim1.expected).toBe(0);
    expect(r.gateApplied).toBe(true);
    expect(r.cappedTotal).toBeLessThanOrEqual(4);
    // rawTotal is still the sum of EVs (dim1 now 0, others 2 => 12), but capped.
    expect(r.rawTotal).toBeCloseTo(12, 6);
  });

  it("gateApplied also fires when the judge itself scores dim-1 EV 0 (no GATE contradiction)", async () => {
    const r = await judgeResponse({
      apiKey: "unused",
      model: "claude-sonnet-4-6",
      packet: packet(),
      coachText: "illegal move suggested",
      gate: CLEAN_GATE,
      call: stubCall(() => ({
        dims: ([1, 2, 3, 4, 5, 6, 7] as DimId[]).map((dim) =>
          dim === 1
            ? { dim, applicable: true, probs: [1, 0, 0], rationale: "illegal" }
            : { dim, applicable: true, probs: [0, 0, 1], rationale: "x" }
        ),
      })),
    });
    expect(r.gateApplied).toBe(true);
    expect(r.cappedTotal).toBeLessThanOrEqual(4);
  });
});

describe("dim-2 over-validation cross-check flag", () => {
  it("flags (but does not zero) a high dim-2 EV when the move lost >=150cp", async () => {
    const r = await judgeResponse({
      apiKey: "unused",
      model: "claude-sonnet-4-6",
      packet: packet({ evalDeltaCpMoverPov: -300, classification: MoveClassification.Blunder }),
      coachText: "great move!",
      gate: CLEAN_GATE,
      call: stubCall(() => dimsAll([0, 0, 1])), // dim2 EV = 2
    });
    const dim2 = r.dims.find((d) => d.dim === 2)!;
    expect(dim2.expected).toBe(2); // not zeroed — trust the judge's number
    expect(dim2.rationale).toContain("[FLAG]");
  });
});

describe("juryGrade — two-judge weighted aggregate (0.6 strong / 0.4 cross)", () => {
  it("aggregates per-dim EV with strong weight 0.6, cross 0.4", async () => {
    // strong (sonnet) gives EV 2 on every dim; cross (haiku) gives EV 1.
    const call = stubCall((model) =>
      model === "claude-sonnet-4-6" ? dimsAll([0, 0, 1]) : dimsAll([0, 1, 0])
    );
    const jr = await juryGrade({
      apiKey: "unused",
      packet: packet(),
      coachText: "rich",
      gate: CLEAN_GATE,
      call,
    });
    expect(jr.perJudge).toHaveLength(2);
    expect(jr.perJudge[0].model).toBe("claude-sonnet-4-6");
    // each aggregate dim EV = 0.6*2 + 0.4*1 = 1.6
    for (const d of jr.aggregate.dims) {
      expect(d.applicable).toBe(true);
      expect(d.expected).toBeCloseTo(1.6, 6);
    }
    expect(jr.aggregate.rawTotal).toBeCloseTo(1.6 * 7, 6);
    expect(jr.aggregate.maxApplicable).toBe(14);
  });

  it("applicability follows the strong judge (cross-check cannot veto)", async () => {
    // strong marks dim2 applicable (EV 2); cross marks dim2 N/A.
    const call = stubCall((model) =>
      model === "claude-sonnet-4-6"
        ? dimsAll([0, 0, 1])
        : {
            dims: ([1, 2, 3, 4, 5, 6, 7] as DimId[]).map((dim) =>
              dim === 2
                ? { dim, applicable: false, naReason: "x", rationale: "x" }
                : { dim, applicable: true, probs: [0, 0, 1], rationale: "x" }
            ),
          }
    );
    const jr = await juryGrade({ apiKey: "unused", packet: packet(), coachText: "x", gate: CLEAN_GATE, call });
    const dim2 = jr.aggregate.dims.find((d) => d.dim === 2)!;
    expect(dim2.applicable).toBe(true);
    // cross didn't score dim2 -> strong alone => EV 2.
    expect(dim2.expected).toBeCloseTo(2, 6);
    // other dims have both => 0.6*2 + 0.4*2 = 2.
    const dim3 = jr.aggregate.dims.find((d) => d.dim === 3)!;
    expect(dim3.expected).toBeCloseTo(2, 6);
  });

  it("strong judge N/A makes the dim N/A in the aggregate (excluded from max)", async () => {
    const call = stubCall((model) =>
      model === "claude-sonnet-4-6"
        ? {
            dims: ([1, 2, 3, 4, 5, 6, 7] as DimId[]).map((dim) =>
              dim === 2
                ? { dim, applicable: false, naReason: "affirmed best", rationale: "best" }
                : { dim, applicable: true, probs: [0, 0, 1], rationale: "x" }
            ),
          }
        : dimsAll([0, 0, 1])
    );
    const jr = await juryGrade({ apiKey: "unused", packet: packet(), coachText: "x", gate: CLEAN_GATE, call });
    const dim2 = jr.aggregate.dims.find((d) => d.dim === 2)!;
    expect(dim2.applicable).toBe(false);
    expect(jr.aggregate.maxApplicable).toBe(12);
  });

  it("re-applies the gate cap on the aggregate", async () => {
    const dirtyGate: ScoreResult = { ...CLEAN_GATE, falseRelationalClaims: 2 };
    const call = stubCall(() => dimsAll([0, 0, 1]));
    const jr = await juryGrade({ apiKey: "unused", packet: packet(), coachText: "x", gate: dirtyGate, call });
    const dim1 = jr.aggregate.dims.find((d) => d.dim === 1)!;
    expect(dim1.expected).toBe(0);
    expect(jr.aggregate.gateApplied).toBe(true);
    expect(jr.aggregate.cappedTotal).toBeLessThanOrEqual(4);
  });
});

describe("aggregateRubrics — degenerate input", () => {
  it("returns all-N/A rubric when there are no judges", () => {
    const r = aggregateRubrics([], CLEAN_GATE, packet());
    expect(r.dims.every((d) => !d.applicable)).toBe(true);
    expect(r.maxApplicable).toBe(0);
    expect(r.normalized).toBe(0);
  });
});
