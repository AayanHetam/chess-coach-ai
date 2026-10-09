import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  gradeMove,
  moverMate,
  moverWin,
  rankForMover,
  sideToMove,
  type ScoredMove,
} from "@/lib/engine/gradeMove";
import { parseMovesResults } from "@/lib/engine/helpers/parseMovesResults";
import { sortLines } from "@/lib/engine/helpers/parseResults";
import { getLineWinPercentage } from "@/lib/engine/helpers/winPercentage";
import { MoveClassification as C } from "@/types/enums";
import type { LineEval } from "@/types/eval";

/**
 * One move graded against another from one search (pathway 3.5). Scores
 * arrive White-relative and are read from the mover's side: the sign is
 * the P0 case, since a Black move that leaves White at +1.00 is a loss for
 * Black, never a gain.
 */

const WHITE_TO_MOVE = new Chess().fen();
const BLACK_TO_MOVE = (() => {
  const g = new Chess();
  g.move("e4");
  return g.fen();
})();

const win = (cp: number) =>
  getLineWinPercentage({ pv: [], depth: 0, multiPv: 1, cp });

describe("the side to move", () => {
  it("reads it from the FEN, and nothing from a bad one", () => {
    expect(sideToMove(WHITE_TO_MOVE)).toBe("w");
    expect(sideToMove(BLACK_TO_MOVE)).toBe("b");
    expect(sideToMove("garbage")).toBeNull();
    expect(sideToMove("8/8/8/8/8/8/8/K6k x - - 0 1")).toBeNull();
  });
});

describe("the sign, both ways", () => {
  // White +1.00 against 0.00, from one search.
  const moves: ScoredMove[] = [
    { uci: "a", cp: 100, depth: 12 },
    { uci: "b", cp: 0, depth: 14 },
  ];

  it("a Black move that leaves White at +1.00 is a loss for Black", () => {
    const g = gradeMove({ fen: BLACK_TO_MOVE, moves }, "a")!;
    expect(g.mover).toBe("b");
    expect(g.reference).toBe("b");
    expect(g.win).toBeCloseTo(100 - win(100), 10);
    expect(g.referenceWin).toBe(50);
    expect(g.lossPts).toBeCloseTo(win(100) - 50, 10);
    expect(g.lossPts).toBeGreaterThan(5);
    expect(g.band).toBe(C.Inaccuracy);
    expect(g.depth).toBe(12);
  });

  it("the same numbers are White's best when White moves", () => {
    const g = gradeMove({ fen: WHITE_TO_MOVE, moves }, "a")!;
    expect(g.mover).toBe("w");
    expect(g.reference).toBe("a");
    expect(g.lossPts).toBe(0);
    expect(g.band).toBe(C.Best);
    expect(gradeMove({ fen: WHITE_TO_MOVE, moves }, "b")!.band).toBe(
      C.Inaccuracy
    );
  });

  it("reads the same through parseMovesResults with Black to move", () => {
    // The engine scores from the side to move: Black's -100 is White +1.00.
    const parsed = parseMovesResults(
      [
        "info depth 12 seldepth 15 multipv 1 score cp 0 nodes 10 pv e7e5 g1f3",
        "info depth 12 seldepth 15 multipv 2 score cp -100 nodes 10 pv a7a6 d2d4",
        "bestmove e7e5 ponder g1f3",
      ],
      BLACK_TO_MOVE,
      ["e7e5", "a7a6"]
    );
    expect(parsed.moves.find((m) => m.uci === "a7a6")!.cp).toBe(100);
    const g = gradeMove(parsed, "a7a6")!;
    expect(g.reference).toBe("e7e5");
    expect(g.lossPts).toBeCloseTo(win(100) - 50, 10);
    expect(g.band).toBe(C.Inaccuracy);
    expect(rankForMover(parsed).map((m) => m.uci)).toEqual(["e7e5", "a7a6"]);
  });
});

describe("mates", () => {
  const ranked = (fen: string, moves: ScoredMove[]) =>
    rankForMover({ fen, moves }).map((m) => m.uci);

  it("a shorter mate beats a longer one, for either side", () => {
    expect(
      ranked(WHITE_TO_MOVE, [
        { uci: "m3", mate: 3, depth: 10 },
        { uci: "m2", mate: 2, depth: 10 },
      ])
    ).toEqual(["m2", "m3"]);
    // Black mates: White-relative -2 and -3.
    expect(
      ranked(BLACK_TO_MOVE, [
        { uci: "m3", mate: -3, depth: 10 },
        { uci: "m2", mate: -2, depth: 10 },
      ])
    ).toEqual(["m2", "m3"]);
  });

  it("mated later beats mated sooner", () => {
    expect(
      ranked(WHITE_TO_MOVE, [
        { uci: "in3", mate: -3, depth: 10 },
        { uci: "in5", mate: -5, depth: 10 },
      ])
    ).toEqual(["in5", "in3"]);
    expect(
      ranked(BLACK_TO_MOVE, [
        { uci: "in3", mate: 3, depth: 10 },
        { uci: "in5", mate: 5, depth: 10 },
      ])
    ).toEqual(["in5", "in3"]);
  });

  it("a mate beats any cp, and any cp beats being mated", () => {
    expect(
      ranked(WHITE_TO_MOVE, [
        { uci: "cp", cp: 900, depth: 10 },
        { uci: "mated", mate: -9, depth: 10 },
        { uci: "mate", mate: 9, depth: 10 },
      ])
    ).toEqual(["mate", "cp", "mated"]);
    expect(
      ranked(BLACK_TO_MOVE, [
        { uci: "cp", cp: -900, depth: 10 },
        { uci: "mated", mate: 9, depth: 10 },
        { uci: "mate", mate: -9, depth: 10 },
      ])
    ).toEqual(["mate", "cp", "mated"]);
  });

  it("says a mate in the mover's terms", () => {
    expect(moverMate({ uci: "x", mate: -2, depth: 1 }, "b")).toBe(2);
    expect(moverMate({ uci: "x", mate: -2, depth: 1 }, "w")).toBe(-2);
    expect(moverMate({ uci: "x", cp: 50, depth: 1 }, "w")).toBeNull();
    const g = gradeMove(
      {
        fen: BLACK_TO_MOVE,
        moves: [
          { uci: "m2", mate: -2, depth: 10 },
          { uci: "q", cp: 0, depth: 10 },
        ],
      },
      "q"
    )!;
    expect(g.reference).toBe("m2");
    expect(g.referenceMate).toBe(2);
    expect(g.mate).toBeNull();
    expect(g.band).toBe(C.Blunder);
  });
});

/** A small seeded generator, so the shuffle is the same on every run. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("rankForMover keeps sortLines' order", () => {
  it("over shuffled synthetic lines, for both sides", () => {
    const next = rng(35);
    for (let round = 0; round < 50; round++) {
      // Side-to-move scores, all distinct, as the engine sends them.
      const cps = new Set<number>();
      const mates = new Set<number>();
      const lines: LineEval[] = [];
      const n = 2 + Math.floor(next() * 8);
      for (let i = 0; i < n; i++) {
        if (next() < 0.35) {
          let m = 0;
          while (m === 0 || mates.has(m)) m = Math.floor(next() * 21) - 10;
          mates.add(m);
          lines.push({ pv: [`m${i}`], mate: m, depth: 12, multiPv: i + 1 });
        } else {
          let cp = Math.floor(next() * 2001) - 1000;
          while (cps.has(cp)) cp += 1;
          cps.add(cp);
          lines.push({ pv: [`m${i}`], cp, depth: 12, multiPv: i + 1 });
        }
      }
      const expected = [...lines].sort(sortLines).map((l) => l.pv[0]);
      for (const fen of [WHITE_TO_MOVE, BLACK_TO_MOVE]) {
        const sign = sideToMove(fen) === "w" ? 1 : -1;
        const moves: ScoredMove[] = lines.map((l) => ({
          uci: l.pv[0],
          depth: l.depth,
          ...(l.mate !== undefined
            ? { mate: l.mate * sign }
            : { cp: l.cp! * sign }),
        }));
        expect(
          rankForMover({ fen, moves }).map((m) => m.uci),
          `round ${round}, ${sideToMove(fen)}`
        ).toEqual(expected);
      }
    }
  });
});

describe("what is not graded", () => {
  const moves: ScoredMove[] = [
    { uci: "a", cp: 30, depth: 12 },
    { uci: "zero", mate: 0, depth: 12 },
    { uci: "none", depth: 12 },
    { uci: "nan", cp: Number.NaN, depth: 12 },
  ];

  it("is null for mate 0, a missing move, an unscored move, or a bad FEN", () => {
    const fen = WHITE_TO_MOVE;
    expect(gradeMove({ fen, moves }, "zero")).toBeNull();
    expect(gradeMove({ fen, moves }, "none")).toBeNull();
    expect(gradeMove({ fen, moves }, "nan")).toBeNull();
    expect(gradeMove({ fen, moves }, "missing")).toBeNull();
    expect(gradeMove({ fen, moves }, "a", { reference: "zero" })).toBeNull();
    expect(gradeMove({ fen, moves }, "a", { reference: "missing" })).toBeNull();
    expect(gradeMove({ fen: "garbage", moves }, "a")).toBeNull();
    expect(moverWin(moves[1], "w")).toBeNull();
  });

  it("leaves unscored moves out of the ranking", () => {
    expect(
      rankForMover({ fen: WHITE_TO_MOVE, moves }).map((m) => m.uci)
    ).toEqual(["a"]);
    expect(rankForMover({ fen: "garbage", moves })).toEqual([]);
  });
});

describe("a reference worse than the move", () => {
  it("is no loss: band Best", () => {
    const g = gradeMove(
      {
        fen: WHITE_TO_MOVE,
        moves: [
          { uci: "good", cp: 150, depth: 16 },
          { uci: "worse", cp: -20, depth: 11 },
        ],
      },
      "good",
      { reference: "worse" }
    )!;
    expect(g.reference).toBe("worse");
    expect(g.lossPts).toBe(0);
    expect(g.band).toBe(C.Best);
    expect(g.depth).toBe(11);
  });
});
