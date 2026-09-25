import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { captionLine } from "../lineCaptions";

// Fixture 07 after 7... Qxc1: White to move, Black's queen hangs on c1.
const MOVES = [
  "e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4", "Qb6",
  "Nf3", "Qxb2", "Na3", "Qxa1", "Nb5", "Qxc1",
];
const BEFORE_8 = (() => {
  const g = new Chess();
  for (const m of MOVES) g.move(m);
  return g.fen();
})();

describe("captionLine", () => {
  it("captions the engine's line: the capture of the queen, then the ledger in the second person", () => {
    const out = captionLine(BEFORE_8, ["Qxc1", "Rb8", "Qf4", "f6"], "w");
    expect(out.plies).toHaveLength(4);
    expect(out.plies[0].san).toBe("Qxc1");
    expect(out.plies[0].label).toBe("8.");
    expect(out.plies[0].caption).toMatch(/queen/);
    expect(out.plies[1].label).toBe("8...");
    expect(out.ledger).toBe("you come out a queen up");
    expect(out.endsInMate).toBe(false);
  });

  it("captions the game's line: the check and the fork, and the queen lost", () => {
    const out = captionLine(BEFORE_8, ["Nc7+", "Kd8", "Nxa8", "Qxd1+", "Kxd1"], "w");
    expect(out.plies[0].caption).toMatch(/check/);
    expect(out.plies[0].caption).toMatch(/fork/);
    expect(out.plies[1].caption).toMatch(/only/);
    expect(out.plies[3].full).toMatch(/queen/);
    // Over THESE plies White takes a rook and a queen and loses a queen: a
    // rook up on the line's own ledger (the game as a whole is another
    // matter, which is why the chip beside it carries the eval).
    expect(out.ledger).toBe("you come out a rook up");
  });

  it("phrases the ledger for the other side when the line is the opponent's", () => {
    const out = captionLine(BEFORE_8, ["Qxc1", "Rb8", "Qf4", "f6"], "b");
    expect(out.ledger).toBe("White ends a queen up");
  });

  it("stays level when nothing is won", () => {
    const out = captionLine(new Chess().fen(), ["e4", "e5", "Nf3", "Nc6"], "w");
    expect(out.ledger).toBe("material stays level");
    expect(out.plies.every((p) => typeof p.caption === "string")).toBe(true);
  });

  it("says who mates", () => {
    // Scholar's mate from the start.
    const out = captionLine(new Chess().fen(), ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"], "w");
    expect(out.endsInMate).toBe(true);
    expect(out.ledger).toBe("you deliver mate");
    expect(captionLine(new Chess().fen(), ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"], "b").ledger).toBe("White mates");
  });

  it("never throws on a line that does not replay", () => {
    const out = captionLine(BEFORE_8, ["Qxc1", "Kg8"], "w");
    expect(out.plies.length).toBeLessThanOrEqual(1);
    expect(captionLine("not a fen", ["e4"]).plies).toEqual([]);
  });
});
