import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { detectPinsAfterMove } from "../motifs/pin";
import { applyEscapability } from "../escapability";

/**
 * PHANTOM RELATIVE PINS
 *
 * A relative pin is a *constraint*: the pinned piece is discouraged from moving
 * because moving it exposes something dearer behind it. If the pinned piece has
 * no move that exposes the piece behind, no constraint exists and there is no
 * pin — however neatly the three squares line up.
 *
 * The detector was pure geometry (pinner / first enemy / dearer enemy on one
 * ray) and `confirmPin` only asked whether the pinner could be captured for
 * free, never whether the pin actually bound anything. So a queen, an enemy
 * pawn and an enemy rook stacked on one file confirmed a pin that the pawn
 * could never expose — every pawn push stays on the file.
 *
 * Fixture is a real position from Lazer_Wizard game 02, move 23 (Black to
 * play), where the coach told the user their f7 pawn was pinned to the rook on
 * f8 by the queen on f4. It is not, and the user flagged it as "VERY wrong".
 */

// Qf4 (White) / pawn f7 / rook f8 (Black). f5 and f6 are empty, so the three
// squares are collinear with a clear ray — the geometry the old code trusted.
const PHANTOM = "5rk1/p4p1p/6p1/2r5/5Q2/2P1P1K1/PP1Pq3/R1B4R b - - 9 23";

// Bg5 pins Nf6 to Qd8: the knight has moves off the a1-h8 diagonal (Ne4, Nd5,
// Nh5, Ng4), each of which lets the bishop through to the queen. A real pin.
const REAL = "rnbqkb1r/pppp1ppp/5n2/6B1/8/8/PPPPPPPP/RN1QKBNR b KQkq - 0 1";

describe("relative pins must actually bind", () => {
  it("CONTROL: the fixture really does present the phantom geometry", () => {
    // If this ever fails, the fixture stopped exercising the bug and the
    // assertions below would pass for the wrong reason.
    const game = new Chess(PHANTOM);
    expect(game.get("f4")).toMatchObject({ type: "q", color: "w" });
    expect(game.get("f7")).toMatchObject({ type: "p", color: "b" });
    expect(game.get("f8")).toMatchObject({ type: "r", color: "b" });
    expect(game.get("f5")).toBeUndefined();
    expect(game.get("f6")).toBeUndefined();

    // And the pawn genuinely cannot expose the rook: its only moves are pushes,
    // which stay on the f-file and keep blocking.
    const pawnMoves = game.moves({ square: "f7", verbose: true });
    expect(pawnMoves.length).toBeGreaterThan(0);
    expect(pawnMoves.every((m) => m.to[0] === "f")).toBe(true);
  });

  it("does not confirm a pin the pinned piece can never expose", () => {
    const game = new Chess(PHANTOM);
    const pins = detectPinsAfterMove(game, "w");
    applyEscapability(game, pins, "w");

    const phantom = pins.find(
      (p) => p.pinner.square === "f4" && p.pinned.square === "f7",
    );
    // Either the detector drops it outright or escapability leaves it
    // unconfirmed — both keep it out of the narratable pool. What must never
    // happen is a confirmed pin.
    expect(phantom?.confirmed ?? false).toBe(false);
  });

  it("CONTROL: a genuine relative pin is still confirmed", () => {
    const game = new Chess(REAL);
    const pins = detectPinsAfterMove(game, "w");
    applyEscapability(game, pins, "w");

    const real = pins.find(
      (p) => p.pinner.square === "g5" && p.pinned.square === "f6",
    );
    expect(real).toBeDefined();
    expect(real?.behind.square).toBe("d8");
    expect(real?.confirmed).toBe(true);
  });
});
