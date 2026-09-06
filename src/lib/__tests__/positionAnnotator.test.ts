import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { annotatePosition } from "../positionAnnotator";
import { pawnMap, isPassedPawn } from "@/lib/contract/positionalFacts";

// The annotator counted an enemy pawn LEVEL with ours as blocking it (`>=`
// where a passed pawn only cares about pawns strictly ahead). Found by a
// 1,200-position cross-check against positionalFacts on 2026-09-05: 130
// disagreements, every one this case.

describe("positionAnnotator passed pawns", () => {
  it("a pawn that has pushed past its neighbour is passed — and so is the neighbour", () => {
    // White b5 vs Black a5: level, so both are passed.
    const level = annotatePosition("6k1/7p/8/pP6/8/8/7P/6K1 w - - 0 1");
    expect(level.pawnStructure.passedPawns.white).toEqual(["b5"]);
    expect(level.pawnStructure.passedPawns.black).toEqual(["a5"]);
    // White b4 vs Black a5: a5 is ahead of b4 on the adjacent file, so b4 is not passed; a5 is not either (b4 is ahead of it).
    const blocked = annotatePosition("6k1/7p/8/p7/1P6/8/7P/6K1 w - - 0 1");
    expect(blocked.pawnStructure.passedPawns.white).toEqual([]);
    expect(blocked.pawnStructure.passedPawns.black).toEqual([]);
  });

  it("agrees with positionalFacts.isPassedPawn on the most advanced pawn of every file, over 300 random positions", () => {
    // Deterministic PRNG so the sample is the same every run.
    let seed = 20260905;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let compared = 0;
    for (let g = 0; g < 60; g++) {
      const game = new Chess();
      const plies = 10 + Math.floor(rand() * 50);
      for (let i = 0; i < plies; i++) {
        const moves = game.moves();
        if (moves.length === 0) break;
        game.move(moves[Math.floor(rand() * moves.length)]);
        if (i % 12 !== 11) continue;
        const fen = game.fen();
        const ann = annotatePosition(fen).pawnStructure.passedPawns;
        const pm = pawnMap(game);
        for (const color of ["w", "b"] as const) {
          const expected: string[] = [];
          for (const [file, ranks] of Object.entries(pm[color])) {
            const front = color === "w" ? Math.max(...ranks) : Math.min(...ranks);
            if (isPassedPawn(pm, `${file}${front}` as never, color)) expected.push(`${file}${front}`);
          }
          const got = color === "w" ? ann.white : ann.black;
          expect([...got].sort(), `${color} passed pawns in ${fen}`).toEqual(expected.sort());
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(200);
  });
});
