import { describe, expect, it, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Chess } from "chess.js";
import type { AnalysisContext } from "@/lib/analysisContextCache";
import { refereeFollowUp } from "@/lib/contract/followUpReferee";
import { buildCoachContract } from "@/lib/contract/builder";
import {
  toCompactContract,
  type CompactContract,
} from "@/lib/contract/followUp";
import { selectCardInsights } from "@/lib/prompts/verbalizerPrompt";
import { buildCompactGameContext } from "@/lib/coach/compactGameContext";
import {
  buildSubjectMomentsBlock,
  whatIfLicensedLines,
} from "@/lib/coach/followUpContext";

/**
 * PR 2.5: a key-moments line (a turn about the other side) is walked from
 * its own root, numbered or not, and the pawn pushes written between its
 * moves without a number are its moves too, so the side to move never
 * drifts. A what-if's lines are read exactly as before.
 */

const REAL = path.join(
  process.cwd(),
  "src/lib/contract/__tests__/fixtures-real"
);
const load = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(REAL, `${name}.json`), "utf8"));
const finalFen = (moves: string[]) => {
  const g = new Chess();
  for (const m of moves) g.move(m);
  return g.fen();
};

async function setup(name: string, player: "w" | "b", side: "w" | "b") {
  const fx = load(name);
  const contract = await buildCoachContract({
    moveHistory: fx.moveHistory,
    gameEval: fx.gameEval,
    playerColor: player,
    username: fx.username,
    userRating: fx.userRating,
    gameHeaders: fx.gameHeaders,
    identity: { fen: finalFen(fx.moveHistory), playerColor: player },
  });
  const compact = toCompactContract(
    contract,
    selectCardInsights(contract).map((i) => i.factIdPrefix)
  );
  const ctx = {
    playedMoves: fx.moveHistory,
    gameEval: fx.gameEval,
    playerColor: player,
    compactGameContext: buildCompactGameContext(
      fx.moveHistory,
      fx.gameEval,
      player
    ),
  } as unknown as AnalysisContext;
  const block = buildSubjectMomentsBlock(ctx, side, true)!;
  const referee = (reply: string) =>
    refereeFollowUp({
      reply,
      compact: compact as CompactContract,
      activeFen: finalFen(fx.moveHistory),
      moveHistory: fx.moveHistory,
      licensedEvals: [],
      extraFens: block.fens,
      extraLicensedText: block.licenceText,
      activePly: fx.moveHistory.length,
      extraLines: block.lines,
    });
  return { fx, block, referee };
}

describe("a key-moments line in the referee", () => {
  let f10: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    f10 = await setup("10_queenless_endgame", "w", "b");
  });

  it("the fixture's line has a pawn push its renderer writes without a number", () => {
    expect(f10.block.lines[0]).toMatchObject({
      startPly: 27,
      sans: ["Nf6", "Ne4", "g4", "f3"],
      subject: true,
    });
    expect(f10.block.text).toContain("14... Nf6 15. Ne4 g4 16. f3");
  });

  it("the line as the block prints it is kept, numbered or not", () => {
    for (const reply of [
      "Instead of 14... Ne5, 14... Nf6 15. Ne4 g4 16. f3 was the line.",
      "14... Nf6 15. Ne4 g4 16. f3 was the line.",
      "Nf6 Ne4 g4 f3 was the line.",
    ]) {
      const r = f10.referee(reply);
      expect(r.dropped, reply).toEqual([]);
    }
  });

  it("an unnumbered pawn push is a move: the side to move never drifts", () => {
    // After 14... Nf6 15. Ne4 g4 it is White to move: no Nxe4 for Black.
    for (const reply of [
      "Instead of 14... Ne5, 14... Nf6 15. Ne4 g4 Nxe4 wins the knight.",
      "14... Nf6 15. Ne4 g4 Nxe4 wins the knight.",
    ]) {
      const r = f10.referee(reply);
      expect(
        r.dropped.map((d) => d.reason),
        reply
      ).toEqual(["san:Nxe4"]);
    }
  });

  it("a pawn push that is no move on the running board drops the sentence", () => {
    // A legal deviation along the line is still legal chess; a push no
    // Black pawn can make there is not.
    const r = f10.referee("14... Nf6 15. Ne4 c1 16. f3 was the line.");
    // The reason is the plain reading's; neither reading keeps it.
    expect(r.dropped).toHaveLength(1);
    expect(r.text).not.toContain("16. f3");
  });
});

describe("a what-if's lines are read as before", () => {
  it("a numbered alternative does not open a what-if root, and a legal reply it never had is dropped", () => {
    // Fixture 07 at move 8: the what-if scores 8. Qxc1. "9. Qg5" is in no
    // line, and 8... Kd8 puts the sentence on the game's board.
    const fx = load("07_knight_fork");
    const fenBefore = (() => {
      const g = new Chess();
      for (const m of fx.moveHistory.slice(0, 14)) g.move(m);
      return g.fen();
    })();
    const lines = whatIfLicensedLines({
      index: 14,
      fenBefore,
      depth: 12,
      moves: [
        {
          role: "asked",
          san: "Qxc1",
          uci: "d1c1",
          cp: 251,
          depth: 12,
          lineSan: ["Qxc1", "Rb8"],
        },
        {
          role: "played",
          san: "Nc7+",
          uci: "b5c7",
          cp: -97,
          depth: 12,
          lineSan: ["Nc7+", "Kd8"],
        },
      ],
    } as never);
    expect(lines.every((l) => !("subject" in l))).toBe(true);
    const compact = {
      contractId: "x",
      playerColor: "w",
      insights: [],
    } as unknown as CompactContract;
    const r = refereeFollowUp({
      reply:
        "After 8. Qxc1, 8... Kd8 9. Qg5 keeps White a piece up. Lesson: take what is hanging.",
      compact,
      activeFen: finalFen(fx.moveHistory.slice(0, 15)),
      moveHistory: fx.moveHistory,
      licensedEvals: [],
      activePly: 15,
      extraLines: lines,
    });
    expect(r.text).toBe("Lesson: take what is hanging.");
  });
});
