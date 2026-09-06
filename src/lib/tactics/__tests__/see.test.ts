import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { see, attackersOf, cheapestCapture } from "../utils";

// Issue #350: the old swap-list see() had three defects — it priced the
// recapturing side's OWN piece as the gain, it never consumed the initial
// capturer from the attacker list (so one piece could capture twice), and its
// backward pass double-counted the alternation. Together they returned +320
// for a queen capturing a pawn-defended knight. These tests pin the corrected
// contract: signed net centipawns for `capturingColor` capturing on `target`,
// played out on real legal moves.

describe("see — static exchange on real legal moves (issue #350)", () => {
  it("prices QxN with a pawn recapture as losing (the issue's counterexample)", () => {
    // White Qe2 attacks the knight on e4; the black f5-pawn defends it.
    // Qxe4 wins 320, fxe4 loses the queen: net 320 − 900 = −580.
    const game = new Chess("6k1/6pp/8/5p2/4n3/8/4Q1P1/6K1 w - - 0 1");
    expect(see(game, "e4", "w")).toBe(320 - 900);
  });

  it("prices an even rook trade at exactly zero", () => {
    // Rxe8 wins 500, Raxe8 takes back 500.
    const game = new Chess("r3r1k1/8/8/8/8/8/8/4R1K1 w - - 0 1");
    expect(see(game, "e8", "w")).toBe(0);
  });

  it("keeps a genuinely free capture positive", () => {
    // The b6 pawn is undefended; Qxb6 is +100.
    const game = new Chess("6k1/8/1p6/8/8/1Q6/8/6K1 w - - 0 1");
    expect(see(game, "b6", "w")).toBe(100);
  });

  it("sees the second rook of a battery through the first (x-ray)", () => {
    // Rd2 and Rd1 doubled against the e6-pawn-defended knight on d5:
    // Rxd5 (+320), exd5 (−500), Rxd5 (+100) → net −80. The old attacker
    // scan stopped at the front rook and called this +320.
    const game = new Chess("6k1/8/4p3/3n4/8/8/3R4/3R2K1 w - - 0 1");
    expect(see(game, "d5", "w")).toBe(320 - 500 + 100);
  });

  it("returns 0 when the only capturer is absolutely pinned", () => {
    // Bd2 is the only piece attacking the knight on e3, but Bxe3 is illegal —
    // it exposes Ke1 to the a5-bishop. A capture that cannot be played wins
    // nothing. The old geometric scan called this a free knight.
    const game = new Chess("6k1/8/8/b7/8/4n3/3B4/4K3 w - - 0 1");
    expect(see(game, "e3", "w")).toBe(0);
  });

  it("never prices the king as winnable material", () => {
    const game = new Chess("6k1/6Q1/8/8/8/8/8/6K1 w - - 0 1");
    expect(see(game, "g8", "w")).toBe(0);
  });

  it("prices a capture-promotion by what the promotion is worth", () => {
    // bxa8=Q wins the rook AND turns a pawn into a queen: 500 + 800.
    const game = new Chess("r5k1/1P6/8/8/8/8/8/6K1 w - - 0 1");
    expect(see(game, "a8", "w")).toBe(500 + 800);
  });

  it("returns 0 for an empty target square", () => {
    const game = new Chess("6k1/8/8/8/8/8/4Q3/6K1 w - - 0 1");
    expect(see(game, "e5", "w")).toBe(0);
  });

  it("prices a declined recapture as declined, not as a forced loss", () => {
    // Rxd5 wins the pawn. Black's only recapture is Qxd5 — but then Rxd5 wins
    // the queen, so black declines and the exchange is exactly +100. Without
    // the decline floor the recursion charges black the queen anyway and
    // inflates the answer to +500.
    const game = new Chess("3q2k1/8/8/3p4/8/8/3R4/3R2K1 w - - 0 1");
    expect(see(game, "d5", "w")).toBe(100);
  });
});

describe("en passant — the one capture that lands off the captured square", () => {
  // Black has just played ...d7-d5 past White's e5 pawn; the FEN carries d6.
  const justDoubleStepped = "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2";

  it("attackersOf sees the e5 pawn as an attacker of d5, and cheapestCapture lands on d6", () => {
    const game = new Chess(justDoubleStepped);
    expect(attackersOf(game, "d5", "w")).toContainEqual({ square: "e5", piece: "p" });
    expect(cheapestCapture(game, "d5")).toMatchObject({ from: "e5", to: "d6", gained: 100 });
  });

  it("see prices the free en passant capture at +100 and a king recapture at 0", () => {
    expect(see(new Chess(justDoubleStepped), "d5", "w")).toBe(100);
    // Same, but the black king on c7 takes back on d6.
    expect(see(new Chess("8/2k5/8/3pP3/8/8/8/4K3 w - d6 0 2"), "d5", "w")).toBe(0);
  });

  it("without the en passant right the pawns do not attack each other", () => {
    const game = new Chess("4k3/8/8/3pP3/8/8/8/4K3 w - - 0 2");
    expect(attackersOf(game, "d5", "w")).toEqual([]);
    expect(see(game, "d5", "w")).toBe(0);
  });

  it("works for Black too: after e2-e4 past a d4 pawn, d4 attacks e4 and wins it", () => {
    const game = new Chess("4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1");
    expect(attackersOf(game, "e4", "b")).toContainEqual({ square: "d4", piece: "p" });
    expect(cheapestCapture(game, "e4")).toMatchObject({ from: "d4", to: "e3", gained: 100 });
    expect(see(game, "e4", "b")).toBe(100);
  });
});
