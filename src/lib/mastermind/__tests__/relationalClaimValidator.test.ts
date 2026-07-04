/**
 * Unit tests for the relational-claim validator (Lever 2, Phase 2).
 *
 * Strategy: mock the parseCall so no network calls are made; test that the
 * validator correctly maps "contradicted" → issue, "holds"/"unverifiable" → pass.
 * Also tests the __test.parseClaims / coerceClaim parser directly.
 */
import { describe, it, expect } from "vitest";
import {
  validateRelationalClaim,
  __test,
  type RelationalClaimOpts,
} from "@/lib/mastermind/validators/relationalClaim";
import type { ParserCall } from "@/lib/mastermind/validators/evalClaim";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const { parseClaims, coerceClaim } = __test;

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Position after 1.e4 e5 2.Nf3 Nc6 3.Bc4 (Italian Game).
// White Ng1 has moved to f3; Bc4 is on c4. Used for attack/pin tests.
const ITALIAN_FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

function makeParseCall(jsonPayload: string): ParserCall {
  return async () => ({ raw: jsonPayload, costUsd: 0.001 });
}

function throwingParseCall(): ParserCall {
  return async () => {
    throw new Error("network error");
  };
}

const BASE_OPTS = {
  correlationId: "test-corr-id",
} as const;

// ---------------------------------------------------------------------------
// parseClaims / coerceClaim unit tests
// ---------------------------------------------------------------------------

describe("parseClaims", () => {
  it("parses a valid attack claim from JSON", () => {
    const claims = parseClaims(
      JSON.stringify([
        {
          kind: "attack",
          pieceColor: "w",
          pieceType: "n",
          fromSquare: "f3",
          targetSquare: "e5",
          rawText: "knight on f3 attacks e5",
        },
      ]),
    );
    expect(claims).toHaveLength(1);
    expect(claims[0].kind).toBe("attack");
    expect(claims[0].fromSquare).toBe("f3");
    expect(claims[0].targetSquare).toBe("e5");
  });

  it("strips ```json fences if present", () => {
    const claims = parseClaims(
      "```json\n" +
        JSON.stringify([
          { kind: "presence", targetSquare: "e4", expectedPiece: { type: "p", color: "w" }, rawText: "pawn on e4" },
        ]) +
        "\n```",
    );
    expect(claims).toHaveLength(1);
    expect(claims[0].kind).toBe("presence");
  });

  it("returns [] for invalid JSON", () => {
    expect(parseClaims("not json")).toEqual([]);
    expect(parseClaims("")).toEqual([]);
  });

  it("returns [] for an empty array", () => {
    expect(parseClaims("[]")).toEqual([]);
  });
});

describe("coerceClaim", () => {
  it("rejects claims with unknown kind", () => {
    expect(coerceClaim({ kind: "threatens", targetSquare: "e5", pieceColor: "w", rawText: "" })).toBeNull();
  });

  it("drops attack claim with no targetSquare", () => {
    expect(coerceClaim({ kind: "attack", pieceColor: "w", rawText: "x" })).toBeNull();
  });

  it("drops attack claim with no pieceColor", () => {
    expect(coerceClaim({ kind: "attack", targetSquare: "e5", rawText: "x" })).toBeNull();
  });

  it("drops self-referential attack claim (fromSquare === targetSquare)", () => {
    expect(
      coerceClaim({ kind: "attack", pieceColor: "w", fromSquare: "e4", targetSquare: "e4", rawText: "pawn on e4" }),
    ).toBeNull();
  });

  it("drops pin claim with no targetSquare", () => {
    expect(coerceClaim({ kind: "pin", pieceColor: "w", rawText: "x" })).toBeNull();
  });

  it("accepts valid pin claim with pinnedToSquare", () => {
    const claim = coerceClaim({
      kind: "pin",
      pieceColor: "w",
      fromSquare: "c4",
      targetSquare: "f7",
      pinnedToSquare: "e8",
      rawText: "Bc4 pins Nf7 to the king",
    });
    expect(claim).not.toBeNull();
    expect(claim?.pinnedToSquare).toBe("e8");
  });

  it("accepts valid line claim", () => {
    const claim = coerceClaim({ kind: "line", line: ["e4", "e5"], rawText: "1.e4 e5" });
    expect(claim).not.toBeNull();
    expect(claim?.line).toEqual(["e4", "e5"]);
  });

  it("drops line claim with empty line array", () => {
    expect(coerceClaim({ kind: "line", line: [], rawText: "x" })).toBeNull();
  });

  it("drops presence claim missing expectedPiece", () => {
    expect(coerceClaim({ kind: "presence", targetSquare: "e4", rawText: "x" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateRelationalClaim integration tests (mocked parseCall)
// ---------------------------------------------------------------------------

describe("validateRelationalClaim", () => {
  it("passes when fen is absent (no-op)", async () => {
    const result = await validateRelationalClaim({
      ...BASE_OPTS,
      llmResponse: "The queen attacks e5",
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.costUsd).toBe(0);
    expect(result.telemetry[0].fire_reason).toBe("no_fen_to_verify");
  });

  it("passes when parseCall throws (infra error → pass-through)", async () => {
    const result = await validateRelationalClaim({
      ...BASE_OPTS,
      fen: STARTING_FEN,
      llmResponse: "something",
      parseCall: throwingParseCall(),
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.telemetry[0].fire_reason).toBe("parser_json_invalid");
  });

  it("passes when extractor returns [] (no claims to check)", async () => {
    const result = await validateRelationalClaim({
      ...BASE_OPTS,
      fen: STARTING_FEN,
      llmResponse: "White has a nice position.",
      parseCall: makeParseCall("[]"),
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.telemetry[0].fire_reason).toBe("passed");
  });

  it("passes for a 'holds' attack claim — Nf3 attacks e5 in Italian", async () => {
    const claimsJson = JSON.stringify([
      {
        kind: "attack",
        pieceColor: "w",
        pieceType: "n",
        fromSquare: "f3",
        targetSquare: "e5",
        rawText: "the knight on f3 attacks e5",
      },
    ]);
    const result = await validateRelationalClaim({
      ...BASE_OPTS,
      fen: ITALIAN_FEN,
      llmResponse: "The knight on f3 attacks e5.",
      parseCall: makeParseCall(claimsJson),
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.telemetry[0].fire_reason).toBe("passed");
  });

  it("fires issue for 'contradicted' attack — Ke1 cannot attack e8 in starting position", async () => {
    const claimsJson = JSON.stringify([
      {
        kind: "attack",
        pieceColor: "w",
        pieceType: "k",
        fromSquare: "e1",
        targetSquare: "e8",
        rawText: "the king on e1 attacks e8",
      },
    ]);
    const result = await validateRelationalClaim({
      ...BASE_OPTS,
      fen: STARTING_FEN,
      llmResponse: "the king on e1 attacks e8",
      parseCall: makeParseCall(claimsJson),
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].check_name).toBe("relational_claim_contradicted");
    expect(result.issues[0].severity).toBe("error");
    expect(result.issues[0].llm_span).toBe("the king on e1 attacks e8");
    expect(result.telemetry[0].fire_reason).toBe("relational_claim_contradicted");
    expect(result.costUsd).toBe(0.001);
  });

  it("fires one issue per contradicted claim; holds claims do not fire", async () => {
    // Nf3 attacks e5 (holds) and Ke1 attacks e8 (contradicted) in Italian FEN.
    const claimsJson = JSON.stringify([
      {
        kind: "attack",
        pieceColor: "w",
        pieceType: "n",
        fromSquare: "f3",
        targetSquare: "e5",
        rawText: "Nf3 attacks e5",
      },
      {
        kind: "attack",
        pieceColor: "w",
        pieceType: "k",
        fromSquare: "e1",
        targetSquare: "e8",
        rawText: "king attacks e8",
      },
    ]);
    const result = await validateRelationalClaim({
      ...BASE_OPTS,
      fen: ITALIAN_FEN,
      llmResponse: "Nf3 attacks e5 and king attacks e8",
      parseCall: makeParseCall(claimsJson),
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].llm_span).toBe("king attacks e8");
  });

  it("passes for 'unverifiable' pin claim (no pinnedToSquare) — not a contradiction", async () => {
    const claimsJson = JSON.stringify([
      {
        kind: "pin",
        pieceColor: "w",
        fromSquare: "c4",
        targetSquare: "f7",
        // pinnedToSquare intentionally absent
        rawText: "Bc4 pins f7",
      },
    ]);
    const result = await validateRelationalClaim({
      ...BASE_OPTS,
      fen: ITALIAN_FEN,
      llmResponse: "Bc4 pins f7",
      parseCall: makeParseCall(claimsJson),
    });
    // Pin is partially unverifiable without pinnedToSquare — must NOT fire an issue.
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("fires issue for presence claim with wrong piece", async () => {
    // Starting FEN: e1 holds a white king, not a queen.
    const claimsJson = JSON.stringify([
      {
        kind: "presence",
        targetSquare: "e1",
        expectedPiece: { type: "q", color: "w" },
        rawText: "the queen is on e1",
      },
    ]);
    const result = await validateRelationalClaim({
      ...BASE_OPTS,
      fen: STARTING_FEN,
      llmResponse: "the queen is on e1",
      parseCall: makeParseCall(claimsJson),
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].check_name).toBe("relational_claim_contradicted");
  });

  it("passes for a valid legal line claim", async () => {
    const claimsJson = JSON.stringify([
      {
        kind: "line",
        line: ["e4", "e5", "Nf3"],
        rawText: "after 1.e4 e5 2.Nf3",
      },
    ]);
    const result = await validateRelationalClaim({
      ...BASE_OPTS,
      fen: STARTING_FEN,
      llmResponse: "after 1.e4 e5 2.Nf3",
      parseCall: makeParseCall(claimsJson),
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("fires issue for an illegal line claim", async () => {
    const claimsJson = JSON.stringify([
      {
        kind: "line",
        line: ["e4", "e5", "Qh8+"], // Qh8 is illegal in starting position
        rawText: "after 1.e4 e5 Qh8+",
      },
    ]);
    const result = await validateRelationalClaim({
      ...BASE_OPTS,
      fen: STARTING_FEN,
      llmResponse: "after 1.e4 e5 Qh8+",
      parseCall: makeParseCall(claimsJson),
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(1);
  });

  // ─── fenMap (Task 10 position-anchoring fix) ────────────────────────────

  it("uses fenMap[ply] when claim has moveRefPly — verifies against historical FEN", async () => {
    // Starting FEN: Nf3 has NOT moved yet (it's on g1). In Italian FEN it has.
    // The claim says Nf3 attacks e5. If we verify against STARTING_FEN it
    // contradicts (Ng1 can't attack e5); if against ITALIAN_FEN it holds.
    // moveRefPly=7 → Italian FEN; primary fen=STARTING_FEN.
    const claimsJson = JSON.stringify([
      {
        kind: "attack",
        pieceColor: "w",
        pieceType: "n",
        fromSquare: "f3",
        targetSquare: "e5",
        moveRefPly: 7,
        rawText: "the knight on f3 attacks e5",
      },
    ]);
    const result = await validateRelationalClaim({
      ...BASE_OPTS,
      fen: STARTING_FEN,          // primary FEN (wrong ply)
      fenMap: { 7: ITALIAN_FEN }, // correct FEN for ply 7
      llmResponse: "After move 4 the knight on f3 attacks e5.",
      parseCall: makeParseCall(claimsJson),
    });
    // fenMap resolves the claim to Italian FEN → Nf3 DOES attack e5 → holds
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("falls back to opts.fen when moveRefPly not in fenMap", async () => {
    // Claim has moveRefPly=99 (not in fenMap) → falls back to opts.fen = ITALIAN_FEN
    // In Italian FEN, Nf3 attacks e5 → holds.
    const claimsJson = JSON.stringify([
      {
        kind: "attack",
        pieceColor: "w",
        pieceType: "n",
        fromSquare: "f3",
        targetSquare: "e5",
        moveRefPly: 99,
        rawText: "the knight on f3 attacks e5",
      },
    ]);
    const result = await validateRelationalClaim({
      ...BASE_OPTS,
      fen: ITALIAN_FEN,
      fenMap: { 5: STARTING_FEN }, // ply 99 not in map → falls back to ITALIAN_FEN
      llmResponse: "the knight on f3 attacks e5",
      parseCall: makeParseCall(claimsJson),
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("contradicts when claim is wrong even with correct fenMap FEN", async () => {
    // Even with the right FEN, Qb3 cannot attack a5 → contradicted.
    // Evans gambit position after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.b4 Bxb4 5.c3 Ba5
    const EVANS_FEN = "r1bqk1nr/pppp1ppp/2n5/b3p3/2B1P3/2P2N2/P2P1PPP/RNBQK2R w KQkq - 1 6";
    const claimsJson = JSON.stringify([
      {
        kind: "attack",
        pieceColor: "w",
        pieceType: "q",
        fromSquare: "b3",
        targetSquare: "a5",
        moveRefPly: 10,
        rawText: "Qb3 hits the bishop on a5",
      },
    ]);
    const result = await validateRelationalClaim({
      ...BASE_OPTS,
      fen: STARTING_FEN,            // wrong primary FEN
      fenMap: { 10: EVANS_FEN },    // Evans position at ply 10
      llmResponse: "Qb3 hits the bishop on a5",
      parseCall: makeParseCall(claimsJson),
    });
    // Qb3→a5 is not a valid queen move — contradicted
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].check_name).toBe("relational_claim_contradicted");
  });
});
