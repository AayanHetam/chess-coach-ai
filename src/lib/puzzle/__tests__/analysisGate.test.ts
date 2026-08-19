import { describe, expect, it } from "vitest";
import {
  analysisAvailability,
  LOCKED_REASON,
  type AnalysisGateInput,
} from "@/lib/puzzle/analysisGate";

function gate(over: Partial<AnalysisGateInput> = {}) {
  return analysisAvailability({
    status: "playing",
    solutionRevealed: false,
    hasPuzzle: true,
    ...over,
  });
}

describe("analysisAvailability — the cheat gate", () => {
  it("stays locked while the puzzle is unsolved", () => {
    // The whole reason this module exists: Stockfish's top move in a tactics
    // position IS the answer.
    const r = gate({ status: "playing" });
    expect(r.available).toBe(false);
  });

  it("stays locked after a WRONG attempt", () => {
    // The subtle one. A wrong attempt is retryable — the board resets and the
    // solver tries again — so the answer is still live. Unlocking here would
    // make one deliberate miss a legal way to ask the engine for the solution.
    const r = gate({ status: "wrong" });
    expect(r.available).toBe(false);
    expect(r.available === false && r.reason).toBe(LOCKED_REASON);
  });

  it("unlocks once solved", () => {
    expect(gate({ status: "solved" }).available).toBe(true);
  });

  it("unlocks once the solution has been shown", () => {
    // They already have the answer; withholding the engine now only punishes
    // the person trying to understand why.
    expect(gate({ status: "playing", solutionRevealed: true }).available).toBe(
      true
    );
  });

  it("unlocks on a revealed solution even after a wrong attempt", () => {
    expect(gate({ status: "wrong", solutionRevealed: true }).available).toBe(
      true
    );
  });

  it("stays locked with no puzzle loaded, whatever the status says", () => {
    // Guards a stale "solved" from the previous puzzle unlocking the next one
    // during the feed swap.
    expect(gate({ hasPuzzle: false, status: "solved" }).available).toBe(false);
    expect(gate({ hasPuzzle: false, solutionRevealed: true }).available).toBe(
      false
    );
  });
});

describe("analysisAvailability — the locked message", () => {
  it("always explains itself when locked", () => {
    // A dead control with no reason reads as broken rather than as a rule.
    for (const input of [
      { status: "playing" } as const,
      { status: "wrong" } as const,
      { hasPuzzle: false } as const,
    ]) {
      const r = gate(input);
      expect(r.available).toBe(false);
      expect(r.available === false && r.reason.length).toBeGreaterThan(0);
    }
  });

  it("names the actual rule rather than saying 'unavailable'", () => {
    const r = gate({ status: "playing" });
    expect(r.available === false && r.reason).toMatch(/solve|solution/i);
  });
});
