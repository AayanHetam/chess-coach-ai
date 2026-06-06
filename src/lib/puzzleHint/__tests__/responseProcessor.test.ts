import { describe, expect, it } from "vitest";
import {
  computeSolutionFingerprint,
  detectSolutionLeak,
  parseHintResponse,
} from "../responseProcessor";

describe("parseHintResponse", () => {
  it("splits prose from the structured trailer", () => {
    const raw = `That move drops a piece — the bishop on f5 was your only defender of d3.

===MENTIONS===
pin;f5,d3,d1;red`;
    const { prose, mentions } = parseHintResponse(raw);
    expect(prose).toContain("That move drops a piece");
    expect(prose).not.toContain("===MENTIONS===");
    expect(prose).not.toContain("pin;f5");
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toEqual({
      term: "pin",
      squares: ["f5", "d3", "d1"],
      color: "red",
    });
  });

  it("handles multiple mention lines", () => {
    const raw = `Look at the position carefully.

===MENTIONS===
pin;g5,g7,g8;red
fork;f6,e8,d8;blue`;
    const { mentions } = parseHintResponse(raw);
    expect(mentions).toHaveLength(2);
    expect(mentions[0].color).toBe("red");
    expect(mentions[1].squares).toEqual(["f6", "e8", "d8"]);
  });

  it("returns empty mentions when the trailer has no lines", () => {
    const raw = `A simple explanation with no patterns named.

===MENTIONS===`;
    const { prose, mentions } = parseHintResponse(raw);
    expect(prose).toContain("simple explanation");
    expect(mentions).toEqual([]);
  });

  it("falls back gracefully when the model forgot the trailer", () => {
    const raw = "Just prose, no trailer delimiter at all.";
    const { prose, mentions } = parseHintResponse(raw);
    expect(prose).toBe("Just prose, no trailer delimiter at all.");
    expect(mentions).toEqual([]);
  });

  it("defaults missing color to red", () => {
    const raw = `Foo.

===MENTIONS===
pin;g5,g7`;
    const { mentions } = parseHintResponse(raw);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].color).toBe("red");
  });

  it("ignores malformed mention lines without failing the whole response", () => {
    const raw = `Foo.

===MENTIONS===
this-is-not-a-valid-line
pin;g5,g7,g8;red
broken-too`;
    const { mentions } = parseHintResponse(raw);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].term).toBe("pin");
  });

  it("extracts SHOW_MOVE moves into showMoves[]", () => {
    const raw = `The move is Nxf7. [SHOW_MOVE:Nxf7 Kxf7 Bxh7+] It forks the king and queen.

===MENTIONS===
fork;f7,e8,d8;blue`;
    const { showMoves } = parseHintResponse(raw);
    expect(showMoves).toEqual(["Nxf7", "Kxf7", "Bxh7+"]);
  });

  it("returns no showMoves when no SHOW_MOVE tag is present", () => {
    const raw = `Just a hint, no demo tag.

===MENTIONS===`;
    const { showMoves } = parseHintResponse(raw);
    expect(showMoves).toBeUndefined();
  });

  it("strips trailing whitespace from prose", () => {
    const raw = `Prose with trailing newlines.


===MENTIONS===
pin;g5,g7,g8;red`;
    const { prose } = parseHintResponse(raw);
    expect(prose).toBe("Prose with trailing newlines.");
  });
});

describe("computeSolutionFingerprint", () => {
  // Classic Greek-gift sac: 1. Bxh7+ Kxh7 2. Ng5+ Kg8 3. Qh5 Re8 4. Qxf7+
  // For testing we only care that the SAN extraction works.
  const fen = "r1bq1rk1/pp2ppbp/2n2np1/3p4/3P4/2N1PN2/PP3PPP/R1BQ1RK1 w - - 0 1";
  const solution = ["e3e4", "d5e4"]; // opponent setup, then user move

  it("returns the user's first move in SAN", () => {
    const fp = computeSolutionFingerprint(fen, solution);
    expect(fp).not.toBeNull();
    expect(fp!.firstSan).toMatch(/e4/);
    expect(fp!.firstDestSquare).toBe("e4");
  });

  it("returns null when the solution is empty", () => {
    const fp = computeSolutionFingerprint(fen, []);
    expect(fp).toBeNull();
  });

  it("returns null when the FEN is invalid", () => {
    const fp = computeSolutionFingerprint("not-a-fen", ["e2e4"]);
    expect(fp).toBeNull();
  });
});

describe("detectSolutionLeak", () => {
  const fingerprint = {
    firstSan: "Nxf7+",
    firstDestSquare: "f7",
    allDestSquares: ["f7", "h7"],
  };

  it("detects the bare SAN", () => {
    expect(
      detectSolutionLeak("You should play Nxf7 to win.", fingerprint),
    ).toBe(true);
  });

  it("detects the SAN with decoration stripped", () => {
    // model sometimes writes the move without the + sign
    expect(
      detectSolutionLeak("Try Nxf7 here.", fingerprint),
    ).toBe(true);
  });

  it("detects bare destination square in algebraic context", () => {
    expect(
      detectSolutionLeak("The knight wants to land on f7.", fingerprint),
    ).toBe(true);
  });

  it("does not flag prose that avoids the move and dest", () => {
    expect(
      detectSolutionLeak(
        "Your move drops a piece because the rook is undefended.",
        fingerprint,
      ),
    ).toBe(false);
  });

  it("does not flag a substring inside a longer word", () => {
    // "of77" shouldn't trigger on "f7" because the boundary check.
    expect(
      detectSolutionLeak(
        "Look at the bishop position — it's strong but vulnerable.",
        fingerprint,
      ),
    ).toBe(false);
  });
});
