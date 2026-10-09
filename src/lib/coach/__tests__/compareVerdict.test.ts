import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  compareTwo,
  compareVerdictWords,
  type CompareVerdict,
} from "../compareVerdict";
import type { ScoredMove } from "@/lib/engine/gradeMove";
import { getLineWinPercentage } from "@/lib/engine/helpers/winPercentage";
import { MoveClassification as C } from "@/types/enums";
import { anchorAtIndex } from "../questionAnchor";
import { verifyClientEvals } from "../clientEvals";
import { buildAnchorBlock } from "../followUpContext";
import {
  followUpCompareClause,
  followUpCompareReminder,
} from "@/lib/prompts/followUpGrammar";
import {
  FOLLOWUP_BUDGET,
  FOLLOWUP_LEAN_BUDGET,
} from "@/lib/prompts/followUpPrompt";

/**
 * The engine's verdict on two moves from one search (pathway 3.5), and the
 * words the page and the anchor block say it in: never a figure, never the
 * review's verdict names, mates and decided positions said as such.
 */

const GAME =
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8".split(
    " "
  );
const fenAt = (n: number) => {
  const g = new Chess();
  for (const m of GAME.slice(0, n)) g.move(m);
  return g.fen();
};
/** Before 8. Nc7+ (White to move) and before 8... Kd8 (Black to move). */
const WHITE = fenAt(14);
const BLACK = fenAt(15);

const LABELS: Record<string, string> = {
  a: "8. Qxc1",
  b: "8. Nd6+",
  ka: "8... Kd8",
  kb: "8... Ke7",
};
const SHORT: Record<string, string> = {
  a: "Qxc1",
  b: "Nd6+",
  ka: "Kd8",
  kb: "Ke7",
};
const long = (v: CompareVerdict) =>
  compareVerdictWords(v, (u) => LABELS[u], "long");
const short = (v: CompareVerdict) =>
  compareVerdictWords(v, (u) => SHORT[u], "short");

function verdict(
  fen: string,
  a: Omit<ScoredMove, "uci" | "depth">,
  b: Omit<ScoredMove, "uci" | "depth">,
  ids: [string, string] = fen === WHITE ? ["a", "b"] : ["ka", "kb"]
): CompareVerdict {
  const v = compareTwo(
    {
      fen,
      moves: [
        { uci: ids[0], depth: 14, ...a },
        { uci: ids[1], depth: 12, ...b },
      ],
    },
    ids[0],
    ids[1]
  );
  expect(v).not.toBeNull();
  return v!;
}

/** Every output the tests below produce, for the lint at the end. */
const said: string[] = [];
const say = (v: CompareVerdict) => {
  said.push(short(v), long(v));
  return v;
};

describe("the verdict, kind by kind", () => {
  it("close: inside the good band neither move is preferred", () => {
    const v = say(verdict(WHITE, { cp: 30 }, { cp: 20 }));
    expect(v).toMatchObject({
      kind: "close",
      preferred: null,
      other: null,
      margin: null,
      mover: "w",
      depth: 12,
    });
    expect(v.grade?.band).toBe(C.Excellent);
    expect(short(v)).toBe("Too close to call in this search.");
    expect(long(v)).toBe(
      "The engine rates 8. Qxc1 and 8. Nd6+ too close to call."
    );
  });

  it("prefers, by a clear, a big and a wide margin", () => {
    const clear = say(verdict(WHITE, { cp: 0 }, { cp: -80 }));
    expect(clear).toMatchObject({
      kind: "prefers",
      preferred: "a",
      other: "b",
      margin: "clear",
    });
    expect(clear.grade?.band).toBe(C.Inaccuracy);
    expect(short(clear)).toBe("The engine prefers Qxc1, by a clear margin.");
    expect(long(clear)).toBe(
      "Of the two, the engine prefers 8. Qxc1, by a clear margin."
    );
    const big = say(verdict(WHITE, { cp: -200 }, { cp: 0 }));
    expect(big).toMatchObject({ preferred: "b", margin: "big" });
    expect(big.grade?.band).toBe(C.Mistake);
    expect(short(big)).toBe("The engine prefers Nd6+, by a big margin.");
    const wide = say(verdict(WHITE, { cp: 0 }, { cp: -500 }));
    expect(wide).toMatchObject({ preferred: "a", margin: "wide" });
    expect(wide.grade?.band).toBe(C.Blunder);
    expect(long(wide)).toBe(
      "Of the two, the engine prefers 8. Qxc1, by a wide margin."
    );
  });

  it("reads Black's moves from Black's side, with Black's labels", () => {
    // White-relative: White better after 8... Kd8 is worse for Black than
    // White slightly worse after 8... Ke7.
    const v = say(verdict(BLACK, { cp: 60 }, { cp: -10 }));
    expect(v).toMatchObject({
      kind: "prefers",
      mover: "b",
      preferred: "kb",
      other: "ka",
      margin: "clear",
    });
    expect(short(v)).toBe("The engine prefers Ke7, by a clear margin.");
    expect(long(v)).toBe(
      "Of the two, the engine prefers 8... Ke7, by a clear margin."
    );
    const close = say(verdict(BLACK, { cp: -10 }, { cp: 0 }));
    expect(long(close)).toBe(
      "The engine rates 8... Kd8 and 8... Ke7 too close to call."
    );
  });

  it("only one move forces mate", () => {
    const v = say(verdict(WHITE, { cp: 400 }, { mate: 3 }));
    expect(v).toMatchObject({ kind: "only_mates", preferred: "b" });
    expect(short(v)).toBe("Only Nd6+ forces mate.");
    expect(long(v)).toBe("The engine finds a forced mate only after 8. Nd6+.");
    // For Black, a White-relative mate below 0 is Black's own.
    const black = say(verdict(BLACK, { mate: -4 }, { mate: 2 }));
    expect(black).toMatchObject({ kind: "only_mates", preferred: "ka" });
    expect(short(black)).toBe("Only Kd8 forces mate.");
  });

  it("both force mate, the shorter preferred", () => {
    const v = say(verdict(WHITE, { mate: 2 }, { mate: 4 }));
    expect(v).toMatchObject({ kind: "both_mate", preferred: "a" });
    expect(short(v)).toBe("Both force mate, Qxc1 sooner.");
    expect(long(v)).toBe(
      "The engine finds a forced mate after either move, sooner after 8. Qxc1."
    );
    const same = say(verdict(WHITE, { mate: 3 }, { mate: 3 }));
    expect(same).toMatchObject({ kind: "both_mate", preferred: null });
    expect(short(same)).toBe("Both force mate.");
    expect(long(same)).toBe(
      "The engine finds a forced mate after either move."
    );
  });

  it("one move allows a forced mate", () => {
    const v = say(verdict(WHITE, { cp: -300 }, { mate: -5 }));
    expect(v).toMatchObject({
      kind: "allows_mate",
      preferred: "a",
      other: "b",
    });
    expect(short(v)).toBe("Nd6+ allows a forced mate.");
    expect(long(v)).toBe(
      "The engine finds a forced mate against White after 8. Nd6+."
    );
    const black = say(verdict(BLACK, { mate: 6 }, { cp: 0 }));
    expect(long(black)).toBe(
      "The engine finds a forced mate against Black after 8... Kd8."
    );
  });

  it("both mated, and a decided position either way", () => {
    const mated = say(verdict(WHITE, { mate: -2 }, { mate: -6 }));
    expect(mated).toMatchObject({ kind: "both_losing", preferred: null });
    expect(short(mated)).toBe("White is losing after either move.");
    const winning = say(verdict(WHITE, { cp: 700 }, { cp: 1200 }));
    expect(winning).toMatchObject({ kind: "both_winning", preferred: null });
    expect(short(winning)).toBe("White is winning after either move.");
    expect(long(winning)).toBe(
      "The engine has White winning after either move."
    );
    const losing = say(verdict(BLACK, { cp: 900 }, { cp: 700 }));
    expect(losing).toMatchObject({ kind: "both_losing", mover: "b" });
    expect(long(losing)).toBe("The engine has Black losing after either move.");
  });

  it("is null for an unscored move, the same move twice or a bad FEN", () => {
    const moves: ScoredMove[] = [
      { uci: "a", cp: 10, depth: 12 },
      { uci: "b", depth: 12 },
    ];
    expect(compareTwo({ fen: WHITE, moves }, "a", "b")).toBeNull();
    expect(compareTwo({ fen: WHITE, moves }, "a", "a")).toBeNull();
    expect(compareTwo({ fen: WHITE, moves }, "a", "c")).toBeNull();
    expect(
      compareTwo(
        { fen: "garbage", moves: [moves[0], { ...moves[0], uci: "c" }] },
        "a",
        "c"
      )
    ).toBeNull();
  });
});

describe("the good band's edge", () => {
  it("is too close to call up to five points and a clear preference past it", () => {
    const pct = (cp: number) =>
      getLineWinPercentage({ pv: [], depth: 0, multiPv: 1, cp });
    // The lowest cp still inside five points of 0.00.
    let edge = 0;
    while (pct(0) - pct(edge - 1) <= 5) edge -= 1;
    expect(pct(0) - pct(edge)).toBeLessThanOrEqual(5);
    const inside = say(verdict(WHITE, { cp: 0 }, { cp: edge }));
    expect(inside.kind).toBe("close");
    expect(inside.grade?.band).toBe(C.Good);
    const past = say(verdict(WHITE, { cp: 0 }, { cp: edge - 1 }));
    expect(past).toMatchObject({ kind: "prefers", margin: "clear" });
    expect(past.grade?.band).toBe(C.Inaccuracy);
  });
});

describe("the words carry no figure, dash or semicolon", () => {
  /** The compare's own block lines, from a verified payload over the game. */
  function blockLines(): string[] {
    const verdict = verifyClientEvals(
      {
        index: 14,
        fen: WHITE,
        depth: 12,
        moves: [
          {
            role: "asked",
            uci: "d1c1",
            cp: 251,
            depth: 12,
            pv: ["d1c1", "a8b8"],
          },
          {
            role: "compared",
            uci: "b5d6",
            cp: -130,
            depth: 12,
            pv: ["b5d6", "e7d6"],
          },
        ],
      },
      { playedMoves: GAME },
      { compare: true }
    );
    if (!verdict.ok) throw new Error(verdict.reason);
    const anchor = anchorAtIndex(GAME, 14, "Qxc1")!;
    const block = buildAnchorBlock(anchor, GAME, undefined, "w", verdict.value);
    return block
      .split("\n")
      .filter((l) =>
        /^(?:The player compares|COMPARE SEARCH|The engine's verdict|Each compared line|Board AFTER .* instead)/.test(
          l
        )
      );
  }

  it("in every verdict, the clause, the reminder and the block's own lines", () => {
    const lines = blockLines();
    expect(lines).toHaveLength(6);
    const all = [
      ...said,
      followUpCompareClause(),
      followUpCompareReminder(null, FOLLOWUP_BUDGET),
      followUpCompareReminder(null, FOLLOWUP_LEAN_BUDGET),
      ...lines,
    ];
    expect(said.length).toBeGreaterThanOrEqual(30);
    for (const text of all) {
      expect(text, text).not.toMatch(/\u2014/);
      expect(text, text).not.toMatch(/;/);
      expect(text, text).not.toMatch(/[+-]\d|\d\.\d\d|%/);
    }
  });
});
