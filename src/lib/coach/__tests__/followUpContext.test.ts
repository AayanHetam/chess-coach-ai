import { describe, expect, it } from "vitest";
import type { AnalysisContext } from "@/lib/analysisContextCache";
import { buildCompactGameContext } from "@/lib/coach/compactGameContext";
import { resolveQuestionAnchor } from "../questionAnchor";
import {
  buildAnchorBlock,
  buildFollowUpCondensedContext,
  windowMoveTable,
} from "../followUpContext";

// Fixture 07: 8. Nc7+ forks king and rook while Black's queen on c1 hangs to 8. Qxc1.
const MOVES = [
  "e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4", "Qb6",
  "Nf3", "Qxb2", "Na3", "Qxa1", "Nb5", "Qxc1", "Nc7+", "Kd8",
  "Nxa8", "Qxd1+", "Kxd1", "e5",
];

/** A gameEval with a real line at every position; move 8 carries the engine's Qxc1 line. */
function gameEval() {
  const positions = MOVES.map((_, i) => ({
    lines: [{ cp: i < 14 ? 284 : -211, depth: 16, multiPv: 1, pv: [] as string[] }],
    bestMove: "N/A",
    moveClassification: i === 15 ? "blunder" : "good",
  }));
  positions.push({ lines: [{ cp: -540, depth: 16, multiPv: 1, pv: [] }], bestMove: "N/A", moveClassification: "good" });
  // Position before 8. Nc7+ (index 14): the engine wants d1c1 and runs Qxc1 Rb8 Qf4 f6.
  positions[14] = {
    lines: [{ cp: 284, depth: 16, multiPv: 1, pv: ["d1c1", "a8b8", "c1f4", "f7f6"] }],
    bestMove: "d1c1",
    moveClassification: "good",
  };
  return { positions } as unknown as NonNullable<AnalysisContext["gameEval"]>;
}

function ctx(over: Partial<AnalysisContext> = {}): AnalysisContext {
  const ge = gameEval();
  return {
    contextId: "c07",
    gameContext: "",
    compactGameContext: buildCompactGameContext(MOVES, ge as never, "w"),
    playedMoves: MOVES,
    systemPrompt: "",
    fewShotExamples: "",
    initialAnalysis: "the review",
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    playerColor: "w",
    skillLevel: "intermediate",
    moveCount: 10,
    createdAt: Date.now(),
    gameEval: ge,
    ...over,
  } as AnalysisContext;
}

describe("buildAnchorBlock — the move the question names", () => {
  const anchor = resolveQuestionAnchor("Why was 8. Nc7+ a mistake?", MOVES, "w")!;
  const block = buildAnchorBlock(anchor, MOVES, gameEval() as never, "w");

  it("names the move, whose it was, and both evals in the table's own format", () => {
    expect(block).toContain("## MOVE UNDER DISCUSSION — 8. Nc7+ (White, the player's move)");
    expect(block).toContain("Eval before the move: +2.84. After it: -2.11.");
  });

  it("carries the engine's preferred move and its line, narrated ply by ply", () => {
    expect(block).toContain("Engine's preferred move here: Qxc1.");
    expect(block).toContain("Engine line from before the move: 8. Qxc1 Rb8 9. Qf4 f6");
    expect(block).toContain("what the engine line does:");
    // The first ply of the story is the capture of the queen.
    expect(block).toMatch(/8\.Qxc1 — .*queen/);
  });

  it("carries what the game did next, told the same way", () => {
    expect(block).toContain("What the game did next: 8. Nc7+ Kd8 9. Nxa8 Qxd1+ 10. Kxd1 e5");
    expect(block).toContain("what these moves do:");
    expect(block).toMatch(/8\.Nc7\+ — .*check/);
  });

  it("lists both boards with the side to move, and the relational read before the move", () => {
    expect(block).toContain("Board BEFORE 8. Nc7+ (White to move):");
    expect(block).toContain("Board AFTER 8. Nc7+ (Black to move):");
    // Black's queen stands on c1 before the move and White's knight on b5.
    expect(block).toMatch(/Black pieces: .*Qc1/);
    expect(block).toMatch(/White pieces: .*Nb5/);
    // After the move the knight is on c7.
    expect(block.split("Board AFTER")[1]).toMatch(/White pieces: .*Nc7/);
  });

  it("says when the question is about an alternative", () => {
    const alt = resolveQuestionAnchor("why not 8. Qxc1?", MOVES, "w")!;
    expect(buildAnchorBlock(alt, MOVES, gameEval() as never, "w")).toContain(
      "The player asks about Qxc1 as an alternative at this point.",
    );
  });

  it("refuses to quote an eval it does not have", () => {
    const ge = gameEval();
    (ge.positions as unknown[])[14] = { lines: [{ cp: 0, depth: 0 }] };
    (ge.positions as unknown[])[15] = { lines: [{ cp: 0, depth: 0 }] };
    const block = buildAnchorBlock(anchor, MOVES, ge as never, "w");
    expect(block).toContain("Engine data for this move is unavailable");
    expect(block).not.toContain("+0.00");
  });

  it("marks the opponent's move as theirs", () => {
    const a = resolveQuestionAnchor("what about 7... Qxc1?", MOVES, "w")!;
    expect(buildAnchorBlock(a, MOVES, gameEval() as never, "w")).toContain("(Black, the opponent's move)");
  });
});

describe("windowMoveTable — the table cut to the question", () => {
  const compact = ctx().compactGameContext;

  it("keeps the plies around the centre and every flagged move, and counts the rest", () => {
    const table = windowMoveTable(compact, 3)!;
    expect(table).toContain("## MOVE TABLE");
    expect(table).toContain("Move 1 (White): e4");
    expect(table).toContain("Move 5 (White): Nf3");
    expect(table).not.toContain("Move 7 (White): Nb5");
    // 8. Nc7+ dropped the eval from +2.84 to -2.11: flagged, so kept out of window.
    expect(table).toMatch(/Move 8 \(White\): Nc7\+ — BLUNDER/);
    expect(table).toMatch(/\(\d+ routine moves not listed/);
  });

  it("centres on the end of the game when nothing is under discussion", () => {
    const table = windowMoveTable(compact, null)!;
    expect(table).toContain("Move 10 (Black): e5");
    expect(table).not.toContain("Move 1 (White): e4");
  });

  it("returns null without a table", () => {
    expect(windowMoveTable("", 3)).toBeNull();
  });
});

describe("buildFollowUpCondensedContext", () => {
  it("is the overview, the PGN, the windowed table and the worst moves — no final-position piece map", () => {
    const out = buildFollowUpCondensedContext(ctx(), 15);
    expect(out).toContain("## THIS GAME");
    expect(out).toContain("Player: White · Skill: intermediate · 10 full moves");
    expect(out).toContain("## MOVES PLAYED (PGN)");
    expect(out).toContain("## MOVE TABLE");
    expect(out).toContain("## TOP MISTAKES");
    expect(out).not.toContain("## FINAL POSITION");
    expect(out).not.toContain("## MOVE-BY-MOVE NARRATIVE");
  });

  it("is a fraction of the full compact context on a long game", () => {
    const long = ctx();
    const out = buildFollowUpCondensedContext(long, 15);
    expect(out.length).toBeLessThan(long.compactGameContext.length);
  });

  it("points at the review without replaying it", () => {
    expect(buildFollowUpCondensedContext(ctx(), null)).toContain("first message in this conversation");
  });
});
