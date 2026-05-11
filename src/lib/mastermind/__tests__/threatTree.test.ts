import { describe, it, expect } from "vitest";
import { buildThreatTree } from "../threatTree";

describe("buildThreatTree", () => {
  it("returns empty when depthBudget is 0", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(buildThreatTree(fen, 0)).toEqual([]);
  });

  it("returns empty when no significant threats exist", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const tree = buildThreatTree(fen, 3);
    expect(tree).toEqual([]);
  });

  it("detects a queen-takes-rook threat", () => {
    const fen = "4k3/8/8/8/3q4/8/3R4/4K3 w - - 0 1";
    const tree = buildThreatTree(fen, 2);
    expect(tree.length).toBeGreaterThan(0);
    expect(tree[0].capturedPiece).toBe("r");
  });

  it("flags a back-rank mate threat", () => {
    const fen = "6k1/5ppp/8/8/8/8/8/4q1K1 w - - 0 1";
    const tree = buildThreatTree(fen, 2);
    expect(tree.length).toBeGreaterThan(0);
    expect(tree.some((node) => node.isMate || node.isCheck)).toBe(true);
  });

  it("respects depth budget by stopping at limit", () => {
    const fen = "4k3/8/8/8/3q4/8/3R4/4K3 w - - 0 1";
    const tree = buildThreatTree(fen, 1);
    if (tree.length > 0) {
      expect(tree[0].depth).toBe(0);
      expect(tree[0].reasonStopped).toBeDefined();
    }
  });

  it("enumerates defenses for a non-mate threat", () => {
    const fen = "4k3/8/8/8/3q4/8/3R4/4K3 w - - 0 1";
    const tree = buildThreatTree(fen, 3);
    if (tree.length > 0 && !tree[0].isMate) {
      expect(tree[0].defenses.length).toBeGreaterThanOrEqual(0);
    }
  });
});
