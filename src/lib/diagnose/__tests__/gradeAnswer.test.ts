import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import type { GameStoryInput } from "@/lib/coach/gameStory";
import {
  diagnoseMomentAt,
  replyAt,
  threatAt,
  type ThreatTruth,
} from "../decisiveMoment";
import {
  gradeAnswer,
  parseAnswerMove,
  truthCause,
  type DiagnoseResult,
} from "../gradeAnswer";

const REAL = path.join(
  process.cwd(),
  "src/lib/contract/__tests__/fixtures-real"
);

function fixture07(): GameStoryInput {
  const fx = JSON.parse(
    fs.readFileSync(path.join(REAL, "07_knight_fork.json"), "utf8")
  );
  return {
    positions: fx.gameEval.positions,
    sans: fx.moveHistory,
    white: fx.gameHeaders?.white ?? null,
    black: fx.gameHeaders?.black ?? null,
    result: null,
    playerColor: "w",
    declaredDepth: null,
  };
}

describe("gradeAnswer at fixture 07, after 6. Na3 (Black to move, the rook on a1 hangs)", () => {
  const input = fixture07();
  const moment = diagnoseMomentAt(input, 11)!;
  const truth = threatAt(moment, input.positions!)!;
  const grade = (text: string): DiagnoseResult | null => {
    const uci = parseAnswerMove(moment.fenAfter, text);
    return uci === null
      ? null
      : gradeAnswer(moment.fenAfter, 11, truth, { kind: "move", uci });
  };

  it("reads the truth however it is written: exact, a calculation slip", () => {
    for (const text of [
      "Qxa1",
      "6... Qxa1",
      "6...Qxa1",
      "b2a1",
      "Qxa1!",
      // Black's dots alone, and the ellipsis a phone types for them.
      "...Qxa1",
      "\u2026Qxa1",
      "6\u2026Qxa1",
      "6\u2026 Qxa1",
    ]) {
      const r = grade(text)!;
      expect(r.grade, text).toBe("exact");
      expect(r.cause).toBe("calculation");
      expect(r.partialBy).toBeNull();
      expect(r.answer).toEqual({
        uci: "b2a1",
        san: "Qxa1",
        label: "6... Qxa1",
      });
    }
  });

  it("gives the right piece on the wrong square a partial, and the lesson is the loose rook", () => {
    for (const text of ["Qxa3", "Qxc1"]) {
      const r = grade(text)!;
      expect(r.grade, text).toBe("partial");
      expect(r.partialBy).toBe("piece");
      expect(r.cause).toBe("hanging");
    }
  });

  it("calls anything else a miss, with the truth's own cause", () => {
    const r = grade("e6")!;
    expect(r.grade).toBe("miss");
    expect(r.cause).toBe("hanging");
    expect(r.answer?.label).toBe("6... e6");
  });

  it("calls no idea a guess", () => {
    const r = gradeAnswer(moment.fenAfter, 11, truth, { kind: "no-idea" })!;
    expect(r).toMatchObject({
      grade: "no-idea",
      cause: "guess",
      partialBy: null,
      answer: null,
    });
    expect(r.truth.uci).toBe("b2a1");
  });

  it("grades no illegal move, and reads no lower-case piece as a move", () => {
    expect(
      gradeAnswer(moment.fenAfter, 11, truth, { kind: "move", uci: "b2h8" })
    ).toBeNull();
    expect(parseAnswerMove(moment.fenAfter, "Qxh8")).toBeNull();
    expect(parseAnswerMove(moment.fenAfter, "qxa1")).toBeNull();
  });

  it("grades only at the index of the side to move", () => {
    expect(
      gradeAnswer(moment.fenAfter, 12, truth, { kind: "move", uci: "b2a1" })
    ).toBeNull();
  });
});

describe("parseAnswerMove", () => {
  const fen = "r3k3/ppp2ppp/2n5/1B1q4/4P2r/2N2N2/PPP2PPP/3QK2R w K - 0 1";

  it("takes the whole message as one move, SAN or UCI", () => {
    expect(parseAnswerMove(fen, "Nxd5")).toBe("c3d5");
    expect(parseAnswerMove(fen, " 16. Nxd5 ")).toBe("c3d5");
    expect(parseAnswerMove(fen, "c3d5")).toBe("c3d5");
    expect(parseAnswerMove(fen, "Nc3d5")).toBe("c3d5");
    expect(parseAnswerMove(fen, "Nxd5?!")).toBe("c3d5");
    expect(parseAnswerMove(fen, "Bxc6+")).toBe("b5c6");
  });

  it("reads nothing that is more than a move, or no move", () => {
    expect(parseAnswerMove(fen, "Nxd5 wins the queen")).toBeNull();
    expect(parseAnswerMove(fen, "why Nxd5?")).toBeNull();
    expect(parseAnswerMove(fen, "")).toBeNull();
    expect(parseAnswerMove(fen, "nxd5")).toBeNull();
    expect(parseAnswerMove("not a fen", "e4")).toBeNull();
  });

  it("reads castling written with zeros, for both sides", () => {
    expect(parseAnswerMove("5k2/8/8/8/8/8/8/4K2R w K - 0 1", "0-0")).toBe(
      "e1g1"
    );
    expect(parseAnswerMove("r3k3/8/8/8/8/8/8/4K3 b q - 0 1", "0-0-0")).toBe(
      "e8c8"
    );
  });

  it("keeps a promotion's piece", () => {
    const promo = "8/4P3/8/8/8/8/k7/4K3 w - - 0 1";
    expect(parseAnswerMove(promo, "e8=Q")).toBe("e7e8q");
    expect(parseAnswerMove(promo, "e7e8q")).toBe("e7e8q");
    expect(parseAnswerMove(promo, "e8=N")).toBe("e7e8n");
    expect(parseAnswerMove(promo, "e8")).toBeNull();
  });
});

describe("gradeAnswer, synthetic positions", () => {
  // Black's last move left the queen on d5 to the knight on c3, the rook on
  // h4 to the knight on f3, and the knight on c6 pinned to the king.
  const FEN = "r3k3/ppp2ppp/2n5/1B1q4/4P2r/2N2N2/PPP2PPP/3QK2R w K - 0 1";
  const truthWith = (lines: { uci: string; cp: number }[]): ThreatTruth =>
    replyAt(
      FEN,
      {
        lines: lines.map((l, i) => ({
          pv: [l.uci],
          cp: l.cp,
          depth: 18,
          multiPv: i + 1,
        })),
      },
      "b",
      30
    )!;
  const grade = (truth: ThreatTruth, text: string) =>
    gradeAnswer(FEN, 30, truth, {
      kind: "move",
      uci: parseAnswerMove(FEN, text)!,
    })!;

  const three = truthWith([
    { uci: "c3d5", cp: 950 },
    { uci: "e4d5", cp: 940 },
    { uci: "b5c6", cp: 300 },
  ]);

  it("counts the search's equal reply as exact", () => {
    expect(three.uci).toBe("c3d5");
    expect(grade(three, "exd5")).toMatchObject({
      grade: "exact",
      cause: "calculation",
    });
  });

  it("reads another forcing reply of the search as a threat, the reply's square as a target, its piece as a piece", () => {
    expect(grade(three, "Bxc6+")).toMatchObject({
      grade: "partial",
      partialBy: "threat",
      cause: "hanging",
    });
    expect(grade(three, "Qxd5")).toMatchObject({
      grade: "partial",
      partialBy: "target",
    });
    expect(grade(three, "Ne2")).toMatchObject({
      grade: "partial",
      partialBy: "piece",
    });
  });

  it("reads a capture of a loose piece, or of a pinned one, as a weakness", () => {
    const one = truthWith([{ uci: "c3d5", cp: 950 }]);
    // The rook on h4 is loose.
    expect(grade(one, "Nxh4")).toMatchObject({
      grade: "partial",
      partialBy: "weakness",
    });
    // The knight on c6 is defended, but pinned to the king.
    expect(grade(one, "Bxc6+")).toMatchObject({
      grade: "partial",
      partialBy: "weakness",
    });
    expect(grade(one, "h3")).toMatchObject({ grade: "miss", partialBy: null });
  });

  it("grades a promotion by its piece and castling written with zeros", () => {
    const promo = "8/4P3/8/8/8/8/k7/4K3 w - - 0 1";
    const queen = replyAt(
      promo,
      { lines: [{ pv: ["e7e8q"], cp: 900, depth: 20, multiPv: 1 }] },
      "b",
      40
    )!;
    expect(
      gradeAnswer(promo, 40, queen, { kind: "move", uci: "e7e8q" })?.grade
    ).toBe("exact");
    expect(
      gradeAnswer(promo, 40, queen, { kind: "move", uci: "e7e8n" })
    ).toMatchObject({ grade: "partial", partialBy: "target" });
    // No promotion piece is no move.
    expect(
      gradeAnswer(promo, 40, queen, { kind: "move", uci: "e7e8" })
    ).toBeNull();

    const castle = "5k2/8/8/8/8/8/8/4K2R w K - 0 1";
    const oo = replyAt(
      castle,
      { lines: [{ pv: ["e1g1"], cp: 500, depth: 20, multiPv: 1 }] },
      "b",
      50
    )!;
    expect(oo.san).toBe("O-O+");
    expect(truthCause(oo)).toBe("check");
    const r = gradeAnswer(castle, 50, oo, {
      kind: "move",
      uci: parseAnswerMove(castle, "0-0")!,
    })!;
    expect(r.grade).toBe("exact");
    expect(r.answer?.label).toBe("26. O-O+");
  });
});

describe("truthCause", () => {
  const base = {
    isMate: false,
    isCheck: false,
    forkTargets: [] as string[],
    capturesHanging: false,
  };
  const cause = (t: Partial<typeof base>) =>
    truthCause({ ...base, ...t } as unknown as ThreatTruth);

  it("orders mate, fork, check, loose piece, calculation", () => {
    expect(
      cause({ isMate: true, isCheck: true, forkTargets: ["a8", "e8"] })
    ).toBe("check");
    expect(cause({ isCheck: true, forkTargets: ["a8", "e8"] })).toBe("fork");
    expect(cause({ isCheck: true, capturesHanging: true })).toBe("check");
    expect(cause({ capturesHanging: true })).toBe("hanging");
    expect(cause({})).toBe("calculation");
  });
});
