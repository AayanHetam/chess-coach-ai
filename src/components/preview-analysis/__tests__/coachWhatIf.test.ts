import { describe, expect, it } from "vitest";
import type {
  EvaluateMovesParams,
  MovesEval,
  PositionEval,
} from "@/types/eval";
import { createEngineTurn } from "@/lib/engine/engineTurn";
import { parseMovesResults } from "@/lib/engine/helpers/parseMovesResults";
import {
  askedMoveEval,
  createWhatIfStore,
  initialWhatIfState,
  resolveWhatIf,
  whatIfJumpDecision,
  runWhatIf,
  WHAT_IF_DEPTH,
  whatIfLine,
  whatIfMoveLabel,
  whatIfScores,
  whatIfStateFrom,
  whatIfSummary,
  whatIfUnavailable,
  type WhatIfEngine,
} from "../coachWhatIf";

/** Fixture 07: 8. Nc7+ forks king and rook while 8. Qxc1 takes a free queen. */
const SANS = [
  "e4",
  "c5",
  "Nf3",
  "Nc6",
  "d4",
  "cxd4",
  "Nxd4",
  "Qb6",
  "Nf3",
  "Qxb2",
  "Na3",
  "Qxa1",
  "Nb5",
  "Qxc1",
  "Nc7+",
  "Kd8",
  "Nxa8",
  "Qxd1+",
  "Kxd1",
  "e5",
];
/** The position before 8. Nc7+ (14 plies in). */
const FEN_BEFORE_8 =
  "r1b1kbnr/pp1ppppp/2n5/1N6/4P3/5N2/P1P2PPP/2qQKB1R w Kkq - 0 8";

/** A sweep whose best at ply 14 is Qxc1 and whose other positions are blank. */
function sweep(bestAt14: string | null): PositionEval[] {
  return Array.from({ length: SANS.length + 1 }, (_, i) =>
    i === 14 && bestAt14
      ? { lines: [{ pv: [bestAt14, "a8b8"], depth: 16, multiPv: 1, cp: 251 }] }
      : { lines: [{ pv: [], depth: 0, multiPv: 1 }] }
  );
}

const ctx = (over: Partial<Parameters<typeof resolveWhatIf>[1]> = {}) => ({
  sans: SANS,
  viewedPly: 14,
  playerColor: "w" as const,
  enginePositions: sweep("d1c1"),
  ...over,
});

describe("resolveWhatIf: reading the question", () => {
  it("a numbered alternative sits at its own move, with the played move and the review's best beside it", () => {
    const ask = resolveWhatIf("why not 8. Qxc1?", ctx({ viewedPly: 0 }));
    expect(ask).not.toBeNull();
    expect(ask!.rule).toBe("asked_san");
    expect(ask!.index).toBe(14);
    expect(ask!.fen).toBe(FEN_BEFORE_8);
    expect(ask!.moveNumber).toBe(8);
    expect(ask!.color).toBe("w");
    expect(ask!.asked).toEqual({ role: "asked", uci: "d1c1", san: "Qxc1" });
    // The review's best IS the asked move, so it is not listed twice.
    expect(ask!.moves).toEqual([
      { role: "asked", uci: "d1c1", san: "Qxc1" },
      { role: "played", uci: "b5c7", san: "Nc7+" },
    ]);
  });

  it("a bare alternative is asked about the board the player is looking at, and the three roles all score", () => {
    const ask = resolveWhatIf("what about Nd6+ instead?", ctx());
    expect(ask).not.toBeNull();
    expect(ask!.rule).toBe("phrase");
    expect(ask!.index).toBe(14);
    expect(ask!.asked).toEqual({ role: "asked", uci: "b5d6", san: "Nd6+" });
    expect(ask!.moves.map((m) => m.role)).toEqual(["asked", "played", "best"]);
    expect(ask!.moves[2]).toEqual({ role: "best", uci: "d1c1", san: "Qxc1" });
  });

  it("without a review there is no best, only the played move", () => {
    const ask = resolveWhatIf(
      "what about Nd6+ instead?",
      ctx({ enginePositions: null })
    );
    expect(ask!.moves.map((m) => m.role)).toEqual(["asked", "played"]);
  });

  it("asking about the move that was played scores it against the best", () => {
    const ask = resolveWhatIf("what about 8. Nc7+?", ctx({ viewedPly: 0 }));
    expect(ask).not.toBeNull();
    expect(ask!.index).toBe(14);
    expect(ask!.asked.uci).toBe("b5c7");
    expect(ask!.moves.map((m) => m.role)).toEqual(["asked", "best"]);
  });

  it("a move that is not legal there is no what-if; the coach answers in words", () => {
    expect(resolveWhatIf("what about Qxf7+ instead?", ctx())).toBeNull();
    // Legal somewhere else in the game, not at move 8.
    expect(resolveWhatIf("why not 8. Kd8?", ctx())).toBeNull();
  });

  it("a verdict question, an action and small talk are not what-ifs", () => {
    expect(resolveWhatIf("why was 8. Nc7+ a mistake?", ctx())).toBeNull();
    expect(resolveWhatIf("go to move 8", ctx())).toBeNull();
    expect(resolveWhatIf("thanks!", ctx())).toBeNull();
    expect(resolveWhatIf("", ctx())).toBeNull();
    expect(resolveWhatIf("what about Nd6+?", ctx({ sans: [] }))).toBeNull();
  });

  it("the cursor past the last move still resolves a bare alternative at the final position", () => {
    // After 10... e5 (20 plies) it is White to move; Nb6 is the knight on a8.
    const ask = resolveWhatIf(
      "what about Nb6 instead?",
      ctx({ viewedPly: 99 })
    );
    expect(ask).not.toBeNull();
    expect(ask!.index).toBe(20);
    expect(ask!.moves.map((m) => m.role)).toEqual(["asked"]);
  });

  it("a FEN-rooted game is replayed from its root", () => {
    const rootFen = FEN_BEFORE_8;
    const ask = resolveWhatIf("what about Qxc1 instead?", {
      sans: ["Nc7+", "Kd8"],
      rootFen,
      viewedPly: 0,
      playerColor: "w",
    });
    expect(ask).not.toBeNull();
    expect(ask!.fen).toBe(rootFen);
    expect(ask!.moveNumber).toBe(8);
    expect(ask!.moves.map((m) => m.san)).toEqual(["Qxc1", "Nc7+"]);
  });
});

describe("whatIfLine and whatIfScores: from one search result", () => {
  const ask = resolveWhatIf("why not 8. Qxc1?", ctx({ viewedPly: 0 }))!;
  const result: MovesEval = {
    fen: FEN_BEFORE_8,
    depth: 12,
    moves: [
      {
        uci: "d1c1",
        san: "Qxc1",
        cp: 251,
        depth: 12,
        pv: ["d1c1", "a8b8", "c1f4", "g8f6"],
      },
      {
        uci: "b5c7",
        san: "Nc7+",
        cp: -97,
        depth: 12,
        pv: ["b5c7", "e8d8", "d1c1", "d8c7"],
      },
    ],
    missing: [],
    bestMove: "d1c1",
    source: "local",
    cold: true,
  };

  it("draws the asked move and the engine's reply, White-relative, at the result's depth", () => {
    const line = whatIfLine(ask, result);
    expect(line).toEqual({
      kind: "engine",
      anchorPly: 14,
      startFen: FEN_BEFORE_8,
      sans: ["Qxc1", "Rb8", "Qf4", "Nf6"],
      moveNumber: 8,
      startsWhite: true,
      evalDisplay: "+2.51",
      depth: 12,
    });
    expect(whatIfLine(ask, result, 2)!.sans).toEqual(["Qxc1", "Rb8"]);
  });

  it("puts every move's number beside its role, in the ask's order", () => {
    expect(whatIfScores(ask, result)).toEqual([
      {
        role: "asked",
        uci: "d1c1",
        san: "Qxc1",
        cp: 251,
        mate: undefined,
        depth: 12,
        evalDisplay: "+2.51",
      },
      {
        role: "played",
        uci: "b5c7",
        san: "Nc7+",
        cp: -97,
        mate: undefined,
        depth: 12,
        evalDisplay: "-0.97",
      },
    ]);
    expect(askedMoveEval(ask, result)?.cp).toBe(251);
  });

  it("a result without the asked move draws nothing and scores it as missing", () => {
    const without: MovesEval = { ...result, moves: [result.moves[1]] };
    expect(whatIfLine(ask, without)).toBeNull();
    expect(askedMoveEval(ask, without)).toBeNull();
    expect(whatIfScores(ask, without)[0].evalDisplay).toBeNull();
  });

  it("a mate score reads as a mate", () => {
    const mating: MovesEval = {
      ...result,
      moves: [{ ...result.moves[0], cp: undefined, mate: 3 }],
    };
    expect(whatIfLine(ask, mating)!.evalDisplay).toBe("M+3");
  });

  it("labels the asked move the way the strip does", () => {
    expect(whatIfMoveLabel(ask)).toBe("8. Qxc1");
    // After 9. Nxa8 Black played Qxd1+; Qa3 was legal instead.
    const black = resolveWhatIf("why not 9... Qa3?", ctx({ viewedPly: 0 }))!;
    expect(black.index).toBe(17);
    expect(whatIfMoveLabel(black)).toBe("9... Qa3");
  });
});

describe("runWhatIf: one search, reported as it deepens", () => {
  const ask = resolveWhatIf("why not 8. Qxc1?", ctx({ viewedPly: 0 }))!;
  const at = (depth: number): MovesEval => ({
    fen: FEN_BEFORE_8,
    depth,
    moves: ask.moves.map((m) => ({
      uci: m.uci,
      san: m.san,
      cp: m.role === "asked" ? 200 + depth : -100,
      depth,
      pv: [m.uci],
    })),
    missing: [],
    bestMove: "d1c1",
    source: "local",
    cold: true,
  });
  /** An engine that reports partials at the given depths, then resolves at the last. */
  const fakeEngine = (
    depths: number[]
  ): WhatIfEngine & { calls: EvaluateMovesParams[] } => {
    const calls: EvaluateMovesParams[] = [];
    return {
      calls,
      evaluateMoves: async (params) => {
        calls.push(params);
        for (const d of depths.slice(0, -1)) params.onPartial?.(at(d));
        return at(depths[depths.length - 1]);
      },
    };
  };

  it("asks for the ask's moves at the position in one call, reports partials from the first stable depth, then the final", async () => {
    const engine = fakeEngine([6, 8, 10, 12, 16]);
    const seen: Array<[number, boolean]> = [];
    const result = await runWhatIf({
      ask,
      engine,
      turn: createEngineTurn(),
      onResult: (r, final) => seen.push([r.depth, final]),
    });
    expect(engine.calls).toHaveLength(1);
    expect(engine.calls[0]).toMatchObject({
      fen: FEN_BEFORE_8,
      moves: ["d1c1", "b5c7"],
      depth: WHAT_IF_DEPTH,
    });
    expect(seen).toEqual([
      [10, false],
      [12, false],
      [16, true],
    ]);
    expect(result?.depth).toBe(16);
  });

  it("a shallower first depth can be asked for", async () => {
    const engine = fakeEngine([6, 8, 16]);
    const seen: number[] = [];
    await runWhatIf({
      ask,
      engine,
      turn: createEngineTurn(),
      firstDepth: 8,
      depth: 12,
      onResult: (r) => seen.push(r.depth),
    });
    expect(engine.calls[0].depth).toBe(12);
    expect(seen).toEqual([8, 16]);
  });

  it("waits its turn behind another engine job and holds the engine until the search ends", async () => {
    const turn = createEngineTurn();
    const log: string[] = [];
    let releaseLive!: () => void;
    const live = turn.run(
      () =>
        new Promise<void>((res) => {
          log.push("live:start");
          releaseLive = () => {
            log.push("live:end");
            res();
          };
        })
    );
    const engine: WhatIfEngine = {
      evaluateMoves: async () => {
        log.push("whatif:search");
        return at(16);
      },
    };
    const done = runWhatIf({
      ask,
      engine,
      turn,
      onResult: () => log.push("whatif:result"),
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toEqual(["live:start"]);
    releaseLive();
    await live;
    await done;
    expect(log).toEqual([
      "live:start",
      "live:end",
      "whatif:search",
      "whatif:result",
    ]);
  });

  it("a stale ask is not searched, and a result that went stale mid-search is not reported", async () => {
    const untouched = fakeEngine([16]);
    expect(
      await runWhatIf({
        ask,
        engine: untouched,
        turn: createEngineTurn(),
        onResult: () => {
          throw new Error("should not report");
        },
        isStale: () => true,
      })
    ).toBeNull();
    expect(untouched.calls).toHaveLength(0);

    let stale = false;
    const seen: number[] = [];
    const result = await runWhatIf({
      ask,
      engine: fakeEngine([10, 12, 16]),
      turn: createEngineTurn(),
      onResult: (r) => {
        seen.push(r.depth);
        stale = true; // the game changed after the first drawing
      },
      isStale: () => stale,
    });
    expect(seen).toEqual([10]);
    expect(result).toBeNull();
  });

  it("an engine failure is null, reported nowhere, and frees the engine", async () => {
    const turn = createEngineTurn();
    const result = await runWhatIf({
      ask,
      engine: {
        evaluateMoves: async () => {
          throw new Error("worker gone");
        },
      },
      turn,
      onResult: () => {
        throw new Error("should not report");
      },
    });
    expect(result).toBeNull();
    expect(turn.busy()).toBe(false);
  });
});

describe("the state the message carries", () => {
  const ask = resolveWhatIf("why not 8. Qxc1?", ctx({ viewedPly: 0 }))!;
  const at = (depth: number, pv = ["d1c1", "a8b8", "c1f4"]): MovesEval => ({
    fen: FEN_BEFORE_8,
    depth,
    moves: [
      { uci: "d1c1", san: "Qxc1", cp: 200 + depth, depth, pv },
      { uci: "b5c7", san: "Nc7+", cp: -97, depth, pv: ["b5c7", "e8d8"] },
    ],
    missing: [],
    bestMove: "d1c1",
    source: "local",
    cold: true,
  });

  it("starts checking with the space reserved and no line", () => {
    const s = initialWhatIfState(7, ask);
    expect(s).toMatchObject({
      id: 7,
      status: "checking",
      line: null,
      depth: 0,
    });
    expect(whatIfSummary(s)).toBe("Checking 8. Qxc1 with the engine…");
  });

  it("a partial draws the line; a deeper partial with the same moves keeps the line's array and updates the numbers", () => {
    const drawn = whatIfStateFrom(initialWhatIfState(1, ask), at(10), false);
    expect(drawn.status).toBe("drawn");
    expect(drawn.line?.sans).toEqual(["Qxc1", "Rb8", "Qf4"]);
    expect(drawn.depth).toBe(10);
    expect(whatIfSummary(drawn)).toBe(
      "8. Qxc1 +2.10 · played 8. Nc7+ -0.97 · d10"
    );
    const deeper = whatIfStateFrom(drawn, at(12), false);
    expect(deeper.line?.sans).toBe(drawn.line?.sans);
    expect(deeper.line?.evalDisplay).toBe("+2.12");
    expect(deeper.line?.depth).toBe(12);
    expect(deeper.depth).toBe(12);
    // New moves: a new line.
    const changed = whatIfStateFrom(
      deeper,
      at(14, ["d1c1", "a8b8", "c1e3"]),
      false
    );
    expect(changed.line?.sans).toEqual(["Qxc1", "Rb8", "Qe3"]);
    expect(changed.line?.sans).not.toBe(drawn.line?.sans);
    const final = whatIfStateFrom(changed, at(16), true);
    expect(final.status).toBe("final");
    expect(whatIfSummary(final)).toContain("d16");
    // Nothing drawn is replaced by a shallower partial, nor by the very
    // next depth: a drawn line is redrawn every second depth.
    expect(whatIfStateFrom(changed, at(9), false)).toBe(changed);
    expect(whatIfStateFrom(drawn, at(11), false)).toBe(drawn);
    expect(whatIfStateFrom(drawn, at(11), true).status).toBe("final");
  });

  it("a partial without the asked move's line is waited through; a final without one is no-line", () => {
    const s0 = initialWhatIfState(1, ask);
    const missing: MovesEval = { ...at(10), moves: [at(10).moves[1]] };
    expect(whatIfStateFrom(s0, missing, false)).toBe(s0);
    const final = whatIfStateFrom(s0, missing, true);
    expect(final.status).toBe("unavailable");
    expect(final.reason).toBe("no-line");
    expect(whatIfSummary(final)).toBe("The engine found no line for 8. Qxc1.");
  });

  it("says why nothing could be checked", () => {
    const s = initialWhatIfState(1, ask);
    expect(whatIfSummary(whatIfUnavailable(s, "no-engine"))).toContain(
      "isn't available"
    );
    expect(whatIfSummary(whatIfUnavailable(s, "busy"))).toContain(
      "still reviewing"
    );
    expect(whatIfSummary(whatIfUnavailable(s, "failed"))).toBe(
      "The engine couldn't check 8. Qxc1."
    );
  });

  it("a Black what-if reads with Black's numbering, and the engine's best is named as such", () => {
    const black = resolveWhatIf("why not 9... Qa3?", ctx({ viewedPly: 0 }))!;
    const fen = black.fen;
    const result: MovesEval = {
      fen,
      depth: 11,
      moves: [
        { uci: "c1a3", san: "Qa3", cp: 150, depth: 11, pv: ["c1a3"] },
        { uci: "c1d1", san: "Qxd1+", cp: 90, depth: 11, pv: ["c1d1", "e1d1"] },
      ],
      missing: [],
      bestMove: "c1a3",
      source: "local",
      cold: true,
    };
    const s = whatIfStateFrom(initialWhatIfState(2, black), result, false);
    expect(whatIfSummary(s)).toBe(
      "9... Qa3 +1.50 · played 9... Qxd1+ +0.90 · d11"
    );
  });
});

describe("resolveWhatIf: where the alternative is played from", () => {
  it("a bare alternative that was also played elsewhere is asked about the viewed board, not about that move", () => {
    // Qxc1 was Black's 7th move; at move 8 it is White's alternative to Nc7+.
    const ask = resolveWhatIf(
      "what about Qxc1 instead?",
      ctx({ viewedPly: 14 })
    );
    expect(ask).not.toBeNull();
    expect(ask!.index).toBe(14);
    expect(ask!.asked).toEqual({ role: "asked", uci: "d1c1", san: "Qxc1" });
    expect(ask!.moves.map((m) => m.role)).toEqual(["asked", "played"]);
    expect(whatIfMoveLabel(ask!)).toBe("8. Qxc1");
  });

  it("the played move named beside the alternative is never taken for it", () => {
    const ask = resolveWhatIf(
      "instead of 8. Nc7+, what about Nd6+?",
      ctx({ viewedPly: 0 })
    );
    expect(ask).not.toBeNull();
    expect(ask!.index).toBe(14);
    expect(ask!.rule).toBe("phrase");
    expect(ask!.asked.san).toBe("Nd6+");
    expect(ask!.moves.map((m) => m.san)).toEqual(["Nd6+", "Nc7+", "Qxc1"]);
  });

  it("a numbered move in a FEN-rooted game is counted from the root's own number", () => {
    const game = {
      sans: ["Nc7+", "Kd8", "Nxa8", "Qxd1+"],
      rootFen: FEN_BEFORE_8,
      viewedPly: 3,
      playerColor: "w" as const,
    };
    const at8 = resolveWhatIf("why not 8. Qxc1?", game);
    expect(at8).not.toBeNull();
    expect(at8!.index).toBe(0);
    expect(whatIfMoveLabel(at8!)).toBe("8. Qxc1");
    expect(at8!.moves.map((m) => m.san)).toEqual(["Qxc1", "Nc7+"]);
    const at9 = resolveWhatIf("why not 9. Qxc1?", game);
    expect(at9).not.toBeNull();
    expect(at9!.index).toBe(2);
    expect(at9!.moveNumber).toBe(9);
    expect(at9!.moves.map((m) => m.san)).toEqual(["Qxc1", "Nxa8"]);
    // A number the game never reached, and a Black move that is not legal there.
    expect(resolveWhatIf("why not 12. Qxc1?", game)).toBeNull();
    expect(resolveWhatIf("why not 8... Kd7?", game)).toBeNull();
  });

  it("with an exploration on the board a bare alternative is left to the coach; a numbered one still resolves", () => {
    expect(
      resolveWhatIf("what about Nd6+ instead?", ctx({ exploring: true }))
    ).toBeNull();
    const ask = resolveWhatIf(
      "why not 8. Qxc1?",
      ctx({ exploring: true, viewedPly: 0 })
    );
    expect(ask).not.toBeNull();
    expect(ask!.index).toBe(14);
  });
});

describe("the numbers the what-if shows", () => {
  const ask = resolveWhatIf("why not 8. Qxc1?", ctx({ viewedPly: 0 }))!;

  it("are the search's own, never the sweep's", () => {
    // The sweep's number for the position is far from the search's.
    const loud = resolveWhatIf("why not 8. Qxc1?", {
      ...ctx({ viewedPly: 0 }),
      enginePositions: Array.from({ length: SANS.length + 1 }, (_, i) =>
        i === 14
          ? { lines: [{ pv: ["d1c1"], depth: 20, multiPv: 1, cp: 999 }] }
          : { lines: [{ pv: [], depth: 0, multiPv: 1 }] }
      ),
    })!;
    const result: MovesEval = {
      fen: FEN_BEFORE_8,
      depth: 12,
      moves: [
        { uci: "d1c1", san: "Qxc1", cp: 251, depth: 12, pv: ["d1c1", "a8b8"] },
        { uci: "b5c7", san: "Nc7+", cp: -97, depth: 12, pv: ["b5c7", "e8d8"] },
      ],
      missing: [],
      bestMove: "d1c1",
      source: "local",
      cold: true,
    };
    const s = whatIfStateFrom(initialWhatIfState(1, loud), result, false);
    expect(whatIfSummary(s)).toBe("8. Qxc1 +2.51 · played 8. Nc7+ -0.97 · d12");
    expect(s.line?.evalDisplay).toBe("+2.51");
    expect(whatIfSummary(s)).not.toContain("9.99");
  });

  it("read White-relative all the way from the engine's side-to-move lines", () => {
    // After 9. Nxa8 it is Black to move: the engine's cp is Black's.
    const black = resolveWhatIf("why not 9... Qa3?", ctx({ viewedPly: 0 }))!;
    expect(black.color).toBe("b");
    const lines = [
      "info depth 11 seldepth 14 multipv 1 score cp -90 nodes 1000 nps 1000 time 1 pv c1d1 e1d1",
      "info depth 11 seldepth 14 multipv 2 score cp -150 nodes 1000 nps 1000 time 1 pv c1a3 a8b6",
      "bestmove c1d1",
    ];
    const result = parseMovesResults(lines, black.fen, ["c1a3", "c1d1"]);
    const s = whatIfStateFrom(initialWhatIfState(3, black), result, true);
    // Black is worse after either move, so both numbers are positive for White.
    expect(whatIfSummary(s)).toBe(
      "9... Qa3 +1.50 · played 9... Qxd1+ +0.90 · d11"
    );
    expect(s.line?.sans).toEqual(["Qa3", "Nb6"]);
    // A mate for Black reads as White's negative mate.
    const mating = parseMovesResults(
      [
        "info depth 11 multipv 1 score mate 2 pv c1a3 a8b6",
        "info depth 11 multipv 2 score cp -90 pv c1d1 e1d1",
        "bestmove c1a3",
      ],
      black.fen,
      ["c1a3", "c1d1"]
    );
    expect(
      whatIfSummary(whatIfStateFrom(initialWhatIfState(4, black), mating, true))
    ).toBe("9... Qa3 M-2 · played 9... Qxd1+ +0.90 · d11");
  });

  it("a line already drawn is cleared when the final result has none for the asked move", () => {
    const at10: MovesEval = {
      fen: FEN_BEFORE_8,
      depth: 10,
      moves: [
        { uci: "d1c1", san: "Qxc1", cp: 210, depth: 10, pv: ["d1c1", "a8b8"] },
        { uci: "b5c7", san: "Nc7+", cp: -97, depth: 10, pv: ["b5c7"] },
      ],
      missing: [],
      bestMove: "d1c1",
      source: "local",
      cold: true,
    };
    const drawn = whatIfStateFrom(initialWhatIfState(1, ask), at10, false);
    expect(drawn.line).not.toBeNull();
    const cleared = whatIfStateFrom(
      drawn,
      { ...at10, depth: 16, moves: [at10.moves[1]], missing: ["d1c1"] },
      true
    );
    expect(cleared.status).toBe("unavailable");
    expect(cleared.reason).toBe("no-line");
    expect(cleared.line).toBeNull();
    expect(cleared.scores).toEqual([]);
  });

  it("says when a newer question took the engine first", () => {
    expect(
      whatIfSummary(whatIfUnavailable(initialWhatIfState(1, ask), "superseded"))
    ).toBe("A newer question took the engine before 8. Qxc1 was checked.");
  });
});

describe("runWhatIf: the caller's signal", () => {
  const ask = resolveWhatIf("why not 8. Qxc1?", ctx({ viewedPly: 0 }))!;

  it("a signal already aborted is null and the engine is never asked", async () => {
    const calls: EvaluateMovesParams[] = [];
    const ac = new AbortController();
    ac.abort();
    const result = await runWhatIf({
      ask,
      engine: {
        evaluateMoves: async (p) => {
          calls.push(p);
          throw new Error("should not search");
        },
      },
      turn: createEngineTurn(),
      signal: ac.signal,
      onResult: () => {
        throw new Error("should not report");
      },
    });
    expect(result).toBeNull();
    expect(calls).toHaveLength(0);
  });

  /** An engine whose search ends only when its signal aborts, the way a real one stops. */
  const engineUntilAborted = () => {
    let seen: AbortSignal | undefined;
    return {
      signal: () => seen,
      evaluateMoves: (p: EvaluateMovesParams) =>
        new Promise<MovesEval>((_, reject) => {
          seen = p.signal;
          p.signal?.addEventListener("abort", () =>
            reject(new Error("Engine search aborted"))
          );
        }),
    };
  };

  it("the caller's abort ends the engine's search, and the result is null", async () => {
    const ac = new AbortController();
    const engine = engineUntilAborted();
    const turn = createEngineTurn();
    const running = runWhatIf({
      ask,
      engine,
      turn,
      signal: ac.signal,
      onResult: () => {
        throw new Error("should not report");
      },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(engine.signal()?.aborted).toBe(false);
    expect(turn.busy()).toBe(true);
    ac.abort();
    expect(engine.signal()?.aborted).toBe(true);
    expect(await running).toBeNull();
    expect(turn.busy()).toBe(false);
  });

  it("a search that never answers is given up at the bound, and the turn is free", async () => {
    const ac = new AbortController();
    const engine = engineUntilAborted();
    const turn = createEngineTurn();
    const result = await runWhatIf({
      ask,
      engine,
      turn,
      signal: ac.signal,
      timeoutMs: 20,
      onResult: () => {
        throw new Error("should not report");
      },
    });
    expect(result).toBeNull();
    expect(engine.signal()?.aborted).toBe(true);
    // The caller's own signal was not touched: the page reads "failed", not "superseded".
    expect(ac.signal.aborted).toBe(false);
    expect(turn.busy()).toBe(false);
  });
});

describe("resolveWhatIf: which side the alternative is for", () => {
  // 1.e4 e5 2.Nf3 Nc6 3.Nc3 Nf6 4.Bc4 Bc5: at ply 7 the strip names 4. Bc4,
  // and Nd5 is legal for White there (c3d5, replacing Bc4) and for Black
  // after it (f6d5).
  const OPEN = ["e4", "e5", "Nf3", "Nc6", "Nc3", "Nf6", "Bc4", "Bc5"];
  const open = (over: Partial<Parameters<typeof resolveWhatIf>[1]> = {}) => ({
    sans: OPEN,
    viewedPly: 7,
    playerColor: "w" as const,
    playerSideKnown: true,
    ...over,
  });

  it("'instead' replaces the move the strip names: the ply before the cursor, the side that moved", () => {
    const ask = resolveWhatIf("what about Nd5 instead?", open());
    expect(ask).not.toBeNull();
    expect(ask!.index).toBe(6);
    expect(ask!.color).toBe("w");
    expect(ask!.asked).toEqual({ role: "asked", uci: "c3d5", san: "Nd5" });
    expect(ask!.moves.map((m) => m.san)).toEqual(["Nd5", "Bc4"]);
    expect(whatIfMoveLabel(ask!)).toBe("4. Nd5");
    expect(resolveWhatIf("why not Nd5?", open())!.index).toBe(6);
  });

  it("the replaced move named beside it decides, cue or not", () => {
    const ask = resolveWhatIf("what about Nd5 instead of Bc4?", open());
    expect(ask!.index).toBe(6);
    expect(ask!.asked.san).toBe("Nd5");
    expect(ask!.moves.map((m) => m.san)).toEqual(["Nd5", "Bc4"]);
    // The same, from a cursor further on: the occurrence nearest the board.
    expect(
      resolveWhatIf("what about Nd5 instead of Bc4?", open({ viewedPly: 8 }))!
        .index
    ).toBe(6);
  });

  it("'here' is the next move from the position shown", () => {
    const ask = resolveWhatIf("what about Nd5 here?", open());
    expect(ask!.index).toBe(7);
    expect(ask!.color).toBe("b");
    expect(ask!.asked).toEqual({ role: "asked", uci: "f6d5", san: "Nd5" });
    expect(whatIfMoveLabel(ask!)).toBe("4... Nd5");
  });

  it("with no cue, a move legal for both sides is left to the coach; legal for one, it is drawn there", () => {
    expect(resolveWhatIf("what about Nd5?", open())).toBeNull();
    // Bc5 is Black's alone at move 4 (White's bishop went to c4): from the
    // cursor after 4. Bc4 it is the next move, and the one the game played.
    const black = resolveWhatIf("what about Bc5?", open());
    expect(black).not.toBeNull();
    expect(black!.index).toBe(7);
    expect(black!.moves.map((m) => m.role)).toEqual(["asked"]);
    // From the cursor before 4. Bc4 it is Black's 3... Bc5, replacing Nf6.
    expect(
      resolveWhatIf("what about Bc5?", open({ viewedPly: 6 }))!.index
    ).toBe(5);
    // Ba6 is White's alone there.
    const white = resolveWhatIf("what about Ba6?", open());
    expect(white!.index).toBe(6);
    expect(white!.moves.map((m) => m.san)).toEqual(["Ba6", "Bc4"]);
  });

  it("'move 4' with no side: where the move is legal, the player's side when both and it is known", () => {
    expect(resolveWhatIf("what about Nd5 on move 4?", open())!.index).toBe(6);
    expect(
      resolveWhatIf("what about Nd5 on move 4?", open({ playerColor: "b" }))!
        .index
    ).toBe(7);
    expect(
      resolveWhatIf(
        "what about Nd5 on move 4?",
        open({ playerSideKnown: false })
      )
    ).toBeNull();
    expect(
      resolveWhatIf(
        "what about Bc5 on move 4?",
        open({ playerSideKnown: false })
      )!.index
    ).toBe(7);
    expect(resolveWhatIf("what about Nd5 on move 9?", open())).toBeNull();
  });

  it("a numbered alternative whose notation was played a ply earlier is still its own move", () => {
    const ask = resolveWhatIf(
      "after 7... Qxc1, why not 8. Qxc1?",
      ctx({ viewedPly: 0 })
    );
    expect(ask).not.toBeNull();
    expect(ask!.index).toBe(14);
    expect(ask!.asked).toEqual({ role: "asked", uci: "d1c1", san: "Qxc1" });
    expect(whatIfMoveLabel(ask!)).toBe("8. Qxc1");
    // Both numbered moves played: the first is the one being replaced.
    const two = resolveWhatIf(
      "8. Nc7+ instead of 8. Qxc1?",
      ctx({ viewedPly: 0 })
    );
    expect(two!.index).toBe(14);
    expect(two!.asked.san).toBe("Qxc1");
  });

  it("a number the game never reached draws nothing even when the notation was played elsewhere", () => {
    expect(
      resolveWhatIf("why not 12. Qxc1?", ctx({ viewedPly: 14 }))
    ).toBeNull();
  });

  it("a FEN-rooted game numbers from its root: the anchor's standard-start count is not trusted", () => {
    // After 1.d4 d5: 2.Nf3 Nf6 3.g3 g6 4.Bg2 Bg7. These six plies are legal
    // from the standard start too, so a start-rooted count would put 3. Bg2
    // at move 4 and label it so.
    const game = {
      sans: ["Nf3", "Nf6", "g3", "g6", "Bg2", "Bg7"],
      rootFen: "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2",
      viewedPly: 6,
      playerColor: "w" as const,
    };
    expect(resolveWhatIf("why not 3. Bg2?", game)).toBeNull();
    const at4 = resolveWhatIf("why not 4. Bf4?", game);
    expect(at4).not.toBeNull();
    expect(at4!.index).toBe(4);
    expect(whatIfMoveLabel(at4!)).toBe("4. Bf4");
    expect(at4!.moves.map((m) => m.san)).toEqual(["Bf4", "Bg2"]);
  });
});

describe("the store the line reads", () => {
  const ask = resolveWhatIf("why not 8. Qxc1?", ctx({ viewedPly: 0 }))!;

  it("holds a state per id and tells its listeners when one changes", () => {
    const store = createWhatIfStore();
    let told = 0;
    const off = store.subscribe(() => told++);
    expect(store.get(1)).toBeUndefined();
    store.set(1, initialWhatIfState(1, ask));
    expect(store.get(1)?.status).toBe("checking");
    expect(told).toBe(1);
    store.update(1, (st) => whatIfUnavailable(st, "busy"));
    expect(store.get(1)?.reason).toBe("busy");
    expect(told).toBe(2);
    off();
    store.update(1, (st) => whatIfUnavailable(st, "failed"));
    expect(told).toBe(2);
    expect(store.get(1)?.reason).toBe("failed");
  });

  it("an update that keeps the state, or names an unknown id, notifies nobody", () => {
    const store = createWhatIfStore();
    let told = 0;
    store.subscribe(() => told++);
    store.set(2, initialWhatIfState(2, ask));
    store.update(2, (st) => st);
    store.update(9, (st) => whatIfUnavailable(st, "failed"));
    expect(told).toBe(1);
    expect(store.get(9)).toBeUndefined();
  });
});

describe("the coach's jump for the what-if's own reply", () => {
  const ask = resolveWhatIf("why not 8. Qxc1?", ctx({ viewedPly: 0 }))!;
  const at = (depth: number): MovesEval => ({
    fen: FEN_BEFORE_8,
    depth,
    moves: [
      { uci: "d1c1", san: "Qxc1", cp: 251, depth, pv: ["d1c1", "a8b8"] },
      { uci: "b5c7", san: "Nc7+", cp: -97, depth, pv: ["b5c7", "e8d8"] },
    ],
    missing: [],
    bestMove: "d1c1",
    source: "local",
    cold: true,
  });

  it("waits while the what-if is checking, is skipped once a line is drawn, and applies when nothing could be checked", () => {
    const checking = initialWhatIfState(1, ask);
    expect(whatIfJumpDecision(checking)).toBe("defer");
    const drawn = whatIfStateFrom(checking, at(10), false);
    expect(whatIfJumpDecision(drawn)).toBe("skip");
    expect(whatIfJumpDecision(whatIfStateFrom(drawn, at(16), true))).toBe(
      "skip"
    );
    for (const reason of [
      "no-engine",
      "busy",
      "failed",
      "no-line",
      "superseded",
    ] as const)
      expect(whatIfJumpDecision(whatIfUnavailable(checking, reason))).toBe(
        "apply"
      );
    // A reply whose what-if the page no longer knows jumps as before.
    expect(whatIfJumpDecision(undefined)).toBe("apply");
  });
});
