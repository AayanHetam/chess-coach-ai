/**
 * Prompt Validation Tests
 * Test cases for prompt generation and validation
 */

import {
  validatePrompt,
  extractMoveNumbers,
  extractPositionReferences,
  hasStockfishReferences,
  estimateTokenCount,
} from "../promptHelpers";
import { getSystemPrompt } from "../systemPrompts";
import { buildGameReviewPrompt, buildMoveAnalysisPrompt } from "../userPrompts";

describe("Prompt Validation", () => {
  describe("validatePrompt", () => {
    it("should validate non-empty prompts", () => {
      expect(validatePrompt("This is a valid prompt")).toBe(true);
    });

    it("should reject empty prompts", () => {
      expect(validatePrompt("")).toBe(false);
      expect(validatePrompt("   ")).toBe(false);
    });

    it("should respect minimum length", () => {
      expect(validatePrompt("Short", 10)).toBe(false);
      expect(validatePrompt("This is a longer prompt", 10)).toBe(true);
    });
  });

  describe("extractMoveNumbers", () => {
    it("should extract move numbers from text", () => {
      const text =
        "Move 5 was good, but move 10 was a mistake. Move 15 was excellent.";
      const moves = extractMoveNumbers(text);
      expect(moves).toEqual([5, 10, 15]);
    });

    it("should handle case-insensitive matches", () => {
      const text = "MOVE 3 and move 7";
      const moves = extractMoveNumbers(text);
      expect(moves).toEqual([3, 7]);
    });

    it("should return empty array for no matches", () => {
      const text = "No moves mentioned here";
      const moves = extractMoveNumbers(text);
      expect(moves).toEqual([]);
    });
  });

  describe("extractPositionReferences", () => {
    it("should extract position numbers from text", () => {
      const text = "At position 5, the game changed. Position 10 was critical.";
      const positions = extractPositionReferences(text);
      expect(positions).toEqual([5, 10]);
    });

    it("should handle case variations", () => {
      const text = "Position 3 and position 8";
      const positions = extractPositionReferences(text);
      expect(positions).toEqual([3, 8]);
    });
  });

  describe("hasStockfishReferences", () => {
    it("should detect Stockfish references", () => {
      expect(hasStockfishReferences("Stockfish evaluation shows +0.5")).toBe(
        true
      );
      expect(
        hasStockfishReferences("The best move according to Stockfish")
      ).toBe(true);
      expect(hasStockfishReferences("Principal variation: e4 Nf3")).toBe(true);
    });

    it("should return false for no Stockfish references", () => {
      expect(hasStockfishReferences("This is a regular chess analysis")).toBe(
        false
      );
    });
  });

  describe("estimateTokenCount", () => {
    it("should estimate token count", () => {
      const text = "This is a test string with approximately 50 characters";
      const tokens = estimateTokenCount(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(20); // Rough check
    });
  });
});

describe("System Prompts", () => {
  it("should generate prompts for all analysis types", () => {
    const types = [
      "game_review",
      "strategy_analysis",
      "move_explanation",
      "position_evaluation",
    ];

    types.forEach((type) => {
      const prompt = getSystemPrompt(type);
      expect(validatePrompt(prompt, 50)).toBe(true);
      expect(hasStockfishReferences(prompt)).toBe(true);
    });
  });

  it("should include Stockfish instructions in all prompts", () => {
    const prompt = getSystemPrompt("game_review");
    expect(prompt.toLowerCase()).toContain("stockfish");
  });
});

describe("User Prompts", () => {
  it("should build game review prompt with user message", () => {
    const prompt = buildGameReviewPrompt([], "Analyze my game");
    expect(prompt).toContain("USER QUESTION/MESSAGE");
    expect(prompt).toContain("Analyze my game");
  });

  it("should build move analysis prompt", () => {
    const prompt = buildMoveAnalysisPrompt(10, "Nf3", []);
    expect(prompt).toContain("Move 10");
    expect(prompt).toContain("Nf3");
  });
});
