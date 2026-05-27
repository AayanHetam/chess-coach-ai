import { describe, it, expect } from "vitest";
import {
  validateEvalClaim,
  ParserCall,
  estimateHaikuCost,
} from "../../validators/evalClaim";
import type { LLMResult } from "@/lib/llmProvider";
import { ParsedEvalClaim } from "../../validators/types";

function mockParser(claims: ParsedEvalClaim[]): ParserCall {
  return async () => ({ raw: JSON.stringify(claims), costUsd: 0.001 });
}

function rawParser(raw: string): ParserCall {
  return async () => ({ raw, costUsd: 0.001 });
}

function claim(overrides: Partial<ParsedEvalClaim> = {}): ParsedEvalClaim {
  return {
    stated_band: "equal",
    stated_cp: null,
    supporting_spans: ["mock span"],
    confidence: 0.9,
    claim_class: "evaluative",
    perspective: "white",
    ...overrides,
  };
}

describe("validateEvalClaim — qualitative mismatch", () => {
  it("Stockfish +70 (slightly_better), LLM says 'Black is winning' → fires qualitative", async () => {
    const r = await validateEvalClaim({
      llmResponse: "Black is winning here.",
      stockfishEval: { cp: 70 },
      playerPerspective: "white",
      correlationId: "test-1",
      parseCall: mockParser([
        claim({ stated_band: "winning", perspective: "black", supporting_spans: ["Black is winning"] }),
      ]),
    });
    expect(r.passed).toBe(false);
    expect(r.issues[0].check_name).toBe("eval_mismatch_qualitative");
  });

  it("Stockfish +70 (slightly_better), LLM says 'slight edge to White' → passes", async () => {
    const r = await validateEvalClaim({
      llmResponse: "White has a slight edge.",
      stockfishEval: { cp: 70 },
      playerPerspective: "white",
      correlationId: "test-2",
      parseCall: mockParser([claim({ stated_band: "slightly_better", perspective: "white" })]),
    });
    expect(r.passed).toBe(true);
  });
});

describe("validateEvalClaim — numeric mismatch", () => {
  it("Stockfish +200, LLM '+1.5' (diff 50 cp, under 150) → passes", async () => {
    const r = await validateEvalClaim({
      llmResponse: "Evaluation is around +1.5.",
      stockfishEval: { cp: 200 },
      playerPerspective: "white",
      correlationId: "test-3",
      parseCall: mockParser([
        claim({ stated_band: "much_better", stated_cp: 150, perspective: "white" }),
      ]),
    });
    expect(r.passed).toBe(true);
  });

  it("Stockfish +200, LLM '+4.0' (diff 200 cp > 150) → fires numeric", async () => {
    const r = await validateEvalClaim({
      llmResponse: "Evaluation is around +4.0.",
      stockfishEval: { cp: 200 },
      playerPerspective: "white",
      correlationId: "test-4",
      parseCall: mockParser([
        claim({ stated_band: "winning", stated_cp: 400, perspective: "white" }),
      ]),
    });
    expect(r.passed).toBe(false);
    expect(r.issues.some((i) => i.check_name === "eval_mismatch_numeric")).toBe(true);
  });
});

describe("validateEvalClaim — adjacent-band tolerance (20 cp)", () => {
  it("Stockfish +55 (slightly_better, 5 cp from boundary), LLM 'roughly equal' → passes (tolerated)", async () => {
    const r = await validateEvalClaim({
      llmResponse: "Roughly equal.",
      stockfishEval: { cp: 55 },
      playerPerspective: "white",
      correlationId: "test-5",
      parseCall: mockParser([claim({ stated_band: "equal", perspective: "white" })]),
    });
    expect(r.passed).toBe(true);
  });

  it("Stockfish +55, LLM 'much better' (skip-one, no tolerance) → fires", async () => {
    const r = await validateEvalClaim({
      llmResponse: "White is much better.",
      stockfishEval: { cp: 55 },
      playerPerspective: "white",
      correlationId: "test-6",
      parseCall: mockParser([claim({ stated_band: "much_better", perspective: "white" })]),
    });
    expect(r.passed).toBe(false);
  });
});

describe("validateEvalClaim — mate handling", () => {
  it("Stockfish mate-in-5 for Black, LLM 'Black has a forced mate' → passes", async () => {
    const r = await validateEvalClaim({
      llmResponse: "Black has a forced mate.",
      stockfishEval: { mate: -5 },
      playerPerspective: "white",
      correlationId: "test-7",
      parseCall: mockParser([
        claim({ stated_band: "winning", perspective: "black", supporting_spans: ["forced mate"] }),
      ]),
    });
    expect(r.passed).toBe(true);
  });

  it("Stockfish -150 (much_worse), LLM 'Black is winning' → fires qualitative", async () => {
    const r = await validateEvalClaim({
      llmResponse: "Black is winning.",
      stockfishEval: { cp: -150 },
      playerPerspective: "white",
      correlationId: "test-8",
      parseCall: mockParser([
        claim({ stated_band: "winning", perspective: "black" }),
      ]),
    });
    expect(r.passed).toBe(false);
  });
});

describe("validateEvalClaim — non-evaluative or hedged prose", () => {
  it("LLM says nothing evaluative (interesting position) → passes, no fire", async () => {
    const r = await validateEvalClaim({
      llmResponse: "An interesting position.",
      stockfishEval: { cp: 50 },
      playerPerspective: "white",
      correlationId: "test-9",
      parseCall: mockParser([]),
    });
    expect(r.passed).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("Hedged 'Black might be slightly worse' against +30 cp → passes via tolerance", async () => {
    const r = await validateEvalClaim({
      llmResponse: "Black might be slightly worse.",
      stockfishEval: { cp: 30 },
      playerPerspective: "white",
      correlationId: "test-10",
      parseCall: mockParser([
        claim({ stated_band: "slightly_worse", perspective: "black", confidence: 0.6 }),
      ]),
    });
    expect(r.passed).toBe(true);
  });

  it("Quoted/attributed text classified metaphorical by parser → passes", async () => {
    const r = await validateEvalClaim({
      llmResponse: "The engine said 'Black is winning' but I disagree.",
      stockfishEval: { cp: 50 },
      playerPerspective: "white",
      correlationId: "test-11",
      parseCall: mockParser([
        claim({ stated_band: "winning", perspective: "black", claim_class: "metaphorical" }),
      ]),
    });
    expect(r.passed).toBe(true);
  });

  it("Parser returns malformed JSON → emits parser_json_invalid telemetry, no fire", async () => {
    const r = await validateEvalClaim({
      llmResponse: "anything",
      stockfishEval: { cp: 0 },
      playerPerspective: "white",
      correlationId: "test-12",
      parseCall: rawParser("definitely not json"),
    });
    expect(r.passed).toBe(true);
    expect(r.telemetry.some((e) => e.fire_reason === "parser_json_invalid")).toBe(true);
  });

  it("Parser returns claims with confidence below threshold → skipped", async () => {
    const r = await validateEvalClaim({
      llmResponse: "Maybe Black is better, hard to tell.",
      stockfishEval: { cp: 50 },
      playerPerspective: "white",
      correlationId: "test-conf-low",
      parseCall: mockParser([
        claim({ stated_band: "winning", perspective: "black", confidence: 0.3 }),
      ]),
    });
    expect(r.passed).toBe(true);
    expect(r.telemetry.some((e) => e.fire_reason === "parser_low_confidence")).toBe(true);
  });
});

describe("validateEvalClaim — adversarial metaphorical prose (§11.1)", () => {
  it("'Black's pieces are dancing around the kingside' → parser classifies metaphorical, no fire", async () => {
    const r = await validateEvalClaim({
      llmResponse: "Black's pieces are dancing around the kingside, creating chaos.",
      stockfishEval: { cp: 70 },
      playerPerspective: "white",
      correlationId: "adv-1",
      parseCall: mockParser([
        claim({
          stated_band: "much_better",
          perspective: "black",
          claim_class: "metaphorical",
          supporting_spans: ["dancing around the kingside"],
        }),
      ]),
    });
    expect(r.passed).toBe(true);
  });

  it("'the rook lift looms over the position' → metaphorical, no fire", async () => {
    const r = await validateEvalClaim({
      llmResponse: "The rook lift looms over the position.",
      stockfishEval: { cp: 0 },
      playerPerspective: "white",
      correlationId: "adv-2",
      parseCall: mockParser([
        claim({
          stated_band: "much_better",
          perspective: "white",
          claim_class: "metaphorical",
          supporting_spans: ["looms"],
        }),
      ]),
    });
    expect(r.passed).toBe(true);
  });

  it("'the queen is screaming at h7' → metaphorical, no fire", async () => {
    const r = await validateEvalClaim({
      llmResponse: "The queen is screaming at h7.",
      stockfishEval: { cp: 30 },
      playerPerspective: "white",
      correlationId: "adv-3",
      parseCall: mockParser([
        claim({
          stated_band: "winning",
          perspective: "white",
          claim_class: "metaphorical",
          supporting_spans: ["screaming at h7"],
        }),
      ]),
    });
    expect(r.passed).toBe(true);
  });

  it("'White's pieces coordinate beautifully' against -0.4 → metaphorical, no fire", async () => {
    const r = await validateEvalClaim({
      llmResponse: "White's pieces coordinate beautifully.",
      stockfishEval: { cp: -40 },
      playerPerspective: "white",
      correlationId: "adv-4",
      parseCall: mockParser([
        claim({
          stated_band: "slightly_better",
          perspective: "white",
          claim_class: "metaphorical",
          supporting_spans: ["coordinate beautifully"],
        }),
      ]),
    });
    expect(r.passed).toBe(true);
  });
});

describe("validateEvalClaim — cost accounting", () => {
  it("costUsd is propagated from parser", async () => {
    const r = await validateEvalClaim({
      llmResponse: "anything",
      stockfishEval: { cp: 0 },
      playerPerspective: "white",
      correlationId: "cost-1",
      parseCall: mockParser([]),
    });
    expect(r.costUsd).toBeGreaterThan(0);
  });
});

describe("validateEvalClaim — no-stockfish-eval skip path", () => {
  it("skips comparison entirely when both cp and mate are undefined", async () => {
    const r = await validateEvalClaim({
      llmResponse: "White is winning with a +3 advantage.",
      stockfishEval: { cp: undefined, mate: undefined },
      playerPerspective: "white",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      moveSan: undefined,
      correlationId: "skip-1",
      parseCall: mockParser([
        claim({ stated_band: "winning", stated_cp: 300, perspective: "white" }),
      ]),
    });
    expect(r.passed).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.telemetry).toHaveLength(1);
    expect(r.telemetry[0].check_name).toBe("eval_claim");
    expect(r.telemetry[0].fire_reason).toBe("no_stockfish_eval");
    expect(r.costUsd).toBe(0);
  });

  it("does NOT call parseCall when stockfishEval is missing (cost-avoidance invariant)", async () => {
    let parserCalled = false;
    const spyParser: ParserCall = async () => {
      parserCalled = true;
      return { raw: "[]", costUsd: 0.001 };
    };
    await validateEvalClaim({
      llmResponse: "any text the LLM produced",
      stockfishEval: { cp: undefined, mate: undefined },
      playerPerspective: "white",
      correlationId: "skip-2",
      parseCall: spyParser,
    });
    expect(parserCalled).toBe(false);
  });

  it("skip event context carries fen + correlation_id for Log Drain traceability", async () => {
    const r = await validateEvalClaim({
      llmResponse: "anything",
      stockfishEval: { cp: undefined, mate: undefined },
      playerPerspective: "black",
      fen: "8/8/8/8/8/8/4k3/4K3 w - - 0 1",
      moveSan: "Kf1",
      correlationId: "skip-3-trace",
      parseCall: mockParser([]),
    });
    expect(r.telemetry[0].context.fen).toBe("8/8/8/8/8/8/4k3/4K3 w - - 0 1");
    expect(r.telemetry[0].context.move_san).toBe("Kf1");
    expect(r.telemetry[0].context.player_perspective).toBe("black");
    expect(r.telemetry[0].context.correlation_id).toBe("skip-3-trace");
  });

  it("does NOT fire when only cp is set (stockfishEval present, real comparison runs)", async () => {
    const r = await validateEvalClaim({
      llmResponse: "Even position.",
      stockfishEval: { cp: 0 },
      playerPerspective: "white",
      correlationId: "skip-4",
      parseCall: mockParser([
        claim({ stated_band: "equal", stated_cp: 0, perspective: "white" }),
      ]),
    });
    // Real comparison path: passes because LLM claim matches stockfish.
    // Telemetry contains "passed", NOT "no_stockfish_eval".
    expect(r.telemetry.some((e) => e.fire_reason === "no_stockfish_eval")).toBe(false);
    expect(r.telemetry.some((e) => e.fire_reason === "passed")).toBe(true);
  });

  it("does NOT fire when only mate is set (stockfishEval present, real comparison runs)", async () => {
    const r = await validateEvalClaim({
      llmResponse: "White is winning by mate.",
      stockfishEval: { mate: 3 },
      playerPerspective: "white",
      correlationId: "skip-5",
      parseCall: mockParser([
        claim({ stated_band: "winning", perspective: "white" }),
      ]),
    });
    expect(r.telemetry.some((e) => e.fire_reason === "no_stockfish_eval")).toBe(false);
  });
});

// Regression for the cost-calc bug fixed alongside this test: prior
// formula was inputUncached = (inputTokens - cacheRead), which goes
// negative when cache_read_input_tokens > input_tokens (the normal
// case for the cache-warm parser system prompt). Per Anthropic's docs,
// input_tokens is ALREADY the uncached portion; subtracting cacheRead
// double-counts. Also: cache_creation_input_tokens was previously
// ignored entirely.
// https://platform.claude.com/docs/en/build-with-claude/prompt-caching
describe("estimateHaikuCost — cost-calc regression", () => {
  function llmResult(overrides: Partial<LLMResult> = {}): LLMResult {
    return {
      content: "x",
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      inputTokens: 50,
      outputTokens: 200,
      elapsedMs: 100,
      ...overrides,
    };
  }

  it("returns positive cost when cache_read_input_tokens > input_tokens", () => {
    const cost = estimateHaikuCost(llmResult({
      inputTokens: 50,
      outputTokens: 200,
      cacheReadTokens: 7000,
    }));
    // Hand-calc: 50/1M*$1 + 7000/1M*$0.10 + 200/1M*$5
    //   = $0.00005 + $0.00070 + $0.00100 = $0.00175
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeCloseTo(0.00175, 6);
  });

  it("accounts for cache_creation_input_tokens at 1.25x base input", () => {
    const cost = estimateHaikuCost(llmResult({
      inputTokens: 50,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheCreationTokens: 6000,
    }));
    // Hand-calc: 50/1M*$1 + 6000/1M*$1.25 + 200/1M*$5
    //   = $0.00005 + $0.00750 + $0.00100 = $0.00855
    expect(cost).toBeCloseTo(0.00855, 6);
    // Without the cache-write term, cost would be only $0.00105.
    // The 8× gap isolates the cache-write contribution.
    expect(cost).toBeGreaterThan(0.005);
  });
});
