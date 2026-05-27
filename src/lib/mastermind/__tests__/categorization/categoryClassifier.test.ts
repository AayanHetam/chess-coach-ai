import { describe, it, expect } from "vitest";
import {
  classifyQuestion,
  CategorizedQuestion,
  DEFAULT_LOW_CONFIDENCE_CATEGORY,
  CLASSIFIER_LOW_CONFIDENCE_THRESHOLD,
  QUESTION_CATEGORIES,
  isQuestionCategory,
  estimateHaikuCost,
} from "../../categorization/categoryClassifier";
import type { LLMResult } from "@/lib/llmProvider";
import { ParserCall } from "../../validators/evalClaim";

function mockParser(response: CategorizedQuestion): ParserCall {
  return async () => ({ raw: JSON.stringify(response), costUsd: 0.001 });
}

function rawParser(raw: string): ParserCall {
  return async () => ({ raw, costUsd: 0.001 });
}

describe("classifyQuestion — six categories happy path", () => {
  it("game_review high-confidence passes through", async () => {
    const r = await classifyQuestion({
      question: "Why did I lose this rook ending?",
      parseCall: mockParser({
        category: "game_review",
        confidence: 0.95,
        rationale: "user references their specific game",
      }),
    });
    expect(r.category).toBe("game_review");
    expect(r.confidence).toBe(0.95);
  });

  it("opponent_prep", async () => {
    const r = await classifyQuestion({
      question: "What does my opponent like to play vs the Najdorf?",
      parseCall: mockParser({
        category: "opponent_prep",
        confidence: 0.92,
        rationale: "asks about another player's tendencies",
      }),
    });
    expect(r.category).toBe("opponent_prep");
  });

  it("position_analysis", async () => {
    const r = await classifyQuestion({
      question: "Is +1.5 winning here?",
      parseCall: mockParser({
        category: "position_analysis",
        confidence: 0.88,
        rationale: "specific position evaluation",
      }),
    });
    expect(r.category).toBe("position_analysis");
  });

  it("concept_explanation", async () => {
    const r = await classifyQuestion({
      question: "What's an outpost?",
      parseCall: mockParser({
        category: "concept_explanation",
        confidence: 0.97,
        rationale: "abstract concept definition",
      }),
    });
    expect(r.category).toBe("concept_explanation");
  });

  it("improvement_strategy", async () => {
    const r = await classifyQuestion({
      question: "How do I get to 1800?",
      parseCall: mockParser({
        category: "improvement_strategy",
        confidence: 0.9,
        rationale: "asks about study direction",
      }),
    });
    expect(r.category).toBe("improvement_strategy");
  });

  it("meta_motivational", async () => {
    const r = await classifyQuestion({
      question: "I keep losing the same way, am I plateaued?",
      parseCall: mockParser({
        category: "meta_motivational",
        confidence: 0.85,
        rationale: "frustration / progress",
      }),
    });
    expect(r.category).toBe("meta_motivational");
  });
});

describe("classifyQuestion — low confidence routes to default", () => {
  it("confidence below threshold routes to meta_motivational", async () => {
    const r = await classifyQuestion({
      question: "Should I trade queens here or study endgames?",
      parseCall: mockParser({
        category: "position_analysis",
        confidence: 0.3,
        rationale: "ambiguous between position & strategy",
      }),
    });
    expect(r.category).toBe(DEFAULT_LOW_CONFIDENCE_CATEGORY);
    expect(r.confidence).toBe(0.3);
    expect(r.rationale).toContain("low_confidence_default");
    expect(r.rationale).toContain("position_analysis");
  });

  it("custom threshold overrides the default", async () => {
    const r = await classifyQuestion({
      question: "edge case",
      parseCall: mockParser({
        category: "game_review",
        confidence: 0.6,
        rationale: "ok",
      }),
      lowConfidenceThreshold: 0.7,
    });
    expect(r.category).toBe(DEFAULT_LOW_CONFIDENCE_CATEGORY);
    expect(r.confidence).toBe(0.6);
  });

  it("confidence exactly at threshold does NOT default (>=)", async () => {
    const r = await classifyQuestion({
      question: "boundary case",
      parseCall: mockParser({
        category: "game_review",
        confidence: CLASSIFIER_LOW_CONFIDENCE_THRESHOLD,
        rationale: "at boundary",
      }),
    });
    expect(r.category).toBe("game_review");
  });

  it("very low confidence preserves the original parser's confidence value", async () => {
    const r = await classifyQuestion({
      question: "??",
      parseCall: mockParser({
        category: "concept_explanation",
        confidence: 0.1,
        rationale: "very unsure",
      }),
    });
    expect(r.category).toBe(DEFAULT_LOW_CONFIDENCE_CATEGORY);
    expect(r.confidence).toBe(0.1);
  });
});

describe("classifyQuestion — malformed parser output", () => {
  it("malformed JSON falls to default with sentinel rationale", async () => {
    const r = await classifyQuestion({
      question: "anything",
      parseCall: rawParser("definitely not json"),
    });
    expect(r.category).toBe(DEFAULT_LOW_CONFIDENCE_CATEGORY);
    expect(r.confidence).toBe(0);
    expect(r.rationale).toBe("parser_json_invalid_or_unknown_category");
  });

  it("empty parser output falls to default", async () => {
    const r = await classifyQuestion({
      question: "anything",
      parseCall: rawParser(""),
    });
    expect(r.category).toBe(DEFAULT_LOW_CONFIDENCE_CATEGORY);
  });

  it("unknown category in JSON falls to default", async () => {
    const r = await classifyQuestion({
      question: "anything",
      parseCall: rawParser(
        JSON.stringify({
          category: "made_up_category",
          confidence: 0.9,
          rationale: "??",
        })
      ),
    });
    expect(r.category).toBe(DEFAULT_LOW_CONFIDENCE_CATEGORY);
  });

  it("out-of-range confidence (>1) falls to default", async () => {
    const r = await classifyQuestion({
      question: "anything",
      parseCall: rawParser(
        JSON.stringify({ category: "game_review", confidence: 1.5, rationale: "??" })
      ),
    });
    expect(r.category).toBe(DEFAULT_LOW_CONFIDENCE_CATEGORY);
  });

  it("out-of-range confidence (negative) falls to default", async () => {
    const r = await classifyQuestion({
      question: "anything",
      parseCall: rawParser(
        JSON.stringify({ category: "game_review", confidence: -0.1, rationale: "??" })
      ),
    });
    expect(r.category).toBe(DEFAULT_LOW_CONFIDENCE_CATEGORY);
  });

  it("missing rationale field is accepted (rationale defaults to empty string)", async () => {
    const r = await classifyQuestion({
      question: "anything",
      parseCall: rawParser(
        JSON.stringify({ category: "game_review", confidence: 0.9 })
      ),
    });
    expect(r.category).toBe("game_review");
    expect(r.rationale).toBe("");
  });

  it("non-string category falls to default", async () => {
    const r = await classifyQuestion({
      question: "anything",
      parseCall: rawParser(
        JSON.stringify({ category: 42, confidence: 0.9, rationale: "??" })
      ),
    });
    expect(r.category).toBe(DEFAULT_LOW_CONFIDENCE_CATEGORY);
  });

  it("array (not object) at top level falls to default", async () => {
    const r = await classifyQuestion({
      question: "anything",
      parseCall: rawParser(JSON.stringify(["not an object"])),
    });
    expect(r.category).toBe(DEFAULT_LOW_CONFIDENCE_CATEGORY);
  });

  it("fenced JSON in markdown code block is parsed correctly", async () => {
    const fenced =
      "```json\n" +
      JSON.stringify({ category: "game_review", confidence: 0.9, rationale: "ok" }) +
      "\n```";
    const r = await classifyQuestion({
      question: "anything",
      parseCall: rawParser(fenced),
    });
    expect(r.category).toBe("game_review");
  });

  it("plain fenced block (no language tag) is parsed correctly", async () => {
    const fenced =
      "```\n" +
      JSON.stringify({ category: "opponent_prep", confidence: 0.85, rationale: "ok" }) +
      "\n```";
    const r = await classifyQuestion({
      question: "anything",
      parseCall: rawParser(fenced),
    });
    expect(r.category).toBe("opponent_prep");
  });
});

describe("classifyQuestion — parser invocation contract", () => {
  it("calls parseCall with the cached system prompt + a Question-prefixed user turn", async () => {
    let capturedSystem = "";
    let capturedUser = "";
    const parser: ParserCall = async ({ system, user }) => {
      capturedSystem = system;
      capturedUser = user;
      return {
        raw: JSON.stringify({
          category: "game_review",
          confidence: 0.9,
          rationale: "ok",
        }),
        costUsd: 0.001,
      };
    };
    await classifyQuestion({
      question: "Why did I lose this rook ending?",
      parseCall: parser,
    });
    expect(capturedSystem).toContain("six categories");
    expect(capturedSystem).toContain("game_review");
    expect(capturedSystem).toContain("CONFIDENCE GUIDE");
    expect(capturedUser).toContain("Question:");
    expect(capturedUser).toContain("Why did I lose this rook ending?");
  });
});

describe("QUESTION_CATEGORIES + isQuestionCategory", () => {
  it("exports all six categories", () => {
    expect(QUESTION_CATEGORIES).toHaveLength(6);
    expect(QUESTION_CATEGORIES).toEqual(
      expect.arrayContaining([
        "game_review",
        "opponent_prep",
        "position_analysis",
        "concept_explanation",
        "improvement_strategy",
        "meta_motivational",
      ])
    );
  });

  it("type-narrows known categories", () => {
    expect(isQuestionCategory("game_review")).toBe(true);
    expect(isQuestionCategory("meta_motivational")).toBe(true);
    expect(isQuestionCategory("made_up")).toBe(false);
    expect(isQuestionCategory("")).toBe(false);
  });
});

describe("classifyQuestion — seed fixture coverage", () => {
  it("seed fixture is well-formed JSON with all six categories represented", async () => {
    const fixture = await import("./fixtures/category-seed-examples.json");
    const data = (fixture as { default: unknown }).default as {
      categories: Record<string, string[]>;
      ambiguous_examples: Array<{ question: string; expected_outcome: string }>;
    };
    for (const cat of QUESTION_CATEGORIES) {
      expect(data.categories[cat]).toBeDefined();
      expect(data.categories[cat].length).toBeGreaterThanOrEqual(5);
    }
    expect(data.ambiguous_examples.length).toBeGreaterThanOrEqual(3);
  });
});

// Regression for the cost-calc bug fixed alongside this test: prior
// formula was inputUncached = (inputTokens - cacheRead), which goes
// negative when cache_read_input_tokens > input_tokens (the normal
// case for the cache-warm classifier system prompt). Per Anthropic's
// docs, input_tokens is ALREADY the uncached portion; subtracting
// cacheRead double-counts. Also: cache_creation_input_tokens was
// previously ignored entirely.
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
    expect(cost).toBeGreaterThan(0.005);
  });
});
