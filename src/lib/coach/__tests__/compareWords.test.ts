import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { compareMatchesWords, readCompare } from "../compareWords";
import { verifyClientEvals, type VerifiedWhatIf } from "../clientEvals";
import type { IntentContext } from "../questionIntent";

/**
 * The two moves a compare names, read with the live router's rules
 * (pathway 3.5), and the route's check that a verified compare payload is
 * about those two moves, in that order, at that ply.
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
const CTX: IntentContext = { anchor: null, moves: GAME, playerColor: "w" };

function compare(
  index: number,
  asked: { uci: string; pv: string[] },
  compared: { uci: string; pv: string[] }
): VerifiedWhatIf {
  const v = verifyClientEvals(
    {
      index,
      fen: fenAt(index),
      depth: 12,
      moves: [
        { role: "asked", cp: 40, depth: 12, ...asked },
        { role: "compared", cp: -20, depth: 12, ...compared },
      ],
    },
    { playedMoves: GAME },
    { compare: true }
  );
  if (!v.ok) throw new Error(v.reason);
  return v.value;
}

/** Before 8. Nc7+: 8. Qxc1 against 8. Nd6+. */
const AT_8 = compare(
  14,
  { uci: "d1c1", pv: ["d1c1", "a8b8"] },
  { uci: "b5d6", pv: ["b5d6", "e7d6"] }
);
/** The start: 1. Nf3 against 1. Nc3. */
const AT_1 = compare(
  0,
  { uci: "g1f3", pv: ["g1f3"] },
  { uci: "b1c3", pv: ["b1c3"] }
);

describe("readCompare", () => {
  it("reads the two moves only where the live rules read a compare", () => {
    expect(readCompare("Bxc4 or bxc4?", CTX)).toBeNull();
    expect(readCompare("Is Nf3 better than Nc3?", CTX)).toBeNull();
    expect(readCompare("could I play Nf3 or Nc3?", CTX)).toBeNull();
    expect(readCompare("compare Nf3 and Nc3", CTX)).toBeNull();
    expect(readCompare("", CTX)).toBeNull();
    const two = readCompare("Nf3 or Nc3 here?", CTX)!;
    expect(two.map((t) => t.san)).toEqual(["Nf3", "Nc3"]);
    expect(two.every((t) => t.numbered === undefined)).toBe(true);
  });

  it("captures each move's number and side, and where it is written", () => {
    const q = "which is better, 8. Qxc1 or 8... Kd8?";
    const [a, b] = readCompare(q, CTX)!;
    expect(a).toMatchObject({
      san: "Qxc1",
      numbered: { number: 8, color: "w" },
    });
    expect(b).toMatchObject({
      san: "Kd8",
      numbered: { number: 8, color: "b" },
    });
    expect(q.slice(a.start, a.end)).toBe("8. Qxc1");
    expect(q.slice(b.start, b.end)).toBe("8... Kd8");
    const [c, d] = readCompare("Qxc1, or 12.Nd6+?", CTX)!;
    expect(c.numbered).toBeUndefined();
    expect(d.numbered).toEqual({ number: 12, color: "w" });
    expect("Qxc1, or 12.Nd6+?".slice(d.start, d.end)).toBe("12.Nd6+");
  });
});

describe("compareMatchesWords", () => {
  it("holds for the two moves named in the payload's order, at its number", () => {
    expect(compareMatchesWords("8. Qxc1 or 8. Nd6+?", AT_8, CTX)).toBe(true);
    expect(compareMatchesWords("Qxc1 or Nd6+ here?", AT_8, CTX)).toBe(true);
    expect(compareMatchesWords("Qxc1 or 8. Nd6+?", AT_8, CTX)).toBe(true);
    // Played as written: chess.js reads "Nd6" as Nd6+.
    expect(compareMatchesWords("Qxc1 or Nd6?", AT_8, CTX)).toBe(true);
    expect(compareMatchesWords("Nf3 or Nc3?", AT_1, CTX)).toBe(true);
  });

  it("fails on the wrong order", () => {
    expect(compareMatchesWords("8. Nd6+ or 8. Qxc1?", AT_8, CTX)).toBe(false);
    expect(compareMatchesWords("Nc3 or Nf3?", AT_1, CTX)).toBe(false);
  });

  it("fails on a wrong number or side", () => {
    expect(compareMatchesWords("9. Qxc1 or 9. Nd6+?", AT_8, CTX)).toBe(false);
    expect(compareMatchesWords("8. Qxc1 or 9. Nd6+?", AT_8, CTX)).toBe(false);
    expect(compareMatchesWords("8... Qxc1 or 8... Nd6+?", AT_8, CTX)).toBe(
      false
    );
  });

  it("fails on another move, a lowercase piece and words that are no compare", () => {
    expect(compareMatchesWords("8. Qxc1 or 8. Nc7+?", AT_8, CTX)).toBe(false);
    expect(compareMatchesWords("nf3 or Nc3?", AT_1, CTX)).toBe(false);
    expect(compareMatchesWords("what about 8. Qxc1 instead?", AT_8, CTX)).toBe(
      false
    );
  });

  it("fails on a plain what-if, which has no second move", () => {
    const v = verifyClientEvals(
      {
        index: 14,
        fen: fenAt(14),
        depth: 12,
        moves: [
          {
            role: "asked",
            uci: "d1c1",
            cp: 40,
            depth: 12,
            pv: ["d1c1"],
          },
        ],
      },
      { playedMoves: GAME }
    );
    expect(v.ok).toBe(true);
    if (v.ok)
      expect(compareMatchesWords("Qxc1 or Nd6+?", v.value, CTX)).toBe(false);
  });
});
