import { describe, it, expect } from "vitest";
import {
  computePositionConfidence,
  confidenceDisclaimer,
} from "../positionConfidence";
import type { VoterConfidence } from "../voter";

function conf(overrides: Partial<VoterConfidence> = {}): VoterConfidence {
  return {
    endgame_wdl: "NONE",
    tactical_motif: "NONE",
    material_win: "NONE",
    mate_in_n: "NONE",
    positional_plan: "NONE",
    user_visibility: "NONE",
    ...overrides,
  };
}

describe("computePositionConfidence", () => {
  it("a confirmed tactic is engine_verified", () => {
    const pc = computePositionConfidence(conf({ tactical_motif: "HIGH" }), 40);
    expect(pc.level).toBe("engine_verified");
    expect(pc.score).toBeGreaterThanOrEqual(70);
    expect(pc.drivers).toContain("tactical_motif=HIGH");
  });

  it("a tablebase endgame is engine_verified (highest authority)", () => {
    const pc = computePositionConfidence(conf({ endgame_wdl: "HIGH" }), 0);
    expect(pc.level).toBe("engine_verified");
    expect(pc.score).toBe(100);
  });

  it("a decisive eval alone verifies a winning claim", () => {
    const pc = computePositionConfidence(conf(), 600);
    expect(pc.level).toBe("engine_verified");
  });

  it("a quiet, balanced position is a strategic_read (NOT low quality)", () => {
    const pc = computePositionConfidence(conf(), 25);
    expect(pc.level).toBe("strategic_read");
    expect(pc.score).toBeLessThan(35);
    expect(pc.drivers[0]).toMatch(/quiet position/);
  });

  it("a modest positional edge is mixed", () => {
    const pc = computePositionConfidence(conf({ positional_plan: "MED" }), 120);
    expect(pc.level).toBe("mixed");
  });

  // The false-flag guard: a great strategic read on a quiet board must NOT be
  // penalized as low-quality — it's scored on the POSITION's verifiability only.
  it("scores the position, not the analysis: quiet board => strategic_read regardless", () => {
    // Same quiet position; the function never sees the LLM text, so a brilliant
    // strategic answer here is still 'strategic_read' — and the UI frames that
    // as judgment territory, not as a weak analysis.
    const pc = computePositionConfidence(conf(), 30);
    expect(pc.level).toBe("strategic_read");
  });

  it("eval clarity scales the score continuously (for the spectrum)", () => {
    const low = computePositionConfidence(conf(), 100).score;
    const mid = computePositionConfidence(conf(), 250).score;
    const high = computePositionConfidence(conf(), 450).score;
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(high).toBe(100);
  });

  it("null eval contributes no clarity", () => {
    const pc = computePositionConfidence(conf(), null);
    expect(pc.score).toBe(0);
    expect(pc.level).toBe("strategic_read");
  });

  it("takes the MAX, not sum: one confirmed tactic dominates", () => {
    const pc = computePositionConfidence(
      conf({ tactical_motif: "HIGH", positional_plan: "LOW", material_win: "LOW" }),
      30,
    );
    expect(pc.level).toBe("engine_verified");
  });
});

describe("confidenceDisclaimer", () => {
  it("emits a verification-type disclaimer only for strategic_read", () => {
    expect(confidenceDisclaimer(computePositionConfidence(conf(), 20))).toMatch(
      /judgment-driven/,
    );
    expect(
      confidenceDisclaimer(computePositionConfidence(conf({ tactical_motif: "HIGH" }), 40)),
    ).toBe("");
    expect(
      confidenceDisclaimer(computePositionConfidence(conf({ positional_plan: "MED" }), 120)),
    ).toBe("");
  });

  it("never frames low verification as low quality", () => {
    const msg = confidenceDisclaimer(computePositionConfidence(conf(), 10));
    expect(msg).not.toMatch(/wrong|bad|unreliable|low quality|might be incorrect/i);
  });
});
