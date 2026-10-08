import { describe, expect, it } from "vitest";
import type {
  EvaluateMovesParams,
  MovesEval,
  PositionEval,
} from "@/types/eval";
import { Chess } from "chess.js";
import { verifyClientEvals } from "@/lib/coach/clientEvals";
import { createEngineTurn } from "@/lib/engine/engineTurn";
import { parseMovesResults } from "@/lib/engine/helpers/parseMovesResults";
import {
  askedMoveEval,
  createWhatIfJumpGate,
  createWhatIfStore,
  initialWhatIfState,
  resolveWhatIf,
  whatIfJumpDecision,
  runWhatIf,
  WHAT_IF_DEPTH,
  whatIfClientEvals,
  whatIfEvalsWithin,
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

/** The board a what-if on 8. Qxc1 puts up: Black to move. */
const FEN_AFTER_8_QXC1 = (() => {
  const g = new Chess(FEN_BEFORE_8);
  g.move("Qxc1");
  return g.fen();
})();

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
    let finishSearch!: () => void;
    const engine: WhatIfEngine = {
      evaluateMoves: () =>
        new Promise<MovesEval>((res) => {
          log.push("whatif:search");
          finishSearch = () => res(at(16));
        }),
    };
    const done = runWhatIf({
      ask,
      engine,
      turn,
      onResult: () => log.push("whatif:result"),
    });
    const tick = () => new Promise((r) => setTimeout(r, 0));
    await tick();
    expect(log).toEqual(["live:start"]);
    releaseLive();
    await live;
    await tick();
    expect(log).toEqual(["live:start", "live:end", "whatif:search"]);
    // A job asked while the search runs waits for it to end.
    const next = turn.run(async () => {
      log.push("next");
    });
    await tick();
    expect(turn.busy()).toBe(true);
    expect(log).not.toContain("next");
    finishSearch();
    await done;
    await next;
    expect(log).toEqual([
      "live:start",
      "live:end",
      "whatif:search",
      "whatif:result",
      "next",
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
      "8. Qxc1 +2.10 · played Nc7+ -0.97 · d10"
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
    expect(whatIfSummary(s)).toBe("9... Qa3 +1.50 · played Qxd1+ +0.90 · d11");
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
    expect(whatIfSummary(s)).toBe("8. Qxc1 +2.51 · played Nc7+ -0.97 · d12");
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
    expect(whatIfSummary(s)).toBe("9... Qa3 +1.50 · played Qxd1+ +0.90 · d11");
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
    ).toBe("9... Qa3 M-2 · played Qxd1+ +0.90 · d11");
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

  it("an engine that never settles, abort or not, is still given up at the bound", async () => {
    // A wedged worker: the search promise neither resolves nor rejects,
    // whatever the signal says.
    let asked = 0;
    const engine: WhatIfEngine = {
      evaluateMoves: () => {
        asked++;
        return new Promise<MovesEval>(() => {});
      },
    };
    const turn = createEngineTurn();
    const result = await runWhatIf({
      ask,
      engine,
      turn,
      timeoutMs: 20,
      onResult: () => {
        throw new Error("should not report");
      },
    });
    expect(asked).toBe(1);
    expect(result).toBeNull();
    // The live evals queued behind it get the engine.
    expect(turn.busy()).toBe(false);
    let next = false;
    await turn.run(async () => {
      next = true;
    });
    expect(next).toBe(true);
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
    // The same from a cursor further on: the game places it, not the cursor.
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
    // Both numbered at move 8: the one the game played there (Nc7+) is set
    // aside, the other is the alternative.
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

describe("the hold on the coach's jump for the what-if's own reply", () => {
  const ask = resolveWhatIf("why not 8. Qxc1?", ctx({ viewedPly: 0 }))!;
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
  const jump = { fromPly: 0, toPly: 15, label: "8. Nc7+" };
  const checking = initialWhatIfState(1, ask);

  it("a jump that arrives while the what-if checks is held, and handed back when no line comes", () => {
    const gate = createWhatIfJumpGate<typeof jump>();
    expect(gate.jump(1, checking, jump)).toBe("defer");
    expect(gate.settled(1, false)).toBe(jump);
    // Handed back once only.
    expect(gate.settled(1, false)).toBeNull();
  });

  it("a held jump is dropped when the line is drawn", () => {
    const gate = createWhatIfJumpGate<typeof jump>();
    gate.jump(1, checking, jump);
    gate.drawn(1);
    expect(gate.settled(1, true)).toBeNull();
    // Settling as drawn drops it too, even without the drawn call.
    gate.jump(1, checking, jump);
    expect(gate.settled(1, true)).toBeNull();
  });

  it("a held jump is dropped when a newer reply starts, and is never another what-if's", () => {
    const gate = createWhatIfJumpGate<typeof jump>();
    gate.jump(1, checking, jump);
    gate.replyStarted();
    expect(gate.settled(1, false)).toBeNull();
    gate.jump(1, checking, jump);
    expect(gate.settled(2, false)).toBeNull();
    gate.drawn(2);
    expect(gate.settled(1, false)).toBe(jump);
  });

  it("a line already drawn skips the jump, nothing checked applies it, and neither is held", () => {
    const gate = createWhatIfJumpGate<typeof jump>();
    const drawn = whatIfStateFrom(checking, at10, false);
    expect(gate.jump(1, drawn, jump)).toBe("skip");
    expect(gate.settled(1, false)).toBeNull();
    expect(gate.jump(1, whatIfUnavailable(checking, "failed"), jump)).toBe(
      "apply"
    );
    expect(gate.settled(1, false)).toBeNull();
  });
});

describe("resolveWhatIf: two moves named, and the move that was played", () => {
  // 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Be3 e5 7.Nb3 Be6 8.f3
  // Be7 9.Qd2 O-O 10.O-O-O Nbd7 11.g4 b5 12.g5 b4 13.Nd5
  const NAJDORF =
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7 g4 b5 g5 b4 Nd5".split(
      " "
    );
  // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 5.d3 d6 6.O-O O-O
  const ITALIAN = "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O".split(" ");
  const OPEN = ["e4", "e5", "Nf3", "Nc6", "Nc3", "Nf6", "Bc4", "Bc5"];
  const on = (
    sans: string[],
    viewedPly: number,
    over: Partial<Parameters<typeof resolveWhatIf>[1]> = {}
  ) => ({
    sans,
    viewedPly,
    playerColor: "w" as const,
    playerSideKnown: true,
    ...over,
  });
  const read = (q: string, c: Parameters<typeof resolveWhatIf>[1]) => {
    const a = resolveWhatIf(q, c);
    return a
      ? {
          label: whatIfMoveLabel(a),
          index: a.index,
          moves: a.moves.map((m) => `${m.role}:${m.san}`),
        }
      : null;
  };

  it("the alternative sits where the move set aside was played, even when its own notation was played elsewhere", () => {
    // 7... Qxc1 was Black's move; the question is about White's 8. Qxc1.
    for (const q of [
      "what about Qxc1 instead of Nc7+?",
      "Qxc1 instead of Nc7+?",
      "why Nc7+ instead of Qxc1?",
    ])
      expect(read(q, on(SANS, 15)), q).toEqual({
        label: "8. Qxc1",
        index: 14,
        moves: ["asked:Qxc1", "played:Nc7+"],
      });
    expect(read("what about Nd5 instead of Be3?", on(NAJDORF, 11))).toEqual({
      label: "6. Nd5",
      index: 10,
      moves: ["asked:Nd5", "played:Be3"],
    });
    expect(read("what about O-O instead of d3?", on(ITALIAN, 9))).toEqual({
      label: "5. O-O",
      index: 8,
      moves: ["asked:O-O", "played:d3"],
    });
  });

  it("never draws a move the game played as the alternative, and draws nothing when the alternative is not legal where the other was played", () => {
    // White could not castle short at move 9; Black's 9... O-O is not it.
    expect(read("what about O-O instead of Qd2?", on(NAJDORF, 17))).toBeNull();
    expect(
      read("what about Nd6+ instead, or maybe Qxc1?", on(SANS, 14))
    ).toBeNull();
    expect(read("instead of 8. Nc7+, what about Nd5?", on(SANS, 0))).toBeNull();
  });

  it("'after Y' puts the alternative on the move after Y", () => {
    expect(
      read("after Bc4, what about Nxe4?", on(OPEN, 7, { playerColor: "b" }))
    ).toEqual({
      label: "4... Nxe4",
      index: 7,
      moves: ["asked:Nxe4", "played:Bc5"],
    });
    for (const q of [
      "after 7... Qxc1, why not Nd6+?",
      "after 7... Qxc1 8. Nc7+, what about Nd6+ instead?",
      "instead of 8. Nc7+, what about Nd6+?",
    ])
      for (const viewedPly of [0, 15])
        expect(read(q, on(SANS, viewedPly))?.label, `${q} @${viewedPly}`).toBe(
          "8. Nd6+"
        );
  });

  it("a move set aside in a 'move N' question picks its ply", () => {
    expect(
      read(
        "what about Nd5 instead of Bc4 on move 4?",
        on(OPEN, 7, { playerColor: "b" })
      )?.index
    ).toBe(6);
  });
});

describe("resolveWhatIf: a bare alternative, the cues and the player's side", () => {
  const OPEN = ["e4", "e5", "Nf3", "Nc6", "Nc3", "Nf6", "Bc4", "Bc5"];
  const at7 = (over: Partial<Parameters<typeof resolveWhatIf>[1]> = {}) => ({
    sans: OPEN,
    viewedPly: 7,
    playerColor: "w" as const,
    playerSideKnown: true,
    ...over,
  });

  it("a first-person question from a player whose side is known is that side's move, whatever the cue", () => {
    const q = "could I have played Nd5 here?";
    expect(resolveWhatIf(q, at7({ playerColor: "b" }))!.index).toBe(7);
    expect(resolveWhatIf(q, at7({ playerColor: "w" }))!.index).toBe(6);
    // Side unknown, both cues: nothing.
    expect(resolveWhatIf(q, at7({ playerSideKnown: false }))).toBeNull();
  });

  it("'here's', 'here is' and 'next time' are not the 'here' cue", () => {
    for (const q of [
      "what about Nd5? next time I'll try it",
      "what about Nd5 here's my idea",
      "what about Nd5 here is why",
      "here's the thing, what about Nd5?",
    ])
      expect(resolveWhatIf(q, at7({ playerSideKnown: false })), q).toBeNull();
  });

  it("on a what-if's own alternative, a bare follow-up is the next alternative at that ply", () => {
    const onQxc1 = {
      sans: SANS,
      viewedPly: 14,
      playerColor: "w" as const,
      onWhatIf: { index: 14, fen: FEN_AFTER_8_QXC1 },
    };
    const own = resolveWhatIf("what about Nd6+ instead?", onQxc1);
    expect(own).not.toBeNull();
    expect(own!.index).toBe(14);
    expect(own!.moves.map((m) => m.san)).toEqual(["Nd6+", "Nc7+"]);
    // "Here" is the board off the mainline: nothing.
    expect(resolveWhatIf("what about Nd6+ here?", onQxc1)).toBeNull();
  });
});

describe("resolveWhatIf: one reading or nothing", () => {
  // 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5 7.Bb3 d6 8.c3
  // O-O 9.h3 Na5 10.Bc2 c5 11.d4
  const RUY =
    "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Na5 Bc2 c5 d4".split(
      " "
    );
  const OPEN = ["e4", "e5", "Nf3", "Nc6", "Nc3", "Nf6", "Bc4", "Bc5"];
  // At move 8 both castlings are legal for both sides.
  const BOTH =
    "d4 d5 Nc3 Nc6 Bf4 Bf5 Qd2 Qd7 Nf3 Nf6 e3 e6 Bd3 Bd6 O-O-O O-O Kb1 Rfe8".split(
      " "
    );
  const FRENCH = ["e4", "e6", "d4", "d5", "exd5", "exd5"];
  type Over = Partial<Parameters<typeof resolveWhatIf>[1]>;
  const game = (sans: string[], viewedPly: number, over: Over = {}) => ({
    sans,
    viewedPly,
    playerColor: "w" as const,
    playerSideKnown: true,
    ...over,
  });
  const label = (q: string, c: Parameters<typeof resolveWhatIf>[1]) => {
    const a = resolveWhatIf(q, c);
    return a ? `${whatIfMoveLabel(a)} @${a.index}` : null;
  };
  const expectAll = (
    cases: Array<[string, Parameters<typeof resolveWhatIf>[1], string | null]>
  ) => {
    for (const [q, c, want] of cases) expect(label(q, c), q).toBe(want);
  };

  it("an 'after' line of several moves puts the alternative after its last move, and never draws a move of the line", () => {
    const blackRoot =
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    expectAll([
      ["after 1.e4 e5 2.Nf3, why not Nf6?", game(RUY, 0), "2... Nf6 @3"],
      ["after 1.e4 e5 2.Nf3, why not d6?", game(RUY, 0), "2... d6 @3"],
      [
        "after 1.e4 e5 2.Nf3 Nc6 3.Bb5, why not Nf6?",
        game(RUY, 0),
        "3... Nf6 @5",
      ],
      ["after 2. Nf3 Nc6 3. Bb5, what about Nf6?", game(RUY, 0), "3... Nf6 @5"],
      ["after Nf3 Nc6 Bb5, what about Nf6?", game(RUY, 0), "3... Nf6 @5"],
      ["after Bb5 a6 Ba4, what about Nge7?", game(RUY, 7), "4... Nge7 @7"],
      ["after Re1 b5 Bb3, what about Na5?", game(RUY, 12), "7... Na5 @13"],
      ["after Nc6, Bb5, why not Nd4?", game(RUY, 5), "3... Nd4 @5"],
      ["after 2. Nf3 Nc6 3. Bb5 a6, why not Bc4?", game(RUY, 0), "4. Bc4 @6"],
      // The d7 pawn: Kd7 is not legal after 8. Nc7+, and Qxc1 is not it.
      ["after 7. Nb5 Qxc1 8. Nc7+, why not Kd7?", game(SANS, 15), null],
      [
        "after 3. d4 cxd4 4. Nxd4, what about Nc6?",
        {
          ...game(["c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6"], 0),
          rootFen: blackRoot,
        },
        "4... Nc6 @6",
      ],
    ]);
  });

  it("an 'after' move the game never played, or a context move set beside a number, draws nothing", () => {
    for (const playerSideKnown of [true, false])
      expectAll([
        [
          "after Bb5, what about Nd5 instead?",
          game(OPEN, 7, { playerSideKnown }),
          null,
        ],
        [
          "after Bb5, what about Nd4 here?",
          game(OPEN, 7, { playerSideKnown }),
          null,
        ],
        ["after 8. Qxc1, what about Rb8?", game(SANS, 15), null],
        ["after 8. Qxc1 Rb8, why not 9. Qf4?", game(SANS, 15), null],
      ]);
  });

  it("'after Y on move N' follows Y, at the number Y was played", () => {
    for (const playerSideKnown of [true, false])
      expectAll([
        [
          "after Nc6 on move 2, what about Bb5?",
          game(OPEN, 0, { playerSideKnown }),
          "3. Bb5 @4",
        ],
        [
          "after Nc6 on move 2, what about d4?",
          game(OPEN, 0, { playerSideKnown }),
          "3. d4 @4",
        ],
        [
          "after a6 on move 3, what about Bc4?",
          game(RUY, 0, { playerSideKnown }),
          "4. Bc4 @6",
        ],
        [
          "after Qxc1 on move 7, why not Qxc1?",
          game(SANS, 0, { playerSideKnown }),
          "8. Qxc1 @14",
        ],
      ]);
  });

  it("the move set aside is searched as the alternative where the other was played, whatever the side", () => {
    for (const playerSideKnown of [true, false])
      for (const q of [
        "why Bc4 instead of Nd5 on move 4?",
        "on move 4, why Bc4 instead of Nd5?",
        "why Bc4 rather than Nd5 on move 4?",
        "why did I play Bc4 instead of Nd5 on move 4?",
      ]) {
        const ask = resolveWhatIf(q, game(OPEN, 7, { playerSideKnown }));
        expect(ask && `${whatIfMoveLabel(ask)} @${ask.index}`, q).toBe(
          "4. Nd5 @6"
        );
        expect(ask!.moves.map((m) => `${m.role}:${m.san}`)).toEqual([
          "asked:Nd5",
          "played:Bc4",
        ]);
      }
    expectAll([
      ["why h3 instead of d4?", game(RUY, 17), "9. d4 @16"],
      ["why h3 rather than d4?", game(RUY, 17), "9. d4 @16"],
      ["why h3 instead of Bc2?", game(RUY, 17), "9. Bc2 @16"],
      ["why c3 instead of h3?", game(RUY, 15), "8. h3 @14"],
      ["why h3 instead of d4 on move 9?", game(RUY, 17), "9. d4 @16"],
      [
        "why a6 instead of Nf6?",
        game(RUY, 6, { playerColor: "b" }),
        "3... Nf6 @5",
      ],
      [
        "why b5 instead of d6?",
        game(RUY, 12, { playerColor: "b" }),
        "6... d6 @11",
      ],
      [
        "why d6 instead of Na5?",
        game(RUY, 14, { playerColor: "b" }),
        "7... Na5 @13",
      ],
    ]);
  });

  it("two readings of 'X instead of Y': the words' way round and the side they name, else nothing", () => {
    expectAll([
      ["why O-O-O instead of O-O?", game(BOTH, 15), "8. O-O @14"],
      ["why did I play O-O-O instead of O-O?", game(BOTH, 15), "8. O-O @14"],
      [
        "why O-O instead of O-O-O?",
        game(BOTH, 16, { playerColor: "b" }),
        "8... O-O-O @15",
      ],
      // Black played O-O, not O-O-O: the words and the game disagree.
      [
        "why did I play O-O-O instead of O-O?",
        game(BOTH, 15, { playerColor: "b" }),
        null,
      ],
      ["should I have played e5 instead of exd5?", game(FRENCH, 6), "3. e5 @4"],
      [
        "should I have played e5 instead of exd5?",
        game(FRENCH, 5, { playerColor: "b" }),
        "3... e5 @5",
      ],
      [
        "should I have played e5 instead of exd5?",
        game(FRENCH, 6, { playerSideKnown: false }),
        null,
      ],
      // White's Qxd5 is not legal there; Black's is not the player's.
      ["could I have played Qxd5 instead of exd5?", game(FRENCH, 5), null],
    ]);
  });

  it("a side the words name is the side of the move, and only the words beside the move name one", () => {
    const tenPlies = [...OPEN, "d3", "d6"];
    expectAll([
      [
        "why didn't my opponent play Nd5 instead?",
        game(tenPlies, 8),
        "4... Nd5 @7",
      ],
      ["what if my opponent played Nd5?", game(OPEN, 7), "4... Nd5 @7"],
      [
        "what if my opponent played Nd5?",
        game(OPEN, 7, { playerColor: "b" }),
        "4. Nd5 @6",
      ],
      [
        "why not Nd5? I don't get it",
        game(OPEN, 7, { playerColor: "b" }),
        "4. Nd5 @6",
      ],
      [
        "what about Nd5 instead? I'm confused",
        game(OPEN, 7, { playerColor: "b" }),
        "4. Nd5 @6",
      ],
      // "I" against the only legal side, or against the side to move "here".
      [
        "could I have played Ng5 here?",
        game(OPEN, 7, { playerColor: "b" }),
        null,
      ],
      ["what if I play Ng5?", game(OPEN, 7, { playerColor: "b" }), null],
      ["what if I play Nd5 here?", game(OPEN, 7), null],
      ["what if I play Nd5 now?", game(OPEN, 7), null],
      ["what if I play Nd5 here?", game(OPEN, 6, { playerColor: "b" }), null],
      // Two sides named for the one move.
      ["could I have played Nd5 for Black?", game(OPEN, 7), null],
      [
        "what if I play Nd5 here?",
        game(OPEN, 7, { playerColor: "b" }),
        "4... Nd5 @7",
      ],
    ]);
  });

  it("a 'here' or 'now' away from the move does not cancel 'instead'", () => {
    for (const q of [
      "why not Nd5 instead, now that I think of it?",
      "I'm new here, why not Nd5?",
      "why not Nd5? I know now",
      "what about Nd5 instead? I'm confused here",
    ])
      expect(label(q, game(OPEN, 7, { playerSideKnown: false })), q).toBe(
        "4. Nd5 @6"
      );
    for (const q of [
      "instead, what about Nd5? anything here?",
      "what about Nd5 instead? where is the knight going from here",
    ])
      expect(label(q, game(OPEN, 7)), q).toBe("4. Nd5 @6");
  });

  it("numbers that leave the alternative open draw nothing", () => {
    for (const q of [
      "instead of 8. Qxc1, what about 8. Nd6+?",
      "rather than 8. Qxc1, why not 8. Nd6+?",
      "not 8. Qxc1 but 8. Nd6+?",
      "instead of 8. Qxc1 what about Nd6+?",
    ])
      expect(label(q, game(SANS, 15)), q).toBeNull();
  });

  it("an 'after' line may name who played it, and a numbered alternative may replace its last move", () => {
    expectAll([
      [
        "after my opponent's Bc4, what about Nxe4?",
        game(OPEN, 7, { playerColor: "b" }),
        "4... Nxe4 @7",
      ],
      [
        "after White played Bc4, what about Nxe4?",
        game(OPEN, 7, { playerColor: "b" }),
        "4... Nxe4 @7",
      ],
      [
        "after 7... Qxc1 8. Nc7+, why not 8. Qxc1?",
        game(SANS, 15),
        "8. Qxc1 @14",
      ],
    ]);
  });

  it("a move is the game's by what it does, not by how it is spelt, and case tells a piece from a pawn", () => {
    // 4. Nxd4 written without its x.
    expectAll([["why Nd4 instead of Nc3?", game(SANS, 7), "4. Nc3 @6"]]);
    // 4. bxc4, the pawn's capture; the bishop could have taken.
    const B3 = "b3 Nc6 e3 Ne5 Nc3 Nc4 bxc4".split(" ");
    expectAll([["why bxc4 instead of Bxc4?", game(B3, 7), "4. Bxc4 @6"]]);
  });

  it("'here' after a short predicate is the cue, and 'now' that opens a clause of its own is not", () => {
    const side = { playerSideKnown: false };
    expectAll([
      ["is Nd5 better here?", game(OPEN, 7, side), "4... Nd5 @7"],
      ["would Nd5 work now?", game(OPEN, 7, side), "4... Nd5 @7"],
      ["Now, I wonder why not Nd5", game(OPEN, 7, side), "4. Nd5 @6"],
      ["Here, what about Nd5?", game(OPEN, 7, side), "4... Nd5 @7"],
    ]);
  });

  it("on a what-if's own board, a reading elsewhere in the game of a move that is also the reply there draws nothing", () => {
    const onQxc1 = {
      ...game(SANS, 14),
      onWhatIf: { index: 14, fen: FEN_AFTER_8_QXC1 },
    };
    // Black's ...Ne5 is a reply on the board shown; "move 9" reads White's
    // 9. Ne5 in the game. On the mainline it is drawn.
    expect(label("what about Ne5 on move 9?", onQxc1)).toBeNull();
    expect(label("what about Ne5 on move 9?", game(SANS, 14))).toBe(
      "9. Ne5 @16"
    );
  });

  it("on a what-if's own board, a move that is also the reply there is drawn only when the words pick the replacement", () => {
    const onQxc1 = (over: Over = {}) => ({
      ...game(SANS, 14, over),
      onWhatIf: { index: 14, fen: FEN_AFTER_8_QXC1 },
    });
    expectAll([
      ["what if Black plays e5?", onQxc1(), null],
      ["what if I play e5?", onQxc1({ playerColor: "b" }), null],
      ["what about e5?", onQxc1(), null],
      ["what about Ne5?", onQxc1(), null],
      ["what if I play Ne5?", onQxc1({ playerColor: "b" }), null],
      ["what about Ne5 then?", onQxc1(), null],
      ["what about Ne5 instead?", onQxc1(), "8. Ne5 @14"],
      ["what if White plays Ne5?", onQxc1(), "8. Ne5 @14"],
      ["what about Nd6+?", onQxc1(), "8. Nd6+ @14"],
    ]);
  });
});

describe("the numbers a what-if sends up with its question", () => {
  // The fixture-07 what-if at move 8 and a search result for it, as
  // parseMovesResults would hand it over: White-relative, every move's own
  // depth and line.
  const ask = resolveWhatIf(
    "what about 8. Qxc1 instead?",
    ctx({ viewedPly: 0 })
  )!;
  const result = (depth: number, over: Partial<MovesEval> = {}): MovesEval =>
    ({
      fen: ask.fen,
      depth,
      moves: [
        {
          uci: "d1c1",
          san: "Qxc1",
          cp: 251,
          depth,
          pv: [
            "d1c1",
            "a8b8",
            "c1f4",
            "g8f6",
            "f1d3",
            "a7a6",
            "b5c7",
            "e8d8",
            "c7a8",
          ],
        },
        {
          uci: "b5c7",
          san: "Nc7+",
          cp: -97,
          depth,
          pv: ["b5c7", "e8d8", "c7a8"],
        },
      ],
      missing: [],
      source: "local",
      ...over,
    }) as MovesEval;

  it("are what the server verifies: the asked move and the played move, each with its line cut to the licensed length", () => {
    const numbers = whatIfClientEvals(ask, result(12))!;
    expect(numbers).toMatchObject({ index: 14, fen: FEN_BEFORE_8, depth: 12 });
    expect(numbers.moves.map((m) => [m.role, m.uci, m.cp])).toEqual([
      ["asked", "d1c1", 251],
      ["played", "b5c7", -97],
    ]);
    expect(numbers.moves[0].pv).toHaveLength(8);
    // The round trip: the client's payload passes the route's own check.
    const v = verifyClientEvals(numbers, {
      playedMoves: SANS,
      gameEval: { positions: sweep("d1c1") },
    });
    expect(v.ok).toBe(true);
    if (v.ok)
      expect(v.value.moves.map((m) => [m.role, m.san])).toEqual([
        ["asked", "Qxc1"],
        ["played", "Nc7+"],
      ]);
  });

  it("are not sent short of the first depth, or without the asked move's line", () => {
    expect(whatIfClientEvals(ask, result(8))).toBeNull();
    const noAsked = result(12);
    noAsked.moves = noAsked.moves.filter((m) => m.uci !== "d1c1");
    expect(whatIfClientEvals(ask, noAsked)).toBeNull();
  });

  it("keep a mate as a mate, and take the shallowest move's depth for the payload's", () => {
    const r = result(14);
    r.moves[0] = { ...r.moves[0], cp: undefined, mate: 4, depth: 15 };
    const numbers = whatIfClientEvals(ask, r)!;
    expect(numbers.moves[0]).toMatchObject({ mate: 4 });
    expect("cp" in numbers.moves[0]).toBe(false);
    expect(numbers.depth).toBe(14);
  });

  it("are waited for at most the bound: late numbers, a failed search and no search are all none", async () => {
    const soon = new Promise<null | ReturnType<typeof whatIfClientEvals>>((r) =>
      setTimeout(() => r(whatIfClientEvals(ask, result(12))), 5)
    );
    expect(await whatIfEvalsWithin(soon as never, 200)).not.toBeNull();
    const late = new Promise((r) => setTimeout(() => r("late"), 200));
    expect(await whatIfEvalsWithin(late as never, 10)).toBeNull();
    expect(
      await whatIfEvalsWithin(Promise.reject(new Error("x")), 50)
    ).toBeNull();
    expect(await whatIfEvalsWithin(undefined, 50)).toBeNull();
  });
});
