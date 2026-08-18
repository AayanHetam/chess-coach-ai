import { describe, expect, it } from "vitest";
import { buildCurrentPositionFacts } from "../positionFacts";

/**
 * C1 — `Current eval: +0.00` fabricated for a position the engine never
 * evaluated. (SILENT_SUBSTITUTION_HANDOFF §3 Group C.)
 *
 * This is the single most prominent number in the follow-up prompt: the block
 * is unshifted to the FRONT of the compact context, and the eval is its last
 * line. When the client Stockfish times out it emits `{cp: 0, depth: 0}`, the
 * `if (curEval)` guard passes because that object is truthy, and a position
 * that is actually +6.2 is presented to the model as dead equal — so "am I
 * winning?" gets answered "it's balanced", and the coach recommends holding a
 * draw in a won game.
 *
 * The second failure mode is `cp ?? 0`: a line carrying neither `cp` nor
 * `mate` also renders as a confident +0.00.
 */

const MOVES = ["e4", "e5", "Nf3", "Nc6"];

/** gameEval whose position[4] (after 4 plies) is whatever we pass. */
const evalWith = (line: Record<string, unknown>) => ({
  positions: [{}, {}, {}, {}, { lines: [line] }] as never,
});

describe("C1 — the current eval is omitted rather than fabricated", () => {
  it("omits the eval for a client timeout sentinel", () => {
    const out = buildCurrentPositionFacts(MOVES, evalWith({ cp: 0, depth: 0 }));
    expect(out).not.toContain("Current eval");
    expect(out).not.toContain("+0.00");
  });

  it("omits the eval when the line carries neither cp nor mate", () => {
    // `cp ?? 0` used to render this as a confident +0.00.
    const out = buildCurrentPositionFacts(MOVES, evalWith({ depth: 18 }));
    expect(out).not.toContain("Current eval");
  });

  it("omits the eval when cp and mate are both null", () => {
    const out = buildCurrentPositionFacts(
      MOVES,
      evalWith({ cp: null, mate: null, depth: 18 })
    );
    expect(out).not.toContain("Current eval");
  });

  it("still renders a real eval", () => {
    const out = buildCurrentPositionFacts(MOVES, evalWith({ cp: 620, depth: 18 }));
    expect(out).toContain("Current eval: +6.20");
  });

  it("still renders a real mate score", () => {
    const out = buildCurrentPositionFacts(MOVES, evalWith({ mate: 3, depth: 18 }));
    expect(out).toContain("Current eval: M+3");
  });

  it("renders a genuine 0.00 when the engine actually evaluated it as equal", () => {
    // The guard must key on depth/absence, NOT on the value being zero —
    // a real dead-equal position is a legitimate and useful fact.
    const out = buildCurrentPositionFacts(MOVES, evalWith({ cp: 0, depth: 18 }));
    expect(out).toContain("Current eval: +0.00");
  });

  it("keeps the rest of the block intact when the eval is dropped", () => {
    const out = buildCurrentPositionFacts(MOVES, evalWith({ cp: 0, depth: 0 }));
    expect(out).toContain("## FINAL POSITION");
    expect(out).toContain("FEN: ");
    expect(out).toContain("White pieces: ");
    expect(out).toContain("to move. Last move played: Nc6.");
  });
});
