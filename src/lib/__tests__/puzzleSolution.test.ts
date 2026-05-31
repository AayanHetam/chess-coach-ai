import { describe, it, expect } from "vitest";
import { parseSolutionMoves } from "../puzzleSolution";

describe("parseSolutionMoves", () => {
  it("parses a standard short UCI sequence", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = parseSolutionMoves(fen, ["e2e4", "e7e5", "g1f3"]);
    expect(result.error).toBeNull();
    expect(result.parsed).toHaveLength(3);
    expect(result.parsed[0]).toEqual({ from: "e2", to: "e4", promotion: undefined });
    expect(result.parsed[2]).toEqual({ from: "g1", to: "f3", promotion: undefined });
  });

  it("parses a 10-move (20-ply) puzzle sequence end-to-end", () => {
    // Generate a long sequence from the starting position.
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const moves = [
      "e2e4", "e7e5", "g1f3", "b8c6", "f1c4",
      "g8f6", "d2d3", "f8c5", "c1g5", "h7h6",
      "g5f6", "d8f6", "b1c3", "d7d6", "e1g1",
      "c8e6", "c4e6", "f7e6", "f3e5", "e8g8",
    ];
    const result = parseSolutionMoves(fen, moves);
    expect(result.error).toBeNull();
    expect(result.parsed).toHaveLength(20);
  });

  it("returns error + partial parsed when a mid-sequence move is illegal", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    // 3rd move is illegal (e2e4 again — pawn already moved)
    const result = parseSolutionMoves(fen, ["e2e4", "e7e5", "e2e4"]);
    expect(result.parsed).toHaveLength(2);
    expect(result.error).toMatch(/Move 3/);
    expect(result.error).toMatch(/e2e4/);
  });

  it("returns error for an invalid FEN", () => {
    const result = parseSolutionMoves("not-a-fen", ["e2e4"]);
    expect(result.parsed).toHaveLength(0);
    expect(result.error).toMatch(/FEN/i);
  });

  it("trims whitespace off individual moves", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = parseSolutionMoves(fen, ["  e2e4  ", "\te7e5"]);
    expect(result.error).toBeNull();
    expect(result.parsed).toHaveLength(2);
  });

  it("lowercases uppercase promotion letters (Q → q)", () => {
    // Black king on a-file, pawn on e7 has a clear promotion path to e8.
    const fen = "k7/4P3/8/8/8/8/8/4K3 w - - 0 1";
    const result = parseSolutionMoves(fen, ["e7e8Q"]);
    expect(result.error).toBeNull();
    expect(result.parsed[0]).toEqual({ from: "e7", to: "e8", promotion: "q" });
  });

  it("handles underpromotion (e.g. promotion to knight)", () => {
    const fen = "k7/4P3/8/8/8/8/8/4K3 w - - 0 1";
    const result = parseSolutionMoves(fen, ["e7e8n"]);
    expect(result.error).toBeNull();
    expect(result.parsed[0].promotion).toBe("n");
  });

  it("falls back to SAN parsing when UCI fails", () => {
    // Try a SAN-style move that wouldn't parse as our UCI shape.
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = parseSolutionMoves(fen, ["Nc3", "Nc6"]);
    expect(result.error).toBeNull();
    expect(result.parsed).toHaveLength(2);
    expect(result.parsed[0].from).toBe("b1");
    expect(result.parsed[0].to).toBe("c3");
  });

  it("flags malformed inputs without crashing", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = parseSolutionMoves(fen, ["e2e4", "", "g1f3"]);
    expect(result.parsed).toHaveLength(1);
    expect(result.error).toMatch(/malformed/);
  });

  it("handles castling notation (e1g1 king-side)", () => {
    // Position where white can castle kingside.
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1";
    const result = parseSolutionMoves(fen, ["f1c4", "g8f6", "e1g1"]);
    expect(result.error).toBeNull();
    expect(result.parsed).toHaveLength(3);
    expect(result.parsed[2]).toEqual({ from: "e1", to: "g1", promotion: undefined });
  });

  it("handles en passant capture", () => {
    // Position right after black's d5-pawn moved 2 squares (en passant available).
    const fen = "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3";
    const result = parseSolutionMoves(fen, ["e5d6"]);
    expect(result.error).toBeNull();
    expect(result.parsed).toHaveLength(1);
  });
});
