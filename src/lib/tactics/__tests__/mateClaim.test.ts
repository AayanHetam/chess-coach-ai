import { describe, expect, it } from "vitest";
import {
  analyzeMateClaim,
  applyMateCorrection,
  describeMateTruth,
  findFalseMateClaims,
} from "@/lib/tactics/mateClaim";

// Lichess puzzle 0vFpB, verbatim from public/data/lichess_puzzles_100k.csv.
// This is the puzzle that produced the fabricated mate claim in production.
const P0VFPB = {
  fen: "2rr2k1/pq3pp1/1p2pn1p/2b1N3/6PQ/2N1P3/PP3P1P/1KRR4 b - - 0 19",
  uci: ["f6e4", "d1d8", "c8d8", "h4d8"],
};

// A genuine mate-in-1 for the positive case: Qxf7#, smothered by the king's
// own pieces. Verified independently of the code under test.
const MATE_IN_1 = {
  fen: "rnbqkbnr/pppp1ppp/8/4p3/5PP1/8/PPPPP2P/RNBQKBNR b KQkq - 0 2",
  uci: ["d8h4"],
};

describe("analyzeMateClaim", () => {
  it("reports the real 0vFpB line as check, not mate", () => {
    const t = analyzeMateClaim(P0VFPB.fen, P0VFPB.uci);
    expect(t.illegal).toBe(false);
    expect(t.plies.map((p) => p.san)).toEqual([
      "Ne4",
      "Rxd8+",
      "Rxd8",
      "Qxd8+",
    ]);
    // The heart of the bug: chess.js itself annotates "+", never "#".
    expect(t.final?.san).toBe("Qxd8+");
    expect(t.final?.isCheckmate).toBe(false);
    expect(t.final?.isCheck).toBe(true);
    expect(t.final?.escapes).toEqual(["Kh7", "Bf8"]);
  });

  it("reports a genuine mate as mate", () => {
    const t = analyzeMateClaim(MATE_IN_1.fen, MATE_IN_1.uci);
    expect(t.final?.san).toBe("Qh4#");
    expect(t.final?.isCheckmate).toBe(true);
    expect(t.final?.escapes).toEqual([]);
  });

  it("treats an unreplayable line as unknown, never as safe", () => {
    const t = analyzeMateClaim(P0VFPB.fen, ["f6e4", "a1a8"]);
    expect(t.illegal).toBe(true);
    expect(t.final).toBeNull();
    // A partial line must not be reported as a verified non-mate either.
    expect(findFalseMateClaims("Then Qxd8# ends it.", t)).toEqual([]);
  });

  it("survives a malformed FEN", () => {
    const t = analyzeMateClaim("not-a-fen", ["e2e4"]);
    expect(t.illegal).toBe(true);
    expect(t.plies).toEqual([]);
  });
});

describe("findFalseMateClaims", () => {
  const truth = analyzeMateClaim(P0VFPB.fen, P0VFPB.uci);

  it("catches the exact sentence shipped to the user", () => {
    const prose =
      "After **Rxd8+ Rxd8**, Black is forced to recapture — and then " +
      "**Qxd8#** is checkmate because the king can't move and no piece " +
      "covers d8.";
    const found = findFalseMateClaims(prose, truth);
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({
      claimed: "Qxd8#",
      actual: "Qxd8+",
      escapes: ["Kh7", "Bf8"],
    });
  });

  it("does not flag the correct '+' annotation", () => {
    expect(findFalseMateClaims("The key move is Qxd8+.", truth)).toEqual([]);
  });

  it("does not flag pattern names or mate threats", () => {
    // Both of these appeared in the SAME response as the false claim and are
    // legitimate English. A keyword scan for "mate" would flag them.
    const prose =
      "This is a back-rank mate threat — the back rank becomes a death trap, " +
      "so always scan for a mating attack.";
    expect(findFalseMateClaims(prose, truth)).toEqual([]);
  });

  it("does not flag mate in a hypothetical branch outside the line", () => {
    // Qg7# is not a move in this solution, so we must not second-guess it.
    expect(findFalseMateClaims("If Kh8 then Qg7# finishes.", truth)).toEqual(
      [],
    );
  });

  it("reports each offending move once, however often it is repeated", () => {
    const found = findFalseMateClaims("Qxd8# — yes, Qxd8# mates.", truth);
    expect(found).toHaveLength(1);
  });

  it("stays silent when the claimed mate is real", () => {
    const mate = analyzeMateClaim(MATE_IN_1.fen, MATE_IN_1.uci);
    expect(findFalseMateClaims("Qh4# ends the game.", mate)).toEqual([]);
  });
});

describe("applyMateCorrection", () => {
  const truth = analyzeMateClaim(P0VFPB.fen, P0VFPB.uci);

  it("rewrites the annotation and appends a correction note", () => {
    const { text, corrections } = applyMateCorrection(
      "Then **Qxd8#** is checkmate.",
      truth,
    );
    expect(corrections).toHaveLength(1);
    expect(text).toContain("**Qxd8+**");
    expect(text).not.toContain("Qxd8#");
    expect(text).toContain("check, not mate");
    expect(text).toContain("Kh7 and Bf8");
  });

  it("rewrites every occurrence, not just the first", () => {
    const { text } = applyMateCorrection("Qxd8# — yes, Qxd8#.", truth);
    expect(text).not.toContain("Qxd8#");
  });

  it("returns truthful prose untouched", () => {
    const input = "Qxd8+ wins a rook.";
    const { text, corrections } = applyMateCorrection(input, truth);
    expect(text).toBe(input);
    expect(corrections).toEqual([]);
  });
});

describe("describeMateTruth", () => {
  it("tells the model the line is check and names the escapes", () => {
    const s = describeMateTruth(analyzeMateClaim(P0VFPB.fen, P0VFPB.uci));
    expect(s).toContain("Qxd8+");
    expect(s).toContain("CHECK, not checkmate");
    expect(s).toContain("Kh7");
    expect(s).toContain("Do NOT call this mate");
  });

  it("confirms a real mate instead of warning against it", () => {
    const s = describeMateTruth(analyzeMateClaim(MATE_IN_1.fen, MATE_IN_1.uci));
    expect(s).toContain("IS checkmate");
    expect(s).not.toContain("Do NOT");
  });

  it("says nothing when the line can't be verified", () => {
    expect(describeMateTruth(analyzeMateClaim("bad", ["e2e4"]))).toBe("");
  });
});
