import { describe, it, expect } from "vitest";
import { runValidationPipeline } from "../../validators";
import type { ParserCall } from "../../validators/evalClaim";
import type { CallLLMOptions, LLMResult } from "@/lib/llmProvider";
import { PositionFeatureDelta } from "../../featureDelta";

function emptyDelta(): PositionFeatureDelta {
  return {
    fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    fenAfter: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    resolutionFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    resolutionReason: "quiescent",
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
}

const emptyJsonParser: ParserCall = async () => ({ raw: "[]", costUsd: 0.001 });

function llmReturning(responses: string[]): (opts: CallLLMOptions) => Promise<LLMResult> {
  let i = 0;
  return async () => {
    const content = responses[Math.min(i, responses.length - 1)];
    i++;
    return {
      content,
      provider: "anthropic",
      model: "claude-sonnet-4-test",
      inputTokens: 100,
      outputTokens: 50,
    } as LLMResult;
  };
}

const initialRequest: CallLLMOptions = {
  tier: "flagship",
  system: "coach system prompt",
  messages: [{ role: "user", content: "analyze move 12" }],
};

describe("runValidationPipeline", () => {
  it("returns passed_initial when both validators pass", async () => {
    const r = await runValidationPipeline({
      initialRequest,
      stockfishEval: { cp: 50 },
      featureDelta: emptyDelta(),
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "pipe-1",
      parseCall: emptyJsonParser,
      callLLM: llmReturning(["bland coaching response"]),
    });
    expect(r.finalOutcome).toBe("passed_initial");
    expect(r.cumulativeIssues).toHaveLength(0);
  });

  it("propagates issues from both validators when present in same response", async () => {
    let calls = 0;
    const parser: ParserCall = async ({ system }) => {
      calls++;
      if (system.startsWith("You parse chess analysis prose")) {
        return {
          raw: JSON.stringify([
            {
              stated_band: "winning",
              stated_cp: null,
              supporting_spans: ["Black is winning"],
              confidence: 0.95,
              claim_class: "evaluative",
              perspective: "black",
            },
          ]),
          costUsd: 0.001,
        };
      }
      return {
        raw: JSON.stringify([
          {
            claim_text: "you lost the bishop pair",
            claim_type: "lost_bishop_pair",
            expected_in_delta: { side: "white" },
            claim_class: "factual_delta_claim",
            confidence: 0.95,
          },
        ]),
        costUsd: 0.001,
      };
    };
    const r = await runValidationPipeline({
      initialRequest,
      stockfishEval: { cp: 50 },
      featureDelta: emptyDelta(),
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "pipe-2",
      parseCall: parser,
      callLLM: llmReturning(["bad", "bad", "bad"]),
    });
    expect(r.finalOutcome).toBe("fallback_used");
    expect(calls).toBeGreaterThanOrEqual(2);
    const checkNames = new Set(r.cumulativeIssues.map((i) => i.check_name));
    expect(checkNames.has("eval_mismatch_qualitative")).toBe(true);
    expect(checkNames.has("feature_citation_unsupported")).toBe(true);
  });

  it("correlation_id threads through all telemetry events", async () => {
    const r = await runValidationPipeline({
      initialRequest,
      stockfishEval: { cp: 50 },
      featureDelta: emptyDelta(),
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "pipe-corr-3",
      parseCall: emptyJsonParser,
      callLLM: llmReturning(["fine"]),
    });
    expect(r.telemetry.length).toBeGreaterThan(0);
    for (const event of r.telemetry) {
      expect(event.context.correlation_id).toBe("pipe-corr-3");
    }
  });

  it("aggregates costUsd across LLM calls and parser calls", async () => {
    const r = await runValidationPipeline({
      initialRequest,
      stockfishEval: { cp: 50 },
      featureDelta: emptyDelta(),
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "pipe-4",
      parseCall: emptyJsonParser,
      callLLM: llmReturning(["fine"]),
    });
    expect(r.totalCostUsd).toBeGreaterThan(0);
  });

  it("every telemetry event has the required fields", async () => {
    const r = await runValidationPipeline({
      initialRequest,
      stockfishEval: { cp: 50 },
      featureDelta: emptyDelta(),
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "pipe-5",
      parseCall: emptyJsonParser,
      callLLM: llmReturning(["fine"]),
    });
    for (const e of r.telemetry) {
      expect(e.check_name).toBeTruthy();
      expect(e.fire_reason).toBeTruthy();
      expect(typeof e.retry_count).toBe("number");
      expect(typeof e.timestamp_ms).toBe("number");
      expect(e.context.correlation_id).toBeTruthy();
    }
  });
});
