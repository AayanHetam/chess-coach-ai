import { describe, expect, it } from "vitest";
import type { AnalysisContext } from "@/lib/analysisContextCache";
import {
  buildCompactGameContext,
  sideMoments,
  sideMomentsSection,
} from "@/lib/coach/compactGameContext";
import { anchorAtIndex } from "../questionAnchor";
import {
  buildAnchorBlock,
  buildFollowUpCondensedContext,
  buildSubjectMomentsBlock,
} from "../followUpContext";

/**
 * PR 2.5: the other side's costliest moves, read at serve time for a turn
 * about that side. Fixture 07's opening: Black's 7... Qxc1 throws away a
 * winning position (the engine wanted 7... Kd8), White's 8. Nc7+ throws it
 * back.
 */
const MOVES =
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8".split(
    " "
  );

type Line = {
  cp?: number | null;
  mate?: number | null;
  depth: number;
  multiPv: number;
  pv: string[];
};
type Pos = { lines: Line[]; bestMove?: string };

function gameEval(edit: (p: Pos[]) => void = () => {}) {
  const positions: Pos[] = Array.from({ length: MOVES.length + 1 }, () => ({
    lines: [{ cp: 0, depth: 16, multiPv: 1, pv: [] }],
  }));
  positions[13] = {
    lines: [
      {
        cp: -263,
        depth: 16,
        multiPv: 1,
        pv: ["e8d8", "f1e2", "a1a2", "e1g1"],
      },
    ],
    bestMove: "e8d8",
  };
  positions[14] = {
    lines: [{ cp: 284, depth: 16, multiPv: 1, pv: ["d1c1", "a8b8"] }],
    bestMove: "d1c1",
  };
  positions[15] = { lines: [{ cp: -211, depth: 16, multiPv: 1, pv: [] }] };
  edit(positions);
  return { positions, accuracy: { white: 71.25, black: 64.5 } };
}

function context(overrides: Partial<AnalysisContext> = {}): AnalysisContext {
  const ge = gameEval();
  return {
    contextId: "c",
    gameContext: "",
    compactGameContext: buildCompactGameContext(MOVES, ge as never, "w"),
    playedMoves: MOVES,
    systemPrompt: "s",
    fewShotExamples: "",
    fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
    skillLevel: "intermediate",
    playerColor: "w",
    moveCount: 8,
    createdAt: 0,
    initialAnalysis: "Review.",
    gameEval: ge as never,
    ...overrides,
  } as AnalysisContext;
}

describe("sideMoments", () => {
  it("reads one side's costliest moves with the stored guards", () => {
    const black = sideMoments(MOVES, gameEval() as never, "b");
    expect(black.played).toBe(8);
    expect(black.scored).toBe(8);
    expect(black.moments.map((m) => [m.index, m.moveSan, m.drop])).toEqual([
      [13, "Qxc1", 547],
      [15, "Kd8", 211],
    ]);
    expect(black.moments[0].bestSan).toBe("Kd8");
    const white = sideMoments(MOVES, gameEval() as never, "w");
    // 7. Nb5 let Black's queen take on c1 (0.00 to -2.63).
    expect(white.moments.map((m) => m.moveSan)).toEqual(["Nc7+", "Nb5"]);
  });

  it("a line with no score is no reading, where the stored list reads 0", () => {
    const ev = gameEval((p) => {
      p[13].lines[0].cp = null;
    });
    const black = sideMoments(MOVES, ev as never, "b");
    expect(black.moments.map((m) => m.moveSan)).toEqual(["Kd8"]);
    expect(black.scored).toBe(7);
    // The stored player's path is unchanged: still `cp ?? 0`.
    expect(buildCompactGameContext(MOVES, ev as never, "b")).toContain(
      "- Move 7 (Black): Qxc1 [MISTAKE] — eval +0.00 → +2.84 (lost 2.8 pawns)"
    );
  });

  it("timeout sentinels and depth mismatches are not scored", () => {
    const ev = gameEval((p) => {
      p[14].lines[0].depth = 0;
      p[16].lines[0].depth = 12;
    });
    const black = sideMoments(
      MOVES,
      { ...ev, settings: { depth: 16 } } as never,
      "b"
    );
    expect(black.moments).toEqual([]);
    expect(black.scored).toBe(6);
  });

  it("a move made with the game already decided is left out, and mates keep their distance", () => {
    const ev = gameEval((p) => {
      // Black at -9 (winning) takes a mate in three for White: from winning
      // to lost, ranked first.
      p[11].lines[0] = { cp: -900, depth: 16, multiPv: 1, pv: [] };
      p[12].lines[0] = { mate: 3, depth: 16, multiPv: 1, pv: [] };
      // White already lost (mated in 2) plays on to mate in 1: decided.
      p[2].lines[0] = { mate: -2, depth: 16, multiPv: 1, pv: [] };
      p[3].lines[0] = { mate: -1, depth: 16, multiPv: 1, pv: [] };
    });
    const black = sideMoments(MOVES, ev as never, "b");
    expect(black.moments[0].moveSan).toBe("Qxa1");
    expect(
      sideMomentsSection(black, "BLACK'S COSTLIEST MOVES")!.split("\n")[1]
    ).toBe(
      "- Move 6 (Black): Qxa1 [BLUNDER] — eval -9.00 → M+3 (lost 109.0 pawns)"
    );
    const white = sideMoments(MOVES, ev as never, "w");
    expect(white.moments.map((m) => m.moveSan)).not.toContain("Nf3");
  });

  it("stops at the first move it could not replay: none for a game set up from a position", () => {
    const fromPosition = ["Kd2", "Kd7", "Ke3"];
    expect(sideMoments(fromPosition, gameEval() as never, "w")).toEqual({
      moments: [],
      scored: 0,
      played: 0,
    });
    const broken = [...MOVES.slice(0, 12), "Qxz9", ...MOVES.slice(13)];
    const read = sideMoments(broken, gameEval() as never, "b");
    expect(read.played).toBe(6);
    expect(read.moments).toEqual([]);
  });
});

describe("buildFollowUpCondensedContext with a subject", () => {
  it("lists the other side's costliest moves in place of the player's, with its accuracy", () => {
    const text = buildFollowUpCondensedContext(context(), 16, {
      side: "b",
      confirmed: true,
    });
    expect(text).toContain(
      "## BLACK'S COSTLIEST MOVES (the player's opponent, by the engine's winning chances, worst first, max 12)\n- Move 7 (Black): Qxc1 [BLUNDER] — eval -2.63 → +2.84 (lost 5.5 pawns); Stockfish preferred Kd8\n- Move 8 (Black): Kd8 [MISTAKE]"
    );
    expect(text).not.toContain("## TOP MISTAKES");
    expect(text).toContain("Your accuracy this game: 71.3%");
    expect(text).toContain(
      "Black's accuracy this game (the player's opponent): 64.5%"
    );
    expect(text).toContain("Player: White · Skill");
  });

  it("unconfirmed: the player's colour is a guess and its accuracy is left out", () => {
    const text = buildFollowUpCondensedContext(context(), 16, {
      side: "b",
      confirmed: false,
    });
    expect(text).toContain("Player: White (a guess, not confirmed) · Skill");
    expect(text).not.toContain("Your accuracy");
    expect(text).toContain("Black's accuracy this game: 64.5%");
    expect(text).toContain("## BLACK'S COSTLIEST MOVES (by the engine's");
  });

  it("never falls back to the player's list when the other side has none", () => {
    const quiet = context({
      gameEval: gameEval((p) => {
        p[13].lines[0].cp = 284;
        p[15].lines[0].cp = 284;
        p[16].lines[0].cp = 284;
      }) as never,
    });
    const text = buildFollowUpCondensedContext(quiet, 16, {
      side: "b",
      confirmed: true,
    });
    expect(text).not.toContain("MISTAKES");
    expect(text).not.toContain("COSTLIEST");
  });

  it("the player's own side, or none, is the context as it was", () => {
    const ctx = context();
    const plain = buildFollowUpCondensedContext(ctx, 16);
    expect(
      buildFollowUpCondensedContext(ctx, 16, { side: "w", confirmed: true })
    ).toBe(plain);
    expect(buildFollowUpCondensedContext(ctx, 16, null)).toBe(plain);
    expect(plain).toContain("## TOP MISTAKES");
  });
});

describe("buildSubjectMomentsBlock", () => {
  it("each moment with its swing, the engine's move and line instead, and the best reply", () => {
    const block = buildSubjectMomentsBlock(context(), "b", true)!;
    expect(block.text.split("\n").slice(0, 4)).toEqual([
      "## BLACK'S KEY MOMENTS (the player's opponent, the moves this turn is about)",
      "Black's costliest moves by the engine, worst first. Evals in pawns, White's perspective. These are flagged moves, so the opening rule does not apply to them.",
      "- 7... Qxc1, a BLUNDER (Black lost 5.5 pawns). Eval -2.63 → +2.84. The engine preferred 7... Kd8.",
      "  Engine line instead of it: 7... Kd8 8. Be2 Qxa2 9. O-O",
    ]);
    expect(block.text).toContain(
      "  White's best reply after it: 8. Qxc1 (the engine's line runs 8. Qxc1 Rb8)"
    );
    // The line is licensed on its own, replacing the game's move there.
    expect(block.lines).toEqual([
      {
        startFen: anchorAtIndex(MOVES, 13)!.fenBefore,
        startPly: 13,
        sans: ["Kd8", "Be2", "Qxa2", "O-O"],
        replacing: true,
      },
    ]);
    // The licence copy carries the story's words but no line's moves.
    expect(block.licenceText).not.toContain("Qxa2");
    expect(block.licenceText).toContain("takes the pawn on a2");
    expect(block.licenceText).not.toContain("Rb8");
    expect(block.licenceText).toContain("White's best reply after it: 8. Qxc1");
    expect(block.fens).toEqual([
      anchorAtIndex(MOVES, 13)!.fenBefore,
      anchorAtIndex(MOVES, 13)!.fenAfter,
      anchorAtIndex(MOVES, 15)!.fenBefore,
      anchorAtIndex(MOVES, 15)!.fenAfter,
    ]);
  });

  it("no preferred move and no line when the engine's line starts with the move played", () => {
    const ctx = context({
      gameEval: gameEval((p) => {
        p[13].lines[0].pv = ["a1c1", "f1e2"];
        p[13].bestMove = "a1c1";
      }) as never,
    });
    const block = buildSubjectMomentsBlock(ctx, "b", true)!;
    expect(block.text).toContain(
      "- 7... Qxc1, a BLUNDER (Black lost 5.5 pawns). Eval -2.63 → +2.84.\n"
    );
    expect(block.text).not.toContain("Engine line instead of it");
    expect(block.lines).toEqual([]);
  });

  it("says none lost half a pawn only when every move was scored", () => {
    const quiet = (edit: (p: Pos[]) => void) =>
      context({
        gameEval: gameEval((p) => {
          p[13].lines[0].cp = 284;
          p[15].lines[0].cp = 284;
          p[16].lines[0].cp = 284;
          edit(p);
        }) as never,
      });
    expect(
      buildSubjectMomentsBlock(
        quiet(() => {}),
        "b",
        true
      )!.text
    ).toBe(
      "## BLACK'S KEY MOMENTS (the player's opponent, the moves this turn is about)\nBy the engine's count, no Black move lost half a pawn or more while the result was still open."
    );
    expect(
      buildSubjectMomentsBlock(
        quiet((p) => {
          p[4].lines[0].depth = 0;
        }),
        "b",
        false
      )!.text
    ).toBe(
      "## BLACK'S KEY MOMENTS (the moves this turn is about)\nThe engine scored 7 of Black's 8 moves, and none of those lost half a pawn or more while the result was still open."
    );
  });

  it("is built once per context, side and confirmation", () => {
    const ctx = context();
    const first = buildSubjectMomentsBlock(ctx, "b", true);
    expect(buildSubjectMomentsBlock(ctx, "b", true)).toBe(first);
    expect(buildSubjectMomentsBlock(ctx, "b", false)).not.toBe(first);
    expect(buildSubjectMomentsBlock(context(), "b", true)).not.toBe(first);
  });

  it("nothing at all without a scored move", () => {
    expect(
      buildSubjectMomentsBlock(context({ gameEval: undefined }), "b", true)
    ).toBeNull();
  });
});

describe("buildAnchorBlock with a subject", () => {
  const anchor = anchorAtIndex(MOVES, 15)!;
  const head = (subject?: { side: "w" | "b"; confirmed: boolean } | null) =>
    buildAnchorBlock(
      anchor,
      MOVES,
      gameEval() as never,
      "w",
      null,
      subject
    ).split("\n")[0];

  it("says the turn is about the other side, the player's labels kept", () => {
    expect(head({ side: "b", confirmed: true })).toBe(
      "## MOVE UNDER DISCUSSION — 8... Kd8 (Black, the opponent's move, and this turn is about Black's moves). The board will show the position after it."
    );
  });

  it("unconfirmed: by colour alone", () => {
    expect(head({ side: "b", confirmed: false })).toBe(
      "## MOVE UNDER DISCUSSION — 8... Kd8 (Black, and this turn is about Black's moves). The board will show the position after it."
    );
  });

  it("no subject, or the player's own: as it was", () => {
    const plain =
      "## MOVE UNDER DISCUSSION — 8... Kd8 (Black, the opponent's move). The board will show the position after it.";
    expect(head()).toBe(plain);
    expect(head({ side: "w", confirmed: true })).toBe(plain);
  });
});
