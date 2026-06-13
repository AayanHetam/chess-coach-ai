// CH-1 integration: compileVoterResult exposes the verification-confidence
// score (the shared backbone for CH-1a/CH-2/CH-3) and the groundingContext is
// facts-only — the per-position "ladder" was removed after review (it duplicated
// per-mistake and contradicted itself). The static hedge now lives once in the
// system prompt; see coachChatPrompt.test.ts. PR_CALIBRATED_HEDGING_PLAN.md.
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

describe("compileVoterResult — positionConfidence backbone", () => {
  it("exposes positionConfidence on the result", () => {
    const r = compileVoterResult({ stockfishEvalCp: 30 });
    expect(r.positionConfidence).toBeDefined();
    expect(r.positionConfidence.level).toBe("strategic_read");
    expect(typeof r.positionConfidence.score).toBe("number");
  });

  it("reflects engine-verified positions (confirmed tactic)", () => {
    const r = compileVoterResult({ motifs: [CONFIRMED_FORK], stockfishEvalCp: 40 });
    expect(r.positionConfidence.level).toBe("engine_verified");
  });

  it("threads the forced-mate flag through (a SF mate is engine_verified)", () => {
    // cp is null during a mate (cp/mate are mutually exclusive on a line).
    const r = compileVoterResult({ stockfishEvalCp: null, stockfishBestMoveMate: 4 });
    expect(r.positionConfidence.level).toBe("engine_verified");
  });

  it("groundingContext is facts-only — the per-position ladder was removed", () => {
    const r = compileVoterResult({ stockfishEvalCp: 30 });
    expect(r.groundingContext).not.toContain("CONFIDENCE LADDER");
    expect(r.groundingContext).not.toContain("VERIFICATION:");
  });
});
