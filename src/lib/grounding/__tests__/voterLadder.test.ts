// CH-1 — calibrated-hedging confidence ladder, emitted by buildGroundingContext
// via compileVoterResult. See MASTERMIND_CONTEXT/PR_CALIBRATED_HEDGING_PLAN.md.
import { describe, it, expect } from "vitest";
import { compileVoterResult } from "../voter";
import type { AnyMotif } from "@/lib/tactics/types";

const CONFIRMED_FORK: AnyMotif = {
  motif: "fork",
  by_piece: "n",
  by_square: "e5",
  targets: [
    { square: "d7", piece: "q" },
    { square: "f7", piece: "r" },
  ],
  unavoidable_loss_cp: 500,
  confirmed: true,
  refutation: null,
};

describe("CH-1 confidence ladder", () => {
  it("compileVoterResult exposes positionConfidence (the shared backbone)", () => {
    const r = compileVoterResult({ stockfishEvalCp: 30 });
    expect(r.positionConfidence).toBeDefined();
    expect(r.positionConfidence.level).toBe("strategic_read");
    expect(typeof r.positionConfidence.score).toBe("number");
  });

  it("always appends a CONFIDENCE LADDER block to groundingContext", () => {
    const r = compileVoterResult({ stockfishEvalCp: 30 });
    expect(r.groundingContext).toContain("CONFIDENCE LADDER");
    // The catch-all for the ungroundable 80% must be present.
    expect(r.groundingContext).toMatch(/state as a SUGGESTION|one idea is/i);
  });

  it("quiet position → header tells the model to frame as judgment, not fact", () => {
    const r = compileVoterResult({ stockfishEvalCp: 20 });
    expect(r.groundingContext).toMatch(/VERIFICATION: low/);
    expect(r.groundingContext).toMatch(/judgment-heavy|frame the rest as your read/i);
  });

  it("confirmed tactic → header allows plain assertion (engine-verified)", () => {
    const r = compileVoterResult({ motifs: [CONFIRMED_FORK], stockfishEvalCp: 40 });
    expect(r.positionConfidence.level).toBe("engine_verified");
    expect(r.groundingContext).toMatch(/VERIFICATION: high/);
  });

  it("low material confidence → ladder says hedge 'winning' language", () => {
    // Balanced position, no material edge → material_win NONE → hedge.
    const r = compileVoterResult({ stockfishEvalCp: 10 });
    expect(r.groundingContext).toMatch(/Material \/ "winning" claims: hedge/);
    expect(r.groundingContext).toMatch(/Do not say "winning", "decisive"/);
  });

  it("decisive eval → material claims may be stated plainly", () => {
    // +6 pawns with a confirmed material motif → material_win HIGH → state plainly.
    const r = compileVoterResult({ motifs: [CONFIRMED_FORK], stockfishEvalCp: 600 });
    expect(r.groundingContext).toMatch(/Material \/ "winning" claims: state plainly/);
  });

  it("never frames low verification as low quality (false-flag guard)", () => {
    const r = compileVoterResult({ stockfishEvalCp: 15 });
    // The ladder must not tell the model its analysis is bad/unreliable —
    // only that the position is judgment-heavy.
    expect(r.groundingContext).not.toMatch(/your analysis (is|may be) (wrong|bad|unreliable|weak)/i);
  });
});
