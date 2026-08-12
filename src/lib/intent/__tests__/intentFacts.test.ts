import { describe, it, expect } from "vitest";
import {
  computeIntentFacts,
  toCp,
  whiteRelativeToMover,
  MATE_CP,
  PROPHYLAXIS_MIN_SWING_CP,
} from "../intentFacts";
import type { EngineLine, IntentProbe } from "../types";

const line = (san: string, cp: number | null, mate: number | null = null, pv: string[] = []): EngineLine => ({
  san,
  score: { cp, mate },
  pv: pv.length ? pv : [san],
  depth: 16,
});

/** A probe with everything switched off; each test turns on only what it means to test. */
function probe(over: Partial<IntentProbe> = {}): IntentProbe {
  return {
    fenBefore: "8/8/8/8/8/8/8/K6k w - - 0 1",
    playedSan: "Kb1",
    fenAfter: "8/8/8/8/8/8/8/1K5k b - - 1 1",
    rootLines: [line("Kb1", 0)],
    threat: null,
    threatAfter: null,
    threatStillLegal: true,
    playedScore: { cp: 0, mate: null },
    moverHasPieces: true,
    ...over,
  };
}

// ─── score conventions ─────────────────────────────────────────────────────
// These are the guardrails. A sign error here does not throw, it silently
// inverts every comparison downstream, so they are tested directly.

describe("score conventions", () => {
  it("leaves White-to-move scores alone and flips Black-to-move ones", () => {
    expect(whiteRelativeToMover({ cp: 180, mate: null }, "w")).toEqual({ cp: 180, mate: null });
    expect(whiteRelativeToMover({ cp: 180, mate: null }, "b")).toEqual({ cp: -180, mate: null });
    expect(whiteRelativeToMover({ cp: null, mate: 3 }, "b")).toEqual({ cp: null, mate: -3 });
  });

  it("real case: Black is winning at -599 White-relative, which is +599 to Black", () => {
    // game_02 before h5, Black to move. Raw engine cp is White-relative.
    expect(toCp(whiteRelativeToMover({ cp: -599, mate: null }, "b"))).toBe(599);
  });

  it("ranks a mate above any material score, and a shorter mate above a longer one", () => {
    expect(toCp({ cp: null, mate: 1 })).toBe(MATE_CP - 1);
    expect(toCp({ cp: null, mate: 5 })).toBe(MATE_CP - 5);
    expect(toCp({ cp: null, mate: 1 })).toBeGreaterThan(toCp({ cp: null, mate: 5 })!);
    expect(toCp({ cp: null, mate: 1 })).toBeGreaterThan(toCp({ cp: 2000, mate: null })!);
    expect(toCp({ cp: null, mate: -2 })).toBe(-(MATE_CP - 2));
  });
});

// ─── prophylaxis ───────────────────────────────────────────────────────────

describe("prophylaxis", () => {
  it("detects the real h5 case with the measured numbers", () => {
    // Measured: White's best free move at the pre-h5 position was Qg4 at +180.
    // Forced after h5 it scores -966. Both are from White's side.
    const f = computeIntentFacts(
      probe({
        playedSan: "h5",
        threat: line("Qg4", 180),
        threatAfter: line("Qg4", -966),
        threatStillLegal: true,
      }),
    );
    expect(f.prophylaxis).not.toBeNull();
    expect(f.prophylaxis!.threatSan).toBe("Qg4");
    expect(f.prophylaxis!.swingCp).toBe(1146);
    expect(f.prophylaxis!.preventedOutright).toBe(false);
  });

  it("CONTROL: a threat that barely moves is NOT reported", () => {
    // Without this, the h5 assertion above could pass simply because any
    // threat probe produces a fact.
    const f = computeIntentFacts(
      probe({ threat: line("Nf3", 30), threatAfter: line("Nf3", 10), threatStillLegal: true }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.notes.join(" ")).toContain("below");
  });

  it("treats a threat the move made illegal as prevention outright", () => {
    const f = computeIntentFacts(
      probe({ threat: line("Qxh7#", null, 1), threatAfter: null, threatStillLegal: false }),
    );
    expect(f.prophylaxis!.preventedOutright).toBe(true);
    expect(f.prophylaxis!.scoreAfterCp).toBeNull();
    expect(f.prophylaxis!.swingCp).toBeNull();
    expect(f.prophylaxis!.defusedMate).toBe(true);
  });

  it("fires exactly at the threshold and not one centipawn below", () => {
    const at = computeIntentFacts(
      probe({ threat: line("Qg4", PROPHYLAXIS_MIN_SWING_CP), threatAfter: line("Qg4", 0) }),
    );
    expect(at.prophylaxis).not.toBeNull();
    const below = computeIntentFacts(
      probe({ threat: line("Qg4", PROPHYLAXIS_MIN_SWING_CP - 1), threatAfter: line("Qg4", 0) }),
    );
    expect(below.prophylaxis).toBeNull();
  });

  it("reports nothing when no threat was probed", () => {
    expect(computeIntentFacts(probe({ threat: null })).prophylaxis).toBeNull();
  });

  // ── the least-bad-move trap ──────────────────────────────────────────────
  // The null move ALWAYS returns something. When the opponent has nothing
  // going on it returns their least-bad option, and any decent move then makes
  // that option look worse — which reads as a defence against a threat that
  // never existed. Both fixtures below are real, measured at depth 16.

  it("rejects a 'threat' that was only the opponent's least-bad move (real fxg3 case)", () => {
    // game_02 move 18: a free tempo was worth just 60cp to the opponent
    // (-136 null score against a -196 baseline), and Qb7 was losing either way.
    const f = computeIntentFacts(
      probe({
        playedSan: "fxg3",
        rootLines: [line("Qg4", 196), line("fxg3", -218)],
        playedScore: { cp: -218, mate: null },
        threat: line("Qb7", -136),
        threatAfter: line("Qb7", -378),
      }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.notes.join(" ")).toContain("no threat");
  });

  it("CONTROL: h5 still passes the tempo gate (real numbers)", () => {
    // Same gate, real threat: a free tempo was worth 628cp to White.
    const f = computeIntentFacts(
      probe({
        playedSan: "h5",
        rootLines: [line("Rf5", 462), line("h5", 0)],
        playedScore: { cp: 0, mate: null },
        threat: line("Qg4", 166),
        threatAfter: line("Qg4", -917),
      }),
    );
    expect(f.prophylaxis).not.toBeNull();
    expect(f.prophylaxis!.threatSan).toBe("Qg4");
    expect(f.prophylaxis!.swingCp).toBe(1083);
  });
});

// ─── cost ──────────────────────────────────────────────────────────────────

describe("cost", () => {
  it("prices the real h5 case: f6 was +599, h5 was 0", () => {
    const f = computeIntentFacts(
      probe({
        playedSan: "h5",
        rootLines: [line("f6", 599), line("Rf5", 542)],
        playedScore: { cp: 0, mate: null },
      }),
    );
    expect(f.cost).toEqual({ bestSan: "f6", bestCp: 599, playedCp: 0, lossCp: 599, mateChange: null });
  });

  it("reports nothing when the played move IS the best move", () => {
    const f = computeIntentFacts(
      probe({ playedSan: "f6", rootLines: [line("f6", 599)], playedScore: { cp: 599, mate: null } }),
    );
    expect(f.cost).toBeNull();
  });

  it("never reports a negative loss when search noise makes the played move look better", () => {
    const f = computeIntentFacts(
      probe({ rootLines: [line("f6", 500)], playedScore: { cp: 540, mate: null } }),
    );
    expect(f.cost).toBeNull();
  });

  // ── mate scores must never enter a centipawn subtraction ────────────────
  // Before these branches existed, the harness printed "COST 30929cp" on a
  // real position — a mate score minus a material score, rendered as 309 pawns.

  it("reports giving up a forced mate categorically, not as centipawns", () => {
    const f = computeIntentFacts(
      probe({ rootLines: [line("Qh8#", null, 1)], playedScore: { cp: 50, mate: null } }),
    );
    expect(f.cost!.mateChange).toBe("gave-up-mate");
    expect(f.cost!.lossCp).toBeNull();
    expect(f.cost!.bestCp).toBeNull();
  });

  it("reports walking into mate categorically (the real Qxf2 / Kf6 case)", () => {
    const f = computeIntentFacts(
      probe({ rootLines: [line("Qd4+", 930)], playedScore: { cp: null, mate: -1 } }),
    );
    expect(f.cost!.mateChange).toBe("allowed-mate");
    expect(f.cost!.lossCp).toBeNull();
  });

  it("says nothing when both lines mate — a slower mate is still a mate", () => {
    const f = computeIntentFacts(
      probe({ rootLines: [line("Qh8#", null, 1)], playedScore: { cp: null, mate: 4 } }),
    );
    expect(f.cost).toBeNull();
  });

  it("CONTROL: no lossCp is ever a mate-sized number", () => {
    // The defect this whole block exists for: any lossCp above a few thousand
    // centipawns means a mate score leaked into the subtraction.
    for (const played of [{ cp: 50, mate: null }, { cp: null, mate: -1 }, { cp: -900, mate: null }]) {
      for (const best of [line("a", 930), line("b", null, 1)]) {
        const f = computeIntentFacts(probe({ rootLines: [best], playedScore: played }));
        if (f.cost?.lossCp != null) expect(Math.abs(f.cost.lossCp)).toBeLessThan(5000);
      }
    }
  });
});

// ─── quiet / zugzwang guard ────────────────────────────────────────────────

describe("quiet positions and the zugzwang guard", () => {
  it("says quiet when nothing was found and the position is flat", () => {
    const f = computeIntentFacts(
      probe({ rootLines: [line("Nf3", 27), line("d4", 26), line("e4", 22)], playedScore: { cp: 27, mate: null } }),
    );
    expect(f.sharpness).toBe("flat");
    expect(f.quiet).toBe(true);
    expect(f.urgencySuppressed).toBe(false);
  });

  it("refuses to call a king-and-pawn position quiet", () => {
    const f = computeIntentFacts(
      probe({
        rootLines: [line("Kd4", 10), line("Kd5", 8)],
        playedScore: { cp: 10, mate: null },
        moverHasPieces: false,
      }),
    );
    expect(f.sharpness).toBe("flat");
    expect(f.quiet).toBe(false);
    expect(f.urgencySuppressed).toBe(true);
  });

  it("is not quiet when something concrete was found, however flat the spread", () => {
    const f = computeIntentFacts(
      probe({
        rootLines: [line("h5", 10), line("Re8", 5)],
        playedScore: { cp: 10, mate: null },
        threat: line("Qg4", 180),
        threatAfter: line("Qg4", -966),
      }),
    );
    expect(f.sharpness).toBe("flat");
    expect(f.quiet).toBe(false);
  });

  it("buckets sharpness at the documented boundaries", () => {
    const at = (gap: number) =>
      computeIntentFacts(probe({ rootLines: [line("a", gap), line("b", 0)], playedScore: { cp: gap, mate: null } }))
        .sharpness;
    expect(at(150)).toBe("only-move");
    expect(at(149)).toBe("clearly-best");
    expect(at(50)).toBe("clearly-best");
    expect(at(49)).toBe("slight-edge");
    expect(at(20)).toBe("slight-edge");
    expect(at(19)).toBe("flat");
  });
});
