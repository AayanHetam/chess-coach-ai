import { describe, it, expect } from "vitest";
import { pickGenerator, mulberry32 } from "../generators";
import type { QuestionCategory } from "../../../src/lib/mastermind/categorization/categoryClassifier";

describe("pickGenerator dispatch", () => {
  it("maps each QuestionCategory to a non-null generator", () => {
    const categories: QuestionCategory[] = [
      "game_review",
      "position_analysis",
      "opponent_prep",
      "improvement_strategy",
      "meta_motivational",
      "concept_explanation",
    ];
    for (const cat of categories) {
      const gen = pickGenerator(cat);
      expect(typeof gen).toBe("function");
    }
  });

  it("game_review + position_analysis return the same generator instance", () => {
    expect(pickGenerator("game_review")).toBe(pickGenerator("position_analysis"));
  });

  it("opponent_prep + improvement_strategy + meta_motivational + concept_explanation each get a distinct generator", () => {
    const gens = new Set([
      pickGenerator("opponent_prep"),
      pickGenerator("improvement_strategy"),
      pickGenerator("meta_motivational"),
      pickGenerator("concept_explanation"),
    ]);
    expect(gens.size).toBe(4);
  });

  it("throws on unknown category", () => {
    expect(() => pickGenerator("not_a_real_category" as QuestionCategory)).toThrow(/unknown category/);
  });
});

describe("mulberry32 RNG determinism", () => {
  it("same seed produces same sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds produce different sequences", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it("output is bounded in [0, 1)", () => {
    const r = mulberry32(99);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
