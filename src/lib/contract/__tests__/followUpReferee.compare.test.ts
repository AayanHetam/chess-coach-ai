import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { refereeFollowUp } from "../followUpReferee";
import type { CompactContract } from "../followUp";
import { verifyClientEvals } from "@/lib/coach/clientEvals";
import {
  compareAltFens,
  whatIfLicensedEvals,
  whatIfLicensedLines,
} from "@/lib/coach/followUpContext";

/**
 * A compare turn (pathway 3.5): 8. Qxc1 or 8. Nd6+, where the game played
 * 8. Nc7+. The referee is given what the chat route gives it: both moves'
 * lines from their roots, each move's number tied to it, the boards after
 * both, and the two moves as `compared`. A figure tied to either move is
 * licensed only in a sentence that names one of them, so a sentence that
 * names both cannot swap their numbers.
 */

const MOVES =
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8".split(
    " "
  );
const fenAfter = (n: number) => {
  const g = new Chess();
  for (const m of MOVES.slice(0, n)) g.move(m);
  return g.fen();
};

const CONTRACT: CompactContract = {
  contractId: "c-compare",
  contractVersion: "1.0",
  playerColor: "w",
  resultText: "Black won",
  finalMaterial: "level",
  accuracy: null,
  insights: [],
  forbiddenClaimClasses: [],
};

const verdict = verifyClientEvals(
  {
    index: 14,
    fen: fenAfter(14),
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
  { playedMoves: MOVES },
  { compare: true }
);
if (!verdict.ok) throw new Error(verdict.reason);
const COMPARE = verdict.value;

/** What the route gives the referee on this turn, `compared` aside. */
const base = {
  compact: CONTRACT,
  activeFen: fenAfter(15),
  activePly: 15,
  moveHistory: MOVES,
  extraFens: [fenAfter(14), fenAfter(15), ...compareAltFens(COMPARE, "Nc7+")],
  extraLines: whatIfLicensedLines(COMPARE),
  licensedEvalsByMove: whatIfLicensedEvals(COMPARE),
};
const withCompared = { ...base, compared: ["Qxc1", "Nd6+"] as const };
const reasons = (
  reply: string,
  input: typeof base & { licensedEvals?: string[] } = withCompared
) => refereeFollowUp({ ...input, reply }).dropped.map((d) => d.reason);

describe("refereeFollowUp: a compare's two numbers", () => {
  it("licenses each number in a sentence that names its own move", () => {
    expect(reasons("8. Qxc1 keeps White at +2.51 here.")).toEqual([]);
    expect(reasons("8. Nd6+ leaves White at -1.30 here.")).toEqual([]);
    expect(reasons("Nd6+ exd6 leaves White at -1.30 for nothing.")).toEqual([]);
  });

  it("drops a number pinned on the other move, as before", () => {
    expect(reasons("8. Qxc1 leaves White at -1.30 here.")).toEqual([
      "eval:-1.30",
    ]);
    expect(reasons("8. Qxc1 leaves White at -1.30 here.", base)).toEqual([
      "eval:-1.30",
    ]);
  });

  it("decides a compared move's number by its tie even when the review's text holds it", () => {
    // -1.30 is Nd6+'s, and also in the licence text: it is still never
    // pinned on 8. Qxc1.
    const withPool = { ...withCompared, licensedEvals: ["-1.30", "+2.51"] };
    expect(reasons("8. Qxc1 leaves White at -1.30 here.", withPool)).toEqual([
      "eval:-1.30",
    ]);
    expect(reasons("8. Nd6+ leaves White at -1.30 here.", withPool)).toEqual(
      []
    );
    // A figure at a sentence's end is read too.
    expect(reasons("8. Qxc1 leaves White at -1.30.")).toEqual(["eval:-1.30"]);
  });

  it("drops figures in a sentence naming both moves, swapped or not", () => {
    const swapped =
      "8. Qxc1 sits at -1.30 while 8. Nd6+ sits at +2.51 in this search.";
    // Without `compared` each figure finds a move it is tied to.
    expect(reasons(swapped, base)).toEqual([]);
    expect(reasons(swapped)).toEqual(["eval:-1.30"]);
    expect(
      reasons(
        "8. Qxc1 sits at +2.51 while 8. Nd6+ sits at -1.30 in this search."
      )
    ).toEqual(["eval:+2.51"]);
  });

  it("keeps the engine's verdict in the app's words, which carry no figure", () => {
    for (const reply of [
      "Of the two, the engine prefers 8. Qxc1, by a wide margin.",
      "The engine rates 8. Qxc1 and 8. Nd6+ too close to call.",
      "The engine finds a forced mate after either move, sooner after 8. Nd6+.",
    ])
      expect(reasons(reply), reply).toEqual([]);
  });
});

describe("refereeFollowUp: a compare's two lines", () => {
  it("reads each line from its own root and lends neither's moves to the other", () => {
    expect(reasons("8. Nd6+ exd6 just loses the knight.")).toEqual([]);
    expect(reasons("8. Qxc1 Rb8 keeps a whole queen extra.")).toEqual([]);
    expect(reasons("8. Qxc1 exd6 wins.")).toEqual(["san:exd6"]);
    expect(reasons("8. Nd6+ Rb8 is the same.").length).toBe(1);
  });

  it("keeps both moves set side by side in one sentence", () => {
    expect(
      reasons(
        "8. Qxc1 Rb8 keeps the queen, while 8. Nd6+ exd6 gives a knight away."
      )
    ).toEqual([]);
  });

  it("changes nothing for a sentence with no figure", () => {
    for (const reply of [
      "8. Nd6+ exd6 just loses the knight.",
      "8. Qxc1 exd6 wins.",
      "Of the two, the engine prefers 8. Qxc1, by a wide margin.",
      "8. Nc7+ forks the king and the rook.",
    ])
      expect(refereeFollowUp({ ...withCompared, reply })).toEqual(
        refereeFollowUp({ ...base, reply })
      );
  });
});
