import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { Chess } from "chess.js";
import type { AnalysisContext } from "@/lib/analysisContextCache";
import { buildCompactGameContext } from "@/lib/coach/compactGameContext";
import { anchorAtIndex, resolveQuestionAnchor } from "../questionAnchor";
import {
  buildAnchorBlock,
  buildFollowUpCondensedContext,
  compareAltFens,
  whatIfLicensedLines,
  windowMoveTable,
} from "../followUpContext";
import { verifyClientEvals } from "../clientEvals";

// Fixture 07: 8. Nc7+ forks king and rook while Black's queen on c1 hangs to 8. Qxc1.
const MOVES = [
  "e4",
  "c5",
  "Nf3",
  "Nc6",
  "d4",
  "cxd4",
  "Nxd4",
  "Qb6",
  "Nf3",
  "Qxb2",
  "Na3",
  "Qxa1",
  "Nb5",
  "Qxc1",
  "Nc7+",
  "Kd8",
  "Nxa8",
  "Qxd1+",
  "Kxd1",
  "e5",
];

/** A gameEval with a real line at every position; move 8 carries the engine's Qxc1 line. */
function gameEval() {
  const positions = MOVES.map((_, i) => ({
    lines: [
      { cp: i < 14 ? 284 : -211, depth: 16, multiPv: 1, pv: [] as string[] },
    ],
    bestMove: "N/A",
    moveClassification: i === 15 ? "blunder" : "good",
  }));
  positions.push({
    lines: [{ cp: -540, depth: 16, multiPv: 1, pv: [] }],
    bestMove: "N/A",
    moveClassification: "good",
  });
  // Position before 8. Nc7+ (index 14): the engine wants d1c1 and runs Qxc1 Rb8 Qf4 f6.
  positions[14] = {
    lines: [
      { cp: 284, depth: 16, multiPv: 1, pv: ["d1c1", "a8b8", "c1f4", "f7f6"] },
    ],
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
  const anchor = resolveQuestionAnchor(
    "Why was 8. Nc7+ a mistake?",
    MOVES,
    "w"
  )!;
  const block = buildAnchorBlock(anchor, MOVES, gameEval() as never, "w");

  it("names the move, whose it was, and both evals in the table's own format", () => {
    expect(block).toContain(
      "## MOVE UNDER DISCUSSION — 8. Nc7+ (White, the player's move)"
    );
    expect(block).toContain("Eval before the move: +2.84. After it: -2.11.");
  });

  it("carries the engine's preferred move and its line, narrated ply by ply", () => {
    expect(block).toContain("Engine's preferred move here: Qxc1.");
    expect(block).toContain(
      "Engine line from before the move (the engine rates this line +2.84, White's perspective): 8. Qxc1 Rb8 9. Qf4 f6"
    );
    expect(block).toContain(
      "This line replaces 8. Nc7+: Nc7+ is not played in it."
    );
    expect(block).toContain(
      "A move from another key moment's line belongs to that move, not to this one."
    );
    expect(block).toContain("what the engine line does:");
    // The first ply of the story is the capture of the queen.
    expect(block).toMatch(/8\.Qxc1 — .*queen/);
  });

  it("carries what the game did next, told the same way", () => {
    expect(block).toContain(
      "What the game did next: 8. Nc7+ Kd8 9. Nxa8 Qxd1+ 10. Kxd1 e5"
    );
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

  it("says when the question is about an alternative, and shows its board", () => {
    const alt = resolveQuestionAnchor("why not 8. Qxc1?", MOVES, "w")!;
    const block = buildAnchorBlock(alt, MOVES, gameEval() as never, "w");
    expect(block).toContain(
      "The player asks about Qxc1 as an alternative at this point."
    );
    // The alternative's own board, so the answer is not written from the
    // board after the move that was played.
    expect(block).toContain(
      "Board AFTER 8. Qxc1 instead (the alternative asked about, Black to move):"
    );
    expect(block.split("Board AFTER 8. Qxc1 instead")[1]).toMatch(
      /White pieces: .*Qc1/
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
    expect(buildAnchorBlock(a, MOVES, gameEval() as never, "w")).toContain(
      "(Black, the opponent's move)"
    );
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
    expect(out).toContain(
      "Player: White · Skill: intermediate · 10 full moves"
    );
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
    expect(buildFollowUpCondensedContext(ctx(), null)).toContain(
      "first message in this conversation"
    );
  });
});

describe("buildAnchorBlock — a verified what-if's own search", () => {
  const anchor = resolveQuestionAnchor("why not 8. Qxc1?", MOVES, "w")!;
  const verdict = verifyClientEvals(
    {
      index: 14,
      fen: anchor.fenBefore,
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
    },
    { playedMoves: MOVES, gameEval: gameEval() as never }
  );
  if (!verdict.ok) throw new Error(`fixture did not verify: ${verdict.reason}`);
  const whatIf = verdict.value;
  const without = buildAnchorBlock(anchor, MOVES, gameEval() as never, "w");
  const withIt = buildAnchorBlock(
    anchor,
    MOVES,
    gameEval() as never,
    "w",
    whatIf
  );

  it("without one the block is byte for byte what it was", () => {
    expect(
      buildAnchorBlock(anchor, MOVES, gameEval() as never, "w", null)
    ).toBe(without);
    expect(
      buildAnchorBlock(anchor, MOVES, gameEval() as never, "w", undefined)
    ).toBe(without);
  });

  it("tells the search's moves with their numbers, labelled as a search of their own", () => {
    expect(withIt).toContain(
      "WHAT-IF SEARCH of the position before 8. Nc7+, at depth 12"
    );
    expect(withIt).toContain(
      "never with the evals above, which come from another search"
    );
    expect(withIt).toContain(
      "  8. Qxc1 (the alternative asked about): +2.51 (White's perspective), line 8. Qxc1 Rb8 9. Qf4 Nf6"
    );
    expect(withIt).toContain(
      "  8. Nc7+ (the move played): -0.97 (White's perspective), line 8. Nc7+ Kd8 9. Nxa8"
    );
    // The alternative's own line, told; and the review's block untouched.
    expect(withIt).toContain("    what this line does:");
    for (const line of without.split("\n")) expect(withIt).toContain(line);
  });

  it("never puts a figure at the end of a sentence, nor as 'the engine rates'", () => {
    const section = withIt
      .split("\n")
      .filter((l) => l.includes("(White's perspective), line"));
    expect(section).toHaveLength(2);
    for (const l of section) {
      expect(l).not.toMatch(/[+-]\d+\.\d\d\.(\s|$)/);
      expect(l).not.toMatch(/rates/);
    }
  });

  it("the game's own move asked about by name is labelled the move played, not an alternative", () => {
    const v = verifyClientEvals(
      {
        index: 14,
        fen: anchor.fenBefore,
        depth: 12,
        moves: [
          {
            role: "asked",
            uci: "b5c7",
            cp: -97,
            depth: 12,
            pv: ["b5c7", "e8d8", "c7a8"],
          },
        ],
      },
      { playedMoves: MOVES, gameEval: gameEval() as never }
    );
    if (!v.ok) throw new Error(v.reason);
    const onPlayed = anchorAtIndex(MOVES, 14, "Nc7+")!;
    expect(onPlayed.askedSan).toBeUndefined();
    const block = buildAnchorBlock(
      onPlayed,
      MOVES,
      gameEval() as never,
      "w",
      v.value
    );
    expect(block).toContain("  8. Nc7+ (the move played, asked about): -0.97");
    expect(block).not.toContain("alternative asked about");
  });

  it("with no review eval for the move, the block points at the search's numbers instead of forbidding any", () => {
    const block = buildAnchorBlock(anchor, MOVES, undefined, "w", whatIf);
    expect(block).not.toContain("do not quote an evaluation");
    expect(block).toContain("quote only the what-if search's numbers below");
    expect(buildAnchorBlock(anchor, MOVES, undefined, "w")).toContain(
      "do not quote an evaluation"
    );
  });

  it("licenses the search's lines from the position, replacing the game's move", () => {
    expect(whatIfLicensedLines(whatIf)).toEqual([
      {
        startFen: anchor.fenBefore,
        startPly: 14,
        sans: ["Qxc1", "Rb8", "Qf4", "Nf6"],
        replacing: true,
      },
      {
        startFen: anchor.fenBefore,
        startPly: 14,
        sans: ["Nc7+", "Kd8", "Nxa8"],
        replacing: true,
      },
    ]);
  });
});

describe("buildAnchorBlock: a verified compare (pathway 3.5)", () => {
  const fenBefore = anchorAtIndex(MOVES, 14)!.fenBefore;
  const verify = (moves: unknown[], compare = true) => {
    const v = verifyClientEvals(
      { index: 14, fen: fenBefore, depth: 12, moves },
      { playedMoves: MOVES, gameEval: gameEval() as never },
      compare ? { compare: true } : undefined
    );
    if (!v.ok) throw new Error(`fixture did not verify: ${v.reason}`);
    return v.value;
  };
  const QXC1 = {
    role: "asked",
    uci: "d1c1",
    cp: 251,
    depth: 12,
    pv: ["d1c1", "a8b8", "c1f4", "g8f6"],
  };
  const ND6 = {
    role: "compared",
    uci: "b5d6",
    cp: -130,
    depth: 12,
    pv: ["b5d6", "e7d6"],
  };
  // 8. Qxc1 or 8. Nd6+, neither the game's: the anchor carries the first.
  const both = verify([QXC1, ND6]);
  const anchor = anchorAtIndex(MOVES, 14, "Qxc1")!;
  const block = buildAnchorBlock(anchor, MOVES, gameEval() as never, "w", both);
  const lines = block.split("\n");

  it("says the player compares two moves, in the order named", () => {
    expect(block).toContain(
      "The player compares 8. Qxc1 and 8. Nd6+ at this point: two moves from the position before 8. Nc7+."
    );
    expect(block).not.toContain("as an alternative at this point");
  });

  it("tells the COMPARE SEARCH with its role words and both stories", () => {
    expect(block).toContain(
      "COMPARE SEARCH of the position before 8. Nc7+, at depth 12: one search on the player's device that scored the two moves the player compares side by side. Its numbers compare with each other only, never with the evals above, which come from another search."
    );
    expect(block).not.toContain("WHAT-IF SEARCH");
    const first = lines.indexOf(
      "  8. Qxc1 (the first move compared): +2.51 (White's perspective), line 8. Qxc1 Rb8 9. Qf4 Nf6"
    );
    const second = lines.indexOf(
      "  8. Nd6+ (the second move compared): -1.30 (White's perspective), line 8. Nd6+ exd6"
    );
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(lines[first + 1]).toBe("    what this line does:");
    expect(lines[second + 1]).toBe("    what this line does:");
    expect(lines.slice(second + 2).join("\n")).toMatch(/exd6/);
  });

  it("gives the engine's verdict in the app's words, then keeps each line to its move", () => {
    const verdict = lines.findIndex((l) =>
      l.startsWith("The engine's verdict on the two")
    );
    expect(lines[verdict]).toBe(
      "The engine's verdict on the two, in the app's words: \"Of the two, the engine prefers 8. Qxc1, by a wide margin.\" Say which move the engine prefers only in these words and never with a number: the app shows both numbers under the question."
    );
    expect(lines[verdict + 1]).toBe(
      "Each compared line belongs to its own move: a move from one of them is never a move of the other."
    );
  });

  it("shows one board per move that is not the game's", () => {
    const boards = lines.filter((l) => / instead \(/.test(l));
    expect(boards).toEqual([
      "Board AFTER 8. Qxc1 instead (the first move compared, Black to move):",
      "Board AFTER 8. Nd6+ instead (the second move compared, Black to move):",
    ]);
    expect(block).not.toContain("the alternative asked about");
  });

  it("names the game's own move as the move played, and gives it no board of its own", () => {
    const withPlayed = verify([
      QXC1,
      { ...ND6, uci: "b5c7", pv: ["b5c7", "e8d8"] },
    ]);
    const b = buildAnchorBlock(
      anchor,
      MOVES,
      gameEval() as never,
      "w",
      withPlayed
    );
    expect(b).toContain(
      "The player compares 8. Qxc1 and 8. Nc7+ (the move played) at this point"
    );
    expect(b).toContain(
      "  8. Nc7+ (the second move compared, the move played): -1.30"
    );
    expect(b.split("\n").filter((l) => / instead \(/.test(l))).toEqual([
      "Board AFTER 8. Qxc1 instead (the first move compared, Black to move):",
    ]);
    // The review's best beside them is named in the header.
    const withBest = verify([
      { ...QXC1, role: "asked", uci: "b5c7", pv: ["b5c7"] },
      ND6,
      { ...QXC1, role: "best" },
    ]);
    const onPlayed = anchorAtIndex(MOVES, 14, "Nd6+")!;
    const c = buildAnchorBlock(
      onPlayed,
      MOVES,
      gameEval() as never,
      "w",
      withBest
    );
    expect(c).toContain(
      "scored the two moves the player compares side by side, and the engine's best."
    );
    expect(c).toContain("  8. Qxc1 (the engine's best): +2.51");
    expect(c).toContain("  8. Nc7+ (the first move compared, the move played)");
  });

  it("with no review eval it forbids none and points at nothing", () => {
    const b = buildAnchorBlock(anchor, MOVES, undefined, "w", both);
    expect(b).toContain("The review has no evaluation for this move.\n");
    expect(b).not.toContain("quote only the what-if search's numbers");
    expect(b).not.toContain("do not quote an evaluation");
  });

  it("compareAltFens gives the boards after the moves that are not the game's", () => {
    const after = (san: string) => {
      const g = new Chess(fenBefore);
      g.move(san);
      return g.fen();
    };
    expect(compareAltFens(both, "Nc7+")).toEqual([
      after("Qxc1"),
      after("Nd6+"),
    ]);
    expect(compareAltFens(both, "Qxc1")).toEqual([after("Nd6+")]);
    // A plain what-if has no compared move, and the played move is no alternative.
    const plain = verify(
      [
        { ...ND6, role: "asked" },
        { ...QXC1, role: "best" },
      ],
      false
    );
    expect(compareAltFens(plain, "Nc7+")).toEqual([after("Nd6+")]);
  });

  it("a plain what-if's block is byte for byte what it was before the compare", () => {
    // Hashes of the same blocks generated at 1319bd2, before pathway 3.5a.
    const sha = (t: string) =>
      createHash("sha256").update(t).digest("hex").slice(0, 20);
    const plain = verify(
      [
        { ...ND6, role: "asked" },
        {
          role: "played",
          uci: "b5c7",
          cp: -97,
          depth: 12,
          pv: ["b5c7", "e8d8", "c7a8"],
        },
        { ...QXC1, role: "best", pv: ["d1c1", "a8b8"] },
      ],
      false
    );
    const nd6 = anchorAtIndex(MOVES, 14, "Nd6+")!;
    const onQxc1 = resolveQuestionAnchor("why not 8. Qxc1?", MOVES, "w")!;
    expect(sha(buildAnchorBlock(onQxc1, MOVES, undefined, "w", plain))).toBe(
      "fcc5cabc1f55c15a134a"
    );
    expect(
      sha(buildAnchorBlock(nd6, MOVES, gameEval() as never, "w", plain))
    ).toBe("73a8b891366f69fa8e7f");
    expect(
      sha(
        buildAnchorBlock(nd6, MOVES, gameEval() as never, "b", plain, {
          side: "b",
          confirmed: true,
        })
      )
    ).toBe("1e8a49b85388b7945624");
  });
});
