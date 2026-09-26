import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { resolveQuestionAnchor } from "../questionAnchor";

// Fixture 07 (the knight-fork game): White's 8. Nc7+ forks king and rook
// while Black's queen on c1 was free for the taking with 8. Qxc1.
const MOVES = [
  "e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4", "Qb6",
  "Nf3", "Qxb2", "Na3", "Qxa1", "Nb5", "Qxc1", "Nc7+", "Kd8",
  "Nxa8", "Qxd1+", "Kxd1", "e5",
];

function fenAfter(n: number): string {
  const g = new Chess();
  for (let i = 0; i < n; i++) g.move(MOVES[i]);
  return g.fen();
}

describe("resolveQuestionAnchor — numbered notation", () => {
  it("resolves White's numbered move to the ply after it, with both boards", () => {
    const a = resolveQuestionAnchor("Why was 8. Nc7+ a mistake?", MOVES, "w");
    expect(a).not.toBeNull();
    expect(a!.index).toBe(14);
    expect(a!.moveNumber).toBe(8);
    expect(a!.color).toBe("w");
    expect(a!.san).toBe("Nc7+");
    expect(a!.ply).toBe(15);
    expect(a!.fenBefore).toBe(fenAfter(14));
    expect(a!.fenAfter).toBe(fenAfter(15));
    expect(a!.matched).toBe("numbered");
    expect(a!.askedSan).toBeUndefined();
  });

  it("resolves Black's three-dot notation, with or without a space", () => {
    expect(resolveQuestionAnchor("what about 8... Kd8?", MOVES)?.index).toBe(15);
    expect(resolveQuestionAnchor("8...Kd8 looked forced", MOVES)?.index).toBe(15);
  });

  it("an alternative written in notation anchors to that spot and is reported as asked", () => {
    const a = resolveQuestionAnchor("why not 8. Qxc1?", MOVES);
    expect(a?.index).toBe(14);
    expect(a?.san).toBe("Nc7+");
    expect(a?.askedSan).toBe("Qxc1");
  });

  it("prefers the reference that was actually played over an alternative in the same question", () => {
    const a = resolveQuestionAnchor("Why 8. Nc7+ instead of 8. Qxc1?", MOVES);
    expect(a?.index).toBe(14);
    expect(a?.askedSan).toBeUndefined();
  });

  it("ignores a move number the game never reached", () => {
    expect(resolveQuestionAnchor("what about 40. Qh7#?", MOVES)).toBeNull();
  });
});

describe("resolveQuestionAnchor — 'move N' with no notation", () => {
  it("is the player's own move by default", () => {
    expect(resolveQuestionAnchor("what happened on move 8?", MOVES, "w")?.index).toBe(14);
    expect(resolveQuestionAnchor("what happened on move 8?", MOVES, "b")?.index).toBe(15);
  });

  it("accepts ordinals", () => {
    expect(resolveQuestionAnchor("my 8th move felt wrong", MOVES, "w")?.index).toBe(14);
  });

  it("falls back to the other side when the player's move at that number does not exist", () => {
    // Move 10 for Black (index 19, e5) exists; White's 11th does not.
    expect(resolveQuestionAnchor("move 10", MOVES, "b")?.index).toBe(19);
    expect(resolveQuestionAnchor("move 11", MOVES, "w")).toBeNull();
  });
});

describe("resolveQuestionAnchor — bare notation", () => {
  it("finds a piece move written without a number", () => {
    const a = resolveQuestionAnchor("Nc7+ looked strong, why not?", MOVES);
    expect(a?.index).toBe(14);
    expect(a?.matched).toBe("bare-san");
  });

  it("picks the occurrence nearest the viewed board when a move was played twice", () => {
    const moves = ["e4", "e5", "Nf3", "Nc6", "Ng1", "Nb8", "Nf3", "Nc6"];
    expect(resolveQuestionAnchor("was Nf3 good?", moves, "w", 1)?.index).toBe(2);
    expect(resolveQuestionAnchor("was Nf3 good?", moves, "w", 8)?.index).toBe(6);
    expect(resolveQuestionAnchor("was Nf3 good?", moves, "w")?.index).toBe(2);
  });

  it("does not read a square as a pawn move without a cue", () => {
    expect(resolveQuestionAnchor("is my king safe on e1?", MOVES)).toBeNull();
    expect(resolveQuestionAnchor("should I have played e5 earlier?", MOVES)?.san).toBe("e5");
  });
});

describe("resolveQuestionAnchor — nothing to anchor", () => {
  it("returns null for a general question", () => {
    expect(resolveQuestionAnchor("what should I study next?", MOVES)).toBeNull();
    expect(resolveQuestionAnchor("thanks!", MOVES)).toBeNull();
    expect(resolveQuestionAnchor("Why was 8. Nc7+ bad?", [])).toBeNull();
  });
});
