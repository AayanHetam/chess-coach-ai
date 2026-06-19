import { describe, it, expect } from "vitest";
import { scoreCoachResponse } from "../relationalScorer";
import { __test } from "../relationalExtract";
import type { RelationalClaim } from "../relationalVerify";

// White queen on d3 — diagonal d3→h7 is clear, queen attacks h7.
const QUEEN_CAN_REACH = "4k3/7b/8/8/8/3Q4/8/4K3 w - - 0 1";

const QUEEN_CANNOT_REACH = "4k3/7b/8/8/8/8/8/3QK3 w - - 0 1";

// Scotch gambit final position: c4 holds a black pawn, c5 holds black bishop.
const SCOTCH_FINAL = "r1bqk2r/ppp2pPp/2n5/2b5/2pp4/2P2N2/PP3PPP/RNBQK2R b KQkq - 0 8";

// Pin position: black bishop b4, white knight c3, white king e1, black king h8.
const PIN_BISHOP_REAL = "7k/8/8/8/1b6/2N5/8/4K3 w - - 0 1";

describe("extractor.parseClaims", () => {
  it("parses a code-fenced JSON array and drops malformed claims", () => {
    const text =
      "```json\n" +
      JSON.stringify([
        { kind: "capture", pieceColor: "w", pieceType: "q", targetSquare: "h7", rawText: "Qxh7" },
        { kind: "capture", pieceColor: "w", targetSquare: "zz" }, // bad square -> dropped
        { kind: "bogus", targetSquare: "h7" }, // bad kind -> dropped
        { kind: "presence", targetSquare: "h7", expectedPiece: { type: "b", color: "b" }, rawText: "" },
      ]) +
      "\n```";
    const claims = __test.parseClaims(text);
    expect(claims).toHaveLength(2);
    expect(claims[0].kind).toBe("capture");
    expect(claims[1].kind).toBe("presence");
  });

  it("returns [] when there is no JSON array", () => {
    expect(__test.parseClaims("No concrete claims here.")).toEqual([]);
  });

  it("drops nonsensical self-referential claims (from === target)", () => {
    expect(__test.coerceClaim({ kind: "attack", pieceColor: "b", fromSquare: "e4", targetSquare: "e4" })).toBeNull();
    // a real attack to a different square still parses
    expect(
      __test.coerceClaim({ kind: "attack", pieceColor: "b", fromSquare: "e4", targetSquare: "f2", rawText: "x" }),
    ).not.toBeNull();
  });

  it("parses a pin claim with pinnedToSquare", () => {
    const raw = [
      {
        kind: "pin",
        pieceColor: "b",
        pieceType: "b",
        fromSquare: "b4",
        targetSquare: "c3",
        pinnedToSquare: "e1",
        rawText: "bishop pins knight to king",
      },
    ];
    const claims = __test.parseClaims(JSON.stringify(raw));
    expect(claims).toHaveLength(1);
    expect(claims[0].kind).toBe("pin");
    expect(claims[0].pinnedToSquare).toBe("e1");
    expect(claims[0].targetSquare).toBe("c3");
  });

  it("parses a pin claim without pinnedToSquare (partial)", () => {
    const raw = [
      {
        kind: "pin",
        pieceColor: "b",
        targetSquare: "c3",
        rawText: "bishop freezes knight",
      },
    ];
    const claims = __test.parseClaims(JSON.stringify(raw));
    expect(claims).toHaveLength(1);
    expect(claims[0].kind).toBe("pin");
    expect(claims[0].pinnedToSquare).toBeUndefined();
  });

  it("drops a pin claim missing required targetSquare", () => {
    expect(__test.coerceClaim({ kind: "pin", pieceColor: "b", pinnedToSquare: "e1" })).toBeNull();
  });

  it("drops a pin claim missing required pieceColor", () => {
    expect(__test.coerceClaim({ kind: "pin", targetSquare: "c3", pinnedToSquare: "e1" })).toBeNull();
  });
});

describe("scoreCoachResponse (injected extractor)", () => {
  it("tallies false / true / unverifiable claims against the board", async () => {
    const injected: RelationalClaim[] = [
      { kind: "capture", pieceColor: "w", pieceType: "q", targetSquare: "h7", rawText: "queen takes h7" }, // contradicted
      { kind: "presence", targetSquare: "h7", expectedPiece: { type: "b", color: "b" }, rawText: "bishop on h7" }, // holds
      { kind: "presence", targetSquare: "h7", rawText: "something on h7" }, // missing expectedPiece -> unverifiable
    ];
    const res = await scoreCoachResponse({
      apiKey: "unused",
      coachText: "irrelevant — extractor is injected",
      fen: QUEEN_CANNOT_REACH,
      extract: async () => ({ ok: true, claims: injected }),
    });
    expect(res.extractorOk).toBe(true);
    expect(res.totalClaims).toBe(3);
    expect(res.falseRelationalClaims).toBe(1);
    expect(res.trueClaims).toBe(1);
    expect(res.unverifiable).toBe(1);
  });

  it("reports extractor failure cleanly with zero counts", async () => {
    const res = await scoreCoachResponse({
      apiKey: "unused",
      coachText: "x",
      fen: QUEEN_CANNOT_REACH,
      extract: async () => ({ ok: false, claims: [], errorMessage: "boom" }),
    });
    expect(res.extractorOk).toBe(false);
    expect(res.extractorError).toBe("boom");
    expect(res.falseRelationalClaims).toBe(0);
  });

  it("scores a real pin claim (holds) via injected extractor", async () => {
    const injected: RelationalClaim[] = [
      {
        kind: "pin",
        pieceColor: "b",
        fromSquare: "b4",
        targetSquare: "c3",
        pinnedToSquare: "e1",
        rawText: "bishop pins knight to king",
      },
    ];
    const res = await scoreCoachResponse({
      apiKey: "unused",
      coachText: "irrelevant",
      fen: PIN_BISHOP_REAL,
      extract: async () => ({ ok: true, claims: injected }),
    });
    expect(res.trueClaims).toBe(1);
    expect(res.falseRelationalClaims).toBe(0);
    expect(res.details[0].verdict).toBe("holds");
  });

  it("scores a false pin claim as contradicted", async () => {
    // Claiming pin to e8 when the real x-ray goes to e1.
    const injected: RelationalClaim[] = [
      {
        kind: "pin",
        pieceColor: "b",
        fromSquare: "b4",
        targetSquare: "c3",
        pinnedToSquare: "e8", // wrong direction
        rawText: "bishop pins knight to e8",
      },
    ];
    const res = await scoreCoachResponse({
      apiKey: "unused",
      coachText: "irrelevant",
      fen: PIN_BISHOP_REAL,
      extract: async () => ({ ok: true, claims: injected }),
    });
    expect(res.falseRelationalClaims).toBe(1);
    expect(res.details[0].verdict).toBe("contradicted");
  });

  it("scores a partial pin claim (no pinnedToSquare) as unverifiable", async () => {
    const injected: RelationalClaim[] = [
      {
        kind: "pin",
        pieceColor: "b",
        fromSquare: "b4",
        targetSquare: "c3",
        rawText: "bishop freezes knight",
      },
    ];
    const res = await scoreCoachResponse({
      apiKey: "unused",
      coachText: "irrelevant",
      fen: PIN_BISHOP_REAL,
      extract: async () => ({ ok: true, claims: injected }),
    });
    expect(res.unverifiable).toBe(1);
    expect(res.falseRelationalClaims).toBe(0);
  });
});

describe("scoreCoachResponse — ply-anchored scoring (fenMap)", () => {
  it("verifies a moveRefPly claim against the ply FEN, not the final FEN", async () => {
    // Final FEN: queen on d1, CANNOT attack h7 → without fenMap this would be "contradicted".
    // fenMap[1]: queen on d3, CAN attack h7 → with fenMap this should be "holds".
    const claimAboutPly1: RelationalClaim = {
      kind: "attack",
      pieceColor: "w",
      targetSquare: "h7",
      moveRefPly: 1,
      rawText: "at move 1, the queen attacked h7",
    };
    const res = await scoreCoachResponse({
      apiKey: "unused",
      coachText: "irrelevant",
      fen: QUEEN_CANNOT_REACH,
      fenMap: { 1: QUEEN_CAN_REACH },
      extract: async () => ({ ok: true, claims: [claimAboutPly1] }),
    });
    expect(res.falseRelationalClaims).toBe(0);
    expect(res.trueClaims).toBe(1);
    expect(res.details[0].verdict).toBe("holds");
  });

  it("falls back to final FEN when moveRefPly is absent from the fenMap", async () => {
    // Same claim but fenMap doesn't have ply 99 → falls back to QUEEN_CANNOT_REACH → contradicted.
    const claimBadRef: RelationalClaim = {
      kind: "attack",
      pieceColor: "w",
      targetSquare: "h7",
      moveRefPly: 99,
      rawText: "queen attacks h7 (bad ref)",
    };
    const res = await scoreCoachResponse({
      apiKey: "unused",
      coachText: "irrelevant",
      fen: QUEEN_CANNOT_REACH,
      fenMap: { 1: QUEEN_CAN_REACH }, // ply 99 not present
      extract: async () => ({ ok: true, claims: [claimBadRef] }),
    });
    expect(res.falseRelationalClaims).toBe(1);
    expect(res.details[0].verdict).toBe("contradicted");
  });

  it("uses final FEN for claims with no moveRefPly even when fenMap is provided", async () => {
    const claimNoRef: RelationalClaim = {
      kind: "attack",
      pieceColor: "w",
      targetSquare: "h7",
      rawText: "queen attacks h7 (no ref)",
    };
    const res = await scoreCoachResponse({
      apiKey: "unused",
      coachText: "irrelevant",
      fen: QUEEN_CANNOT_REACH,
      fenMap: { 1: QUEEN_CAN_REACH },
      extract: async () => ({ ok: true, claims: [claimNoRef] }),
    });
    expect(res.falseRelationalClaims).toBe(1);
    expect(res.details[0].verdict).toBe("contradicted");
  });
});

describe("extractor — moveRefPly parsing", () => {
  it("parses a valid integer moveRefPly", () => {
    const raw = [
      {
        kind: "attack",
        pieceColor: "w",
        targetSquare: "h7",
        moveRefPly: 11,
        rawText: "at move 6 white attacked h7",
      },
    ];
    const claims = __test.parseClaims(JSON.stringify(raw));
    expect(claims).toHaveLength(1);
    expect(claims[0].moveRefPly).toBe(11);
  });

  it("ignores non-integer or non-positive moveRefPly", () => {
    const raw = [
      { kind: "attack", pieceColor: "w", targetSquare: "h7", moveRefPly: 0, rawText: "x" },
      { kind: "attack", pieceColor: "w", targetSquare: "h7", moveRefPly: -1, rawText: "y" },
      { kind: "attack", pieceColor: "w", targetSquare: "h7", moveRefPly: "11", rawText: "z" },
    ];
    const claims = __test.parseClaims(JSON.stringify(raw));
    expect(claims).toHaveLength(3);
    for (const c of claims) {
      expect(c.moveRefPly).toBeUndefined();
    }
  });
});

describe("extractor — isPastTenseClaim", () => {
  it("detects was/were + relational verb -ing patterns", () => {
    expect(__test.isPastTenseClaim("The d5 pawn was attacking the bishop on c4")).toBe(true);
    expect(__test.isPastTenseClaim("White was defending the e4 pawn")).toBe(true);
    expect(__test.isPastTenseClaim("The rook were threatening the queen")).toBe(true);
    expect(__test.isPastTenseClaim("Black was eyeing the h7 square")).toBe(true);
    expect(__test.isPastTenseClaim("was been targeting the king")).toBe(true);
  });

  it("does not flag present-tense or past-simple constructions", () => {
    expect(__test.isPastTenseClaim("The queen attacks h7")).toBe(false);
    expect(__test.isPastTenseClaim("The bishop defends d4")).toBe(false);
    expect(__test.isPastTenseClaim("6.Nxf7 forked queen and rook")).toBe(false);
    expect(__test.isPastTenseClaim("the rook is attacking g2")).toBe(false);
    expect(__test.isPastTenseClaim("you played 5...Nxg5 winning a piece")).toBe(false);
  });
});

describe("extractor — filterClaims (past-tense + stale-presence)", () => {
  it("drops past-tense attack claim without moveRefPly", () => {
    const c: RelationalClaim = {
      kind: "attack",
      pieceColor: "b",
      targetSquare: "c4",
      rawText: "The d5 pawn was attacking the bishop on c4",
    };
    expect(__test.filterClaims([c], SCOTCH_FINAL)).toHaveLength(0);
  });

  it("keeps a past-tense attack claim that has moveRefPly", () => {
    const c: RelationalClaim = {
      kind: "attack",
      pieceColor: "b",
      targetSquare: "c4",
      moveRefPly: 9,
      rawText: "The d5 pawn was attacking the bishop on c4",
    };
    expect(__test.filterClaims([c], SCOTCH_FINAL)).toHaveLength(1);
  });

  it("drops presence claim for a piece absent from the current FEN (stale reference)", () => {
    // c4 holds a black pawn in SCOTCH_FINAL, not a black bishop.
    const c: RelationalClaim = {
      kind: "presence",
      targetSquare: "c4",
      expectedPiece: { type: "b", color: "b" },
      rawText: "the bishop on c4",
    };
    expect(__test.filterClaims([c], SCOTCH_FINAL)).toHaveLength(0);
  });

  it("keeps a presence claim for a piece that IS in the current FEN", () => {
    // c5 holds the black bishop in SCOTCH_FINAL.
    const c: RelationalClaim = {
      kind: "presence",
      targetSquare: "c5",
      expectedPiece: { type: "b", color: "b" },
      rawText: "the bishop on c5",
    };
    expect(__test.filterClaims([c], SCOTCH_FINAL)).toHaveLength(1);
  });

  it("keeps a stale presence claim that has moveRefPly (ply-anchored historical reference)", () => {
    const c: RelationalClaim = {
      kind: "presence",
      targetSquare: "c4",
      expectedPiece: { type: "b", color: "w" },
      moveRefPly: 4,
      rawText: "the white bishop was on c4 at move 4",
    };
    expect(__test.filterClaims([c], SCOTCH_FINAL)).toHaveLength(1);
  });

  it("keeps a present-tense claim regardless of FEN mismatch on other squares", () => {
    const c: RelationalClaim = {
      kind: "attack",
      pieceColor: "b",
      targetSquare: "h8",
      rawText: "The g7 pawn attacks the rook on h8",
    };
    // g7 has a white pawn (uppercase P), h8 has a black rook — "attacks" not past-tense → kept.
    expect(__test.filterClaims([c], SCOTCH_FINAL)).toHaveLength(1);
  });

  it("drops attack claim with fromSquare empty in final FEN (historical narration, no ply anchor)", () => {
    // d5 is empty in SCOTCH_FINAL — historical "d5 pawn attacked c4" should be filtered.
    const c: RelationalClaim = {
      kind: "attack",
      pieceColor: "b",
      fromSquare: "d5",
      targetSquare: "c4",
      rawText: "The bishop on c4 is hanging — attacked by the d5 pawn",
    };
    expect(__test.filterClaims([c], SCOTCH_FINAL)).toHaveLength(0);
  });

  it("keeps attack claim with fromSquare occupied in the final FEN", () => {
    // d1 holds the white queen in SCOTCH_FINAL — present-tense claim is verifiable.
    const c: RelationalClaim = {
      kind: "attack",
      pieceColor: "w",
      fromSquare: "d1",
      targetSquare: "d4",
      rawText: "White's queen on d1 eyes d4",
    };
    expect(__test.filterClaims([c], SCOTCH_FINAL)).toHaveLength(1);
  });

  it("keeps attack claim with empty fromSquare when moveRefPly is set (ply-anchored historical reference)", () => {
    // d5 is empty in final FEN, but moveRefPly anchors the claim to ply 7 where a pawn was there.
    const c: RelationalClaim = {
      kind: "attack",
      pieceColor: "b",
      fromSquare: "d5",
      targetSquare: "c4",
      moveRefPly: 7,
      rawText: "at move 7, the d5 pawn attacked the bishop on c4",
    };
    expect(__test.filterClaims([c], SCOTCH_FINAL)).toHaveLength(1);
  });
});
