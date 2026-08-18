import { describe, it, expect } from "vitest";
import { selectInsights } from "@/lib/contract/selectInsights";
import type { GameEvalInput } from "@/lib/contract/gameEvalSchema";

/**
 * A REVIEW OF YOUR GAME IS ABOUT YOUR MOVES.
 *
 * Aayan, watching real reviews: "the model goes to the opponent's mistakes when
 * it cannot find significant mistakes in your own gameplay."
 *
 * That was structural. `selectInsights` runs two scans — TOP MISTAKES, which
 * filters to the user's colour, and CHESS INTELLIGENCE, which did not. The
 * builder cards the UNION, so the opponent's biggest blunders were promoted
 * into the prompt; and because the intelligence scan ranks purely by eval drop
 * across both sides, the cleaner the student played, the more completely the
 * opponent took over the list.
 *
 * Measured on Aayan's own twelve games, ordered by how well he played:
 *
 *   game_05   his worst move cost   61cp   -> opponent took 3 of 3 slots
 *   game_03   his worst move cost  114cp   -> opponent took 3 of 3 slots
 *   game_09   his worst move cost  115cp   -> opponent took 3 of 3 slots
 *   game_07   his worst move cost  197cp   -> opponent took 0
 *
 * 21 of 111 carded plies were the opponent's, across 10 of the 12 games.
 *
 * It reached the student, too: `renderIntelligenceBlock` prints the concepts
 * under "teach by name — this is the principle the student missed", so an
 * opponent's blunder was handed to the model as the student's own lesson,
 * directly beneath a MISTAKES section reading "No significant mistakes
 * detected".
 */
describe("a review only ever discusses the student's own moves", () => {
  const moveHistory = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "d5"];
  const line = (cp: number) => ({ cp, depth: 16, multiPv: 1, pv: [] as string[] });

  /**
   * White (the student) plays cleanly; Black hands over material twice.
   * Every drop below is comfortably over the 50cp bar, so nothing here is
   * excluded for being too small.
   */
  function evalWhereOnlyBlackErrs(): GameEvalInput {
    // White-relative, one entry per position (positions[i] is the eval BEFORE
    // ply i). Black moves on ODD plies and loses ground when the eval RISES
    // across its move, so the two jumps below sit at plies 1 and 3. White's
    // own swings are all 10cp, far under the 50cp bar.
    const cps = [20, 30, 560, 550, 1100, 1090, 1080, 1070, 1060];
    return {
      positions: cps.map((cp) => ({ bestMove: "e2e4", lines: [line(cp)] })),
    };
  }

  it("CONTROL: those opponent errors really are the biggest drops in the game", () => {
    // Without this, the assertions below could pass simply because the fixture
    // produces nothing at all — which is how three earlier tests in this repo
    // passed for the wrong reason.
    const asBlack = selectInsights(moveHistory, evalWhereOnlyBlackErrs(), "b");
    expect(asBlack.topMistakes.length).toBeGreaterThan(0);
    expect(asBlack.topMistakes.every((m) => m.colorName === "Black")).toBe(true);
    expect(Math.max(...asBlack.topMistakes.map((m) => m.dropCp))).toBeGreaterThan(400);
  });

  it("gives White nothing when only Black erred, instead of reaching across", () => {
    const { topMistakes, intelligenceTop3 } = selectInsights(
      moveHistory,
      evalWhereOnlyBlackErrs(),
      "w",
    );
    expect(topMistakes).toHaveLength(0);
    // The regression: this used to return Black's two blunders, and the builder
    // cards the union of the two lists.
    expect(intelligenceTop3).toHaveLength(0);
  });

  it("never lets the opponent's colour into the intelligence list, either side", () => {
    for (const [colour, name] of [["w", "White"], ["b", "Black"]] as const) {
      const { intelligenceTop3 } = selectInsights(moveHistory, evalWhereOnlyBlackErrs(), colour);
      expect(intelligenceTop3.every((i) => i.colorName === name)).toBe(true);
    }
  });

  it("makes the intelligence list a SUBSET of top mistakes — so `I` ids cannot occur", () => {
    // Both scans now draw from the same colour-filtered candidate pool and sort
    // it the same way, so the top 3 are always inside the top 10. That makes
    // `factIdPrefix`'s `I${intelRank}` branch in builder.ts unreachable, and an
    // insight with a null topMistakeRank impossible.
    //
    // Stated as a test rather than left implicit: every `I`-prefixed insight in
    // both fixture directories was an OPPONENT move, and ~40 referee tests were
    // anchored to them.
    const positions = [
      { bestMove: "e2e4", lines: [line(900)] },
      { bestMove: "e2e4", lines: [line(300)] }, // ply 0 White: -600
      { bestMove: "e2e4", lines: [line(290)] },
      { bestMove: "e2e4", lines: [line(280)] },
      { bestMove: "e2e4", lines: [line(100)] }, // ply 4 White: -180
      { bestMove: "e2e4", lines: [line(90)] },
      { bestMove: "e2e4", lines: [line(-200)] }, // ply 6 White: -290
      { bestMove: "e2e4", lines: [line(-210)] },
      { bestMove: "e2e4", lines: [line(-400)] }, // ply 8 White: -190
    ];
    const moves = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "d5", "exd5"];
    const { topMistakes, intelligenceTop3 } = selectInsights(moves, { positions }, "w");
    expect(intelligenceTop3.length).toBeGreaterThan(0);
    const topPlies = new Set(topMistakes.map((m) => m.ply));
    expect(intelligenceTop3.every((i) => topPlies.has(i.ply))).toBe(true);
  });

  it("still surfaces the student's own mistakes when they made some", () => {
    // White throws away a winning position at ply 0; Black then errs far more
    // severely. The student's move must still be selected, and the opponent's
    // larger blunder must not displace it.
    const positions = [
      { bestMove: "e2e4", lines: [line(600)] },
      { bestMove: "e2e4", lines: [line(-40)] }, // ply 0 (White): drops 640
      { bestMove: "e2e4", lines: [line(-50)] },
      { bestMove: "e2e4", lines: [line(-60)] },
      { bestMove: "e2e4", lines: [line(1900)] }, // ply 3 (Black): drops 1960
    ];
    const { topMistakes, intelligenceTop3 } = selectInsights(moveHistory, { positions }, "w");
    expect(topMistakes.map((m) => m.ply)).toContain(0);
    expect(intelligenceTop3.map((i) => i.ply)).toContain(0);
    expect(intelligenceTop3.every((i) => i.colorName === "White")).toBe(true);
    // Black's bigger blunder is the largest drop in the game and still excluded.
    expect(intelligenceTop3.map((i) => i.ply)).not.toContain(3);
  });
});
