import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Chess } from "chess.js";
import type { MovesEval, PositionEval } from "@/types/eval";
import { verifyClientEvals } from "@/lib/coach/clientEvals";
import { compareMatchesWords, readCompare } from "@/lib/coach/compareWords";
import {
  compareLabel,
  compareSummary,
  COMPARE_PUBLIC_DEFAULT,
  initialWhatIfState,
  isCompareEnabledPublic,
  pinWhatIfLine,
  resolveCompare,
  resolveWhatIf,
  whatIfClientEvals,
  whatIfJumpDecision,
  whatIfLine,
  whatIfLineFor,
  whatIfStateFrom,
  whatIfSummary,
  whatIfUnavailable,
  type WhatIfAsk,
  type WhatIfContext,
} from "../coachWhatIf";

/**
 * A compare on the page (pathway 3.5b): "8. Qxc1 or 8. Nd6+?" read with the
 * router's own rule, placed at exactly one ply, scored in the what-if's one
 * search and drawn as two lines under the question with the numbers and
 * the engine's verdict in words.
 */

/** Fixture 07: 8. Nc7+ forks king and rook while 8. Qxc1 takes a free queen. */
const SANS =
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8 Nxa8 Qxd1+ Kxd1 e5".split(
    " "
  );
/** The position before 8. Nc7+ (14 plies in). */
const FEN_BEFORE_8 =
  "r1b1kbnr/pp1ppppp/2n5/1N6/4P3/5N2/P1P2PPP/2qQKB1R w Kkq - 0 8";

/** A sweep whose best at ply 14 is `bestAt14` and whose other positions are blank. */
function sweep(bestAt14: string | null): PositionEval[] {
  return Array.from({ length: SANS.length + 1 }, (_, i) =>
    i === 14 && bestAt14
      ? { lines: [{ pv: [bestAt14, "a8b8"], depth: 16, multiPv: 1, cp: 251 }] }
      : { lines: [{ pv: [], depth: 0, multiPv: 1 }] }
  );
}

const ctx = (over: Partial<WhatIfContext> = {}): WhatIfContext => ({
  sans: SANS,
  viewedPly: 14,
  playerColor: "w",
  playerSideKnown: true,
  enginePositions: sweep("d1c1"),
  ...over,
});

/** A rook ending set up from a position: both sides can play Ra4 and Ra5. */
const ROOKS = "r3k3/8/8/8/8/8/8/R3K3 w - - 0 1";
const rooks = (over: Partial<WhatIfContext> = {}): WhatIfContext => ({
  sans: ["Kd2", "Kd7", "Ke3"],
  rootFen: ROOKS,
  viewedPly: 1,
  playerColor: "w",
  playerSideKnown: true,
  ...over,
});

/** The start, where both pawn pushes are legal for White. */
const pawns = (over: Partial<WhatIfContext> = {}): WhatIfContext => ({
  sans: ["Nf3", "d5", "g3", "Nf6"],
  viewedPly: 0,
  playerColor: "w",
  playerSideKnown: true,
  ...over,
});

const where = (q: string, c: WhatIfContext) => {
  const ask = resolveCompare(q, c);
  return ask
    ? `${ask.index} ${ask.moveNumber}${ask.color} ${ask.asked.san} / ${ask.compared?.san}`
    : null;
};

describe("resolveCompare: reading the two moves", () => {
  it("both numbered: the two moves at their move, the first asked and the second compared", () => {
    const ask = resolveCompare("8. Qxc1 or 8. Nd6+?", ctx({ viewedPly: 0 }))!;
    expect(ask).not.toBeNull();
    expect(ask.rule).toBe("compare");
    expect(ask.index).toBe(14);
    expect(ask.fen).toBe(FEN_BEFORE_8);
    expect(ask.moveNumber).toBe(8);
    expect(ask.color).toBe("w");
    expect(ask.asked).toEqual({ role: "asked", uci: "d1c1", san: "Qxc1" });
    expect(ask.compared).toEqual({
      role: "compared",
      uci: "b5d6",
      san: "Nd6+",
    });
    // The review's best is the first move, so it is not listed twice, and
    // a compare has no separate part for the game's move.
    expect(ask.moves.map((m) => [m.role, m.uci])).toEqual([
      ["asked", "d1c1"],
      ["compared", "b5d6"],
    ]);
  });

  it("one numbered: the number places both", () => {
    expect(where("Qxc1 or 8. Nd6+?", ctx({ viewedPly: 0 }))).toBe(
      "14 8w Qxc1 / Nd6+"
    );
    expect(where("8. Qxc1 or Nd6+?", ctx({ viewedPly: 3 }))).toBe(
      "14 8w Qxc1 / Nd6+"
    );
    // Numbers that disagree, or a number where neither is legal: nothing.
    expect(where("8. Qxc1 or 9. Nd6+?", ctx())).toBeNull();
    expect(where("9. Qxc1 or 9. Nd6+?", ctx())).toBeNull();
    expect(where("8... Qxc1 or 8... Nd6+?", ctx())).toBeNull();
  });

  it("'here' is the next move from the board shown", () => {
    expect(where("Qxc1 or Nd6+ here?", ctx({ viewedPly: 14 }))).toBe(
      "14 8w Qxc1 / Nd6+"
    );
    expect(where("Ra4 or Ra5 here?", rooks())).toBe("1 1b Ra4 / Ra5");
    // At 13 Black is to move: Nd6+ is no move there.
    expect(where("Qxc1 or Nd6+ here?", ctx({ viewedPly: 13 }))).toBeNull();
  });

  it("'instead' and 'should I have' are the move the strip names, the one before the cursor", () => {
    expect(where("Qxc1 or Nd6+ instead?", ctx({ viewedPly: 15 }))).toBe(
      "14 8w Qxc1 / Nd6+"
    );
    expect(where("Ra4 or Ra5 instead?", rooks())).toBe("0 1w Ra4 / Ra5");
    expect(where("should I have played Ra4 or Ra5?", rooks())).toBe(
      "0 1w Ra4 / Ra5"
    );
    // At 14 the strip names 7... Qxc1, a Black move: Nd6+ is not one.
    expect(where("Qxc1 or Nd6+ instead?", ctx({ viewedPly: 14 }))).toBeNull();
  });

  it("legal at both plies with no cue draws nothing, and a side the words name picks", () => {
    expect(where("Ra4 or Ra5?", rooks())).toBeNull();
    expect(where("my Ra4 or Ra5?", rooks())).toBe("0 1w Ra4 / Ra5");
    expect(where("Ra4 or Ra5 for Black?", rooks())).toBe("1 1b Ra4 / Ra5");
    // A side the words name that cannot play them there.
    expect(where("Qxc1 or Nd6+ for Black?", ctx())).toBeNull();
  });

  it("a side conflict draws nothing", () => {
    expect(where("White's Ra4 or Ra5 for Black?", rooks())).toBeNull();
  });

  it("an illegal move, or the same move twice, draws nothing", () => {
    expect(where("8. Qxf7+ or 8. Nd6+?", ctx())).toBeNull();
    expect(where("8. Qxc1 or 8. Qd8?", ctx())).toBeNull();
    // "Nd6" is chess.js's Nd6+: one move, twice.
    expect(where("8. Nd6+ or 8. Nd6?", ctx())).toBeNull();
  });

  it("a third move, an 'after' line or 'move 8' draws nothing", () => {
    expect(where("Qxc1 or Nd6+ or Nc7+?", ctx())).toBeNull();
    expect(where("after 7... Qxc1, 8. Qxc1 or 8. Nd6+?", ctx())).toBeNull();
    expect(where("after Qxc1, Nd6+ or Nc7+?", ctx())).toBeNull();
    expect(where("Qxc1 or Nd6+ on move 8?", ctx())).toBeNull();
    expect(where("on my 8th move, Qxc1 or Nd6+?", ctx())).toBeNull();
  });

  it("unnumbered, never on an exploration or a what-if's own board; numbered, still", () => {
    const fen = (() => {
      const g = new Chess(FEN_BEFORE_8);
      g.move("Qxc1");
      return g.fen();
    })();
    expect(where("Qxc1 or Nd6+ here?", ctx({ exploring: true }))).toBeNull();
    expect(
      where("Qxc1 or Nd6+ here?", ctx({ onWhatIf: { index: 14, fen } }))
    ).toBeNull();
    expect(where("8. Qxc1 or 8. Nd6+?", ctx({ exploring: true }))).toBe(
      "14 8w Qxc1 / Nd6+"
    );
    expect(where("Ra4 or Ra5?", rooks({ exploring: true }))).toBeNull();
    expect(where("1... Ra4 or 1... Ra5?", rooks({ exploring: true }))).toBe(
      "1 1b Ra4 / Ra5"
    );
  });

  it("a bare pawn pair needs a move cue, and never follows a piece's name", () => {
    expect(where("e4 or d4 here?", pawns())).toBe("0 1w e4 / d4");
    expect(where("Is e4 or d4 better here?", pawns())).toBe("0 1w e4 / d4");
    expect(where("should I push e4 or d4?", pawns())).toBe("0 1w e4 / d4");
    expect(where("e4 or d4?", pawns())).toBeNull();
    expect(where("is my knight better on e4 or d4?", pawns())).toBeNull();
    expect(where("should my bishop go e4 or d4 here?", pawns())).toBeNull();
    // Numbered, a pawn push is a move.
    expect(where("1. e4 or 1. d4?", pawns())).toBe("0 1w e4 / d4");
  });

  it("one move may be the game's: it is the compared move, with no played part", () => {
    const ask = resolveCompare("Qxc1 or Nc7+ here?", ctx())!;
    expect(ask.index).toBe(14);
    expect(ask.moves.map((m) => [m.role, m.san])).toEqual([
      ["asked", "Qxc1"],
      ["compared", "Nc7+"],
    ]);
  });

  it("the review's best is scored beside them only when it is neither", () => {
    const neither = resolveCompare("Nd6+ or Nc7+ here?", ctx())!;
    expect(neither.moves.map((m) => [m.role, m.san])).toEqual([
      ["asked", "Nd6+"],
      ["compared", "Nc7+"],
      ["best", "Qxc1"],
    ]);
    const second = resolveCompare("Nd6+ or Qxc1 here?", ctx())!;
    expect(second.moves.map((m) => m.role)).toEqual(["asked", "compared"]);
    const noReview = resolveCompare(
      "Nd6+ or Nc7+ here?",
      ctx({ enginePositions: null })
    )!;
    expect(noReview.moves.map((m) => m.role)).toEqual(["asked", "compared"]);
  });

  it("a game set up from a position counts its numbers from its own start", () => {
    expect(where("1... Ra4 or 1... Ra5?", rooks())).toBe("1 1b Ra4 / Ra5");
    expect(where("2. Ra4 or 2. Ra5?", rooks())).toBe("2 2w Ra4 / Ra5");
    expect(where("1. Ra4 or 1. Ra5?", rooks())).toBe("0 1w Ra4 / Ra5");
    // Black to move at the start, on move 10.
    const fromBlack = rooks({
      rootFen: "r3k3/8/8/8/8/8/8/R3K3 b - - 0 10",
      sans: ["Kd7", "Kd2"],
    });
    expect(where("10... Ra4 or 10... Ra5?", fromBlack)).toBe("0 10b Ra4 / Ra5");
    expect(where("11. Ra4 or 11. Ra5?", fromBlack)).toBe("1 11w Ra4 / Ra5");
    expect(where("10. Ra4 or 10. Ra5?", fromBlack)).toBeNull();
  });

  it("only what the live rules read as a compare, and only as written", () => {
    for (const q of [
      "Bxc4 or bxc4?",
      "Is Nd6+ better than Qxc1?",
      "could I play Qxc1 or Nd6+?",
      "compare Qxc1 and Nd6+",
      "qxc1 or Nd6+ here?",
      "",
    ])
      expect(where(q, ctx()), q).toBeNull();
  });
});

describe("a compare and a what-if never read the same words", () => {
  const COMPARES = [
    "8. Qxc1 or 8. Nd6+?",
    "Qxc1 or 8. Nd6+?",
    "Qxc1 or Nd6+ here?",
    "Qxc1 or Nc7+ here?",
    "Nd6+ or Nc7+ here?",
    "Qxc1 vs Nd6+?",
    "Qxc1, or Nd6+?",
  ];

  it("resolveWhatIf returns null for every compare question", () => {
    for (const q of COMPARES) {
      expect(resolveCompare(q, ctx()), q).not.toBeNull();
      for (const viewedPly of [0, 14, 15])
        expect(resolveWhatIf(q, ctx({ viewedPly })), q).toBeNull();
    }
  });

  it("resolveCompare returns null for every what-if fixture", () => {
    // Every question the what-if suite asks, read off its source.
    const source = fs.readFileSync(
      path.join(__dirname, "coachWhatIf.test.ts"),
      "utf8"
    );
    const questions = Array.from(
      new Set(
        Array.from(source.matchAll(/"([^"\n]*[A-Za-z][^"\n]*\?)"/g)).map(
          (m) => m[1]
        )
      )
    );
    expect(questions.length).toBeGreaterThan(60);
    for (const q of questions) {
      expect(
        readCompare(q, { anchor: null, moves: SANS, playerColor: "w" }),
        q
      ).toBeNull();
      for (const viewedPly of [0, 14, 15])
        expect(resolveCompare(q, ctx({ viewedPly })), q).toBeNull();
    }
  });
});

/** A search result for the fixture-07 compare, White-relative, every move's own depth and line. */
function result(
  ask: WhatIfAsk,
  depth: number,
  over: {
    first?: Partial<MovesEval["moves"][number]> | null;
    second?: Partial<MovesEval["moves"][number]> | null;
  } = {}
): MovesEval {
  const moves: MovesEval["moves"] = [];
  if (over.first !== null)
    moves.push({
      uci: "d1c1",
      san: "Qxc1",
      cp: 240 + depth,
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
      ...over.first,
    });
  if (over.second !== null)
    moves.push({
      uci: "b5d6",
      san: "Nd6+",
      cp: 120,
      depth,
      pv: ["b5d6", "e7d6", "d1c1"],
      ...over.second,
    });
  return {
    fen: ask.fen,
    depth,
    moves,
    missing: [],
    source: "local",
    cold: true,
  } as MovesEval;
}

describe("the state a compare carries", () => {
  const ask = resolveCompare("8. Qxc1 or 8. Nd6+?", ctx({ viewedPly: 0 }))!;

  it("starts checking with both lines' space reserved", () => {
    const s = initialWhatIfState(3, ask);
    expect(s).toMatchObject({
      id: 3,
      status: "checking",
      line: null,
      compared: { line: null },
      depth: 0,
    });
    expect(compareSummary(s)).toEqual({
      numbers: "Checking 8. Qxc1 and Nd6+ with the engine…",
      words: "",
    });
    // The coach's jump for its reply waits while it checks.
    expect(whatIfJumpDecision(s)).toBe("defer");
  });

  it("is drawn only with both lines: a partial missing either is waited through", () => {
    const s0 = initialWhatIfState(1, ask);
    expect(whatIfStateFrom(s0, result(ask, 10, { second: null }), false)).toBe(
      s0
    );
    expect(whatIfStateFrom(s0, result(ask, 10, { first: null }), false)).toBe(
      s0
    );
    const drawn = whatIfStateFrom(s0, result(ask, 10), false);
    expect(drawn.status).toBe("drawn");
    expect(drawn.line?.sans.slice(0, 3)).toEqual(["Qxc1", "Rb8", "Qf4"]);
    expect(drawn.compared?.line?.sans).toEqual(["Nd6+", "exd6", "Qxc1"]);
    expect(whatIfJumpDecision(drawn)).toBe("skip");
  });

  it("a final missing either line is no-line", () => {
    const s0 = initialWhatIfState(1, ask);
    for (const missing of [{ first: null }, { second: null }]) {
      const final = whatIfStateFrom(s0, result(ask, 16, missing), true);
      expect(final.status).toBe("unavailable");
      expect(final.reason).toBe("no-line");
      expect(final.line).toBeNull();
      expect(final.compared?.line).toBeNull();
      expect(compareSummary(final)).toEqual({
        numbers:
          "The engine found no line for one of 8. Qxc1 and Nd6+, so they are not compared.",
        words: "",
      });
    }
  });

  it("keeps each line's moves when a deeper search has the same ones, and redraws every second depth", () => {
    const drawn = whatIfStateFrom(
      initialWhatIfState(1, ask),
      result(ask, 10),
      false
    );
    expect(whatIfStateFrom(drawn, result(ask, 11), false)).toBe(drawn);
    const deeper = whatIfStateFrom(drawn, result(ask, 12), false);
    expect(deeper.line?.sans).toBe(drawn.line?.sans);
    expect(deeper.compared?.line?.sans).toBe(drawn.compared?.line?.sans);
    expect(deeper.line?.evalDisplay).toBe("+2.52");
    expect(deeper.depth).toBe(12);
    // The second line changes on its own: the first keeps its array.
    const changed = whatIfStateFrom(
      deeper,
      result(ask, 14, { second: { pv: ["b5d6", "e8d8", "d6f7"] } }),
      false
    );
    expect(changed.line?.sans).toBe(drawn.line?.sans);
    expect(changed.compared?.line?.sans).toEqual(["Nd6+", "Kd8", "Nxf7+"]);
    const final = whatIfStateFrom(changed, result(ask, 16), true);
    expect(final.status).toBe("final");
  });

  it("a plain what-if carries no compared part, and its state is what it was", () => {
    const whatIf = resolveWhatIf("why not 8. Qxc1?", ctx({ viewedPly: 0 }))!;
    const s = initialWhatIfState(1, whatIf);
    expect("compared" in s).toBe(false);
    const drawn = whatIfStateFrom(s, result(whatIf, 10), false);
    expect("compared" in drawn).toBe(false);
    const gone = whatIfStateFrom(s, result(whatIf, 16, { first: null }), true);
    expect("compared" in gone).toBe(false);
    expect(whatIfSummary(gone)).toBe("The engine found no line for 8. Qxc1.");
  });

  it("holds each line on its own when the reader taps or plays it", () => {
    const drawn = whatIfStateFrom(
      initialWhatIfState(1, ask),
      result(ask, 10),
      false
    );
    const first = drawn.line!;
    const second = drawn.compared!.line!;
    const a = pinWhatIfLine(drawn, second);
    expect(a.compared?.pinned).toBe(second);
    expect(a.pinned).toBeUndefined();
    const b = pinWhatIfLine(a, first);
    expect(b.pinned).toBe(first);
    expect(b.compared?.pinned).toBe(second);
    // Held for good: a later line does not replace either.
    const later = whatIfStateFrom(
      b,
      result(ask, 14, {
        first: { pv: ["d1c1", "e7e5"] },
        second: { pv: ["b5d6", "e8d8"] },
      }),
      false
    );
    expect(pinWhatIfLine(later, later.line!).pinned).toBe(first);
    expect(pinWhatIfLine(later, later.compared!.line!).compared?.pinned).toBe(
      second
    );
  });

  it("whatIfLineFor draws any scored move's line, and whatIfLine is the asked move's", () => {
    const r = result(ask, 12);
    expect(whatIfLineFor(ask, r, "b5d6")?.sans[0]).toBe("Nd6+");
    expect(whatIfLineFor(ask, r, "d1c1")).toEqual(whatIfLine(ask, r));
    expect(whatIfLineFor(ask, r, "b5c7")).toBeNull();
  });
});

describe("the numbers a compare sends up", () => {
  const ask = resolveCompare("8. Qxc1 or 8. Nd6+?", ctx({ viewedPly: 0 }))!;

  it("carry the compared role, and the server verifies them and reads the words the same way", () => {
    const numbers = whatIfClientEvals(ask, result(ask, 12))!;
    expect(numbers).toMatchObject({ index: 14, fen: FEN_BEFORE_8, depth: 12 });
    expect(numbers.moves.map((m) => [m.role, m.uci])).toEqual([
      ["asked", "d1c1"],
      ["compared", "b5d6"],
    ]);
    expect(numbers.moves[0].pv).toHaveLength(8);
    const v = verifyClientEvals(
      numbers,
      { playedMoves: SANS, gameEval: { positions: sweep("d1c1") } },
      { compare: true }
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.moves.map((m) => [m.role, m.san])).toEqual([
      ["asked", "Qxc1"],
      ["compared", "Nd6+"],
    ]);
    const words = { anchor: null, moves: SANS, playerColor: "w" as const };
    for (const q of ["8. Qxc1 or 8. Nd6+?", "Qxc1 or Nd6+ here?"])
      expect(compareMatchesWords(q, v.value, words), q).toBe(true);
    // Without the server's compare switch the payload is a shape it does not read.
    const off = verifyClientEvals(numbers, { playedMoves: SANS });
    expect(off).toEqual({ ok: false, reason: "shape" });
  });

  it("carry the review's best beside them when it is neither", () => {
    const three = resolveCompare("Nd6+ or Nc7+ here?", ctx())!;
    const r = result(three, 12);
    r.moves.push({
      uci: "b5c7",
      san: "Nc7+",
      cp: -97,
      depth: 12,
      pv: ["b5c7", "e8d8", "c7a8"],
    });
    const numbers = whatIfClientEvals(three, r)!;
    expect(numbers.moves.map((m) => [m.role, m.uci])).toEqual([
      ["asked", "b5d6"],
      ["compared", "b5c7"],
      ["best", "d1c1"],
    ]);
    const v = verifyClientEvals(
      numbers,
      { playedMoves: SANS, gameEval: { positions: sweep("d1c1") } },
      { compare: true }
    );
    expect(v.ok).toBe(true);
  });

  it("are not sent when the compared move is not scored, or short of the first depth", () => {
    expect(
      whatIfClientEvals(ask, result(ask, 12, { second: null }))
    ).toBeNull();
    expect(
      whatIfClientEvals(ask, result(ask, 12, { second: { cp: undefined } }))
    ).toBeNull();
    expect(whatIfClientEvals(ask, result(ask, 9))).toBeNull();
  });

  it("take the shallowest move's depth for the payload's", () => {
    const r = result(ask, 14);
    r.moves[1] = { ...r.moves[1], depth: 13 };
    expect(whatIfClientEvals(ask, r)!.depth).toBe(13);
  });
});

describe("the words above a compare's lines", () => {
  const ask = resolveCompare("8. Qxc1 or 8. Nd6+?", ctx({ viewedPly: 0 }))!;
  const s0 = initialWhatIfState(1, ask);

  it("names the two moves with the number written once", () => {
    expect(compareLabel(ask)).toBe("8. Qxc1 and Nd6+");
    const black = resolveCompare("1... Ra4 or 1... Ra5?", rooks())!;
    expect(compareLabel(black)).toBe("1... Ra4 and Ra5");
  });

  it("says what is checked, or why nothing could be, with no verdict", () => {
    const cases: Array<[Parameters<typeof whatIfUnavailable>[1], string]> = [
      [
        "no-engine",
        "The engine isn't available here, so 8. Qxc1 and Nd6+ are unchecked.",
      ],
      [
        "busy",
        "The engine is still reviewing the game, so 8. Qxc1 and Nd6+ are unchecked.",
      ],
      [
        "superseded",
        "A newer question took the engine before 8. Qxc1 and Nd6+ were checked.",
      ],
      ["failed", "The engine couldn't check 8. Qxc1 and Nd6+."],
      [
        "no-line",
        "The engine found no line for one of 8. Qxc1 and Nd6+, so they are not compared.",
      ],
    ];
    for (const [reason, numbers] of cases)
      expect(compareSummary(whatIfUnavailable(s0, reason))).toEqual({
        numbers,
        words: "",
      });
  });

  it("drawn and final: both numbers and the depth, and the engine's verdict in words", () => {
    const drawn = whatIfStateFrom(s0, result(ask, 12), false);
    expect(compareSummary(drawn)).toEqual({
      numbers: "8. Qxc1 +2.52 · Nd6+ +1.20 · d12",
      words: "The engine prefers Qxc1, by a big margin.",
    });
    const final = whatIfStateFrom(drawn, result(ask, 16), true);
    expect(compareSummary(final).numbers).toBe(
      "8. Qxc1 +2.56 · Nd6+ +1.20 · d16"
    );
  });

  it("names the engine's best after the two, and says when the two are too close to call", () => {
    const three = resolveCompare("Nd6+ or Nc7+ here?", ctx())!;
    const r: MovesEval = {
      fen: three.fen,
      depth: 14,
      moves: [
        { uci: "b5d6", san: "Nd6+", cp: 120, depth: 14, pv: ["b5d6", "e7d6"] },
        { uci: "b5c7", san: "Nc7+", cp: 115, depth: 14, pv: ["b5c7", "e8d8"] },
        { uci: "d1c1", san: "Qxc1", cp: 260, depth: 14, pv: ["d1c1", "a8b8"] },
      ],
      missing: [],
      source: "local",
      cold: true,
    } as MovesEval;
    const s = whatIfStateFrom(initialWhatIfState(2, three), r, false);
    expect(compareSummary(s)).toEqual({
      numbers: "8. Nd6+ +1.20 · Nc7+ +1.15 · engine's Qxc1 +2.60 · d14",
      words: "Too close to call in this search.",
    });
  });

  it("speaks of mates and of decided positions as such, for Black too", () => {
    const black = resolveCompare("1... Ra4 or 1... Ra5?", rooks())!;
    const r = (a: Partial<MovesEval["moves"][number]>) =>
      ({
        fen: black.fen,
        depth: 12,
        moves: [
          { uci: "a8a4", san: "Ra4", depth: 12, pv: ["a8a4"], ...a },
          { uci: "a8a5", san: "Ra5", cp: -30, depth: 12, pv: ["a8a5"] },
        ],
        missing: [],
        source: "local",
        cold: true,
      }) as MovesEval;
    const mates = whatIfStateFrom(
      initialWhatIfState(4, black),
      r({ mate: -3 }),
      false
    );
    // White-relative: a negative mate is Black's.
    expect(compareSummary(mates).numbers).toBe(
      "1... Ra4 M-3 · Ra5 -0.30 · d12"
    );
    expect(compareSummary(mates).words).toBe("Only Ra4 forces mate.");
    const allows = whatIfStateFrom(
      initialWhatIfState(4, black),
      r({ mate: 3 }),
      false
    );
    expect(compareSummary(allows).words).toBe("Ra4 allows a forced mate.");
  });

  it("never carries an em dash, a semicolon, or a figure in its words", () => {
    const states = [
      s0,
      whatIfStateFrom(s0, result(ask, 12), false),
      whatIfStateFrom(s0, result(ask, 16), true),
      ...(
        ["no-engine", "busy", "failed", "no-line", "superseded"] as const
      ).map((r) => whatIfUnavailable(s0, r)),
    ];
    for (const s of states) {
      const { numbers, words } = compareSummary(s);
      for (const text of [numbers, words]) {
        expect(text).not.toMatch(/—|;/);
      }
      expect(words).not.toMatch(/[+-]\d|\d\.\d\d|%/);
    }
  });
});

describe("the page's compare switch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off until its flip, and the env overrides it either way", () => {
    expect(COMPARE_PUBLIC_DEFAULT).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_COACH_COMPARE", "");
    expect(isCompareEnabledPublic()).toBe(false);
    for (const v of ["1", "on", "TRUE"]) {
      vi.stubEnv("NEXT_PUBLIC_COACH_COMPARE", v);
      expect(isCompareEnabledPublic(), v).toBe(true);
    }
    for (const v of ["0", "off", "false"]) {
      vi.stubEnv("NEXT_PUBLIC_COACH_COMPARE", v);
      expect(isCompareEnabledPublic(), v).toBe(false);
    }
  });
});
