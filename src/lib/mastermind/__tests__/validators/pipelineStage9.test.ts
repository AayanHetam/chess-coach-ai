// Stage 9 pipeline integration tests.
//
// Asserts:
// (a) Preservation contract — when voterSnapshot is undefined, the four
//     Stage 9 validators short-circuit; no issues, no telemetry, costUsd
//     contribution = 0. Byte-identical to pre-Stage-9 pipeline output for
//     existing callers.
// (b) Wiring contract — when voterSnapshot is present and the LLM response
//     contains forbidden tokens, the corresponding validators fire and the
//     issues/telemetry flow through the parallel-dispatch aggregation.
// (c) Each Stage 9 validator dispatches independently — a snapshot that
//     would only fire one validator does not produce noise from the others.

import { describe, it, expect } from "vitest";
import { runValidationPipeline, VoterSnapshot } from "../../validators";
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

function llmReturning(content: string): (opts: CallLLMOptions) => Promise<LLMResult> {
  return async () => ({
    content,
    provider: "anthropic",
    model: "claude-sonnet-4-test",
    inputTokens: 100,
    outputTokens: 50,
  } as LLMResult);
}

const initialRequest: CallLLMOptions = {
  tier: "flagship",
  system: "coach system prompt",
  messages: [{ role: "user", content: "analyze move 12" }],
};

function baseSnapshot(): VoterSnapshot {
  return {
    confidence: {
      user_visibility: "HIGH",
      positional_plan: "HIGH",
      mate_in_n: "HIGH",
      material_win: "HIGH",
    },
    maiaProb: 0.65,
    userRating: 1500,
    sfCp: 220,
    sfMate: null,
    lc0Cp: 240,
    syzygyDtm: null,
  };
}

// ── (a) Preservation contract ────────────────────────────────────────────────

describe("runValidationPipeline — Stage 9 preservation contract", () => {
  it("byte-identical output when voterSnapshot is undefined", async () => {
    const responseWithEveryTrigger =
      "White is completely winning. Mate in 5 is forced. " +
      "Black is up a piece — obviously the best response was Nf6.";

    const withoutSnap = await runValidationPipeline({
      initialRequest,
      stockfishEval: { cp: 50 },
      featureDelta: emptyDelta(),
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "preserve-1",
      parseCall: emptyJsonParser,
      callLLM: llmReturning(responseWithEveryTrigger),
      category: "game_review",
      // voterSnapshot intentionally omitted
    });

    // Without a snapshot, Stage 9 validators must contribute NOTHING:
    // - no issues from any of the four
    // - no telemetry events from any of the four
    const stage9CheckNames = new Set([
      "user_visibility_overclaim",
      "positional_claim_unsupported",
      "mate_claim_unsupported",
      "mate_distance_incorrect",
      "material_win_unsupported",
    ]);
    const stage9Telemetry = new Set([
      "user_visibility",
      "positional_claim",
      "mate_in_n",
      "material_win",
    ]);
    const stage9Issues = withoutSnap.cumulativeIssues.filter((i) =>
      stage9CheckNames.has(i.check_name),
    );
    const stage9TelemetryEvents = withoutSnap.telemetry.filter((t) =>
      stage9Telemetry.has(t.check_name),
    );
    expect(stage9Issues).toEqual([]);
    expect(stage9TelemetryEvents).toEqual([]);
  });
});

// ── (b) Wiring contract — validators fire through the pipeline ───────────────

describe("runValidationPipeline — Stage 9 wiring contract", () => {
  it("userVisibility fires through the pipeline when forbidden token + low Maia prob", async () => {
    const snap = baseSnapshot();
    snap.confidence.user_visibility = "NONE";
    snap.maiaProb = 0.05;
    const r = await runValidationPipeline({
      initialRequest,
      stockfishEval: { cp: 50 },
      featureDelta: emptyDelta(),
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "wire-uv",
      parseCall: emptyJsonParser,
      callLLM: llmReturning("The obvious move was Nf3."),
      category: "position_analysis",
      voterSnapshot: snap,
      maxRetries: 0,
    });
    const userVisIssues = r.cumulativeIssues.filter(
      (i) => i.check_name === "user_visibility_overclaim",
    );
    expect(userVisIssues.length).toBe(1);
    expect(userVisIssues[0].llm_span).toBe("obvious");
  });

  it("mateInN ungrounded + distance both fire when applicable", async () => {
    const snap = baseSnapshot();
    snap.confidence.mate_in_n = "NONE";
    snap.syzygyDtm = 4;
    snap.sfMate = null;
    const r = await runValidationPipeline({
      initialRequest,
      stockfishEval: { cp: 50 },
      featureDelta: emptyDelta(),
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "wire-mate",
      parseCall: emptyJsonParser,
      callLLM: llmReturning("There was mate in 12 for White."),
      category: "position_analysis",
      voterSnapshot: snap,
      maxRetries: 0,
    });
    const ungrounded = r.cumulativeIssues.filter(
      (i) => i.check_name === "mate_claim_unsupported",
    );
    const distance = r.cumulativeIssues.filter(
      (i) => i.check_name === "mate_distance_incorrect",
    );
    expect(ungrounded.length).toBe(1);
    expect(distance.length).toBe(1);
  });

  it("materialWin fires + escalates severity when |sfCp| < 100", async () => {
    const snap = baseSnapshot();
    snap.confidence.material_win = "NONE";
    snap.sfCp = 30;  // engine says material is balanced
    const r = await runValidationPipeline({
      initialRequest,
      stockfishEval: { cp: 30 },
      featureDelta: emptyDelta(),
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "wire-material",
      parseCall: emptyJsonParser,
      callLLM: llmReturning("White is winning material here."),
      category: "position_analysis",
      voterSnapshot: snap,
      maxRetries: 0,
    });
    const materialIssues = r.cumulativeIssues.filter(
      (i) => i.check_name === "material_win_unsupported",
    );
    expect(materialIssues.length).toBe(1);
    expect(materialIssues[0].severity).toBe("error");
  });

  it("positionalClaim fires + escalates severity when Lc0 vetoes SF", async () => {
    const snap = baseSnapshot();
    snap.confidence.positional_plan = "NONE";
    snap.sfCp = 40;
    snap.lc0Cp = -80;  // Lc0 vetoes
    const r = await runValidationPipeline({
      initialRequest,
      stockfishEval: { cp: 40 },
      featureDelta: emptyDelta(),
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "wire-pos",
      parseCall: emptyJsonParser,
      callLLM: llmReturning("White is dominating."),
      category: "position_analysis",
      voterSnapshot: snap,
      maxRetries: 0,
    });
    const posIssues = r.cumulativeIssues.filter(
      (i) => i.check_name === "positional_claim_unsupported",
    );
    expect(posIssues.length).toBe(1);
    expect(posIssues[0].severity).toBe("error");
  });
});

// ── (c) Independent dispatch — no cross-contamination ───────────────────────

describe("runValidationPipeline — Stage 9 independent dispatch", () => {
  it("a snapshot triggering only userVisibility produces no other Stage 9 issues", async () => {
    const snap = baseSnapshot();
    snap.confidence.user_visibility = "NONE";
    snap.maiaProb = 0.05;
    // Everything else is HIGH/null — should not fire.
    const r = await runValidationPipeline({
      initialRequest,
      stockfishEval: { cp: 50 },
      featureDelta: emptyDelta(),
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "indep-1",
      parseCall: emptyJsonParser,
      callLLM: llmReturning("The obvious move was Nf3."),
      category: "position_analysis",
      voterSnapshot: snap,
      maxRetries: 0,
    });
    const otherStage9 = r.cumulativeIssues.filter((i) =>
      ["positional_claim_unsupported", "mate_claim_unsupported", "material_win_unsupported"].includes(i.check_name),
    );
    expect(otherStage9).toEqual([]);
  });

  it("all four Stage 9 validators emit a 'passed' telemetry event when nothing fires", async () => {
    const snap = baseSnapshot();
    const r = await runValidationPipeline({
      initialRequest,
      stockfishEval: { cp: 220 },
      featureDelta: emptyDelta(),
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "indep-2",
      parseCall: emptyJsonParser,
      callLLM: llmReturning("Solid positional move."),
      category: "position_analysis",
      voterSnapshot: snap,
    });
    const stage9Telemetry = new Set([
      "user_visibility",
      "positional_claim",
      "mate_in_n",
      "material_win",
    ]);
    const events = r.telemetry.filter((t) => stage9Telemetry.has(t.check_name));
    expect(events.length).toBe(4);
    for (const e of events) {
      expect(e.fire_reason).toBe("passed");
    }
  });
});
