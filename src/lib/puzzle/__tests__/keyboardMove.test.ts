import { describe, expect, it } from "vitest";
import { isMoveStartKey, parseKeyboardMove } from "../keyboardMove";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// After 1.e4 e5 2.Nf3 Nc6 3.Bc4 — White can castle short.
const ITALIAN = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
// White pawn on e7, ready to promote.
const PROMO = "8/4P2k/8/8/8/8/8/4K3 w - - 0 1";
// Two knights can reach d2: Nb1 and Nf3 (the d-pawn is gone, so d2 is free —
// with the pawn still there "Nd2" was simply illegal, not ambiguous).
const AMBIG = "rnbqkbnr/pppppppp/8/8/8/5N2/PPP1PPPP/RNBQKB1R w KQkq - 0 1";
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

  it("asks which piece when a SAN token is ambiguous, instead of guessing or calling it illegal", () => {
    // Two knights can reach d2. "Not a legal move here." was the old answer,
    // which to the player is the board contradicting what they can see.
    expect(parseKeyboardMove(AMBIG, "Nd2")).toEqual({
      ok: false,
      error: "Two knights can reach d2 (b1 and f3) — type Nbd2 or Nfd2.",
    });
  });

  it("plays a disambiguated token from an ambiguous position", () => {
    expect(parseKeyboardMove(AMBIG, "Nbd2")).toMatchObject({ ok: true, from: "b1", to: "d2" });
    expect(parseKeyboardMove(AMBIG, "Nfd2")).toMatchObject({ ok: true, from: "f3", to: "d2" });
  });

  describe("the 2026-09-08 report: Rc1 rejected as illegal", () => {
    // White rooks on a1 and f1, c1 empty: "Rc1" is legal for either rook.
    const TWO_ROOKS = "4k3/8/8/8/8/8/8/R4RK1 w - - 0 1";
    // Only the a1 rook can reach c1 (the other rook is on h1 behind the king).
    const ONE_ROOK = "4k3/8/8/8/8/8/8/R5KR w - - 0 1";
    // A black bishop sits on c1: the move is a capture, Rxc1.
    const CAPTURE = "4k3/8/8/8/8/8/8/R1b3KR w - - 0 1";

    it("explains the ambiguity and names the two spellings", () => {
      expect(parseKeyboardMove(TWO_ROOKS, "Rc1")).toEqual({
        ok: false,
        error: "Two rooks can reach c1 (a1 and f1) — type Rac1 or Rfc1.",
      });
      expect(parseKeyboardMove(TWO_ROOKS, "Rac1")).toMatchObject({ ok: true, from: "a1", to: "c1" });
    });

    it("plays Rc1 when only one rook can get there", () => {
      expect(parseKeyboardMove(ONE_ROOK, "Rc1")).toMatchObject({ ok: true, from: "a1", to: "c1", piece: "wR" });
    });

    it("forgives a capture typed without the x", () => {
      expect(parseKeyboardMove(CAPTURE, "Rc1")).toMatchObject({ ok: true, from: "a1", to: "c1" });
      expect(parseKeyboardMove(CAPTURE, "Rxc1")).toMatchObject({ ok: true, from: "a1", to: "c1" });
    });

    it("still refuses a square the piece cannot reach", () => {
      expect(parseKeyboardMove(ONE_ROOK, "Rc3")).toEqual({
        ok: false,
        error: "Not a legal move here.",
      });
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
