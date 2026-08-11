import { describe, expect, it } from "vitest";
import { buildCompactGameContext } from "@/lib/coach/compactGameContext";
import type { GameEvalInput } from "@/lib/contract/gameEvalSchema";

/**
 * C2 — a never-evaluated move is narrated as a "blunder" on the Haiku
 * follow-up path. (SILENT_SUBSTITUTION_HANDOFF §3 Group C.)
 *
 * The sentinel guard already existed here and was doing half its job: it
 * suppressed the eval SWING (`drop` is forced to 0), but the label ladder
 * then falls through to `evalAfter.moveClassification` — so the timed-out
 * ply is still stamped with whatever classification the client attached.
 * The comment twenty lines above the bug says the guard exists "so a stalled
 * position can't narrate as a fabricated blunder"; it did not do that.
 *
 * Forcing `drop = 0` is precisely what GUARANTEES the fall-through: the three
 * severity branches above it all require a drop, so control reaches the
 * classification branch every time.
 */

const line = (over: Record<string, unknown> = {}) => ({
  pv: ["e2e4"],
  depth: 16,
  multiPv: 1,
  ...over,
});

const MOVES = ["e4", "e5", "Nf3", "Nc6"];

function ctx(positions: GameEvalInput["positions"]): string {
  return buildCompactGameContext(MOVES, { positions }, "w");
}

describe("C2 — sentinel plies carry no classification in the compact context", () => {
  it("does not label a timed-out ply with the client's classification", () => {
    const out = ctx([
      { lines: [line({ cp: 30 })] },
      // The engine never finished this position.
      { lines: [line({ cp: 0, depth: 0 })], moveClassification: "blunder" },
      { lines: [line({ cp: 25 })] },
      { lines: [line({ cp: 20 })] },
      { lines: [line({ cp: 15 })] },
    ]);
    expect(out).not.toContain("blunder");
  });

  it("does not label the ply AFTER a sentinel either", () => {
    // The swing for ply N reads positions[N] and positions[N+1]; a sentinel
    // therefore poisons two moves, not one.
    const out = ctx([
      { lines: [line({ cp: 30 })] },
      { lines: [line({ cp: 25 })] },
      { lines: [line({ cp: 0, depth: 0 })] },
      { lines: [line({ cp: 20 })], moveClassification: "mistake" },
      { lines: [line({ cp: 15 })] },
    ]);
    expect(out).not.toContain("mistake");
  });

  it("still labels a real move with its real classification", () => {
    const out = ctx([
      { lines: [line({ cp: 30 })] },
      { lines: [line({ cp: 25 })], moveClassification: "excellent" },
      { lines: [line({ cp: 20 })] },
      { lines: [line({ cp: 15 })] },
      { lines: [line({ cp: 10 })] },
    ]);
    expect(out).toContain("excellent");
  });

  it("still narrates a real blunder from a real eval swing", () => {
    const out = ctx([
      { lines: [line({ cp: 600 })] },
      { lines: [line({ cp: -50 })] }, // White threw away ~6.5 pawns at ply 0
      { lines: [line({ cp: -60 })] },
      { lines: [line({ cp: -70 })] },
      { lines: [line({ cp: -80 })] },
    ]);
    expect(out).toContain("BLUNDER");
  });

  it("keeps the PGN section regardless", () => {
    const out = ctx([{ lines: [line({ cp: 0, depth: 0 })] }]);
    expect(out).toContain("## MOVES PLAYED (PGN)");
  });
});
