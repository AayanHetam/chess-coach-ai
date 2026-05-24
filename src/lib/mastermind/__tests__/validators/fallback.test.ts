import { describe, it, expect } from "vitest";
import { buildFallbackResponse } from "../../validators/fallback";
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

describe("buildFallbackResponse", () => {
  it("synthesizes coherent prose from eval + feature delta", () => {
    const delta = emptyDelta();
    delta.pawnStructureDelta.passedPawnsGained.white = ["b5"];
    delta.kingSafetyDelta.black = -20;
    delta.isEmptyDelta = false;

    const text = buildFallbackResponse({
      stockfishEval: { cp: 200 },
      featureDelta: delta,
      playerPerspective: "white",
    });
    expect(text).toContain("White");
    expect(text).toContain("b5");
    expect(text.toLowerCase()).toContain("king");
    expect(text).toContain("What changed");
  });

  it("contains no chess error — every cited square exists in standard FEN", () => {
    const delta = emptyDelta();
    delta.pawnStructureDelta.openFilesGained = ["d"];
    delta.isEmptyDelta = false;
    const text = buildFallbackResponse({
      stockfishEval: { cp: 0 },
      featureDelta: delta,
      playerPerspective: "white",
    });
    const invalidSquares = text.match(/\b[a-h][9-9]\b|\bi[1-8]\b|\b[a-h]0\b/g);
    expect(invalidSquares).toBeNull();
  });

  it("respects coachTone modifier", () => {
    const warmText = buildFallbackResponse({
      stockfishEval: { cp: 200 },
      playerPerspective: "white",
      coachTone: "warm",
    });
    const bluntText = buildFallbackResponse({
      stockfishEval: { cp: 200 },
      playerPerspective: "white",
      coachTone: "blunt",
    });
    expect(warmText).not.toBe(bluntText);
    expect(bluntText.length).toBeLessThan(warmText.length);
  });

  it("omits sections when corresponding inputs are empty", () => {
    const text = buildFallbackResponse({
      stockfishEval: { cp: 0 },
      playerPerspective: "white",
    });
    expect(text).not.toContain("What changed");
    expect(text).not.toContain("Tactical risk");
    expect(text).not.toContain("What to look at");
    expect(text.length).toBeGreaterThan(0);
  });

  it("contains no 'may be inaccurate' disclaimer", () => {
    const text = buildFallbackResponse({
      stockfishEval: { cp: 200 },
      playerPerspective: "white",
    });
    expect(text.toLowerCase()).not.toContain("may be inaccurate");
    expect(text.toLowerCase()).not.toContain("please verify");
  });
});
