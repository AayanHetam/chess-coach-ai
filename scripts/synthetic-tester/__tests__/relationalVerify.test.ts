import { describe, it, expect } from "vitest";
import { verifyRelationalClaim, describePosition, type RelationalClaim } from "../relationalVerify";

// White queen on d1, black bishop on h7. Qd1 does NOT attack h7 (no line d1->h7).
const QUEEN_CANNOT_REACH = "4k3/7b/8/8/8/8/8/3QK3 w - - 0 1";
// White queen on d3, clear diagonal d3-e4-f5-g6-h7 to the black bishop on h7.
const QUEEN_CAN_REACH = "4k3/7b/8/8/8/3Q4/8/4K3 w - - 0 1";
// Black king g8 defends the black bishop on h7.
const BISHOP_DEFENDED = "6k1/7b/8/8/8/8/8/4K3 w - - 0 1";
const STARTPOS = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Pin test positions (all have both kings):
// Black bishop on b4, white knight on c3, white king on e1, black king on h8.
// b4→c3→d2→e1 diagonal: removing Nc3 exposes Ke1 to Bb4 → real absolute pin.
const PIN_BISHOP_REAL = "7k/8/8/8/1b6/2N5/8/4K3 w - - 0 1";
// White rook on c1, black queen on c5, black king on c8, white king on e1.
// Rc1 attacks c-file; removing Qc5 exposes Kc8 → real pin.
const PIN_ROOK_REAL = "2k5/8/8/2q5/8/8/8/2R1K3 w - - 0 1";
// Black bishop on b4, white pawn on d4 (NOT on b4 diagonal), white knight on c3, kings.
// b4 diagonal goes a3/c3/d2/e1 and a5/c5/d6/e7/f8 — d4 is not on either diagonal.
const PIN_NOT_ALIGNED = "7k/8/8/8/1b1P4/2N5/8/4K3 w - - 0 1";
// Black bishop on b4, white knight on c3, white king on a1 (NOT e1), black king on h8.
// Removing c3 exposes e1 — but e1 is empty in this position → "no piece behind pin".
const PIN_NO_BEHIND_PIECE = "7k/8/8/8/1b6/2N5/8/K7 w - - 0 1";

describe("verifyRelationalClaim — the canonical hallucination", () => {
  it("CONTRADICTS 'the white queen can capture the bishop on h7' when the queen can't reach it", () => {
    const claim: RelationalClaim = {
      kind: "capture",
      pieceType: "q",
      pieceColor: "w",
      targetSquare: "h7",
      rawText: "Bad idea — the queen can just capture the bishop on h7.",
    };
    expect(verifyRelationalClaim(claim, QUEEN_CANNOT_REACH).verdict).toBe("contradicted");
  });

  it("HOLDS the same claim when the queen genuinely attacks h7", () => {
    const claim: RelationalClaim = {
      kind: "capture",
      pieceType: "q",
      pieceColor: "w",
      targetSquare: "h7",
      rawText: "The queen can capture the bishop on h7.",
    };
    expect(verifyRelationalClaim(claim, QUEEN_CAN_REACH).verdict).toBe("holds");
  });
});

describe("verifyRelationalClaim — attack vs capture", () => {
  it("attack holds (turn-independent) even though it's not that side's move", () => {
    const claim: RelationalClaim = { kind: "attack", pieceColor: "w", targetSquare: "h7", rawText: "" };
    expect(verifyRelationalClaim(claim, QUEEN_CAN_REACH).verdict).toBe("holds");
  });
  it("capture is contradicted when the target square is empty", () => {
    const claim: RelationalClaim = { kind: "capture", pieceColor: "w", targetSquare: "h6", rawText: "" };
    expect(verifyRelationalClaim(claim, QUEEN_CAN_REACH).verdict).toBe("contradicted");
  });
});

describe("verifyRelationalClaim — presence", () => {
  it("holds when the named piece is on the square", () => {
    const claim: RelationalClaim = {
      kind: "presence",
      targetSquare: "h7",
      expectedPiece: { type: "b", color: "b" },
      rawText: "",
    };
    expect(verifyRelationalClaim(claim, QUEEN_CANNOT_REACH).verdict).toBe("holds");
  });
  it("contradicts a piece claimed on an empty square", () => {
    const claim: RelationalClaim = {
      kind: "presence",
      targetSquare: "a4",
      expectedPiece: { type: "n", color: "w" },
      rawText: "",
    };
    expect(verifyRelationalClaim(claim, QUEEN_CANNOT_REACH).verdict).toBe("contradicted");
  });
});

describe("verifyRelationalClaim — defense", () => {
  it("holds when a friendly piece defends the occupant", () => {
    const claim: RelationalClaim = { kind: "defense", pieceColor: "b", targetSquare: "h7", rawText: "" };
    expect(verifyRelationalClaim(claim, BISHOP_DEFENDED).verdict).toBe("holds");
  });
  it("contradicts a defense claim when the piece is hanging", () => {
    const claim: RelationalClaim = { kind: "defense", pieceColor: "b", targetSquare: "h7", rawText: "" };
    expect(verifyRelationalClaim(claim, QUEEN_CANNOT_REACH).verdict).toBe("contradicted");
  });
});

describe("verifyRelationalClaim — line legality", () => {
  it("holds for a legal forcing line (Scholar's mate)", () => {
    const claim: RelationalClaim = {
      kind: "line",
      line: ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"],
      rawText: "",
    };
    expect(verifyRelationalClaim(claim, STARTPOS).verdict).toBe("holds");
  });
  it("contradicts an illegal line", () => {
    const claim: RelationalClaim = { kind: "line", line: ["e4", "e4"], rawText: "" };
    expect(verifyRelationalClaim(claim, STARTPOS).verdict).toBe("contradicted");
  });
});

describe("verifyRelationalClaim — position anchoring (precedingLine)", () => {
  it("checks a relation against the position AFTER the preceding line, not the root", () => {
    // At the root (startpos) the f1 bishop attacks nothing past e2/d3 (blocked).
    const rootClaim: RelationalClaim = { kind: "attack", pieceColor: "w", fromSquare: "f1", targetSquare: "a6", rawText: "" };
    expect(verifyRelationalClaim(rootClaim, STARTPOS).verdict).toBe("contradicted");
    // After 1.e4, the f1 bishop's diagonal f1-a6 opens up.
    const linedClaim: RelationalClaim = { ...rootClaim, precedingLine: ["e4"] };
    expect(verifyRelationalClaim(linedClaim, STARTPOS).verdict).toBe("holds");
  });

  it("contradicts a claim whose preceding line is itself illegal", () => {
    const claim: RelationalClaim = {
      kind: "attack",
      pieceColor: "w",
      targetSquare: "h7",
      precedingLine: ["Qh5"], // illegal as the first move from startpos
      rawText: "",
    };
    expect(verifyRelationalClaim(claim, STARTPOS).verdict).toBe("contradicted");
  });
});

describe("verifyRelationalClaim — pin (task 2)", () => {
  it("HOLDS a real diagonal absolute pin: Bb4 (black) pins Nc3 to Ke1", () => {
    // b4→c3→d2→e1 diagonal. Removing Nc3 exposes Ke1.
    const claim: RelationalClaim = {
      kind: "pin",
      pieceColor: "b",
      pieceType: "b",
      fromSquare: "b4",
      targetSquare: "c3",
      pinnedToSquare: "e1",
      rawText: "The bishop on b4 pins the knight on c3 to the king on e1.",
    };
    expect(verifyRelationalClaim(claim, PIN_BISHOP_REAL).verdict).toBe("holds");
  });

  it("HOLDS a real rook pin on the c-file: Rc1 pins Qc5 to Kc8", () => {
    const claim: RelationalClaim = {
      kind: "pin",
      pieceColor: "w",
      pieceType: "r",
      fromSquare: "c1",
      targetSquare: "c5",
      pinnedToSquare: "c8",
      rawText: "The rook on c1 pins the queen on c5 to the king on c8.",
    };
    expect(verifyRelationalClaim(claim, PIN_ROOK_REAL).verdict).toBe("holds");
  });

  it("CONTRADICTS a pin where the pinner does not attack the claimed pinned square", () => {
    // Bishop on b4 does NOT attack d4 (rank move, not diagonal).
    const claim: RelationalClaim = {
      kind: "pin",
      pieceColor: "b",
      fromSquare: "b4",
      targetSquare: "d4", // has a white pawn in PIN_NOT_ALIGNED, but b4 bishop can't attack d4
      pinnedToSquare: "e1",
      rawText: "The bishop on b4 pins the pawn on d4.",
    };
    expect(verifyRelationalClaim(claim, PIN_NOT_ALIGNED).verdict).toBe("contradicted");
  });

  it("CONTRADICTS a pin where removing the pinned piece does NOT expose the claimed target (x-ray fails)", () => {
    // Bishop b4 pins Nc3, but pinnedToSquare=e8 is not behind c3 from b4's diagonal.
    // b4→c3→d2→e1 diagonal. e8 is not on this line.
    const claim: RelationalClaim = {
      kind: "pin",
      pieceColor: "b",
      fromSquare: "b4",
      targetSquare: "c3",
      pinnedToSquare: "e8", // wrong: b4 x-ray through c3 goes to e1, not e8
      rawText: "The bishop on b4 pins the knight on c3 to the piece on e8.",
    };
    expect(verifyRelationalClaim(claim, PIN_BISHOP_REAL).verdict).toBe("contradicted");
  });

  it("returns UNVERIFIABLE when pinnedToSquare is absent (partial pin info)", () => {
    const claim: RelationalClaim = {
      kind: "pin",
      pieceColor: "b",
      fromSquare: "b4",
      targetSquare: "c3",
      // no pinnedToSquare — pinner attacks c3 but we can't confirm full pin
      rawText: "The bishop freezes the knight on c3.",
    };
    expect(verifyRelationalClaim(claim, PIN_BISHOP_REAL).verdict).toBe("unverifiable");
  });

  it("CONTRADICTS a pin on an empty target square", () => {
    // d2 is empty in PIN_BISHOP_REAL.
    const claim: RelationalClaim = {
      kind: "pin",
      pieceColor: "b",
      targetSquare: "d2",
      pinnedToSquare: "e1",
      rawText: "The bishop pins the piece on d2.",
    };
    expect(verifyRelationalClaim(claim, PIN_BISHOP_REAL).verdict).toBe("contradicted");
  });

  it("CONTRADICTS a pin where pinner and pinned piece are the same color", () => {
    // Claiming white bishop on b4 pins the white knight on c3 (same color — own piece can't be pinned by own piece).
    // In PIN_BISHOP_REAL, b4 has a BLACK bishop. pieceColor="w" will find no white piece on b4 → "pinner does not attack".
    const claim: RelationalClaim = {
      kind: "pin",
      pieceColor: "w", // claim white pinner...
      fromSquare: "b4", // ...but b4 has a black bishop → no white attacker → contradicted
      targetSquare: "c3",
      pinnedToSquare: "e1",
      rawText: "The white piece on b4 pins the knight on c3.",
    };
    expect(verifyRelationalClaim(claim, PIN_BISHOP_REAL).verdict).toBe("contradicted");
  });

  it("returns UNVERIFIABLE when missing required fields (no pieceColor)", () => {
    const claim: RelationalClaim = {
      kind: "pin",
      targetSquare: "c3",
      pinnedToSquare: "e1",
      rawText: "Something pins the knight.",
    };
    expect(verifyRelationalClaim(claim, PIN_BISHOP_REAL).verdict).toBe("unverifiable");
  });

  it("CONTRADICTS a pin where the behind square is empty (no piece to expose)", () => {
    // PIN_NO_BEHIND_PIECE: bishop b4, knight c3, but white king is on a1 (not e1) → e1 is empty.
    const claim: RelationalClaim = {
      kind: "pin",
      pieceColor: "b",
      fromSquare: "b4",
      targetSquare: "c3",
      pinnedToSquare: "e1", // empty in this position
      rawText: "The bishop pins the knight to the king on e1.",
    };
    expect(verifyRelationalClaim(claim, PIN_NO_BEHIND_PIECE).verdict).toBe("contradicted");
  });
});

describe("verifyRelationalClaim — battery handling (task 3)", () => {
  // White queen on b3, white bishop on c4 (blocks the queen's diagonal to f7),
  // white king on e1, black king on e8, black pawn on f7.
  // Bc4 attacks f7 directly; Qb3 is behind Bc4 on the same diagonal → battery.
  const BATTERY_Qb3_Bc4_f7 = "4k3/5p2/8/8/2B5/1Q6/8/4K3 w - - 0 1";

  // White queen on b3, black bishop on a5, white king on e1, black king on e8.
  // b3→a5 is (-1,+2) — not a rank/file/diagonal — so no chess line exists and
  // "Qb3 hits a5" remains a flat board-contradiction.
  const NO_LINE_Qb3_a5 = "4k3/8/8/b7/8/1Q6/8/4K3 w - - 0 1";

  // White rook on a1, white rook on a4 (blocks), black queen on a8, white king on e1, black king on e8.
  // "Ra1 attacks a8" — Ra4 is on the same file between a1 and a8 AND Ra4 attacks a8 → rook battery.
  const BATTERY_ROOK_FILE = "3qk3/8/8/8/R7/8/8/R3K3 w - - 0 1";

  // White queen on d4, white pawn on e5 (not a sliding piece — can't form a battery),
  // black king on h8, black pawn on f6. "Qd4 attacks f6" — Pe5 blocks but is not a slider.
  const PAWN_BLOCKS_NOT_BATTERY = "7k/8/5p2/4P3/3Q4/8/8/4K3 w - - 0 1";

  it("returns UNVERIFIABLE (not contradicted) for Qb3 claiming to hit f7 when Bc4 battery partner attacks f7", () => {
    const claim: RelationalClaim = {
      kind: "attack",
      pieceType: "q",
      pieceColor: "w",
      fromSquare: "b3",
      targetSquare: "f7",
      rawText: "Qb3 hits f7, threatening the pawn.",
    };
    expect(verifyRelationalClaim(claim, BATTERY_Qb3_Bc4_f7).verdict).toBe("unverifiable");
  });

  it("CONTRADICTS Qb3 claiming to hit a5 (no chess line from b3 to a5, no battery)", () => {
    const claim: RelationalClaim = {
      kind: "attack",
      pieceType: "q",
      pieceColor: "w",
      fromSquare: "b3",
      targetSquare: "a5",
      rawText: "Qb3 hits the bishop on a5.",
    };
    expect(verifyRelationalClaim(claim, NO_LINE_Qb3_a5).verdict).toBe("contradicted");
  });

  it("returns UNVERIFIABLE for Ra1 claiming to hit a8 when Ra4 battery partner attacks a8", () => {
    const claim: RelationalClaim = {
      kind: "attack",
      pieceType: "r",
      pieceColor: "w",
      fromSquare: "a1",
      targetSquare: "a8",
      rawText: "The rook on a1 attacks a8.",
    };
    expect(verifyRelationalClaim(claim, BATTERY_ROOK_FILE).verdict).toBe("unverifiable");
  });

  it("CONTRADICTS when a pawn blocks the queen — pawn is not a sliding piece so no battery exemption applies", () => {
    // In PAWN_BLOCKS_NOT_BATTERY: white queen on d4, white pawn on e5, black pawn on f6.
    // Pe5 is on the diagonal between d4 and f6 AND white pawn does attack f6 (diagonal capture),
    // but a pawn is NOT a sliding piece so findBatteryBlocker skips it → "contradicted" not "unverifiable".
    const claim: RelationalClaim = {
      kind: "attack",
      pieceType: "q",
      pieceColor: "w",
      fromSquare: "d4",
      targetSquare: "f6",
      rawText: "The queen attacks f6.",
    };
    expect(verifyRelationalClaim(claim, PAWN_BLOCKS_NOT_BATTERY).verdict).toBe("contradicted");
  });

  it("HOLDS when the queen directly attacks the target (no battery needed, no blocker)", () => {
    // Bc4 is on c4; queen on b3 — the Bc4 blocks f7 route, but queen directly attacks e6 (clear diagonal).
    // b3→c4 is one step, b3→e6: (1,2)→(4,5), delta (+3,+3), but c4=(2,3) is BETWEEN b3 and e6!
    // So use a clear attack: queen on d1 directly attacks h5 diagonal d1→e2→f3→g4→h5.
    // Use QUEEN_CAN_REACH from above (queen on d3, direct diagonal to h7).
    const claim: RelationalClaim = {
      kind: "attack",
      pieceType: "q",
      pieceColor: "w",
      fromSquare: "d3",
      targetSquare: "h7",
      rawText: "The queen attacks h7.",
    };
    expect(verifyRelationalClaim(claim, QUEEN_CAN_REACH).verdict).toBe("holds");
  });
});

describe("describePosition", () => {
  it("lists pieces by color with the side to move", () => {
    const desc = describePosition(QUEEN_CANNOT_REACH);
    expect(desc).toContain("White to move");
    expect(desc).toContain("Qd1");
    expect(desc).toContain("Bh7");
  });
});
