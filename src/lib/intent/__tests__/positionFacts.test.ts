import { describe, it, expect } from "vitest";
import { buildPositionFacts, isTemptingReply, didCaptureThreatPiece } from "../positionFacts";
import { PIECE_VALUE_CP } from "@/lib/tactics/utils";

/**
 * Fixtures are real positions from Lazer_Wizard's games wherever possible, plus
 * Philidor's legacy, because the queen sacrifice is the case that breaks any
 * design that ranks moves by material.
 */

// Philidor's legacy after Nh6+ Kh8. Qg8+ throws the queen for a rook and mates.
const SMOTHERED = "5r1k/6pp/7N/8/8/1Q6/6PP/6K1 w - - 0 1";
// game_01 move 10 Black: Bxd1 wins the white queen.
const WINS_QUEEN = "r2k1bnr/ppp2ppp/2nP4/1N6/2B1q3/4BbP1/PPP2P1P/R2QK2R b KQ - 0 10";
// game_02 move 17 Black: Bxg3, the bait.
const BAIT = "2r2rk1/p1q2p1p/6p1/8/Q7/2P1P1P1/PP1P1P1b/R1B1K2R b KQ - 0 17";
// game_02 move 23 Black: h5. The pawn is attacked before AND after — not an escape.
const H5 = "5rk1/p4p1p/6p1/2r5/5Q2/2P1P1K1/PP1Pq3/R1B4R b - - 9 23";

describe("buildPositionFacts", () => {
  it("reads a queen sacrifice as material-NEGATIVE even though it captures nothing", () => {
    // Philidor's legacy. Qg8+ takes NOTHING — it puts the queen on an empty
    // square where the rook must take it. A capture-based measure sees zero.
    const f = buildPositionFacts(SMOTHERED, "Qg8+")!;
    expect(f.capturedCp).toBe(0);
    // -720, not -900: the exchange runs Qg8+ Rxg8 Nxg8 Kxg8, so White wins the
    // rook back before losing the knight. The engine meanwhile scores this
    // mate in 2 — that divergence between material and evaluation is exactly
    // what the purpose ranking exists to resolve.
    expect(f.materialSwingCp).toBe(-720);
    expect(f.givesCheck).toBe(true);
  });

  it("CONTROL: a genuine material win reads positive", () => {
    const f = buildPositionFacts(WINS_QUEEN, "Bxd1")!;
    expect(f.capturedCp).toBe(900);
    expect(f.materialSwingCp).toBeGreaterThan(0);
  });

  it("does not call a move an escape when the piece is still attacked after", () => {
    const f = buildPositionFacts(H5, "h5")!;
    expect(f.escapedAttack).toBe(false);
  });

  it("returns null for a move that is not legal in the position", () => {
    expect(buildPositionFacts(H5, "Qxh8")).toBeNull();
  });

  // ── recaptures are priced across BOTH plies ──────────────────────────────
  // Suppressing every recapture was the first fix for "50 of 59 recaptures
  // carded as material wins". An adversarial audit rated the result CRITICAL:
  // taking a queen back was reported as nothing at all, and the position was
  // then carded as quiet.

  it("prices an EVEN recapture at zero rather than at what it took", () => {
    // 1.e4 d5 2.exd5 Qxd5: Black takes the pawn back. capturedCp is 100, but
    // the net across both plies is 0 and that is what the coach must see.
    const fen = "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2";
    const f = buildPositionFacts(fen, "Qxd5", "d5", PIECE_VALUE_CP.p)!;
    expect(f.isRecapture).toBe(true);
    expect(f.capturedCp).toBe(100);
    expect(f.recaptureNetCp).toBe(0);
  });

  it("prices a recapture that WINS material at what it actually won", () => {
    // Black has just played ...Qxd4, taking a pawn and hanging the queen on an
    // undefended square. Nxd4 takes a whole queen for a pawn: net +800.
    const fen = "r3k2r/ppp2ppp/5n2/8/3q4/5N2/PPP2PPP/R1BQ1RK1 w kq - 0 1";
    const f = buildPositionFacts(fen, "Nxd4", "d4", PIECE_VALUE_CP.p)!;
    expect(f.isRecapture).toBe(true);
    expect(f.capturedCp).toBe(900);
    expect(f.recaptureNetCp).toBe(800);
  });

  it("declines to price a recapture when the previous capture's value is unknown", () => {
    const fen = "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2";
    const f = buildPositionFacts(fen, "Qxd5", "d5")!;
    expect(f.isRecapture).toBe(true);
    expect(f.recaptureNetCp).toBeNull();
  });

  it("does not let the enemy KING outrank a promoting pawn as recapturer", () => {
    // valueOf() maps the king to 0 so a king is never counted as material won.
    // Reused as a sort key it made the king the CHEAPEST attacker, so a king
    // recapture was always modelled over a pawn that captures and promotes —
    // and the promotion tie-break, guarded by an exact-value tie, never ran.
    // Rxc8 takes a queen but allows bxc8=Q: it loses 400cp, and the module
    // reported it as WINNING 400cp.
    const fen = "2Q5/1P1K1ppk/8/8/8/8/r4PPP/2r5 b - - 0 1";
    const f = buildPositionFacts(fen, "Rxc8")!;
    expect(f.capturedCp).toBe(900);
    expect(f.materialSwingCp).toBe(-400);
  });

  it("CONTROL: with the enemy king off the square, the same capture still reads -400", () => {
    // Isolates the mechanism. Identical capture and identical promoting pawn;
    // the only difference is whether the king is among the attackers. Both must
    // now agree, which is what proves the king was the cause.
    const fen = "2Q5/1P3pp1/7k/8/8/8/r4PPP/2r4K b - - 0 1";
    const f = buildPositionFacts(fen, "Rxc8")!;
    expect(f.materialSwingCp).toBe(-400);
  });

  it("reports check without requiring a capture", () => {
    const f = buildPositionFacts("4k3/8/8/8/8/8/8/4K2R w K - 0 1", "Rh8+")!;
    expect(f.givesCheck).toBe(true);
    expect(f.capturedCp).toBe(0);
  });
});

describe("isTemptingReply", () => {
  it("a capture that looks free is tempting — the bait in game_02", () => {
    // After Bxg3, fxg3 grabs a whole bishop. It is also a 447cp error.
    const afterBait = "2r2rk1/p1q2p1p/6p1/8/Q7/2P1P1b1/PP1P1P2/R1B1K2R w KQ - 0 18";
    expect(isTemptingReply(afterBait, "fxg3")).toBe(true);
  });

  it("a quiet developing move is not tempting", () => {
    expect(isTemptingReply("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "Nf3")).toBe(false);
  });

  it("a check is tempting even with nothing captured", () => {
    expect(isTemptingReply("4k3/8/8/8/8/8/8/4K2R w K - 0 1", "Rh8+")).toBe(true);
  });

  it("is false for an illegal move rather than throwing", () => {
    expect(isTemptingReply(BAIT, "Qxh8")).toBe(false);
  });
});
