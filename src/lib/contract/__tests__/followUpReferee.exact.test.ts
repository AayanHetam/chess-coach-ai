import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { EVAL_RE, refereeFollowUp } from "../followUpReferee";
import type { CompactContract } from "../followUp";

/**
 * Two holes the replay gate's review found in the follow-up referee, both
 * older than the gate: a move was licensed by a case-blind key, so the
 * game's pawn capture bxc4 let an impossible Bxc4 through, and a figure
 * that ended a sentence was never read, so "-2.84." passed where "-2.84,"
 * was dropped.
 */

const CONTRACT: CompactContract = {
  contractId: "c-exact",
  contractVersion: "1.0",
  playerColor: "w",
  resultText: "Black won",
  finalMaterial: "level",
  accuracy: null,
  insights: [],
  forbiddenClaimClasses: [],
};

/** 1. e4 b5 2. Bc4 bxc4: Black's pawn takes on c4, no bishop of Black's can. */
const MOVES = ["e4", "b5", "Bc4", "bxc4"];
const final = (() => {
  const g = new Chess();
  for (const m of MOVES) g.move(m);
  return g.fen();
})();

const ref = (reply: string, licensedEvals: string[] = []) =>
  refereeFollowUp({
    reply,
    compact: CONTRACT,
    activeFen: final,
    moveHistory: MOVES,
    licensedEvals,
  });

describe("a move is licensed as written, case kept", () => {
  it("the game's bxc4 licenses 2... bxc4 and never 2... Bxc4", () => {
    expect(ref("After 2... bxc4 Black is fine.").dropped).toEqual([]);
    expect(ref("After 2... Bxc4 Black is fine.").dropped).toEqual([
      { sentence: "After 2... Bxc4 Black is fine.", reason: "san:Bxc4" },
    ]);
  });

  it("a bare move is the pool's only as written", () => {
    expect(ref("So bxc4 was natural.").dropped).toEqual([]);
    expect(ref("So Bxc4 was natural.").dropped.map((d) => d.reason)).toEqual([
      "san:Bxc4",
    ]);
  });
});

describe("a figure that ends a sentence is read", () => {
  it("is matched before a full stop, and a dotted number is not a figure", () => {
    const figs = (s: string) =>
      Array.from(s.matchAll(EVAL_RE)).map((m) => m[1]);
    expect(figs("White stands at -2.84.")).toEqual(["-2.84"]);
    expect(figs("It is -1.5.")).toEqual(["-1.5"]);
    expect(figs("Mate follows, M+3.")).toEqual(["M+3"]);
    expect(figs("White stands at +2.84, a big lead.")).toEqual(["+2.84"]);
    expect(figs("version +1.2.3 here")).toEqual([]);
  });

  it("an unlicensed figure at a sentence's end is dropped, a licensed one kept", () => {
    expect(
      ref("After 2... bxc4 White stands at -2.84.", ["+2.84"]).dropped.map(
        (d) => d.reason
      )
    ).toEqual(["eval:-2.84"]);
    expect(
      ref("After 2... bxc4 White stands at +2.84.", ["+2.84"]).dropped
    ).toEqual([]);
  });
});
