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

  it("a Stockfish forced mate is engine_verified even with cp=null (the critical fix)", () => {
    // When SF reports a mate, cp is null; without the mate flag this scored as a
    // quiet position and the coach was told to hedge a forced mate.
    const pc = computePositionConfidence(conf({ mate_in_n: "LOW" }), null, 5);
    expect(pc.level).toBe("engine_verified");
    expect(pc.drivers.some((d) => d.includes("forced mate"))).toBe(true);
  });

  it("a forced mate against the side to move (negative) is also engine_verified", () => {
    const pc = computePositionConfidence(conf(), null, -3);
    expect(pc.level).toBe("engine_verified");
  });

  it("a two-engine positional consensus (positional_plan HIGH) reaches engine_verified", () => {
    // positional_plan HIGH fires only when SF and Lc0 agree; under-claiming it
    // as 'mixed' is the over-hedge failure mode.
    const pc = computePositionConfidence(conf({ positional_plan: "HIGH" }), 180);
    expect(pc.level).toBe("engine_verified");
  });

  // ── boundary pins (so a threshold drift can't silently over/under-hedge) ──
  it("pins the engine_verified boundary at score01=0.7 (eval 280 vs 279)", () => {
    expect(computePositionConfidence(conf(), 280).level).toBe("engine_verified");
    expect(computePositionConfidence(conf(), 279).level).toBe("mixed");
  });

  it("pins the strategic_read boundary at score01=0.35 (eval 140 vs 139)", () => {
    expect(computePositionConfidence(conf(), 140).level).toBe("mixed");
    expect(computePositionConfidence(conf(), 139).level).toBe("strategic_read");
  });

  it("a clear material edge alone stays engine_verified (no over-hedge)", () => {
    expect(computePositionConfidence(conf({ material_win: "HIGH" }), 50).level).toBe(
      "engine_verified",
    );
  });

  it("reports an eval driver (not 'quiet position') once the eval moves the level", () => {
    const pc = computePositionConfidence(conf(), 150); // mixed, score ~0.38
    expect(pc.level).toBe("mixed");
    expect(pc.drivers.some((d) => d.startsWith("eval"))).toBe(true);
    expect(pc.drivers.some((d) => d.includes("quiet position"))).toBe(false);
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
    // Broad: any quality-implying slur, regardless of subject noun.
    expect(msg).not.toMatch(/\b(wrong|bad|unreliable|weak|low.?quality|poor|incorrect)\b/i);
    // ...and it MUST positively frame it as judgment-vs-fact (load-bearing).
    expect(msg).toMatch(/strategic|judgment/i);
    expect(msg).toMatch(/than engine-verified fact/i);
  });
});
