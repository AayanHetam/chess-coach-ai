import { describe, expect, it } from "vitest";
import { buildCompactGameContext } from "@/lib/coach/compactGameContext";
import type { GameEvalInput } from "@/lib/contract/gameEvalSchema";

/**
 * T8 on the Haiku follow-up path (SILENT_SUBSTITUTION_HANDOFF §4).
 *
 * The compact context is what every turn after the first is narrated from, so
 * a fabricated severity here is repeated for the rest of the conversation.
 *
 * Two things have to be suppressed together, and the C2 fix is the reason why:
 * forcing `drop = 0` guarantees the three severity branches all miss, so
 * control falls through to `evalAfter.moveClassification` — which the client
 * computed from the SAME incomparable pair. Zeroing the drop alone would just
 * move the fabrication one line down.
 */

const line = (cp: number, depth: number) => ({ pv: ["e2e4"], cp, depth, multiPv: 1 });
const MOVES = ["e4", "e5", "Nf3", "Nc6"];
const SETTINGS = { engine: "stockfish-17", date: "2026-01-01", depth: 16, multiPv: 3 };

/** Index 1 is the position the engine had to retry 4 plies shallower. */
function positions(retryDepth: number): GameEvalInput["positions"] {
  const ps = [0, 1, 2, 3, 4].map(() => ({ lines: [line(30, 16)] }) as GameEvalInput["positions"][number]);
  ps[1] = { lines: [line(-90, retryDepth)], moveClassification: "blunder" };
  return ps;
}

describe("T8 — the compact context does not narrate a mixed-depth swing", () => {
  it("the fixture really does produce a severity label (guards against a vacuous test)", () => {
    // Same numbers, uniform depth: the swing is real as far as the payload is
    // concerned, and the context says so.
    const out = buildCompactGameContext(MOVES, { positions: positions(16), settings: SETTINGS }, "w");
    expect(out).toMatch(/INACCURACY|MISTAKE|BLUNDER/);
  });

  it("prints no severity for a pair the engine searched to different depths", () => {
    const out = buildCompactGameContext(MOVES, { positions: positions(12), settings: SETTINGS }, "w");
    expect(out).not.toMatch(/INACCURACY|MISTAKE|BLUNDER/);
  });

  /**
   * The fall-through needs its own fixture. With a 120cp gap the severity
   * ladder matches first, so `moveClassification` is never consulted and a
   * test using that fixture would pass whether or not the guard exists —
   * green for the wrong reason. A gap UNDER 50cp is what actually reaches the
   * classification branch.
   */
  function smallGap(retryDepth: number): GameEvalInput["positions"] {
    const ps = [0, 1, 2, 3, 4].map(() => ({ lines: [line(30, 16)] }) as GameEvalInput["positions"][number]);
    ps[1] = { lines: [line(10, retryDepth)], moveClassification: "blunder" };
    return ps;
  }

  it("the small-gap fixture really does reach the classification branch", () => {
    const out = buildCompactGameContext(MOVES, { positions: smallGap(16), settings: SETTINGS }, "w");
    expect(out).toContain("blunder");
    // Confirms it arrived via the fall-through, not the severity ladder.
    expect(out).not.toMatch(/INACCURACY|MISTAKE|BLUNDER/);
  });

  it("does not fall through to the client's own classification either", () => {
    // The classification was computed from the same incomparable subtraction,
    // so it is no more trustworthy than the drop this guard just discarded.
    const out = buildCompactGameContext(MOVES, { positions: smallGap(12), settings: SETTINGS }, "w");
    expect(out).not.toContain("blunder");
  });
});
