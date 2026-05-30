import { describe, it, expect } from "vitest";
import { validateFeatureDeltaCitations } from "../../validators/featureDeltaCitation";
import { ParserCall } from "../../validators/evalClaim";
import { ParsedFeatureClaim } from "../../validators/types";
import { PositionFeatureDelta } from "../../featureDelta";
import { RoleChange } from "../../pieceRoles";

function mockParser(claims: ParsedFeatureClaim[]): ParserCall {
  return async () => ({ raw: JSON.stringify(claims), costUsd: 0.001 });
}

function emptyDelta(overrides: Partial<PositionFeatureDelta> = {}): PositionFeatureDelta {
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
    ...overrides,
  };
}

function claim(overrides: Partial<ParsedFeatureClaim> = {}): ParsedFeatureClaim {
  return {
    claim_text: "mock claim",
    claim_type: "material_change",
    expected_in_delta: {},
    claim_class: "factual_delta_claim",
    confidence: 0.9,
    ...overrides,
  };
}

describe("validateFeatureDeltaCitations — bishop pair", () => {
  it("'you lost the bishop pair' + actual capture → passes", async () => {
    const delta = emptyDelta({
      fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      resolutionFen: "rn1qkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
      materialDelta: { white: 0, black: -3 },
      isEmptyDelta: false,
    });
    const r = await validateFeatureDeltaCitations({
      llmResponse: "you lost the bishop pair",
      featureDelta: delta,
      pieceRoleDiff: [],
      playerPerspective: "black",
      correlationId: "bp-1",
      parseCall: mockParser([
        claim({
          claim_text: "you lost the bishop pair",
          claim_type: "lost_bishop_pair",
          expected_in_delta: { side: "black" },
        }),
      ]),
    });
    expect(r.passed).toBe(true);
  });

  it("'you lost the bishop pair' + both bishops still present → fires", async () => {
    const delta = emptyDelta();
    const r = await validateFeatureDeltaCitations({
      llmResponse: "you lost the bishop pair",
      featureDelta: delta,
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "bp-2",
      parseCall: mockParser([
        claim({
          claim_text: "you lost the bishop pair",
          claim_type: "lost_bishop_pair",
          expected_in_delta: { side: "white" },
        }),
      ]),
    });
    expect(r.passed).toBe(false);
    expect(r.issues[0].check_name).toBe("feature_citation_unsupported");
  });
});

describe("validateFeatureDeltaCitations — passed pawn", () => {
  it("'new passed pawn on b5' + delta has b5 in passedPawnsGained.white → passes", async () => {
    const delta = emptyDelta({
      pawnStructureDelta: {
        ...emptyDelta().pawnStructureDelta,
        passedPawnsGained: { white: ["b5"], black: [] },
      },
    });
    const r = await validateFeatureDeltaCitations({
      llmResponse: "White has a new passed pawn on b5",
      featureDelta: delta,
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "pp-1",
      parseCall: mockParser([
        claim({
          claim_text: "passed pawn on b5",
          claim_type: "new_passed_pawn",
          expected_in_delta: { side: "white", square: "b5" },
        }),
      ]),
    });
    expect(r.passed).toBe(true);
  });

  it("'new passed pawn on b5' + delta has b5 in passedPawnsLost (wrong direction) → fires", async () => {
    const delta = emptyDelta({
      pawnStructureDelta: {
        ...emptyDelta().pawnStructureDelta,
        passedPawnsLost: { white: ["b5"], black: [] },
      },
    });
    const r = await validateFeatureDeltaCitations({
      llmResponse: "White has a new passed pawn on b5",
      featureDelta: delta,
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "pp-2",
      parseCall: mockParser([
        claim({
          claim_text: "passed pawn on b5",
          claim_type: "new_passed_pawn",
          expected_in_delta: { side: "white", square: "b5" },
        }),
      ]),
    });
    expect(r.passed).toBe(false);
  });
});

describe("validateFeatureDeltaCitations — king safety", () => {
  it("'Black's king became unsafe' + kingSafetyDelta.black < 0 → passes", async () => {
    const delta = emptyDelta({ kingSafetyDelta: { white: 0, black: -15 } });
    const r = await validateFeatureDeltaCitations({
      llmResponse: "Black's king became unsafe",
      featureDelta: delta,
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "ks-1",
      parseCall: mockParser([
        claim({
          claim_text: "Black's king became unsafe",
          claim_type: "king_safety_change",
          expected_in_delta: { side: "black", direction: "decrease" },
        }),
      ]),
    });
    expect(r.passed).toBe(true);
  });

  it("'Black's king became unsafe' + kingSafetyDelta.black > 0 → fires", async () => {
    const delta = emptyDelta({ kingSafetyDelta: { white: 0, black: 10 } });
    const r = await validateFeatureDeltaCitations({
      llmResponse: "Black's king became unsafe",
      featureDelta: delta,
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "ks-2",
      parseCall: mockParser([
        claim({
          claim_text: "Black's king became unsafe",
          claim_type: "king_safety_change",
          expected_in_delta: { side: "black", direction: "decrease" },
        }),
      ]),
    });
    expect(r.passed).toBe(false);
  });
});

describe("validateFeatureDeltaCitations — piece roles", () => {
  it("'your knight became overworked' + role diff has knight gaining overworked → passes", async () => {
    const roleDiff: RoleChange[] = [
      { square: "e4", piece: "n", color: "w", gained: ["overworked"], lost: [] },
    ];
    const r = await validateFeatureDeltaCitations({
      llmResponse: "your knight on e4 became overworked",
      featureDelta: emptyDelta(),
      pieceRoleDiff: roleDiff,
      playerPerspective: "white",
      correlationId: "role-1",
      parseCall: mockParser([
        claim({
          claim_text: "knight on e4 became overworked",
          claim_type: "role_gained",
          expected_in_delta: { piece: "n", role: "overworked", side: "white", square: "e4" },
        }),
      ]),
    });
    expect(r.passed).toBe(true);
  });
});

describe("validateFeatureDeltaCitations — adversarial / non-factual", () => {
  it("'Black's queen looks impressive but is sidelined' (qualitative) → passes", async () => {
    const r = await validateFeatureDeltaCitations({
      llmResponse: "Black's queen looks impressive but is sidelined.",
      featureDelta: emptyDelta(),
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "adv-fc-1",
      parseCall: mockParser([
        claim({
          claim_text: "queen looks impressive but is sidelined",
          claim_type: "role_lost",
          expected_in_delta: { piece: "q", side: "black" },
          claim_class: "qualitative_commentary",
        }),
      ]),
    });
    expect(r.passed).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("'if Black plays Nf6 you'd have an outpost' (conditional) → passes", async () => {
    const r = await validateFeatureDeltaCitations({
      llmResponse: "If Black plays Nf6, you'd have an outpost on e4.",
      featureDelta: emptyDelta(),
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "adv-fc-2",
      parseCall: mockParser([
        claim({
          claim_text: "you'd have an outpost on e4",
          claim_type: "new_outpost",
          expected_in_delta: { side: "white", square: "e4" },
          claim_class: "conditional_speculation",
        }),
      ]),
    });
    expect(r.passed).toBe(true);
  });
});

describe("validateFeatureDeltaCitations — multi-citation", () => {
  it("3 claims with 1 invented → fires once on the invented one", async () => {
    const delta = emptyDelta({
      pawnStructureDelta: {
        ...emptyDelta().pawnStructureDelta,
        passedPawnsGained: { white: ["b5"], black: [] },
      },
      kingSafetyDelta: { white: 0, black: -10 },
    });
    const r = await validateFeatureDeltaCitations({
      llmResponse: "Three claims about the position.",
      featureDelta: delta,
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "multi-1",
      parseCall: mockParser([
        claim({
          claim_text: "new passed pawn on b5",
          claim_type: "new_passed_pawn",
          expected_in_delta: { side: "white", square: "b5" },
        }),
        claim({
          claim_text: "Black's king became unsafe",
          claim_type: "king_safety_change",
          expected_in_delta: { side: "black", direction: "decrease" },
        }),
        claim({
          claim_text: "you lost the bishop pair",
          claim_type: "lost_bishop_pair",
          expected_in_delta: { side: "white" },
        }),
      ]),
    });
    expect(r.passed).toBe(false);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].llm_span).toContain("bishop pair");
  });
});

describe("validateFeatureDeltaCitations — historical-claim skip (2026-05-30 fix)", () => {
  // Game-review prose recapping prior positions ("you had the bishop pair
  // until move 18", "earlier your knight was an outpost") would
  // false-positive against the just-made-move featureDelta. Parser now
  // tags these "historical_state_claim"; validator emits a skip event
  // for telemetry visibility and moves on.
  it("'historical_state_claim' parsed → skip telemetry, no fire", async () => {
    const delta = emptyDelta({
      fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      resolutionFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      materialDelta: { white: 0, black: 0 },
      isEmptyDelta: true,
    });
    const r = await validateFeatureDeltaCitations({
      llmResponse: "You had the bishop pair until move 18, but lost it then.",
      featureDelta: delta,
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "test-feature-historical",
      parseCall: mockParser([
        claim({
          claim_text: "You had the bishop pair until move 18",
          claim_type: "lost_bishop_pair",
          // Without the historical class, this would fire feature_citation_unsupported
          // (no actual bishop-pair loss in this move's delta — material_delta white=0).
          claim_class: "historical_state_claim",
          expected_in_delta: { side: "white" },
        }),
      ]),
    });
    expect(r.passed).toBe(true);
    expect(r.issues).toEqual([]);
    expect(
      r.telemetry.some((e) => e.fire_reason === "skip_historical_claim"),
    ).toBe(true);
  });

  it("mixed historical + factual: skip historical, evaluate factual", async () => {
    // Real game-review prose mixes the two. Validator should skip the
    // historical and evaluate the factual exactly as before.
    const delta = emptyDelta({
      fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      resolutionFen: "rn1qkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
      // Real loss-of-bishop just happened on this move
      materialDelta: { white: 0, black: -3 },
      isEmptyDelta: false,
    });
    const r = await validateFeatureDeltaCitations({
      llmResponse:
        "Earlier you had two bishops; now you've lost the bishop pair.",
      featureDelta: delta,
      pieceRoleDiff: [],
      playerPerspective: "white",
      correlationId: "test-feature-mixed",
      parseCall: mockParser([
        claim({
          claim_text: "Earlier you had two bishops",
          claim_type: "lost_bishop_pair",
          claim_class: "historical_state_claim",
          expected_in_delta: { side: "white" },
        }),
        claim({
          claim_text: "now you've lost the bishop pair",
          claim_type: "lost_bishop_pair",
          claim_class: "factual_delta_claim",
          expected_in_delta: { side: "black" },
        }),
      ]),
    });
    expect(r.passed).toBe(true);
    expect(r.issues).toEqual([]);
    // Both signals present in telemetry: historical skip + factual pass
    expect(
      r.telemetry.some((e) => e.fire_reason === "skip_historical_claim"),
    ).toBe(true);
    expect(r.telemetry.some((e) => e.fire_reason === "passed")).toBe(true);
  });
});
