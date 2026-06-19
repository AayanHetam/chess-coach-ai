/**
 * GAP-A GUARDRAIL proof: Lever 2 never suppresses true relational claims.
 *
 * Acceptance criterion: "true-claim-suppression rate ≤ 5% on a curated
 * known-good-claims fixture set."
 *
 * Argument:
 *   Lever 2 fires (triggers coach regeneration) ONLY when verifyRelationalClaim
 *   returns "contradicted." If ALL chess.js-verified true claims return "holds,"
 *   Lever 2 can never suppress them → suppression rate = 0% < 5%.
 *
 * Every claim below is a ground-truth true relational fact, derived from
 * chess.js move generation and attackers() — NOT from LLM output. The set
 * covers every RelationKind (attack, capture, defense, presence, line, pin)
 * across four distinct positions spanning opening, middlegame, and tactical themes.
 */
import { describe, it, expect } from "vitest";
import { verifyRelationalClaim, type RelationalClaim } from "../relationalVerify";

// ---------------------------------------------------------------------------
// FEN fixtures (manually verified against chess.js)
// ---------------------------------------------------------------------------

/** Italian Game after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 */
const ITALIAN = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

/** Italian after 4.Nc3 (added White Nc3) */
const ITALIAN_NC3 = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5";

/** Italian + Bb4 pin: 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.Nc3 Nf6 5.d4 Bb4 */
const ITALIAN_BB4_PIN = "r1bqk2r/pppp1ppp/2n2n2/4p3/1bBPP3/2N2N2/PPP2PPP/R1BQK2R w KQkq - 2 6";

/** After 1.d4: white pawn on d4 attacks c5 and e5 */
const AFTER_D4 = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1";

// ---------------------------------------------------------------------------
// Curated known-good claims (ground-truth, chess.js-verifiable)
// ---------------------------------------------------------------------------

/**
 * Each entry is a triple of (position, human-readable description, claim).
 * Every claim is chess.js-verified true: attackers() confirms attacks/captures/defenses,
 * move generation confirms legality, board state confirms presence, x-ray confirms pins.
 */
const KNOWN_GOOD_CLAIMS: Array<{
  fen: string;
  desc: string;
  claim: RelationalClaim;
}> = [
  // ---- ATTACK claims -------------------------------------------------------
  {
    fen: ITALIAN,
    desc: "Bc4 attacks f7 (diagonal c4-d5-e6-f7, d5/e6 empty)",
    claim: {
      kind: "attack",
      fromSquare: "c4",
      pieceType: "b",
      pieceColor: "w",
      targetSquare: "f7",
      rawText: "the white bishop on c4 attacks f7",
    },
  },
  {
    fen: ITALIAN,
    desc: "Nf3 attacks e5 (knight move f3→e5)",
    claim: {
      kind: "attack",
      fromSquare: "f3",
      pieceType: "n",
      pieceColor: "w",
      targetSquare: "e5",
      rawText: "the white knight on f3 attacks e5",
    },
  },
  {
    fen: AFTER_D4,
    desc: "d4 pawn attacks c5 (white pawn attacks diagonally)",
    claim: {
      kind: "attack",
      fromSquare: "d4",
      pieceType: "p",
      pieceColor: "w",
      targetSquare: "c5",
      rawText: "white pawn on d4 attacks c5",
    },
  },
  {
    fen: AFTER_D4,
    desc: "d4 pawn attacks e5 (white pawn attacks diagonally)",
    claim: {
      kind: "attack",
      fromSquare: "d4",
      pieceType: "p",
      pieceColor: "w",
      targetSquare: "e5",
      rawText: "white pawn on d4 attacks e5",
    },
  },
  {
    fen: ITALIAN_NC3,
    desc: "Nc3 attacks e4 (knight move c3→e4, defends white pawn)",
    claim: {
      kind: "attack",
      fromSquare: "c3",
      pieceType: "n",
      pieceColor: "w",
      targetSquare: "e4",
      rawText: "the white knight on c3 attacks e4",
    },
  },
  // ---- CAPTURE claims -------------------------------------------------------
  {
    fen: ITALIAN,
    desc: "Bc4 can capture pawn on f7 (enemy black pawn, bishop attacks f7)",
    claim: {
      kind: "capture",
      fromSquare: "c4",
      pieceType: "b",
      pieceColor: "w",
      targetSquare: "f7",
      rawText: "the white bishop on c4 can capture f7",
    },
  },
  {
    fen: ITALIAN,
    desc: "Nf3 can capture pawn on e5 (enemy black pawn, legal knight move)",
    claim: {
      kind: "capture",
      fromSquare: "f3",
      pieceType: "n",
      pieceColor: "w",
      targetSquare: "e5",
      rawText: "white knight on f3 can take on e5",
    },
  },
  // ---- PRESENCE claims -----------------------------------------------------
  {
    fen: ITALIAN,
    desc: "white bishop is on c4",
    claim: {
      kind: "presence",
      targetSquare: "c4",
      expectedPiece: { type: "b", color: "w" },
      rawText: "white bishop on c4",
    },
  },
  {
    fen: ITALIAN,
    desc: "black knight is on c6",
    claim: {
      kind: "presence",
      targetSquare: "c6",
      expectedPiece: { type: "n", color: "b" },
      rawText: "black knight on c6",
    },
  },
  {
    fen: ITALIAN,
    desc: "black pawn is on e5",
    claim: {
      kind: "presence",
      targetSquare: "e5",
      expectedPiece: { type: "p", color: "b" },
      rawText: "black pawn on e5",
    },
  },
  {
    fen: ITALIAN_BB4_PIN,
    desc: "black bishop is on b4",
    claim: {
      kind: "presence",
      targetSquare: "b4",
      expectedPiece: { type: "b", color: "b" },
      rawText: "black bishop on b4",
    },
  },
  // ---- DEFENSE claims ------------------------------------------------------
  {
    fen: ITALIAN_NC3,
    desc: "white Nc3 defends pawn on e4 (Nc3 attacks e4, e4 has white pawn)",
    claim: {
      kind: "defense",
      fromSquare: "c3",
      pieceType: "n",
      pieceColor: "w",
      targetSquare: "e4",
      rawText: "white Nc3 defends the pawn on e4",
    },
  },
  // ---- PIN claims ----------------------------------------------------------
  {
    fen: ITALIAN_BB4_PIN,
    desc: "Bb4 pins Nc3 to Ke1 (x-ray: b4→c3→d2→e1, d2 empty)",
    claim: {
      kind: "pin",
      fromSquare: "b4",
      pieceType: "b",
      pieceColor: "b",
      targetSquare: "c3",
      pinnedToSquare: "e1",
      rawText: "the black bishop on b4 pins the white knight on c3 to the white king",
    },
  },
  // ---- LINE claims ---------------------------------------------------------
  {
    fen: ITALIAN,
    desc: "Ng5 is legal from Italian position",
    claim: {
      kind: "line",
      line: ["Ng5"],
      rawText: "White can play Ng5",
    },
  },
  {
    fen: ITALIAN,
    desc: "Nxe5 is legal — knight on f3 captures pawn on e5",
    claim: {
      kind: "line",
      line: ["Nxe5"],
      rawText: "White can play Nxe5 winning a pawn",
    },
  },
  {
    fen: ITALIAN,
    desc: "d3 is legal",
    claim: {
      kind: "line",
      line: ["d3"],
      rawText: "White can solidify with d3",
    },
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("relationalSuppression — GAP-A guardrail proof", () => {
  it("verifyRelationalClaim never returns 'contradicted' for chess.js-verified true claims", () => {
    const contradicted: string[] = [];
    for (const { fen, desc, claim } of KNOWN_GOOD_CLAIMS) {
      const result = verifyRelationalClaim(claim, fen);
      if (result.verdict === "contradicted") {
        contradicted.push(`[${desc}] → ${result.reason}`);
      }
    }
    // If any known-good claim is contradicted, Lever 2 would incorrectly
    // fire on coach text containing that claim and suppress it.
    expect(contradicted, "These true claims were incorrectly marked contradicted:\n" + contradicted.join("\n")).toEqual([]);
  });

  it("suppression rate is 0% — all claims pass through Lever 2 as holds or unverifiable", () => {
    let total = 0;
    let suppressed = 0;
    for (const { fen, claim } of KNOWN_GOOD_CLAIMS) {
      total++;
      if (verifyRelationalClaim(claim, fen).verdict === "contradicted") suppressed++;
    }
    const suppressionRate = suppressed / total;
    // Acceptance criterion: ≤ 5% suppression on this curated fixture set.
    expect(suppressionRate).toBeLessThanOrEqual(0.05);
    // The actual rate should be exactly 0% if all claims are correctly verified.
    expect(suppressed).toBe(0);
  });

  it("covers all RelationKind types (completeness check)", () => {
    const kinds = new Set(KNOWN_GOOD_CLAIMS.map((f) => f.claim.kind));
    expect(kinds.has("attack")).toBe(true);
    expect(kinds.has("capture")).toBe(true);
    expect(kinds.has("defense")).toBe(true);
    expect(kinds.has("presence")).toBe(true);
    expect(kinds.has("line")).toBe(true);
    expect(kinds.has("pin")).toBe(true);
  });

  it("has at least 15 curated known-good claims (adequate coverage)", () => {
    expect(KNOWN_GOOD_CLAIMS.length).toBeGreaterThanOrEqual(15);
  });
});
