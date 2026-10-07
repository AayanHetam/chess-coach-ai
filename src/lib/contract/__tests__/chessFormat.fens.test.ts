/**
 * fensAlongGame is the contract builder's one-walk replacement for the
 * per-ply getFenAtHalfMove replays. The invariant that lets the builder
 * swap one for the other without a serving change: entry k equals
 * getFenAtHalfMove(h, k) for every k, illegal moves included.
 */
import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { fensAlongGame, getFenAtHalfMove } from "../chessFormat";

const LEGAL_GAME = [
  "e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7",
  "Re1", "b5", "Bb3", "d6", "c3", "O-O", "h3", "Nb8", "d4", "Nbd7",
];

describe("fensAlongGame", () => {
  it("matches getFenAtHalfMove at every half-move of a legal game", () => {
    const fens = fensAlongGame(LEGAL_GAME);
    expect(fens).toHaveLength(LEGAL_GAME.length + 1);
    for (let k = 0; k <= LEGAL_GAME.length; k++) {
      expect(fens[k]).toBe(getFenAtHalfMove(LEGAL_GAME, k));
    }
    expect(fens[0]).toBe(new Chess().fen());
  });

  it("stops at the first illegal move and repeats that position, like getFenAtHalfMove", () => {
    // The fifth half-move is not a move at all. chess.js rejects it, and
    // both walkers must hold the position after four half-moves from then on.
    const legalPrefix = ["e4", "e5", "Nf3", "Nc6"];
    const broken = [...legalPrefix, "Zz9", "Qh4", "Kd3"];
    const fens = fensAlongGame(broken);
    expect(fens).toHaveLength(broken.length + 1);
    for (let k = 0; k <= broken.length; k++) {
      expect(fens[k]).toBe(getFenAtHalfMove(broken, k));
    }
    // After the illegal fifth half-move every later entry repeats ply 4.
    expect(fens[5]).toBe(fens[4]);
    expect(fens[7]).toBe(fens[4]);
    // And the legal prefix is untouched.
    expect(fens[4]).toBe(getFenAtHalfMove(legalPrefix, 4));
  });

  it("returns only the start position for an empty history", () => {
    const fens = fensAlongGame([]);
    expect(fens).toEqual([new Chess().fen()]);
    expect(fens[0]).toBe(getFenAtHalfMove([], 0));
  });
});
