import { describe, it, expect } from "vitest";
import { buildCurrentPositionFacts, buildFenPositionFacts } from "../positionFacts";

describe("buildFenPositionFacts", () => {
  it("emits the CURRENTLY VIEWED POSITION block for a valid FEN", () => {
    // After 1.e4 e5 2.Nf3 — Black to move, knight on f3.
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";
    const out = buildFenPositionFacts(fen);
    expect(out).toContain("## CURRENTLY VIEWED POSITION");
    expect(out).toContain(`FEN: ${fen}`);
    expect(out).toContain("Nf3");
    expect(out).toContain("Black to move.");
    expect(out).toMatch(/do NOT reconstruct/);
  });

  it("returns empty for an unparseable FEN (caller falls back to context)", () => {
    expect(buildFenPositionFacts("not-a-fen")).toBe("");
  });
});

describe("buildCurrentPositionFacts", () => {
  it("returns empty for no moves", () => {
    expect(buildCurrentPositionFacts([])).toBe("");
    expect(buildCurrentPositionFacts(undefined)).toBe("");
  });

  it("emits the FINAL POSITION block with FEN, piece map, side-to-move, last move", () => {
    // 1.e4 e5 2.Nf3 — White's knight on f3, Black to move.
    const out = buildCurrentPositionFacts(["e4", "e5", "Nf3"]);
    expect(out).toContain("## FINAL POSITION");
    expect(out).toMatch(/FEN: .+ b /); // black to move in the FEN
    expect(out).toContain("Black to move. Last move played: Nf3.");
    // piece map names pieces by square (White knight now on f3, not g1).
    expect(out).toMatch(/White pieces:.*Nf3/);
    expect(out).not.toMatch(/White pieces:.*Ng1/);
    expect(out).toMatch(/Black pieces:.*Pe5/);
    // anti-reconstruction instruction present
    expect(out).toMatch(/do NOT reconstruct the board/);
  });

  it("includes the current eval when gameEval is provided", () => {
    const gameEval = {
      positions: [
        { lines: [{ cp: 20 }] }, // after 0 moves
        { lines: [{ cp: 30 }] }, // after 1
        { lines: [{ cp: 25 }] }, // after 2
        { lines: [{ cp: 40 }] }, // after 3 (current)
      ],
    };
    const out = buildCurrentPositionFacts(["e4", "e5", "Nf3"], gameEval);
    expect(out).toContain("Current eval: +0.40");
  });

  it("reports a forced mate eval correctly", () => {
    const gameEval = { positions: [{}, {}, { lines: [{ mate: 1 }] }] };
    const out = buildCurrentPositionFacts(["f3", "e5"], gameEval);
    expect(out).toContain("Current eval: M+1");
  });

  it("stops cleanly at an illegal move rather than throwing", () => {
    const out = buildCurrentPositionFacts(["e4", "e5", "Qz9"]);
    expect(out).toContain("## FINAL POSITION");
    // replayed only the two legal moves; White to move after e4 e5.
    expect(out).toContain("White to move.");
  });
});
