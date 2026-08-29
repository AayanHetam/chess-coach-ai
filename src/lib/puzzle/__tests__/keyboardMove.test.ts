import { describe, expect, it } from "vitest";
import { isMoveStartKey, parseKeyboardMove } from "../keyboardMove";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// After 1.e4 e5 2.Nf3 Nc6 3.Bc4 — White can castle short.
const ITALIAN = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
// White pawn on e7, ready to promote.
const PROMO = "8/4P2k/8/8/8/8/8/4K3 w - - 0 1";
// Two knights can reach d2: Nb1 and Nf3.
const AMBIG = "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1";
// Black pawn on b5 and bishop on d5 can both capture on c4 (diagonally).
const B_FILE = "rnbqk1nr/pp1ppppp/8/1p1b4/2P5/8/PP1PPPPP/RNBQKBNR b KQkq - 0 3";

describe("parseKeyboardMove — SAN", () => {
  it("parses a pawn move", () => {
    expect(parseKeyboardMove(START, "e4")).toEqual({
      ok: true,
      from: "e2",
      to: "e4",
      piece: "wP",
    });
  });

  it("parses a piece move and forgives a lowercase piece letter", () => {
    expect(parseKeyboardMove(START, "Nf3")).toMatchObject({ ok: true, from: "g1", to: "f3", piece: "wN" });
    expect(parseKeyboardMove(START, "nf3")).toMatchObject({ ok: true, from: "g1", to: "f3" });
  });

  it("does NOT capitalise a leading b — bxc4 and Bxc4 are different moves", () => {
    // Both captures are legal here; lowercase b must stay the b-pawn.
    expect(parseKeyboardMove(B_FILE, "bxc4")).toMatchObject({ ok: true, from: "b5", piece: "bP" });
    expect(parseKeyboardMove(B_FILE, "Bxc4")).toMatchObject({ ok: true, from: "d5", piece: "bB" });
  });

  it("parses castling, including 0-0 and o-o spellings", () => {
    for (const s of ["O-O", "0-0", "o-o"]) {
      expect(parseKeyboardMove(ITALIAN, s)).toMatchObject({
        ok: true,
        from: "e1",
        to: "g1",
        piece: "wK",
      });
    }
  });

  it("rejects an ambiguous SAN token instead of guessing", () => {
    expect(parseKeyboardMove(AMBIG, "Nd2")).toEqual({
      ok: false,
      error: "Not a legal move here.",
    });
  });
});

describe("parseKeyboardMove — UCI", () => {
  it("parses bare from-to", () => {
    expect(parseKeyboardMove(START, "e2e4")).toMatchObject({ ok: true, from: "e2", to: "e4" });
  });

  it("queens by default on promotion, matching the board's autoPromoteToQueen", () => {
    expect(parseKeyboardMove(PROMO, "e7e8")).toMatchObject({ ok: true, from: "e7", to: "e8" });
    expect(parseKeyboardMove(PROMO, "e8=Q")).toMatchObject({ ok: true, from: "e7", to: "e8" });
  });

  it("refuses underpromotion honestly — the sink cannot express it", () => {
    expect(parseKeyboardMove(PROMO, "e7e8n")).toEqual({
      ok: false,
      error: "Promotion is always to a queen here.",
    });
    expect(parseKeyboardMove(PROMO, "e8=N")).toEqual({
      ok: false,
      error: "Promotion is always to a queen here.",
    });
  });
});

describe("parseKeyboardMove — rejections", () => {
  it("rejects an illegal move, an opponent move, and junk", () => {
    expect(parseKeyboardMove(START, "e5")).toMatchObject({ ok: false });
    expect(parseKeyboardMove(START, "e7e5")).toMatchObject({ ok: false });
    expect(parseKeyboardMove(START, "hello")).toMatchObject({ ok: false });
  });

  it("rejects empty input with a usage hint", () => {
    expect(parseKeyboardMove(START, "  ")).toMatchObject({ ok: false });
  });

  it("survives an unparseable FEN", () => {
    expect(parseKeyboardMove("not a fen", "e4")).toMatchObject({ ok: false });
  });
});

describe("isMoveStartKey", () => {
  it("accepts files, piece letters and castling starters", () => {
    for (const k of ["a", "h", "e", "n", "N", "B", "b", "q", "K", "o", "O", "0"]) {
      expect(isMoveStartKey(k), k).toBe(true);
    }
  });

  it("rejects digits (other than 0), space, and modifiers", () => {
    for (const k of ["1", "8", " ", "Enter", "Tab", "z", "x"]) {
      expect(isMoveStartKey(k), k).toBe(false);
    }
  });
});
