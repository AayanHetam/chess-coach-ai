import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { generateSuggestions } from "../generateSuggestions";
import { MoveClassification } from "@/types/enums";
import type { PositionEval } from "@/types/eval";

function makeEnginePos(
  classification?: MoveClassification,
): PositionEval {
  return {
    lines: [
      {
        pv: [],
        depth: 16,
        multiPv: 1,
        cp: 0,
      },
    ],
    ...(classification ? { moveClassification: classification } : {}),
  };
}

describe("generateSuggestions", () => {
  it("always pins 'Analyze my game' first, even with no data", () => {
    const result = generateSuggestions({ loadedGame: null });
    expect(result[0].text).toBe("Analyze my game");
    expect(result[0].pinned).toBe(true);
  });

  it("returns at most 1 pinned + 3 generated suggestions", () => {
    const game = new Chess();
    // Force enough rules to fire by stacking everything.
    game.move("e4");
    game.move("e5");
    const positions: PositionEval[] = [
      makeEnginePos(),
      makeEnginePos(MoveClassification.Brilliant),
      makeEnginePos(MoveClassification.Blunder),
    ];
    const result = generateSuggestions({
      loadedGame: game,
      enginePositions: positions,
      mistakeContext: { movePlayed: "Bxh7+", classification: "blunder" },
      openingName: "Sicilian Defense",
    });
    expect(result).toHaveLength(4); // 1 pinned + 3 generated
    expect(result[0].pinned).toBe(true);
    expect(result.slice(1).every((s) => !s.pinned)).toBe(true);
  });

  it("active mistakeContext is the highest-priority generated suggestion", () => {
    const result = generateSuggestions({
      loadedGame: null,
      mistakeContext: { movePlayed: "Nxe5", classification: "blunder" },
    });
    expect(result[1].text).toBe("Why was Nxe5 a blunder?");
  });

  it("worst-blunder suggestion uses the move SAN from the game history", () => {
    const game = new Chess();
    game.move("e4"); // ply 1 (white)
    game.move("e5"); // ply 2 (black)
    game.move("Qh5"); // ply 3 — pretend this is the blunder
    const positions: PositionEval[] = [
      makeEnginePos(),
      makeEnginePos(),
      makeEnginePos(),
      makeEnginePos(MoveClassification.Blunder), // after ply 3
    ];
    const result = generateSuggestions({
      loadedGame: game,
      enginePositions: positions,
    });
    expect(result.find((s) => s.text.includes("blunder at"))).toMatchObject({
      text: "Walk me through the blunder at 2.Qh5",
    });
  });

  it("prefers the EARLIEST blunder to surface the turning point, not the cleanup", () => {
    const game = new Chess();
    game.move("e4");
    game.move("e5");
    game.move("Bc4");
    game.move("Nc6");
    const positions: PositionEval[] = [
      makeEnginePos(),
      makeEnginePos(),
      makeEnginePos(),
      makeEnginePos(MoveClassification.Blunder), // ply 3 — earliest blunder
      makeEnginePos(MoveClassification.Blunder), // ply 4 — later blunder
    ];
    const result = generateSuggestions({
      loadedGame: game,
      enginePositions: positions,
    });
    // 2.Bc4 is white's 2nd move at ply 3 (3-1=2 → moves[2]="Bc4"); label
    // would say "2.Bc4".
    expect(
      result.find((s) => s.text.includes("2.Bc4")),
    ).toBeDefined();
  });

  it("surfaces brilliant moves with the right move label", () => {
    const game = new Chess();
    game.move("e4");
    game.move("e5");
    game.move("d4"); // ply 3 — pretend brilliant
    const positions: PositionEval[] = [
      makeEnginePos(),
      makeEnginePos(),
      makeEnginePos(),
      makeEnginePos(MoveClassification.Brilliant),
    ];
    const result = generateSuggestions({
      loadedGame: game,
      enginePositions: positions,
    });
    expect(result.find((s) => s.text.includes("brilliant"))).toMatchObject({
      text: "Why was 2.d4 brilliant?",
    });
  });

  it("includes the opening name when it's specific (not the placeholder 'Opening')", () => {
    const result = generateSuggestions({
      loadedGame: null,
      openingName: "Sicilian Defense: Najdorf",
    });
    expect(
      result.find((s) => s.text === "Tell me about the Sicilian Defense: Najdorf"),
    ).toBeDefined();
  });

  it("skips the opening suggestion when name is the generic 'Opening'", () => {
    const result = generateSuggestions({
      loadedGame: null,
      openingName: "Opening",
    });
    expect(result.find((s) => s.text.startsWith("Tell me about"))).toBeUndefined();
  });

  it("adds the endgame suggestion when the final position has ≤ 14 pieces", () => {
    const game = new Chess();
    // Strip to KvK with a pawn endgame-ish position via direct FEN load.
    game.load("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
    const result = generateSuggestions({ loadedGame: game });
    expect(
      result.find((s) => s.text === "What was the key endgame idea?"),
    ).toBeDefined();
  });

  it("does NOT add the endgame suggestion in a full-piece middlegame", () => {
    const game = new Chess();
    game.move("e4");
    game.move("e5");
    const result = generateSuggestions({ loadedGame: game });
    expect(
      result.find((s) => s.text === "What was the key endgame idea?"),
    ).toBeUndefined();
  });

  it("falls back to generic suggestions when no rules fire", () => {
    const result = generateSuggestions({ loadedGame: null });
    // PINNED + 3 fallbacks
    expect(result).toHaveLength(4);
    expect(result[0].text).toBe("Analyze my game");
    expect(result.slice(1).map((s) => s.text)).toContain(
      "What's the most important moment in this game?",
    );
  });

  it("dedupes when rules produce overlapping text", () => {
    // Open-ended sanity check: even if fallbacks overlap with rule output,
    // total length stays bounded.
    const game = new Chess();
    game.move("e4");
    game.move("e5");
    const result = generateSuggestions({
      loadedGame: game,
      mistakeContext: { movePlayed: "Nxe5", classification: "blunder" },
    });
    const textsSet = new Set(result.map((s) => s.text));
    expect(textsSet.size).toBe(result.length);
  });
});
