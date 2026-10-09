import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  CLIENT_EVALS_LINE_PLIES,
  comparedOf,
  verifyClientEvals as verifyRaw,
  type ClientEvals,
  type ClientEvalsGame,
} from "../clientEvals";

/**
 * Every plain what-if below is verified twice, with the compare's reading
 * (pathway 3.5) and without it, and the two must agree to the byte.
 */
const verifyClientEvals = (raw: unknown, g: ClientEvalsGame) => {
  const off = verifyRaw(raw, g);
  expect(verifyRaw(raw, g, { compare: true })).toEqual(off);
  return off;
};

/** Fixture 07: 8. Nc7+ forks king and rook while 8. Qxc1 takes a free queen. */
const SANS =
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8 Nxa8 Qxd1+ Kxd1 e5".split(
    " "
  );
const FEN_BEFORE_8 =
  "r1b1kbnr/pp1ppppp/2n5/1N6/4P3/5N2/P1P2PPP/2qQKB1R w Kkq - 0 8";

/** A sweep whose best before move 8 is Qxc1. */
const gameEval = {
  positions: Array.from({ length: SANS.length + 1 }, (_, i) =>
    i === 14
      ? { lines: [{ pv: ["d1c1", "a8b8"], depth: 16, cp: 284 }] }
      : { lines: [{ pv: [], depth: 0 }] }
  ),
};

const payload = (over: Partial<ClientEvals> = {}): ClientEvals => ({
  index: 14,
  fen: FEN_BEFORE_8,
  depth: 12,
  moves: [
    {
      role: "asked",
      uci: "d1c1",
      cp: 251,
      depth: 12,
      pv: ["d1c1", "a8b8", "c1f4", "g8f6"],
    },
    {
      role: "played",
      uci: "b5c7",
      cp: -97,
      depth: 12,
      pv: ["b5c7", "e8d8", "c7a8"],
    },
  ],
  ...over,
});

const game = { playedMoves: SANS, gameEval };

describe("verifyClientEvals: what survives", () => {
  it("a well-formed what-if is replayed and derived on the server", () => {
    const v = verifyClientEvals(payload(), game);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value).toEqual({
      index: 14,
      fenBefore: FEN_BEFORE_8,
      moveNumber: 8,
      color: "w",
      depth: 12,
      moves: [
        {
          role: "asked",
          uci: "d1c1",
          san: "Qxc1",
          cp: 251,
          depth: 12,
          lineSan: ["Qxc1", "Rb8", "Qf4", "Nf6"],
          // The review's best there: its own number rides beside the cold one.
          review: { cp: 284 },
        },
        {
          role: "played",
          uci: "b5c7",
          san: "Nc7+",
          cp: -97,
          depth: 12,
          lineSan: ["Nc7+", "Kd8", "Nxa8"],
        },
      ],
    });
  });

  it("orders the moves asked, played, best whatever the client's order, and keeps a mate as a mate", () => {
    const p = payload();
    p.moves = [{ ...p.moves[1] }, { ...p.moves[0], cp: undefined, mate: 3 }];
    const v = verifyClientEvals(p, game);
    expect(v.ok && v.value.moves.map((m) => [m.role, m.mate ?? m.cp])).toEqual([
      ["asked", 3],
      ["played", -97],
    ]);
  });

  it("the best move must be the review's own there", () => {
    const withBest = payload();
    withBest.moves = [
      { ...withBest.moves[0], uci: "b5d6", pv: ["b5d6", "e7d6"] },
      withBest.moves[1],
      { role: "best", uci: "d1c1", cp: 251, depth: 12, pv: ["d1c1"] },
    ];
    expect(verifyClientEvals(withBest, game).ok).toBe(true);
    withBest.moves[2] = {
      role: "best",
      uci: "f3e5",
      cp: 0,
      depth: 12,
      pv: ["f3e5"],
    };
    expect(verifyClientEvals(withBest, game)).toEqual({
      ok: false,
      reason: "best_mismatch",
    });
  });

  it("takes a line of the licensed length, every move of it replayed, and no longer", () => {
    // A legal shuffle as long as the cut, then one move more.
    const g = new Chess(FEN_BEFORE_8);
    const pv = ["d1c1"];
    g.move("Qxc1");
    for (let i = 0; i < CLIENT_EVALS_LINE_PLIES; i++) {
      const m = g.moves({ verbose: true })[0];
      pv.push(`${m.from}${m.to}${m.promotion ?? ""}`);
      g.move(m);
    }
    const p = payload();
    p.moves[0] = { ...p.moves[0], pv: pv.slice(0, CLIENT_EVALS_LINE_PLIES) };
    const v = verifyClientEvals(p, game);
    expect(v.ok && v.value.moves[0].lineSan.length).toBe(
      CLIENT_EVALS_LINE_PLIES
    );
    p.moves[0] = { ...p.moves[0], pv };
    expect(verifyClientEvals(p, game)).toEqual({ ok: false, reason: "shape" });
  });

  it("the played move carries the review's number after it, where the review has one", () => {
    const sweep = {
      positions: gameEval.positions.map((pos, i) =>
        i === 15 ? { lines: [{ pv: ["e8d8"], depth: 16, cp: -211 }] } : pos
      ),
    };
    const v = verifyClientEvals(payload(), { ...game, gameEval: sweep });
    expect(v.ok && v.value.moves.map((m) => [m.role, m.review])).toEqual([
      ["asked", { cp: 284 }],
      ["played", { cp: -211 }],
    ]);
  });

  it("a best the review cannot confirm is left out, and the rest stands", () => {
    const p = payload();
    p.moves = [
      { ...p.moves[0], uci: "b5d6", pv: ["b5d6", "e7d6"] },
      p.moves[1],
      { role: "best", uci: "f3d4", cp: 999, depth: 12, pv: ["f3d4"] },
    ];
    for (const noReview of [
      { ...game, gameEval: undefined },
      {
        ...game,
        gameEval: {
          positions: gameEval.positions.map((pos, i) =>
            i === 14 ? { lines: [{ pv: ["d1c1"], cp: 0, depth: 0 }] } : pos
          ),
        },
      },
    ]) {
      const v = verifyClientEvals(p, noReview);
      expect(v.ok && v.value.moves.map((m) => m.role)).toEqual([
        "asked",
        "played",
      ]);
    }
  });
});

describe("verifyClientEvals: what is dropped, and why", () => {
  const reason = (p: unknown, g: ClientEvalsGame = game) => {
    const v = verifyClientEvals(p, g);
    return v.ok ? "ok" : v.reason;
  };

  it("anything that is not the shape, or out of bounds", () => {
    expect(reason(null)).toBe("shape");
    expect(reason("a string")).toBe("shape");
    expect(reason({ ...payload(), depth: 6 })).toBe("shape");
    expect(reason({ ...payload(), index: -1 })).toBe("shape");
    expect(reason({ ...payload(), fen: "x".repeat(121) })).toBe("shape");
    const p = payload();
    expect(
      reason({ ...p, moves: [{ ...p.moves[0], cp: 9000 }, p.moves[1]] })
    ).toBe("shape");
    expect(
      reason({
        ...p,
        moves: [{ ...p.moves[0], cp: undefined, mate: 0 }, p.moves[1]],
      })
    ).toBe("shape");
    expect(
      reason({
        ...p,
        moves: [{ ...p.moves[0], uci: "d1c1; drop table" }, p.moves[1]],
      })
    ).toBe("shape");
    expect(reason({ ...p, moves: Array(11).fill(p.moves[0]) })).toBe("shape");
  });

  it("roles: one asked move, at most one played and one best, no move twice, every move scored", () => {
    const p = payload();
    expect(reason({ ...p, moves: [p.moves[1]] })).toBe("roles");
    expect(
      reason({ ...p, moves: [p.moves[0], { ...p.moves[0], role: "played" }] })
    ).toBe("roles");
    // One move spelt two ways: chess.js plays "b5c7q" as Nc7+, so the
    // suffix is no spelling of that move at all.
    expect(
      reason({
        ...p,
        moves: [
          { ...p.moves[1], role: "asked", uci: "b5c7q", pv: ["b5c7q"] },
          p.moves[1],
        ],
      })
    ).toBe("illegal_move");
    expect(
      reason({
        ...p,
        moves: [{ ...p.moves[0], pv: ["d1c1", "a8b8q"] }, p.moves[1]],
      })
    ).toBe("illegal_line");
    expect(
      reason({ ...p, moves: [p.moves[0], { ...p.moves[1], cp: undefined }] })
    ).toBe("no_score");
  });

  it("a position that is not the game's at that index", () => {
    expect(reason({ ...payload(), index: 99 })).toBe("replay");
    // The position before 8... Kd8, sent as the one before 8. Nc7+.
    expect(reason({ ...payload(), index: 15 })).toBe("fen");
    // The same position with another move counter is another FEN.
    expect(
      reason({ ...payload(), fen: FEN_BEFORE_8.replace(/ 8$/, " 9") })
    ).toBe("fen");
  });

  it("an illegal move, a line that does not start with it, or an illegal line move", () => {
    const p = payload();
    expect(
      reason({
        ...p,
        moves: [{ ...p.moves[0], uci: "d1d8", pv: ["d1d8"] }, p.moves[1]],
      })
    ).toBe("illegal_move");
    expect(
      reason({ ...p, moves: [{ ...p.moves[0], pv: ["b5c7"] }, p.moves[1]] })
    ).toBe("line_mismatch");
    expect(
      reason({
        ...p,
        moves: [{ ...p.moves[0], pv: ["d1c1", "a8b8", "c1c1"] }, p.moves[1]],
      })
    ).toBe("illegal_line");
  });

  it("a number from a shallower search than the payload names", () => {
    const p = payload();
    expect(
      reason({ ...p, moves: [{ ...p.moves[0], depth: 11 }, p.moves[1]] })
    ).toBe("depth");
  });

  it("a line that ends in mate scored as anything but the mating side's mate", () => {
    // 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6: 4. Qxf7# where the game played 4. Nc3.
    const sans = "e4 e5 Bc4 Nc6 Qh5 Nf6 Nc3".split(" ");
    const g = new Chess();
    for (const m of sans.slice(0, 6)) g.move(m);
    const mating = (score: { cp?: number; mate?: number }) => ({
      index: 6,
      fen: g.fen(),
      depth: 12,
      moves: [
        { role: "asked", uci: "h5f7", depth: 12, pv: ["h5f7"], ...score },
        { role: "played", uci: "b1c3", cp: 0, depth: 12, pv: ["b1c3"] },
      ],
    });
    const mateGame = { playedMoves: sans };
    expect(reason(mating({ mate: 1 }), mateGame)).toBe("ok");
    expect(reason(mating({ mate: -1 }), mateGame)).toBe("mate_mismatch");
    expect(reason(mating({ cp: -500 }), mateGame)).toBe("mate_mismatch");
    // Mate in 2 is not the one move that mates.
    expect(reason(mating({ mate: 2 }), mateGame)).toBe("mate_mismatch");
  });

  it("a 'played' move that is not the game's move there", () => {
    const p = payload();
    expect(
      reason({
        ...p,
        moves: [p.moves[0], { ...p.moves[1], uci: "b5d6", pv: ["b5d6"] }],
      })
    ).toBe("played_mismatch");
  });
});

describe("a compare (pathway 3.5)", () => {
  /** The game's 8. Nc7+ against 8. Nd6+, sent compared first, with the review's best, 8. Qxc1. */
  const comparePayload = (moves?: unknown[]) => ({
    index: 14,
    fen: FEN_BEFORE_8,
    depth: 12,
    moves: moves ?? [
      {
        role: "compared",
        uci: "b5d6",
        cp: -130,
        depth: 12,
        pv: ["b5d6", "e7d6"],
      },
      {
        role: "asked",
        uci: "b5c7",
        cp: -97,
        depth: 12,
        pv: ["b5c7", "e8d8"],
      },
      { role: "best", uci: "d1c1", cp: 251, depth: 12, pv: ["d1c1", "a8b8"] },
    ],
  });
  const compareReason = (p: unknown) => {
    const v = verifyRaw(p, game, { compare: true });
    return v.ok ? "ok" : v.reason;
  };
  const asked = {
    role: "asked",
    uci: "d1c1",
    cp: 251,
    depth: 12,
    pv: ["d1c1", "a8b8"],
  };
  const compared = {
    role: "compared",
    uci: "b5d6",
    cp: -130,
    depth: 12,
    pv: ["b5d6", "e7d6"],
  };

  it("without the compare's reading, a compared move is no shape", () => {
    expect(verifyRaw(comparePayload(), game)).toEqual({
      ok: false,
      reason: "shape",
    });
  });

  it("with it, the payload verifies and sorts asked, compared, best", () => {
    const v = verifyRaw(comparePayload(), game, { compare: true });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.moves.map((m) => [m.role, m.san])).toEqual([
      ["asked", "Nc7+"],
      ["compared", "Nd6+"],
      ["best", "Qxc1"],
    ]);
    expect(comparedOf(v.value)).toMatchObject({
      role: "compared",
      uci: "b5d6",
      san: "Nd6+",
      cp: -130,
      lineSan: ["Nd6+", "exd6"],
    });
    expect(v.value.moves[2].review).toEqual({ cp: 284 });
    const plain = verifyRaw(payload(), game);
    expect(plain.ok && comparedOf(plain.value)).toBe(null);
  });

  it("roles: two compared moves, a compared move that is the asked one, a compared and a played move", () => {
    expect(
      compareReason(
        comparePayload([
          asked,
          compared,
          { ...compared, uci: "b5c7", pv: ["b5c7"] },
        ])
      )
    ).toBe("roles");
    expect(
      compareReason(comparePayload([asked, { ...asked, role: "compared" }]))
    ).toBe("roles");
    expect(
      compareReason(
        comparePayload([
          asked,
          compared,
          {
            role: "played",
            uci: "b5c7",
            cp: -97,
            depth: 12,
            pv: ["b5c7"],
          },
        ])
      )
    ).toBe("roles");
    expect(compareReason(comparePayload([compared]))).toBe("roles");
  });

  it("checks a compared move as it checks any move", () => {
    expect(
      compareReason(
        comparePayload([asked, { ...compared, uci: "b5b6", pv: ["b5b6"] }])
      )
    ).toBe("illegal_move");
    expect(
      compareReason(
        comparePayload([asked, { ...compared, pv: ["b5c7", "e8d8"] }])
      )
    ).toBe("line_mismatch");
    // Mate in 1 for White, on a line that reaches past its first move with no mate.
    expect(
      compareReason(
        comparePayload([asked, { ...compared, cp: undefined, mate: 1 }])
      )
    ).toBe("mate_mismatch");
  });
});
