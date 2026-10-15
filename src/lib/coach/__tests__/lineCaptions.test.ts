import { afterEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { captionLine } from "../lineCaptions";

// Fixture 07 after 7... Qxc1: White to move, Black's queen hangs on c1.
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
];
const BEFORE_8 = (() => {
  const g = new Chess();
  for (const m of MOVES) g.move(m);
  return g.fen();
})();

describe("captionLine", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("captions the engine's line: the capture of the queen, then the ledger in the second person", () => {
    const out = captionLine(BEFORE_8, ["Qxc1", "Rb8", "Qf4", "f6"], "w");
    expect(out.plies).toHaveLength(4);
    expect(out.plies[0].san).toBe("Qxc1");
    expect(out.plies[0].label).toBe("8.");
    expect(out.plies[0].caption).toMatch(/queen/);
    expect(out.plies[1].label).toBe("8...");
    // White had lost a rook, a bishop and a pawn (9 points); taking the
    // queen back only levels it.
    expect(out.ledger).toBe("material is level at the end");
    expect(out.endsInMate).toBe(false);
  });

  it("captions the game's line: the check and the fork, and the queen lost", () => {
    const out = captionLine(
      BEFORE_8,
      ["Nc7+", "Kd8", "Nxa8", "Qxd1+", "Kxd1"],
      "w"
    );
    expect(out.plies[0].caption).toMatch(/check/);
    expect(out.plies[0].caption).toMatch(/fork/);
    expect(out.plies[1].caption).toMatch(/only/);
    expect(out.plies[3].full).toMatch(/queen/);
    // Over these plies White takes a rook and a queen and loses a queen
    // (+5), but it started 9 points down: it ends 4 down, and the footer
    // says where it ends, not what the line won.
    expect(out.ledger).toBe("you're 4 points down at the end");
  });

  it("phrases the ledger for whoever reads it", () => {
    const line = ["Nc7+", "Kd8", "Nxa8", "Qxd1+", "Kxd1"];
    expect(captionLine(BEFORE_8, line, "b").ledger).toBe(
      "you're 4 points up at the end"
    );
    expect(captionLine(BEFORE_8, line, null).ledger).toBe(
      "Black is 4 points up at the end"
    );
  });

  it("names a piece only when one piece is the whole difference", () => {
    // A knight walks into a pawn: nothing else changed hands.
    const knight = captionLine(
      new Chess().fen(),
      ["d4", "Nf6", "Nf3", "Ne4", "Nfd2", "Nc3", "bxc3"],
      "w"
    );
    expect(knight.ledger).toBe("you're a knight up at the end");
  });

  it("says nothing about material when the line stops mid-exchange", () => {
    // Scandinavian after 5.Bd2: 5...Qxc3, and White has not taken back yet.
    const g = new Chess();
    for (const m of [
      "e4",
      "d5",
      "exd5",
      "Qxd5",
      "Nc3",
      "Qa5",
      "d4",
      "Nf6",
      "Bd2",
    ])
      g.move(m);
    expect(captionLine(g.fen(), ["Qxc3"], "w").ledger).toBe("");
  });

  it("with COACH_CLAIM_VERIFIER off, the legacy ledger is unchanged", () => {
    vi.stubEnv("COACH_CLAIM_VERIFIER", "0");
    vi.stubEnv("NEXT_PUBLIC_COACH_CLAIM_VERIFIER", "0");
    expect(
      captionLine(BEFORE_8, ["Qxc1", "Rb8", "Qf4", "f6"], "w").ledger
    ).toBe("you come out a queen up");
    expect(
      captionLine(BEFORE_8, ["Nc7+", "Kd8", "Nxa8", "Qxd1+", "Kxd1"], "w")
        .ledger
    ).toBe("you come out a rook up");
    expect(
      captionLine(BEFORE_8, ["Qxc1", "Rb8", "Qf4", "f6"], "b").ledger
    ).toBe("White ends a queen up");
    expect(
      captionLine(new Chess().fen(), ["e4", "e5", "Nf3", "Nc6"], "w").ledger
    ).toBe("material stays level");
  });

  it("stays level when nothing is won", () => {
    const out = captionLine(new Chess().fen(), ["e4", "e5", "Nf3", "Nc6"], "w");
    expect(out.ledger).toBe("material is level at the end");
    expect(out.plies.every((p) => typeof p.caption === "string")).toBe(true);
  });

  it("says who mates", () => {
    // Scholar's mate from the start.
    const out = captionLine(
      new Chess().fen(),
      ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"],
      "w"
    );
    expect(out.endsInMate).toBe(true);
    expect(out.ledger).toBe("you deliver mate");
    expect(
      captionLine(
        new Chess().fen(),
        ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"],
        "b"
      ).ledger
    ).toBe("White mates");
  });

  it("never throws on a line that does not replay", () => {
    const out = captionLine(BEFORE_8, ["Qxc1", "Kg8"], "w");
    expect(out.plies.length).toBeLessThanOrEqual(1);
    expect(captionLine("not a fen", ["e4"]).plies).toEqual([]);
  });
});
