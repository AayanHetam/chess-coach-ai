import { describe, it, expect } from "vitest";
import { GOAL_DIAGRAMS, GOAL_DIAGRAM_ALT, SPOT_DIAGRAMS } from "../tacticDiagrams";
import { QUIZ_GOAL_OPTIONS } from "../quizThemes";
import type { DiagramSpec, Square } from "../TacticDiagram";

/**
 * These diagrams teach a tactic to a beginner who may not know its shape, so
 * the geometry has to be REAL. A fork diagram whose knight doesn't actually
 * attack both pieces teaches the wrong pattern to exactly the person who came
 * to learn it — and it would look completely fine to anyone who already knows
 * what a fork is, which is why it needs a test rather than an eyeball.
 */

const d = (col: number, row: number): Square => [col, row] as const;
const eq = (a: Square, b: Square) => a[0] === b[0] && a[1] === b[1];

function pieceAt(spec: DiagramSpec, sq: Square) {
  return spec.pieces.find((p) => eq(p.at, sq));
}

const isKnightMove = (a: Square, b: Square) => {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  return (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
};
const isDiagonal = (a: Square, b: Square) =>
  Math.abs(a[0] - b[0]) === Math.abs(a[1] - b[1]) && a[0] !== b[0];
const isLine = (a: Square, b: Square) =>
  (a[0] === b[0]) !== (a[1] === b[1]); // same file XOR same rank

describe("every goal option has a diagram", () => {
  it("covers each key in QUIZ_GOAL_OPTIONS, with a caption", () => {
    for (const o of QUIZ_GOAL_OPTIONS) {
      expect(GOAL_DIAGRAMS[o.key], `missing diagram for "${o.key}"`).toBeDefined();
      expect(GOAL_DIAGRAM_ALT[o.key], `missing caption for "${o.key}"`).toBeTruthy();
    }
  });

  it("places every piece and arrow inside the crop", () => {
    for (const [key, spec] of Object.entries({ ...GOAL_DIAGRAMS, ...SPOT_DIAGRAMS })) {
      const inside = (s: Square) =>
        s[0] >= 0 && s[0] < spec.size && s[1] >= 0 && s[1] < spec.size;
      for (const p of spec.pieces) expect(inside(p.at), `${key} piece off-board`).toBe(true);
      for (const a of spec.arrows ?? []) {
        expect(inside(a.from), `${key} arrow from off-board`).toBe(true);
        expect(inside(a.to), `${key} arrow to off-board`).toBe(true);
      }
      for (const m of spec.marks ?? []) expect(inside(m.at), `${key} mark off-board`).toBe(true);
    }
  });

  it("never stacks two pieces on one square", () => {
    for (const [key, spec] of Object.entries({ ...GOAL_DIAGRAMS, ...SPOT_DIAGRAMS })) {
      const seen = new Set(spec.pieces.map((p) => `${p.at[0]},${p.at[1]}`));
      expect(seen.size, `${key} has overlapping pieces`).toBe(spec.pieces.length);
    }
  });
});

describe("the fork diagram is a real fork", () => {
  const spec = GOAL_DIAGRAMS.tactics; // Tactics is represented by the fork

  it("has a white knight attacking two black pieces via legal knight moves", () => {
    const knight = spec.pieces.find((p) => p.glyph === "knight" && p.side === "w");
    expect(knight).toBeDefined();

    const targets = spec.pieces.filter((p) => p.side === "b");
    expect(targets.length).toBe(2);
    for (const t of targets) {
      expect(isKnightMove(knight!.at, t.at), `knight cannot reach ${t.glyph}`).toBe(true);
    }
  });

  it("forks the king — which is what makes it winning", () => {
    expect(spec.pieces.some((p) => p.glyph === "king" && p.side === "b")).toBe(true);
  });

  it("draws one arrow per forked piece", () => {
    expect(spec.arrows).toHaveLength(2);
  });
});

describe("the pin diagram is a real pin", () => {
  const spec = SPOT_DIAGRAMS.pin;

  it("puts bishop, pinned piece and king on one diagonal, in that order", () => {
    const bishop = spec.pieces.find((p) => p.glyph === "bishop" && p.side === "w")!;
    const king = spec.pieces.find((p) => p.glyph === "king" && p.side === "b")!;
    const pinned = spec.pieces.find((p) => p.side === "b" && p.glyph !== "king")!;

    expect(isDiagonal(bishop.at, king.at)).toBe(true);
    expect(isDiagonal(bishop.at, pinned.at)).toBe(true);

    // The pinned piece must sit BETWEEN the bishop and the king — otherwise
    // nothing is pinned and the picture is just three pieces on a diagonal.
    const between =
      pinned.at[0] > Math.min(bishop.at[0], king.at[0]) &&
      pinned.at[0] < Math.max(bishop.at[0], king.at[0]);
    expect(between, "pinned piece is not between bishop and king").toBe(true);
  });

  it("marks the pinned piece", () => {
    expect(spec.marks?.some((m) => eq(m.at, d(1, 2)))).toBe(true);
  });
});

describe("the hanging-piece diagram is really hanging", () => {
  const spec = SPOT_DIAGRAMS.hanging;

  it("attacks the black piece along a rank or file", () => {
    const rook = spec.pieces.find((p) => p.glyph === "rook" && p.side === "w")!;
    const victim = spec.pieces.find((p) => p.side === "b")!;
    expect(isLine(rook.at, victim.at)).toBe(true);
  });

  it("gives the victim no defender — that is the entire point", () => {
    const blacks = spec.pieces.filter((p) => p.side === "b");
    expect(blacks).toHaveLength(1);
  });

  it("flags it as danger, not as a neutral target", () => {
    expect(spec.marks?.[0].tone).toBe("danger");
  });
});

describe("the king-safety diagram has real attacking lines", () => {
  const spec = GOAL_DIAGRAMS.middlegame; // Middlegame is represented by an attack

  it("converges a rank attacker and a diagonal attacker on the king", () => {
    const king = spec.pieces.find((p) => p.glyph === "king" && p.side === "b")!;
    const rook = spec.pieces.find((p) => p.glyph === "rook")!;
    const queen = spec.pieces.find((p) => p.glyph === "queen")!;
    expect(isLine(rook.at, king.at), "rook does not attack along a line").toBe(true);
    expect(isDiagonal(queen.at, king.at), "queen does not attack along a diagonal").toBe(true);
  });
});

describe("the endgame diagram shows the opposition", () => {
  const spec = GOAL_DIAGRAMS.endgame;

  it("stands the kings on one file, two squares apart", () => {
    const kings = spec.pieces.filter((p) => p.glyph === "king");
    expect(kings).toHaveLength(2);
    expect(kings[0].at[0]).toBe(kings[1].at[0]);
    expect(Math.abs(kings[0].at[1] - kings[1].at[1])).toBe(2);
  });

  it("never puts the kings adjacent, which would be an illegal position", () => {
    const kings = spec.pieces.filter((p) => p.glyph === "king");
    const dx = Math.abs(kings[0].at[0] - kings[1].at[0]);
    const dy = Math.abs(kings[0].at[1] - kings[1].at[1]);
    expect(Math.max(dx, dy)).toBeGreaterThan(1);
  });

  it("has the white king LEADING the pawn, not trailing it", () => {
    // Rows increase downward, so the escorting king should sit on a smaller
    // row index than its pawn.
    const wk = spec.pieces.find((p) => p.glyph === "king" && p.side === "w")!;
    const pawn = spec.pieces.find((p) => p.glyph === "pawn" && p.side === "w")!;
    expect(wk.at[1]).toBeLessThan(pawn.at[1]);
  });
});

describe("the opening diagram develops legally", () => {
  const spec = GOAL_DIAGRAMS.openings;

  it("moves the knight by a legal knight move to an empty square", () => {
    const arrow = spec.arrows![0];
    const knight = pieceAt(spec, arrow.from);
    expect(knight?.glyph).toBe("knight");
    expect(isKnightMove(arrow.from, arrow.to)).toBe(true);
    expect(pieceAt(spec, arrow.to), "develops onto an occupied square").toBeUndefined();
  });

  it("uses a quiet arrow — nothing is under attack yet", () => {
    expect(spec.arrows![0].tone).toBe("quiet");
  });
});
