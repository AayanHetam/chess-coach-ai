import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { buildMoveChoices } from "@/lib/puzzle/moveChoices";

// Lichess puzzle 0vFpB, at the student's starting position (after the
// opponent's setup move Ne4). Solution: Rd1xd8+.
const FEN = "2rr2k1/pq3pp1/1p2p2p/2b1N3/4n1P1/2N1P3/PP3P1P/1KRR3Q w - - 1 20";
const SOLUTION = "d1d8";

describe("buildMoveChoices", () => {
  it("returns four options containing exactly one solution", () => {
    const opts = buildMoveChoices(FEN, SOLUTION);
    expect(opts).toHaveLength(4);
    expect(opts.filter((o) => o.isSolution)).toHaveLength(1);
    expect(opts.find((o) => o.isSolution)?.uci).toBe(SOLUTION);
  });

  it("returns no duplicate moves", () => {
    const opts = buildMoveChoices(FEN, SOLUTION);
    expect(new Set(opts.map((o) => o.uci)).size).toBe(opts.length);
  });

  it("offers only legal moves", () => {
    // Every option must be playable — an illegal option would be unanswerable
    // and would desync the board the moment it was picked.
    for (const o of buildMoveChoices(FEN, SOLUTION)) {
      const g = new Chess(FEN);
      const played = g.move({
        from: o.uci.slice(0, 2),
        to: o.uci.slice(2, 4),
        promotion: o.uci.length > 4 ? o.uci.slice(4) : "q",
      });
      expect(played, `${o.san} should be legal`).toBeTruthy();
    }
  });

  it("is deterministic — same position, same order, every call", () => {
    // A reshuffle on re-render would move the answer under the user's finger.
    const a = buildMoveChoices(FEN, SOLUTION);
    for (let i = 0; i < 20; i++) {
      expect(buildMoveChoices(FEN, SOLUTION)).toEqual(a);
    }
  });

  it("does not always put the answer in the same slot", () => {
    // Guards the other failure mode: a stable order that always puts the
    // solution first is trivially gameable.
    const positions: Array<[string, string]> = [
      [FEN, SOLUTION],
      [
        "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
        "f3f7",
      ],
      [
        "rnbqkbnr/pppp1ppp/8/4p3/5PP1/8/PPPPP2P/RNBQKBNR b KQkq - 0 2",
        "d8h4",
      ],
    ];
    const slots = positions.map(([fen, sol]) =>
      buildMoveChoices(fen, sol).findIndex((o) => o.isSolution),
    );
    expect(new Set(slots).size).toBeGreaterThan(1);
  });

  it("prefers tempting distractors — checks and captures", () => {
    const opts = buildMoveChoices(FEN, SOLUTION);
    const distractors = opts.filter((o) => !o.isSolution);
    // Four options where three are quiet pawn shuffles is not a question.
    expect(
      distractors.some((d) => d.san.includes("x") || d.san.includes("+")),
    ).toBe(true);
  });

  it("fails closed when the solution is not legal in this position", () => {
    // Wrong FEN for the solution means a question with no right answer.
    // Returning [] tells the caller to fall back to the board.
    expect(buildMoveChoices(FEN, "a1a8")).toEqual([]);
  });

  it("fails closed on an unparseable FEN", () => {
    expect(buildMoveChoices("not-a-fen", SOLUTION)).toEqual([]);
  });

  it("returns everything available when the position has fewer moves", () => {
    // Bare-king ending with exactly three legal replies. The option list must
    // shrink to what exists rather than padding with illegal filler.
    const tight = "7k/8/8/8/8/8/8/R6K b - - 0 1";
    const opts = buildMoveChoices(tight, "h8g8");
    expect(opts).toHaveLength(3);
    expect(opts.filter((o) => o.isSolution)).toHaveLength(1);
  });

  it("fails closed in a position with no legal moves at all", () => {
    // Checkmate: there is nothing to ask. Returning [] makes the caller fall
    // back to the board instead of rendering an empty question.
    expect(buildMoveChoices("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1", "h8g7")).toEqual(
      [],
    );
  });

  it("honours a smaller requested count", () => {
    const opts = buildMoveChoices(FEN, SOLUTION, 2);
    expect(opts).toHaveLength(2);
    expect(opts.filter((o) => o.isSolution)).toHaveLength(1);
  });
});
