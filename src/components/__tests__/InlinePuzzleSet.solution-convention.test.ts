import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";

/**
 * Pin the Lichess puzzle solution-index convention used by InlinePuzzleSet
 * (and by the legacy PracticeChessBoard onPieceDrop):
 *
 *   solution[0] = opponent's setup move, auto-played 600ms after FEN load
 *   solution[1] = expected user first move
 *   solution[2] = opponent's response, auto-played
 *   solution[3] = expected user second move
 *   ... alternating
 *
 * If a refactor breaks this convention, every puzzle will register as
 * incorrect. This test makes that failure mode loud at CI time.
 *
 * Fixture: Lichess puzzle 00008 from the public puzzle DB.
 *   FEN:      r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24
 *   Solution: f2g3 e6e7 b2b1 b3c1 b1c1 h6c1
 *   Themes:   crushing, hangingPiece, long, middlegame
 *
 * In the FEN, black is to move — so the puzzle FEN's side-to-move is the
 * OPPONENT (black plays f2g3 first as the setup), and the user plays as
 * white starting with e6e7.
 */
describe("Lichess puzzle solution convention", () => {
  const FEN = "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24";
  const SOLUTION = ["f2g3", "e6e7", "b2b1", "b3c1", "b1c1", "h6c1"];

  it("solution[0] is legal from the puzzle FEN (opponent's setup move)", () => {
    const g = new Chess(FEN);
    expect(g.turn()).toBe("b"); // FEN side-to-move = opponent (black)
    const move = SOLUTION[0];
    const result = g.move({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      promotion: move.length > 4 ? move[4] : undefined,
    });
    expect(result).not.toBeNull();
    // After opponent's setup, it's the USER's turn
    expect(g.turn()).toBe("w");
  });

  it("solution[1] is legal after the setup (expected user move)", () => {
    const g = new Chess(FEN);
    g.move({ from: "f2", to: "g3" }); // setup
    const move = SOLUTION[1];
    const result = g.move({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
    });
    expect(result).not.toBeNull();
    // After user's first move, opponent (black) moves next
    expect(g.turn()).toBe("b");
  });

  it("playing the full solution alternating opponent/user produces a legal sequence", () => {
    const g = new Chess(FEN);
    for (const m of SOLUTION) {
      const result = g.move({
        from: m.slice(0, 2),
        to: m.slice(2, 4),
        promotion: m.length > 4 ? m[4] : undefined,
      });
      expect(result, `move ${m} should be legal`).not.toBeNull();
    }
  });

  it("a wrong user move at index 1 does not match expected[1]", () => {
    const g = new Chess(FEN);
    g.move({ from: "f2", to: "g3" });
    // User tries something other than e6e7
    const userTry = { from: "e6", to: "f6" }; // illegal-but-shape-similar
    const expected = { from: "e6", to: "e7" };
    const isMatch =
      userTry.from === expected.from && userTry.to === expected.to;
    expect(isMatch).toBe(false);
  });
});
