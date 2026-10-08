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
        claim({
          stated_band: "winning",
          perspective: "black",
          supporting_spans: ["Black is winning"],
        }),
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
      parseCall: mockParser([
        claim({ stated_band: "slightly_better", perspective: "white" }),
      ]),
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
        claim({
          stated_band: "much_better",
          stated_cp: 150,
          perspective: "white",
        }),
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
    expect(r.issues.some((i) => i.check_name === "eval_mismatch_numeric")).toBe(
      true
    );
  });
});

describe("validateEvalClaim — adjacent-band tolerance (20 cp)", () => {
  it("Stockfish +55 (slightly_better, 5 cp from boundary), LLM 'roughly equal' → passes (tolerated)", async () => {
    const r = await validateEvalClaim({
      llmResponse: "Roughly equal.",
      stockfishEval: { cp: 55 },
      playerPerspective: "white",
      correlationId: "test-5",
      parseCall: mockParser([
        claim({ stated_band: "equal", perspective: "white" }),
      ]),
    });
    expect(r.passed).toBe(true);
  });

  it("Stockfish +55, LLM 'much better' (skip-one, no tolerance) → fires", async () => {
    const r = await validateEvalClaim({
      llmResponse: "White is much better.",
      stockfishEval: { cp: 55 },
      playerPerspective: "white",
      correlationId: "test-6",
      parseCall: mockParser([
        claim({ stated_band: "much_better", perspective: "white" }),
      ]),
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
        claim({
          stated_band: "winning",
          perspective: "black",
          supporting_spans: ["forced mate"],
        }),
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
        claim({
          stated_band: "slightly_worse",
          perspective: "black",
          confidence: 0.6,
        }),
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
        claim({
          stated_band: "winning",
          perspective: "black",
          claim_class: "metaphorical",
        }),
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
    expect(
      r.telemetry.some((e) => e.fire_reason === "parser_json_invalid")
    ).toBe(true);
  });

  it("Parser returns claims with confidence below threshold → skipped", async () => {
    const r = await validateEvalClaim({
      llmResponse: "Maybe Black is better, hard to tell.",
      stockfishEval: { cp: 50 },
      playerPerspective: "white",
      correlationId: "test-conf-low",
      parseCall: mockParser([
        claim({
          stated_band: "winning",
          perspective: "black",
          confidence: 0.3,
        }),
      ]),
    });
    expect(r.passed).toBe(true);
    expect(
      r.telemetry.some((e) => e.fire_reason === "parser_low_confidence")
    ).toBe(true);
  });

  // 2026-05-30 fix-historical-claims: game-review prose routinely cites
  // past-position evaluations ("Black was winning at move 24"). Parser
  // tags those claim_class: "historical"; validator skips with explicit
  // skip_historical_claim telemetry instead of silently dropping.
  it("Parser returns historical claim → skipped with skip_historical_claim telemetry", async () => {
    const r = await validateEvalClaim({
      llmResponse:
        "Black was winning at move 24, but the position is roughly equal now.",
      stockfishEval: { cp: 20 }, // current position: equal
      playerPerspective: "white",
      correlationId: "test-historical",
      // Parser returns two claims — one historical (about move 24),
      // one current (about now). Validator should skip the historical
      // and validate only the current.
      parseCall: mockParser([
        claim({
          stated_band: "winning",
          perspective: "black",
          confidence: 0.9,
          claim_class: "historical",
          supporting_spans: ["Black was winning at move 24"],
        }),
        claim({
          stated_band: "equal",
          perspective: "white",
          confidence: 0.9,
          claim_class: "evaluative",
          supporting_spans: ["roughly equal now"],
        }),
      ]),
    });
    // The historical claim "Black was winning" would have fired (Black
    // winning vs equal is non-adjacent → no tolerance). With the skip,
    // no fires; only telemetry.
    expect(r.passed).toBe(true);
    expect(r.issues).toEqual([]);
    expect(
      r.telemetry.some((e) => e.fire_reason === "skip_historical_claim")
    ).toBe(true);
    // The current-position claim ("equal" vs +20 cp = equal) passes.
    expect(r.telemetry.some((e) => e.fire_reason === "passed")).toBe(true);
  });
});

describe("validateEvalClaim — adversarial metaphorical prose (§11.1)", () => {
  it("'Black's pieces are dancing around the kingside' → parser classifies metaphorical, no fire", async () => {
    const r = await validateEvalClaim({
      llmResponse:
        "Black's pieces are dancing around the kingside, creating chaos.",
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
    expect(r.telemetry.some((e) => e.fire_reason === "no_stockfish_eval")).toBe(
      false
    );
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
    expect(r.telemetry.some((e) => e.fire_reason === "no_stockfish_eval")).toBe(
      false
    );
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
    const cost = estimateHaikuCost(
      llmResult({
        inputTokens: 50,
        outputTokens: 200,
        cacheReadTokens: 7000,
      })
    );
    // Hand-calc: 50/1M*$1 + 7000/1M*$0.10 + 200/1M*$5
    //   = $0.00005 + $0.00070 + $0.00100 = $0.00175
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeCloseTo(0.00175, 6);
  });

  it("accounts for cache_creation_input_tokens at 1.25x base input", () => {
    const cost = estimateHaikuCost(
      llmResult({
        inputTokens: 50,
        outputTokens: 200,
        cacheReadTokens: 0,
        cacheCreationTokens: 6000,
      })
    );
    // Hand-calc: 50/1M*$1 + 6000/1M*$1.25 + 200/1M*$5
    //   = $0.00005 + $0.00750 + $0.00100 = $0.00855
    expect(cost).toBeCloseTo(0.00855, 6);
    // Without the cache-write term, cost would be only $0.00105.
    // The 8× gap isolates the cache-write contribution.
    expect(cost).toBeGreaterThan(0.005);
  });
});

describe("validateEvalClaim — a verified what-if's own numbers (positionEvals)", () => {
  // Fixture 07 at move 8: the game played 8. Nc7+ (the review has the
  // position after it at -2.11); the client's search scored 8. Qxc1 at
  // +2.51 and 8. Nc7+ at -0.97 side by side.
  const whatIf = [
    { san: "Qxc1", cp: 251 },
    { san: "Nc7+", cp: -97 },
  ];
  const base = {
    llmResponse: "",
    stockfishEval: { cp: -211 },
    playerPerspective: "white" as const,
    moveSan: "Nc7+",
    correlationId: "what-if",
  };

  it("a correct number about the alternative is no longer checked against the played move's eval", async () => {
    const parseCall = mockParser([
      claim({
        stated_band: "much_better",
        stated_cp: 251,
        supporting_spans: ["8. Qxc1 keeps White at +2.51"],
      }),
    ]);
    // Today's defect: flagged against the played move's -2.11.
    const before = await validateEvalClaim({ ...base, parseCall });
    expect(before.passed).toBe(false);
    expect(before.issues.map((i) => i.check_name)).toContain(
      "eval_mismatch_numeric"
    );
    const after = await validateEvalClaim({
      ...base,
      parseCall,
      positionEvals: whatIf,
    });
    expect(after.passed).toBe(true);
    expect(after.issues).toEqual([]);
  });

  it("a wrong number about the alternative is still caught, against the alternative's own number", async () => {
    const r = await validateEvalClaim({
      ...base,
      positionEvals: whatIf,
      parseCall: mockParser([
        claim({
          stated_band: "losing",
          stated_cp: -900,
          supporting_spans: ["8. Qxc1 keeps the game at -9.00"],
        }),
      ]),
    });
    expect(r.passed).toBe(false);
    const numeric = r.issues.find(
      (i) => i.check_name === "eval_mismatch_numeric"
    )!;
    expect(numeric.expected).toEqual({ cp: 251 });
    expect(numeric.detail).toContain("about Qxc1");
  });

  it("the played move's number from either search passes, its check sign or not", async () => {
    for (const [cp, span] of [
      [-211, "after 8. Nc7+ White is at -2.11"],
      [-97, "8. Nc7 comes out at -0.97"],
    ] as const) {
      const r = await validateEvalClaim({
        ...base,
        positionEvals: whatIf,
        parseCall: mockParser([
          claim({
            stated_band: cp <= -150 ? "much_worse" : "slightly_worse",
            stated_cp: cp,
            supporting_spans: [span],
          }),
        ]),
      });
      expect(r.passed, span).toBe(true);
    }
  });

  it("the played move's number pinned on the alternative is caught", async () => {
    const r = await validateEvalClaim({
      ...base,
      positionEvals: whatIf,
      parseCall: mockParser([
        claim({
          stated_band: "much_worse",
          stated_cp: -211,
          supporting_spans: ["8. Qxc1 drops White to -2.11"],
        }),
      ]),
    });
    expect(r.passed).toBe(false);
  });

  it("a claim naming no what-if move is checked as before, and without positionEvals nothing changes", async () => {
    const parseCall = mockParser([
      claim({
        stated_band: "much_better",
        stated_cp: 251,
        supporting_spans: ["White is clearly better here"],
      }),
    ]);
    const withMap = await validateEvalClaim({
      ...base,
      parseCall,
      positionEvals: whatIf,
    });
    const without = await validateEvalClaim({ ...base, parseCall });
    expect(withMap.passed).toBe(false);
    expect(withMap.issues).toEqual(without.issues);
    expect(withMap.telemetry.map((t) => t.fire_reason)).toEqual(
      without.telemetry.map((t) => t.fire_reason)
    );
  });

  it("a Black what-if's number reads White-relative from either perspective", async () => {
    // After 9. Nxa8 Black played 9... Qxd1+ (the review: -2.00, Black
    // winning); 9... Qa3 scored +1.50 for White. "Black at -1.50" is that.
    const black = {
      ...base,
      moveSan: "Qxd1+",
      stockfishEval: { cp: -200 },
      playerPerspective: "black" as const,
      parseCall: mockParser([
        claim({
          stated_band: "much_worse",
          stated_cp: -150,
          perspective: "black",
          supporting_spans: ["9... Qa3 leaves Black at -1.50"],
        }),
      ]),
    };
    expect((await validateEvalClaim(black)).passed).toBe(false);
    const withRefs = (qa3: number) =>
      validateEvalClaim({
        ...black,
        positionEvals: [
          { san: "Qa3", cp: qa3 },
          { san: "Qxd1+", cp: -190 },
        ],
      });
    expect((await withRefs(150)).passed).toBe(true);
    // The other sign is the other side's number: caught.
    expect((await withRefs(-150)).passed).toBe(false);
  });

  it("a span naming two moves is checked as before: which move a figure belongs to is not guessed", async () => {
    const run = (claims: ParsedEvalClaim[], positionEvals?: typeof whatIf) =>
      validateEvalClaim({
        ...base,
        positionEvals,
        parseCall: mockParser(claims),
      });
    const one = (
      span: string,
      cp: number,
      band: ParsedEvalClaim["stated_band"]
    ) => claim({ stated_band: band, stated_cp: cp, supporting_spans: [span] });
    for (const claims of [
      // The played move's number on the alternative, the other named first.
      [
        one(
          "Rather than 8. Nc7+, 8. Qxc1 leaves White at -0.97",
          -97,
          "slightly_worse"
        ),
      ],
      // A pair that swaps the two numbers, and a pair that gets them right.
      [
        one(
          "Here 8. Qxc1 only reaches -0.97 while 8. Nc7+ keeps +2.51",
          -97,
          "slightly_worse"
        ),
        one(
          "Here 8. Qxc1 only reaches -0.97 while 8. Nc7+ keeps +2.51",
          251,
          "much_better"
        ),
      ],
      [
        one(
          "Here 8. Qxc1 reaches +2.51 while 8. Nc7+ only keeps -0.97",
          251,
          "much_better"
        ),
        one(
          "Here 8. Qxc1 reaches +2.51 while 8. Nc7+ only keeps -0.97",
          -97,
          "slightly_worse"
        ),
      ],
      // The game's move with the alternative in a parenthetical.
      [
        one(
          "8. Nc7+ (rather than 8. Qxc1) drops White to -2.11",
          -211,
          "much_worse"
        ),
      ],
    ]) {
      const withIt = await run(claims, whatIf);
      const without = await run(claims);
      expect(withIt.issues, claims[0].supporting_spans[0]).toEqual(
        without.issues
      );
    }
    // The wrong ones are caught that way too.
    expect(
      (
        await run(
          [
            one(
              "Rather than 8. Nc7+, 8. Qxc1 leaves White at -0.97",
              -97,
              "slightly_worse"
            ),
          ],
          whatIf
        )
      ).passed
    ).toBe(false);
  });

  it("a numbered mention names a what-if move only at its own number, and a bare one not when the game played that SAN elsewhere", async () => {
    // Fixture 07: Black's 7... Qxc1 and White's what-if 8. Qxc1 share a SAN.
    const at8 = [
      {
        san: "Qxc1",
        cp: 251,
        moveNumber: 8,
        color: "w" as const,
        playedElsewhere: true,
      },
      { san: "Nc7+", cp: -97, moveNumber: 8, color: "w" as const },
    ];
    const say = (
      span: string,
      cp: number,
      band: ParsedEvalClaim["stated_band"]
    ) => [
      claim({ stated_band: band, stated_cp: cp, supporting_spans: [span] }),
    ];
    for (const claims of [
      say("after 7... Qxc1 White is at -2.11", -211, "much_worse"),
      say("Qxc1 keeps White at +2.51", 251, "much_better"),
    ]) {
      const withIt = await validateEvalClaim({
        ...base,
        positionEvals: at8,
        parseCall: mockParser(claims),
      });
      const without = await validateEvalClaim({
        ...base,
        parseCall: mockParser(claims),
      });
      expect(withIt.issues, claims[0].supporting_spans[0]).toEqual(
        without.issues
      );
    }
    // Numbered at its own number, it is the what-if's move.
    expect(
      (
        await validateEvalClaim({
          ...base,
          positionEvals: at8,
          parseCall: mockParser(
            say("8. Qxc1 keeps White at +2.51", 251, "much_better")
          ),
        })
      ).passed
    ).toBe(true);
  });

  it("a piece move written with another disambiguation is not the what-if's move", async () => {
    const claims = [
      claim({
        stated_band: "equal",
        stated_cp: 30,
        supporting_spans: ["Nfd2 keeps it level at +0.30"],
      }),
    ];
    const withIt = await validateEvalClaim({
      ...base,
      positionEvals: [
        { san: "Nbd2", cp: 30 },
        { san: "Nc7+", cp: -97 },
      ],
      parseCall: mockParser(claims),
    });
    const without = await validateEvalClaim({
      ...base,
      parseCall: mockParser(claims),
    });
    expect(withIt.issues).toEqual(without.issues);
  });

  it("the figure and the band are checked against the same number", async () => {
    // +0.40 is the review's figure for 8. Qxc1, but "much better" is not
    // what +0.40 is: the claim does not get the band from the cold +2.51.
    const r = await validateEvalClaim({
      ...base,
      positionEvals: [
        { san: "Qxc1", cp: 251, review: { cp: 40 } },
        { san: "Nc7+", cp: -97 },
      ],
      parseCall: mockParser([
        claim({
          stated_band: "much_better",
          stated_cp: 40,
          supporting_spans: ["8. Qxc1 is much better for White at +0.40"],
        }),
      ]),
    });
    expect(r.issues.map((i) => i.check_name)).toEqual([
      "eval_mismatch_qualitative",
    ]);
  });

  it("a move's review number is a reference beside its cold one: the review's best keeps the review's figure", async () => {
    // The review rates 8. Qxc1 +0.40 (its eval before the move) and the
    // position after 8. Nc7+ +0.20; the cold search has +0.95 and +0.10.
    const quiet = {
      ...base,
      stockfishEval: { cp: 20 },
      positionEvals: [
        { san: "Qxc1", cp: 95, review: { cp: 40 } },
        { san: "Nc7+", cp: 10, review: { cp: 20 } },
      ],
    };
    const say = (cp: number, band: ParsedEvalClaim["stated_band"]) =>
      validateEvalClaim({
        ...quiet,
        parseCall: mockParser([
          claim({
            stated_band: band,
            stated_cp: cp,
            supporting_spans: [
              `The engine line 8. Qxc1 Rb8 keeps the game at ${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)} for White`,
            ],
          }),
        ]),
      });
    expect((await say(40, "equal")).passed).toBe(true);
    expect((await say(95, "slightly_better")).passed).toBe(true);
    expect((await say(300, "much_better")).passed).toBe(false);
  });

  it("O-O is never read inside O-O-O, and 0-0 is O-O", async () => {
    const castles = {
      ...base,
      moveSan: "O-O-O",
      stockfishEval: { cp: -160 },
      positionEvals: [
        { san: "O-O", cp: 200 },
        { san: "O-O-O", cp: -150, review: { cp: -160 } },
      ],
    };
    const say = (span: string, cp: number) =>
      validateEvalClaim({
        ...castles,
        parseCall: mockParser([
          claim({
            stated_band: cp > 0 ? "much_better" : "much_worse",
            stated_cp: cp,
            supporting_spans: [span],
          }),
        ]),
      });
    expect((await say("O-O-O keeps White at +2.00", 200)).passed).toBe(false);
    expect((await say("O-O-O left White at -1.50", -150)).passed).toBe(true);
    expect((await say("O-O keeps White at +2.00", 200)).passed).toBe(true);
    expect((await say("0-0 keeps White at +2.00", 200)).passed).toBe(true);
  });

  it("a pawn push is a move only when numbered or cued, never a square", async () => {
    const knight = {
      ...base,
      moveSan: "Nd5",
      stockfishEval: { cp: -200 },
      positionEvals: [
        { san: "d5", cp: 60 },
        { san: "Nd5", cp: -180, review: { cp: -200 } },
      ],
    };
    const say = (span: string, cp: number) =>
      validateEvalClaim({
        ...knight,
        parseCall: mockParser([
          claim({
            stated_band: cp > 0 ? "slightly_better" : "much_worse",
            stated_cp: cp,
            supporting_spans: [span],
          }),
        ]),
      });
    // The square: the played move's numbers, as before.
    expect(
      (await say("with the knight on d5 White is -2.00", -200)).passed
    ).toBe(true);
    expect((await say("with the knight on d5 White is +0.60", 60)).passed).toBe(
      false
    );
    // The move: its own number.
    expect((await say("pushing d5 gives White +0.60", 60)).passed).toBe(true);
    expect((await say("4. d5 gives White +0.60", 60)).passed).toBe(true);
  });

  it("a piece move written without its disambiguation is the one move it can be", async () => {
    const r = await validateEvalClaim({
      ...base,
      positionEvals: [
        { san: "Nbd2", cp: 30 },
        { san: "Nc7+", cp: -97 },
      ],
      parseCall: mockParser([
        claim({
          stated_band: "equal",
          stated_cp: 30,
          supporting_spans: ["Nd2 keeps it level at +0.30"],
        }),
      ]),
    });
    expect(r.passed).toBe(true);
  });

  it("a band-only claim about the played move is told the review's number first", async () => {
    const r = await validateEvalClaim({
      ...base,
      positionEvals: whatIf,
      parseCall: mockParser([
        claim({
          stated_band: "winning",
          stated_cp: null,
          supporting_spans: ["8. Nc7+ is winning for White"],
        }),
      ]),
    });
    const band = r.issues.find(
      (i) => i.check_name === "eval_mismatch_qualitative"
    )!;
    expect(band.expected).toEqual({ band: "much_worse", cp: -211 });
  });
});
