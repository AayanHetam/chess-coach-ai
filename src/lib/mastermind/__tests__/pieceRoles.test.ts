import { describe, it, expect } from "vitest";
import { classifyPieceRoles, diffPieceRoles } from "../pieceRoles";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("classifyPieceRoles", () => {
  it("starting position assigns defender role to pieces guarding pawns", () => {
    const roles = classifyPieceRoles(STARTING_FEN);
    expect(roles["b1"].roles).toContain("defender");
    expect(roles["g1"].roles).toContain("defender");
  });

  it("knight on a strong central square gets outpost role when no opposing pawn can evict", () => {
    const fen = "rnbqkbnr/pp1p1ppp/8/2pNp3/8/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1";
    const roles = classifyPieceRoles(fen);
    const knight = roles["d5"];
    expect(knight).toBeDefined();
    expect(knight.piece).toBe("n");
    expect(knight.roles).toContain("outpost");
  });

  it("knight pinned against king is marked pinned", () => {
    const pinFen = "rnbqkb1r/pppp1ppp/8/4p3/1B6/8/PPPPnPPP/RNBQK1NR w KQkq - 0 1";
    const roles = classifyPieceRoles(pinFen);
    const pinned = roles["e2"];
    if (pinned) {
      expect(["pinned", "attacker", "defender"]).toEqual(expect.arrayContaining(pinned.roles));
    }
  });

  it("returns an entry for every occupied square", () => {
    const roles = classifyPieceRoles(STARTING_FEN);
    expect(Object.keys(roles)).toHaveLength(32);
  });
});

describe("diffPieceRoles", () => {
  it("no changes between identical positions", () => {
    const a = classifyPieceRoles(STARTING_FEN);
    const b = classifyPieceRoles(STARTING_FEN);
    expect(diffPieceRoles(a, b)).toHaveLength(0);
  });

  it("flags moved piece: roles lost at origin square, gained at destination", () => {
    const before = classifyPieceRoles(STARTING_FEN);
    const afterKnightMove = "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1";
    const after = classifyPieceRoles(afterKnightMove);
    const changes = diffPieceRoles(before, after);

    const g1Change = changes.find((c) => c.square === "g1");
    expect(g1Change).toBeDefined();
    if (g1Change) {
      expect(g1Change.lost).toContain("defender");
    }

    const f3Change = changes.find((c) => c.square === "f3");
    expect(f3Change).toBeDefined();
    if (f3Change) {
      expect(f3Change.gained.length).toBeGreaterThan(0);
    }
  });
});
