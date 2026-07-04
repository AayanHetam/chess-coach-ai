import { describe, it, expect } from "vitest";
import {
  buildRelationalFacts,
  factsConfirmAttack,
  factsConfirmHanging,
  factsConfirmPin,
  type RelationalFactsBlock,
} from "../relationalFactsBuilder";

// ---------------------------------------------------------------------------
// FEN fixtures
// ---------------------------------------------------------------------------

/** Starting position — no captures, no hanging, no pins */
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Hallucination-reproduction position:
 *   White queen on b3, Black bishop on a5 — queen does NOT attack a5
 *   (b3→a5 is a knight-move distance, not a valid queen line).
 *   White king g1, Black king g8.
 */
const QUEEN_DOES_NOT_ATTACK_A5 = "6k1/8/8/b7/8/1Q6/8/6K1 w - - 0 1";

/**
 * Queen on d3 attacking Black bishop on h7 (valid diagonal d3→e4→f5→g6→h7).
 * White king a1, Black king g8.
 */
const QUEEN_ATTACKS_H7 = "6k1/7b/8/8/8/3Q4/8/K7 w - - 0 1";

/**
 * Absolute pin: White bishop on b2, Black knight on e5, Black king on g8.
 * The diagonal b2→c3→d4→e5→f6→g7 — wait, king is on g8 not g7.
 * Let's use the a1-h8 diagonal: a1,b2,c3,d4,e5,f6,g7,h8
 * Black king on h8, Black knight on e5, White bishop on b2 → absolute pin.
 * White king on a3.
 */
const PIN_POSITION = "7k/8/8/4n3/8/K7/1B6/8 w - - 0 1";

/**
 * Hanging piece: Black queen on d7, White rook on d1 (attacks d7).
 * Black king g8, White king a1. Queen is undefended.
 */
const HANGING_QUEEN = "6k1/3q4/8/8/8/8/8/K2R4 w - - 0 1";

/**
 * Not-hanging: Black bishop on h7, White queen on d3 (attacks h7),
 * Black rook on f5 defends h7 (rook on f5 cannot defend h7 — wrong).
 * Let's put a Black pawn on g6 that defends h7... wait pawns attack diagonally.
 * A black pawn on g6 attacks h5 and f5, not h7.
 * Let's use a Black rook on h1 that defends h7 (same file): h1→h7.
 * White queen d3 attacks h7? d3→e4→f5→g6→h7 diagonal ✓
 * Black rook h1 defends h7? h1→h7 file ✓
 */
const DEFENDED_BISHOP = "6k1/7b/8/8/8/3Q4/8/K6r w - - 0 1";

// ---------------------------------------------------------------------------
// Tests: basic structure
// ---------------------------------------------------------------------------

describe("buildRelationalFacts — structural", () => {
  it("returns a block with all required fields", () => {
    const facts = buildRelationalFacts(START_FEN);
    expect(facts.fen).toBe(START_FEN);
    expect(facts.sideToMove).toBe("w");
    expect(Array.isArray(facts.captures)).toBe(true);
    expect(Array.isArray(facts.hanging)).toBe(true);
    expect(Array.isArray(facts.pins)).toBe(true);
    expect(typeof facts.summary).toBe("string");
    expect(facts.summary.length).toBeGreaterThan(0);
  });

  it("starting position has no captures, no hanging, no pins", () => {
    const facts = buildRelationalFacts(START_FEN);
    expect(facts.captures).toHaveLength(0);
    expect(facts.hanging).toHaveLength(0);
    expect(facts.pins).toHaveLength(0);
  });

  it("summary includes the coaching rule", () => {
    const facts = buildRelationalFacts(START_FEN);
    expect(facts.summary).toContain("COACHING RULE");
    expect(facts.summary).toContain("ATTACKS ON ENEMY PIECES");
    expect(facts.summary).toContain("HANGING");
    expect(facts.summary).toContain("ABSOLUTE PINS");
  });
});

// ---------------------------------------------------------------------------
// Tests: hallucination-grounding (the key correctness case)
// ---------------------------------------------------------------------------

describe("buildRelationalFacts — attack grounding", () => {
  it("does NOT list queen-b3 attacking bishop-a5 (the hallucination case)", () => {
    const facts = buildRelationalFacts(QUEEN_DOES_NOT_ATTACK_A5);
    // No white capture should have attackerSquare b3 and targetSquare a5
    const falseCapture = facts.captures.find(
      (f) => f.attackerSquare === "b3" && f.targetSquare === "a5"
    );
    expect(falseCapture).toBeUndefined();
  });

  it("factsConfirmAttack returns false for Qb3→a5 (impossible queen line)", () => {
    const facts = buildRelationalFacts(QUEEN_DOES_NOT_ATTACK_A5);
    expect(factsConfirmAttack(facts, "w", "b3", "a5")).toBe(false);
  });

  it("factsConfirmAttack returns false for any white piece attacking a5 (only black bishop there)", () => {
    const facts = buildRelationalFacts(QUEEN_DOES_NOT_ATTACK_A5);
    // a5 holds a black bishop. Only white piece is Qb3 which does NOT attack a5.
    expect(factsConfirmAttack(facts, "w", undefined, "a5")).toBe(false);
  });

  it("correctly lists queen-d3 attacking bishop-h7 (valid diagonal)", () => {
    const facts = buildRelationalFacts(QUEEN_ATTACKS_H7);
    const capture = facts.captures.find(
      (f) => f.attackerSquare === "d3" && f.targetSquare === "h7"
    );
    expect(capture).toBeDefined();
    expect(capture?.attackerType).toBe("q");
    expect(capture?.attackerColor).toBe("w");
    expect(capture?.targetType).toBe("b");
    expect(capture?.targetColor).toBe("b");
  });

  it("factsConfirmAttack returns true for Qd3→Bh7", () => {
    const facts = buildRelationalFacts(QUEEN_ATTACKS_H7);
    expect(factsConfirmAttack(facts, "w", "d3", "h7")).toBe(true);
  });

  it("factsConfirmAttack with undefined fromSquare works for any white attacker of h7", () => {
    const facts = buildRelationalFacts(QUEEN_ATTACKS_H7);
    expect(factsConfirmAttack(facts, "w", undefined, "h7")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: hanging detection
// ---------------------------------------------------------------------------

describe("buildRelationalFacts — hanging pieces", () => {
  it("flags undefended queen as hanging", () => {
    const facts = buildRelationalFacts(HANGING_QUEEN);
    const hangingQueen = facts.hanging.find((h) => h.square === "d7");
    expect(hangingQueen).toBeDefined();
    expect(hangingQueen?.pieceType).toBe("q");
    expect(hangingQueen?.color).toBe("b");
    // White rook on d1 attacks d7
    expect(hangingQueen?.attackerSquares).toContain("d1");
    // No defenders
    expect(hangingQueen?.defenderSquares).toHaveLength(0);
  });

  it("factsConfirmHanging returns true for the undefended queen", () => {
    const facts = buildRelationalFacts(HANGING_QUEEN);
    expect(factsConfirmHanging(facts, "d7")).toBe(true);
  });

  it("does not flag well-defended bishop as hanging", () => {
    const facts = buildRelationalFacts(DEFENDED_BISHOP);
    // Black bishop on h7 is attacked by Qd3 but defended by Rh1
    const hangingBishop = facts.hanging.find((h) => h.square === "h7");
    expect(hangingBishop).toBeUndefined();
  });

  it("starting position has no hanging pieces", () => {
    const facts = buildRelationalFacts(START_FEN);
    expect(factsConfirmHanging(facts, "d5")).toBe(false);
    expect(facts.hanging).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: pin detection
// ---------------------------------------------------------------------------

describe("buildRelationalFacts — absolute pins", () => {
  it("detects an absolute pin to the king", () => {
    // PIN_POSITION: White Bb2 pins Black Ne5 to Black Kh8
    // Diagonal a1-h8: a1,b2,c3,d4,e5,f6,g7,h8 — Ne5 between Bb2 and Kh8 ✓
    const facts = buildRelationalFacts(PIN_POSITION);
    const pin = facts.pins.find((p) => p.pinnedSquare === "e5");
    expect(pin).toBeDefined();
    expect(pin?.pinnedType).toBe("n");
    expect(pin?.pinnerSquare).toBe("b2");
    expect(pin?.pinnerType).toBe("b");
    expect(pin?.pinnerColor).toBe("w");
    expect(pin?.behindSquare).toBe("h8");
    expect(pin?.isAbsolute).toBe(true);
  });

  it("factsConfirmPin returns true for the pinned square", () => {
    const facts = buildRelationalFacts(PIN_POSITION);
    expect(factsConfirmPin(facts, "e5")).toBe(true);
  });

  it("factsConfirmPin returns false for a non-pinned square", () => {
    const facts = buildRelationalFacts(PIN_POSITION);
    expect(factsConfirmPin(facts, "b2")).toBe(false); // the pinner, not pinned
    expect(factsConfirmPin(facts, "h8")).toBe(false); // the king
  });

  it("starting position has no pins", () => {
    const facts = buildRelationalFacts(START_FEN);
    expect(facts.pins).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: summary text content
// ---------------------------------------------------------------------------

describe("buildRelationalFacts — summary text", () => {
  it("summary does NOT mention a5 in Qb3 position (no false attack in text)", () => {
    const facts = buildRelationalFacts(QUEEN_DOES_NOT_ATTACK_A5);
    // The summary should not list Qb3→Ba5 since the queen doesn't attack a5
    expect(facts.summary).not.toContain("b3→Ba5");
    expect(facts.summary).not.toContain("Qb3→Ba5");
  });

  it("summary mentions Qd3→Bh7 for the diagonal attack position", () => {
    const facts = buildRelationalFacts(QUEEN_ATTACKS_H7);
    expect(facts.summary).toContain("Qd3");
    expect(facts.summary).toContain("Bh7");
  });

  it("summary mentions the pin in the pin position", () => {
    const facts = buildRelationalFacts(PIN_POSITION);
    expect(facts.summary).toContain("ABSOLUTE PINS");
    expect(facts.summary).toContain("Ne5");
  });

  it("summary mentions hanging queen", () => {
    const facts = buildRelationalFacts(HANGING_QUEEN);
    expect(facts.summary).toContain("Qd7");
    expect(facts.summary).toContain("no defenders");
  });
});

// ---------------------------------------------------------------------------
// Tests: edge cases
// ---------------------------------------------------------------------------

describe("buildRelationalFacts — edge cases", () => {
  it("handles a position with multiple attackers on the same square", () => {
    // White queen on d3 (diagonal attack via d3→e4→f5→g6→h7) AND
    // White rook on h4 (file attack h4→h5→h6→h7) both attack black bishop on h7.
    // Black king g8, White king a1.
    const fen = "6k1/7b/8/8/7R/3Q4/8/K7 w - - 0 1";
    const facts = buildRelationalFacts(fen);
    const attacksOnH7 = facts.captures.filter((f) => f.targetSquare === "h7");
    expect(attacksOnH7.length).toBe(2);
    expect(attacksOnH7.map((f) => f.attackerSquare).sort()).toEqual(["d3", "h4"].sort());
  });

  it("handles a position where the side to move is black", () => {
    // Flip QUEEN_ATTACKS_H7 to black to move
    const fen = QUEEN_ATTACKS_H7.replace("w - -", "b - -");
    const facts = buildRelationalFacts(fen);
    expect(facts.sideToMove).toBe("b");
    // Attack graph is independent of who is to move
    expect(factsConfirmAttack(facts, "w", "d3", "h7")).toBe(true);
  });

  it("capture facts carry correct piece types and colors", () => {
    const facts = buildRelationalFacts(QUEEN_ATTACKS_H7);
    const capture = facts.captures[0];
    expect(capture.attackerColor).toBe("w");
    expect(capture.targetColor).toBe("b");
    expect(["p", "n", "b", "r", "q", "k"]).toContain(capture.attackerType);
  });
});
