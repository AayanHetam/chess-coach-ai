/**
 * Detector precision/recall fixes measured against labeled data
 * (scripts/eval/motif_detector_recall.ts — Lichess puzzle themes + the
 * ChessQA motif battery). Each block names the class the benchmark caught.
 */
import { describe, it, expect } from "vitest";
import { detectMotifs } from "../index";
import type { ForkMotif, PinMotif, TrappedPieceMotif, BackRankMateMotif } from "../types";

const forks = (fen: string, san: string) => detectMotifs(fen, san).filter((m): m is ForkMotif => m.motif === "fork");
const pins = (fen: string, san: string) => detectMotifs(fen, san).filter((m): m is PinMotif => m.motif === "pin");
const trapped = (fen: string, san: string) => detectMotifs(fen, san).filter((m): m is TrappedPieceMotif => m.motif === "trapped_piece");
const backRank = (fen: string, san: string) =>
  detectMotifs(fen, san).filter((m): m is BackRankMateMotif => m.motif === "back_rank_mate" || m.motif === "back_rank_threat");

describe("fork — a fork wins something, it is not any two attacked units", () => {
  // 90% of the shipped detector's fires on puzzles NOT labeled fork were a
  // check that also hit a defended pawn (48% of 400 unlabeled puzzles fired).
  it("a check that also attacks a king-defended pawn is not a fork", () => {
    // Qxf7+ hits Kg8 and the g7 pawn (defended by the king)
    expect(forks("r1bqB1k1/ppp2ppp/3p4/8/5Q2/5N2/P1P2PPP/b4K1R w - - 0 14", "Qxf7+")).toEqual([]);
  });
  it("a checkmating move is described as mate, never as a fork", () => {
    expect(forks("r1bqB2k/ppp2Qpp/3p4/8/8/5N2/P1P2PPP/b4K1R w - - 1 15", "Qf8#")).toEqual([]);
  });
  it("pawns are not fork targets", () => {
    // Qd4 attacks the b6 and f6 pawns only
    expect(forks("6k1/5ppp/1p3p2/8/8/8/5PPP/3Q2K1 w - - 0 1", "Qd4")).toEqual([]);
  });
  it("a defended piece cheaper than the forker does not count as a target", () => {
    // Rc8+ hits Kh8 and the knight on c5, but the knight is pawn-defended and worth less than the rook
    expect(forks("7k/2R3p1/1p5p/2n5/8/8/5PPP/6K1 w - - 0 1", "Rc8+")).toEqual([]);
  });
  it("a check that also attacks an undefended piece is a confirmed fork", () => {
    // same shape without the b6 pawn: Rc8+ Kh7 and the knight on c5 falls
    const f = forks("7k/2R3p1/7p/2n5/8/8/5PPP/6K1 w - - 0 1", "Rc8+");
    expect(f).toHaveLength(1);
    expect(f[0].confirmed).toBe(true);
    expect(f[0].targets.map((t) => t.square).sort()).toEqual(["c5", "h8"]);
  });
  it("the royal knight fork of king and rook is still a confirmed fork", () => {
    // fixture 07: 8. Nc7+ forks Ke8 and Ra8
    const f = forks("r1b1kbnr/pp1ppppp/2n5/1N6/4P3/5N2/P1P2PPP/2qQKB1R w Kkq - 0 8", "Nc7+");
    expect(f).toHaveLength(1);
    expect(f[0].confirmed).toBe(true);
    expect(f[0].targets.map((t) => t.square).sort()).toEqual(["a8", "e8"]);
  });
  it("a knight fork of two undefended pieces is a confirmed fork", () => {
    const f = forks("3q1rk1/ppp3pp/8/8/3N4/8/PPP2PPP/R2Q1RK1 w - - 0 1", "Ne6");
    expect(f).toHaveLength(1);
    expect(f[0].confirmed).toBe(true);
  });
});

describe("pin — a move's motif list says which pins that move created", () => {
  // 63.7% of the pins detectMotifs reported on Lichess solutions already
  // existed before the move. They stay (exploiting a pin is a tactic too)
  // but carry createdByMove so the coach never credits the wrong move.
  it("the pinning move reports its pin as created by the move", () => {
    // 1.d4 e6 2.Nf3 Nf6 3.Bg5 pins the knight to the queen
    const p = pins("rnbqkb1r/pppp1ppp/4pn2/8/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq - 2 3", "Bg5");
    expect(p).toHaveLength(1);
    expect(p[0].pinned.square).toBe("f6");
    expect(p[0].createdByMove).toBe(true);
  });
  it("an unrelated later move reports the standing pin as pre-existing", () => {
    // same pin on the board; White plays e3
    const p = pins("rnbqkb1r/pppp1ppp/4pn2/6B1/3P4/5N2/PPP1PPPP/RN1QKB1R w KQkq - 3 4", "e3");
    expect(p).toHaveLength(1);
    expect(p[0].createdByMove).toBe(false);
  });
});

describe("trapped piece — attacked by something cheaper and no safe square", () => {
  // Shipped recall on Lichess `trappedPiece` was 17.5%: knights were below the
  // value floor and a square was 'unsafe' only against a cheaper attacker.
  const beforeG4 = "6k1/6pp/5p2/7n/8/4P1P1/5P1P/6K1 w - - 0 1";
  it("g4 traps the knight on h5 (f4 and g3 are pawn-covered, f6/g7 are its own pawns)", () => {
    const t = trapped(beforeG4, "g4");
    expect(t).toHaveLength(1);
    expect(t[0].square).toBe("h5");
    expect(t[0].piece).toBe("n");
    expect(t[0].confirmed).toBe(true);
  });
  it("not trapped when a flight square is safe", () => {
    // no e3 pawn: Nf4 is a safe square
    expect(trapped("6k1/6pp/5p2/7n/8/6P1/5P1P/6K1 w - - 0 1", "g4")).toEqual([]);
  });
  it("not trapped when it can capture its way out profitably", () => {
    // a loose white rook on f4: Nxf4 wins material
    expect(trapped("6k1/6pp/5p2/7n/5R2/4P1P1/5P1P/6K1 w - - 0 1", "g4")).toEqual([]);
  });
  it("not trapped when the attacker can be removed for free", () => {
    // black bishop on d7 takes the g4 pawn
    expect(trapped("6k1/3b2pp/5p2/7n/8/4P1P1/5P1P/6K1 w - - 0 1", "g4")).toEqual([]);
  });
  it("an attacked piece that is merely undefended is hanging, not trapped", () => {
    // Bxe5 attacks the undefended knight with an equal-value piece: nothing cheaper is doing the trapping
    expect(trapped("6k1/8/8/4n3/8/8/6PP/2B3K1 w - - 0 1", "Bb2")).toEqual([]);
  });
});

describe("back rank — escape squares are judged by legal king moves (x-ray through the vacated square)", () => {
  // Shipped recall on Lichess `backRankMate` was 54%: h1 read as 'not
  // attacked' because the king itself blocked the mating rook's ray.
  it("Re1# is a back-rank mate", () => {
    const b = backRank("4r1k1/8/8/8/8/8/5PPP/6K1 b - - 0 1", "Re1#");
    expect(b).toHaveLength(1);
    expect(b[0].motif).toBe("back_rank_mate");
    expect(b[0].confirmed).toBe(true);
    expect(b[0].delivering_square).toBe("e1");
  });
  it("a rook on the open file against a boxed-in king is a back-rank threat", () => {
    const b = backRank("4r1k1/8/8/8/8/8/5PPP/6K1 b - - 0 1", "Kh8");
    expect(b).toHaveLength(1);
    expect(b[0].motif).toBe("back_rank_threat");
  });
  it("no threat when the king has luft", () => {
    expect(backRank("4r1k1/8/8/8/8/6P1/5P1P/6K1 b - - 0 1", "Kh8")).toEqual([]);
  });
});
