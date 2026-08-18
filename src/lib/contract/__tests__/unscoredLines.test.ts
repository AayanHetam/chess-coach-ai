import { describe, it, expect } from "vitest";
import { selectInsights } from "@/lib/contract/selectInsights";
import type { GameEvalInput } from "@/lib/contract/gameEvalSchema";

/**
 * A LINE WITH NO SCORE IS NOT A LINE SCORED 0.00.
 *
 * `flattenEval` read `line.cp ?? 0` on its no-mate branch, so a line carrying
 * neither a centipawn nor a mate score — no measurement at all — flattened to
 * a confident "dead equal". That 0 then became one operand of
 * `drop = cpBefore - cpAfter` and of the `drop > 50` gate, so an unscored ply
 * sitting next to a real +350 manufactures a 350cp swing on one side of it and
 * a 350cp "recovery" on the other. Both lists sort by dropCp, so the phantom
 * sorts toward rank 1, and serialize prints it as "Eval: 0.00 → …" with a
 * severity label derived from the same invented drop.
 *
 * gameEvalSchema deliberately never rejects a request (its module doc), and
 * both `cp` and `mate` are optional there, so the shape is admissible at the
 * boundary. C6 fixed the sibling half of this — a null MATE used to flatten to
 * -9999, a forced loss — by requiring `typeof === "number"`; the null-cp half
 * kept asserting 0.00. The convention everywhere else in the contract layer is
 * to say nothing when there is no number (EvalFact.cp is number|null and
 * serialize omits the Eval line entirely); selection now follows it: a ply
 * whose either side is unscored is skipped, exactly like the depth-0 sentinel.
 */
describe("unscored lines are skipped, not read as 0.00", () => {
  const moveHistory = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"];
  const scored = (cp: number) => ({ cp, depth: 16, multiPv: 1, pv: [] as string[] });
  // pv and a real depth, but neither cp nor mate: the admissible no-measurement shape.
  const unscored = () => ({ depth: 16, multiPv: 1, pv: [] as string[] });
  const mateLine = (mate: number) => ({ mate, depth: 16, multiPv: 1, pv: [] as string[] });

  const evalOf = (lines: Array<ReturnType<typeof scored | typeof unscored>>): GameEvalInput => ({
    positions: lines.map((l) => ({ bestMove: "e2e4", lines: [l] })),
  });

  it("CONTROL: the same shape WITH a real 0cp score does produce the candidate", () => {
    // positions[3] genuinely scored 0 next to +350 on both sides: Black's ply 3
    // (350 -> 0 across their move is a 350cp GAIN for them... read White-side:
    // White drops 350 across ply 2? No — assert the raw effect instead: some
    // candidate exists and cites a 350 drop. If this control ever fails, the
    // main assertion below would pass vacuously.
    const ge = evalOf([scored(20), scored(30), scored(350), scored(0), scored(350), scored(340), scored(345)]);
    const w = selectInsights(moveHistory, ge, "w");
    const b = selectInsights(moveHistory, ge, "b");
    const all = [...w.topMistakes, ...b.topMistakes];
    expect(all.some((m) => m.dropCp === 350)).toBe(true);
  });

  it("an unscored ply manufactures NO mistake candidates on either side", () => {
    // Identical, except the 0 was never measured. Before the fix this produced
    // the exact same 350cp candidates as the control above — a fabricated
    // collapse into the unscored ply and a fabricated recovery out of it.
    const ge = evalOf([scored(20), scored(30), scored(350), unscored(), scored(350), scored(340), scored(345)]);
    const w = selectInsights(moveHistory, ge, "w");
    const b = selectInsights(moveHistory, ge, "b");
    const all = [...w.topMistakes, ...b.topMistakes, ...w.intelligenceTop3, ...b.intelligenceTop3];
    expect(all.filter((m) => m.ply === 2 || m.ply === 3)).toEqual([]);
  });

  it("plies NOT touching the unscored position still card normally", () => {
    // The skip must be surgical: a real 300cp blunder later in the same game
    // survives. Guards that skip too much are the mirror failure.
    const ge = evalOf([scored(20), scored(30), scored(350), unscored(), scored(350), scored(50), scored(45)]);
    const w = selectInsights(moveHistory, ge, "w");
    expect(w.topMistakes.some((m) => m.ply === 4 && m.dropCp === 300)).toBe(true);
  });

  it("CONTROL: mate-only lines still flatten to ±9999 and card", () => {
    // The other flattenEval branch must be untouched: losing a won mate is the
    // biggest drop a game can contain.
    // position 2 (before White's ply 2) is mate-in-3 for White; position 3 is
    // -500. White-relative 9999 -> -500 across White's own move: drop 10499.
    const ge = evalOf([scored(20), scored(30), mateLine(3), scored(-500), scored(-510), scored(-505), scored(-500)]);
    const w = selectInsights(moveHistory, ge, "w");
    expect(w.topMistakes.some((m) => m.ply === 2 && m.dropCp > 9000)).toBe(true);
  });
});
