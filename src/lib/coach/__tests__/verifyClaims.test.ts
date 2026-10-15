/**
 * The replay verifier's contract: board facts are proven by replaying the
 * claimed line on chess.js, and anything that cannot be proven fails
 * closed — "false" when the board contradicts it, "unverified" when the
 * board cannot settle it — never "verified".
 */
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import {
  applyDelta,
  materialBalance,
  materialDelta,
  replayLine,
  sideValue,
  verifyClaims,
  type Claim,
  type MaterialBalance,
  type MaterialDelta,
} from "../verifyClaims";
import { loadGame } from "./coachAccuracyFixtures";

const opera = loadGame("operaGame");
const gameB = loadGame("gameB");
/** Position before White's 10th move in the Opera Game (after 9...b5). */
const OPERA_BEFORE_10 = opera.fens[18];
/** After 10.Nxb5, Black to move. */
const OPERA_AFTER_NXB5 = opera.fens[19];
/** Game B before 12.Ng5 / 15.Qh7+ / 19.Nxa8 / 22.g4#. */
const B_BEFORE_12 = gameB.fens[22];
const B_BEFORE_15 = gameB.fens[28];
const B_BEFORE_19 = gameB.fens[36];
const B_BEFORE_22 = gameB.fens[42];
/** The 19.Nxa8 card's line: the engine's best line from before move 19 at depth 16. */
const QH6_LINE = ["Qh6+", "Ke7", "Nh7", "Rh8", "Qf6+", "Kd7", "Qxf7+", "Be7"];

const status = (
  startFen: string,
  line: string[],
  claim: Claim,
  refutation?: string[]
) => verifyClaims({ startFen, line, claims: [claim], refutation }).verdicts[0];

describe("replayLine", () => {
  it("records each ply's mover, piece, capture, check and the running balance", () => {
    const r = replayLine(OPERA_BEFORE_10, ["Nxb5", "cxb5", "Bxb5+"]);
    expect(r.ok).toBe(true);
    expect(r.plies.map((p) => p.captured)).toEqual([
      { piece: "p", square: "b5" },
      { piece: "n", square: "b5" },
      { piece: "p", square: "b5" },
    ]);
    expect(r.plies[1]).toMatchObject({
      mover: "b",
      piece: "p",
      from: "c6",
      to: "b5",
      label: "10...",
    });
    expect(r.plies[2].givesCheck).toBe(true);
    expect(r.plies.map((p) => p.balanceAfter)).toEqual([1, -2, -1]);
    expect(r.startBalance).toBe(0);
    expect(r.endBalance).toBe(-1);
    expect(r.delta).toBe(-1);
    expect(r.midCaptureSequence).toBeNull();
    expect(r.sideToMoveAtEnd).toBe("b");
  });

  it("reads UCI as well as SAN", () => {
    const r = replayLine(OPERA_BEFORE_10, ["c3b5", "c6b5", "c4b5"]);
    expect(r.ok).toBe(true);
    expect(r.plies.map((p) => p.san)).toEqual(["Nxb5", "cxb5", "Bxb5+"]);
  });

  it("keeps the start balance, the change and the end balance apart", () => {
    // Game B, the 19.Nxa8 card: White starts 2 down, the line is worth +1, White ends 1 down.
    const r = replayLine(B_BEFORE_19, QH6_LINE);
    expect(r.ok).toBe(true);
    expect(r.startBalance).toBe(-2);
    expect(r.delta).toBe(1);
    expect(r.endBalance).toBe(-1);
  });

  it("says when a line stops in the middle of an exchange", () => {
    const r = replayLine(OPERA_AFTER_NXB5, ["cxb5"]);
    expect(r.midCaptureSequence).toEqual({ square: "b5", recapturer: "w" });
  });

  it("stops at the first illegal move", () => {
    const r = replayLine(OPERA_BEFORE_10, ["Nxb5", "Qxb5", "Bxb5+"]);
    expect(r.ok).toBe(false);
    expect(r.illegal).toEqual({ index: 1, move: "Qxb5" });
    expect(r.plies).toHaveLength(1);
  });

  it("recognises mate", () => {
    const r = replayLine(B_BEFORE_22, ["g4#"]);
    expect(r.endsInMate).toBe(true);
    expect(r.plies[0].isMate).toBe(true);
  });

  it("rejects a position chess.js rejects", () => {
    const r = replayLine("not a fen", ["e4"]);
    expect(r.ok).toBe(false);
    expect(r.startBalance).toBeNull();
  });
});

describe("material: a balance and a delta are different things", () => {
  it("computes them from the board and converts between them explicitly", () => {
    expect(materialBalance(new Chess().fen())).toBe(0);
    const start = materialBalance(B_BEFORE_19)!;
    expect(start).toBe(-2);
    const end = materialBalance(
      replayLine(B_BEFORE_19, QH6_LINE).plies.at(-1)!.fenAfter
    )!;
    const change = materialDelta(start, end);
    expect(change).toBe(1);
    expect(applyDelta(start, change)).toBe(end);
    expect(sideValue(end, "b")).toBe(1);
    expect(sideValue(change, "w")).toBe(1);
  });

  it("will not let one stand in for the other (checked by tsc)", () => {
    const takesBalance = (b: MaterialBalance) => b;
    const takesDelta = (d: MaterialDelta) => d;
    const b = materialBalance(B_BEFORE_19)!;
    const d = materialDelta(b, b);
    // @ts-expect-error a delta is not a balance
    takesBalance(d);
    // @ts-expect-error a balance is not a delta
    takesDelta(b);
    // @ts-expect-error a bare number is neither
    takesBalance(-2);
    // @ts-expect-error a delta cannot be applied to a delta
    applyDelta(d, d);
    expect(takesBalance(b)).toBe(-2);
  });
});

describe("claims", () => {
  describe("piece on a square", () => {
    it("verifies the piece that is there and rejects the wrong piece or an empty square", () => {
      expect(
        status(B_BEFORE_12, ["Ng5"], {
          kind: "piece_on",
          square: "g5",
          piece: "n",
          color: "w",
          atPly: 1,
        }).status
      ).toBe("verified");
      const wrong = status(B_BEFORE_12, ["Ng5"], {
        kind: "piece_on",
        square: "g5",
        piece: "b",
        atPly: 1,
      });
      expect(wrong.status).toBe("false");
      expect(wrong.actual).toEqual({ piece: "n", color: "w" });
      expect(
        status(B_BEFORE_12, ["Ng5"], {
          kind: "piece_on",
          square: "g4",
          piece: "n",
          atPly: 1,
        }).status
      ).toBe("false");
    });
  });

  describe("captures", () => {
    it("Opera 10...cxb5 takes a knight, not a bishop", () => {
      const line = ["Nxb5", "cxb5", "Bxb5+"];
      expect(
        status(OPERA_BEFORE_10, line, {
          kind: "captures",
          moveIndex: 1,
          piece: "n",
          square: "b5",
        }).status
      ).toBe("verified");
      const bishop = status(OPERA_BEFORE_10, line, {
        kind: "captures",
        moveIndex: 1,
        piece: "b",
      });
      expect(bishop.status).toBe("false");
      expect(bishop.actual).toEqual({ piece: "n", square: "b5" });
      expect(
        status(OPERA_BEFORE_10, line, {
          kind: "captures",
          moveIndex: 3,
          piece: "b",
        }).status
      ).toBe("unverified");
    });
  });

  describe("material won or lost", () => {
    const line = ["Nxb5", "cxb5", "Bxb5+"];

    it("White does not win material in the Opera Game sequence: it ends a knight for two pawns down", () => {
      const v = status(OPERA_BEFORE_10, line, {
        kind: "material_change",
        side: "w",
        points: 1,
        mode: "at_least",
      });
      expect(v.status).toBe("false");
      expect(v.actual).toMatchObject({ change: -1, endBalance: -1 });
      expect(
        status(OPERA_BEFORE_10, line, { kind: "ahead", leader: "w" }).status
      ).toBe("false");
    });

    it("Black's 10...cxb5 does not win a piece, measured from either starting position", () => {
      expect(
        status(OPERA_BEFORE_10, line, {
          kind: "material_change",
          side: "b",
          points: 3,
          mode: "at_least",
        }).status
      ).toBe("false");
      expect(
        status(OPERA_AFTER_NXB5, ["cxb5", "Bxb5+"], {
          kind: "material_change",
          side: "b",
          points: 3,
          mode: "at_least",
        }).status
      ).toBe("false");
    });

    it("a material claim on a line that stops mid-exchange cannot be settled", () => {
      const v = status(OPERA_AFTER_NXB5, ["cxb5"], {
        kind: "material_change",
        side: "b",
        points: 3,
        mode: "at_least",
      });
      expect(v.status).toBe("unverified");
      expect(v.reason).toMatch(/exchange/);
    });

    it("a true count is not rejected: Black does end a knight for two pawns up (the engine still says White is winning, which is judgment, not a count)", () => {
      expect(
        status(OPERA_BEFORE_10, line, {
          kind: "material_change",
          side: "b",
          points: 1,
          mode: "at_least",
        }).status
      ).toBe("verified");
      expect(
        status(OPERA_BEFORE_10, line, { kind: "ahead", leader: "b", margin: 1 })
          .status
      ).toBe("verified");
    });

    it("Game B's 19.Nxa8 card line wins White a point and still ends White a point down", () => {
      expect(
        status(B_BEFORE_19, QH6_LINE, {
          kind: "material_change",
          side: "w",
          points: 1,
          mode: "exactly",
        }).status
      ).toBe("verified");
      expect(
        status(B_BEFORE_19, QH6_LINE, { kind: "ahead", leader: "w" }).status
      ).toBe("false");
      expect(
        status(B_BEFORE_19, QH6_LINE, { kind: "ahead", leader: "b", margin: 1 })
          .status
      ).toBe("verified");
      expect(
        status(B_BEFORE_19, QH6_LINE, { kind: "ahead", leader: "b", margin: 2 })
          .status
      ).toBe("false");
    });
  });

  describe("mate and check", () => {
    it("22.g4# is mate; 15.Qh7+ is check but not mate", () => {
      expect(
        status(B_BEFORE_22, ["g4#"], { kind: "is_mate", moveIndex: 0 }).status
      ).toBe("verified");
      expect(
        status(B_BEFORE_15, ["Qh7+"], { kind: "is_mate", moveIndex: 0 }).status
      ).toBe("false");
      expect(
        status(B_BEFORE_15, ["Qh7+"], { kind: "gives_check", moveIndex: 0 })
          .status
      ).toBe("verified");
      expect(
        status(B_BEFORE_12, ["Ng5"], { kind: "gives_check", moveIndex: 0 })
          .status
      ).toBe("false");
    });
  });

  describe("hanging pieces (Game B, 12.Ng5)", () => {
    const refutation = ["g6", "Rb1", "Qxa2"]; // the engine's reply line after 12.Ng5

    it("the knight on g5 does not hang: nothing attacks it", () => {
      const v = status(B_BEFORE_12, ["Ng5"], {
        kind: "hangs",
        square: "g5",
        piece: "n",
        atPly: 1,
      });
      expect(v.status).toBe("false");
      expect(v.reason).toMatch(/not attacked/);
    });

    it("the knight on b5 can be taken for nothing, but it was already loose before 12.Ng5", () => {
      expect(
        status(B_BEFORE_12, ["Ng5"], {
          kind: "hangs",
          square: "b5",
          piece: "n",
          atPly: 1,
        }).status
      ).toBe("verified");
      const newly = status(B_BEFORE_12, ["Ng5"], {
        kind: "newly_hangs",
        square: "b5",
        piece: "n",
        moveIndex: 0,
      });
      expect(newly.status).toBe("false");
      expect(newly.reason).toMatch(/already/);
    });

    it("a hanging piece is not the reason for the mistake when the engine's refutation never takes it", () => {
      expect(
        status(
          B_BEFORE_12,
          ["Ng5"],
          { kind: "refutation_takes", square: "b5", piece: "n" },
          refutation
        ).status
      ).toBe("false");
      expect(
        status(
          B_BEFORE_12,
          ["Ng5"],
          { kind: "refutation_takes", square: "g5", piece: "n" },
          refutation
        ).status
      ).toBe("false");
    });

    it("…and is the reason when it does: after 19.Nxa8 the refutation takes the knight on g5", () => {
      expect(
        status(
          B_BEFORE_19,
          ["Nxa8"],
          { kind: "refutation_takes", square: "g5", piece: "n" },
          ["Kxg5", "Qg7+", "Ng6"]
        ).status
      ).toBe("verified");
    });

    it("a defended piece does not hang", () => {
      // After 1.e4 e5 2.Nf3 the e5 pawn is attacked once and defended by nothing — but after 2...Nc6 it is held.
      const v = status(new Chess().fen(), ["e4", "e5", "Nf3", "Nc6"], {
        kind: "hangs",
        square: "e5",
        piece: "p",
        atPly: 4,
      });
      expect(v.status).toBe("false");
      expect(v.reason).toMatch(/defended|exchange/);
    });
  });

  describe("captures and pieces named without a move", () => {
    const line = ["Nxb5", "cxb5", "Bxb5+"];

    it("a capture somewhere in the line, by the side that made it", () => {
      expect(
        status(OPERA_BEFORE_10, line, {
          kind: "line_captures",
          piece: "n",
          square: "b5",
        }).status
      ).toBe("verified");
      expect(
        status(OPERA_BEFORE_10, line, {
          kind: "line_captures",
          piece: "n",
          by: "b",
        }).status
      ).toBe("verified");
      expect(
        status(OPERA_BEFORE_10, line, {
          kind: "line_captures",
          piece: "n",
          by: "w",
        }).status
      ).toBe("false");
      const bishop = status(OPERA_BEFORE_10, line, {
        kind: "line_captures",
        piece: "b",
        square: "b5",
      });
      expect(bishop.status).toBe("false");
      expect(bishop.actual).toEqual([
        { move: "10.Nxb5", piece: "p", square: "b5" },
        { move: "10...cxb5", piece: "n", square: "b5" },
        { move: "11.Bxb5+", piece: "p", square: "b5" },
      ]);
    });

    it("a piece on a square at any point of the line", () => {
      expect(
        status(B_BEFORE_12, ["Ng5"], {
          kind: "piece_on_in_line",
          square: "g5",
          piece: "n",
          color: "w",
        }).status
      ).toBe("verified");
      expect(
        status(B_BEFORE_12, ["Ng5"], {
          kind: "piece_on_in_line",
          square: "f3",
          piece: "n",
        }).status
      ).toBe("verified");
      expect(
        status(B_BEFORE_12, ["Ng5"], {
          kind: "piece_on_in_line",
          square: "g5",
          piece: "b",
        }).status
      ).toBe("false");
      expect(
        status(B_BEFORE_12, ["Ng5"], {
          kind: "piece_on_in_line",
          square: "g5",
          piece: "n",
          color: "b",
        }).status
      ).toBe("false");
    });
  });

  describe("fail closed", () => {
    const claims: Claim[] = [
      { kind: "captures", moveIndex: 0, piece: "p" },
      { kind: "ahead", leader: "w" },
      { kind: "piece_on", square: "b5", piece: "n", atPly: 1 },
    ];

    it("an illegal move anywhere in the line leaves every claim unverified", () => {
      const out = verifyClaims({
        startFen: OPERA_BEFORE_10,
        line: ["Nxb5", "Qxb5", "Bxb5+"],
        claims,
      });
      expect(out.verdicts.map((v) => v.status)).toEqual([
        "unverified",
        "unverified",
        "unverified",
      ]);
      expect(out.verdicts[0].reason).toMatch(/Qxb5/);
    });

    it("a position chess.js rejects leaves every claim unverified", () => {
      const out = verifyClaims({
        startFen: "8/8/8/8/8/8/8/8 w - - 0 1",
        line: ["e4"],
        claims,
      });
      expect(out.verdicts.every((v) => v.status === "unverified")).toBe(true);
    });

    it("a wrong piece name is never verified", () => {
      expect(
        status(OPERA_BEFORE_10, ["Nxb5", "cxb5"], {
          kind: "captures",
          moveIndex: 1,
          piece: "r",
        }).status
      ).not.toBe("verified");
      expect(
        status(B_BEFORE_12, ["Ng5"], {
          kind: "hangs",
          square: "b5",
          piece: "b",
          atPly: 1,
        }).status
      ).not.toBe("verified");
    });

    it("a claim about a square without that piece is never verified", () => {
      expect(
        status(B_BEFORE_12, ["Ng5"], {
          kind: "piece_on",
          square: "e4",
          piece: "q",
          atPly: 1,
        }).status
      ).not.toBe("verified");
      expect(
        status(B_BEFORE_12, ["Ng5"], { kind: "hangs", square: "e4", atPly: 1 })
          .status
      ).not.toBe("verified");
    });

    it("a claim pointing past the end of the line is unverified", () => {
      expect(
        status(B_BEFORE_12, ["Ng5"], { kind: "is_mate", moveIndex: 4 }).status
      ).toBe("unverified");
      expect(
        status(B_BEFORE_12, ["Ng5"], {
          kind: "piece_on",
          square: "g5",
          piece: "n",
          atPly: 9,
        }).status
      ).toBe("unverified");
    });

    it("an unknown claim is unverified", () => {
      expect(
        status(B_BEFORE_12, ["Ng5"], {
          kind: "wins_the_game",
        } as unknown as Claim).status
      ).toBe("unverified");
    });

    it("a refutation claim with no refutation line is unverified", () => {
      expect(
        status(B_BEFORE_12, ["Ng5"], { kind: "refutation_takes", square: "b5" })
          .status
      ).toBe("unverified");
    });
  });
});
