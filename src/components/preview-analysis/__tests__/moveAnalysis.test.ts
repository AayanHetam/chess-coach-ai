import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { MoveClassification } from "@/types/enums";
import type { PositionEval } from "@/types/eval";
import { analyzeMoveAt, describeMove } from "../moveAnalysis";

// Fixture 07. Every position gets a real line; the ones the tests read get
// the engine's actual preference.
const MOVES = [
  "e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4", "Qb6",
  "Nf3", "Qxb2", "Na3", "Qxa1", "Nb5", "Qxc1", "Nc7+", "Kd8",
  "Nxa8", "Qxd1+", "Kxd1", "e5",
];

function uci(fenBefore: string, san: string): string {
  const g = new Chess(fenBefore);
  const m = g.move(san);
  return `${m.from}${m.to}`;
}
function fenAfter(n: number): string {
  const g = new Chess();
  for (let i = 0; i < n; i++) g.move(MOVES[i]);
  return g.fen();
}

function positions(): PositionEval[] {
  const out: PositionEval[] = [];
  for (let i = 0; i <= MOVES.length; i++) {
    // Default: the engine "prefers" the move that was played, at a flat eval.
    const pv = i < MOVES.length ? [uci(fenAfter(i), MOVES[i])] : [];
    out.push({ lines: [{ pv, cp: 30, depth: 16, multiPv: 1 }], bestMove: pv[0], moveClassification: MoveClassification.Good });
  }
  // Before 8. Nc7+ (index 14): +2.84, engine wants Qxc1 Rb8 Qf4 f6.
  const f14 = fenAfter(14);
  out[14] = { lines: [{ pv: [uci(f14, "Qxc1"), "a8b8", "c1f4", "f7f6"], cp: 284, depth: 16, multiPv: 1 }], bestMove: uci(f14, "Qxc1"), moveClassification: MoveClassification.Good };
  // After 8. Nc7+ (index 15): -2.11, a blunder.
  out[15] = { ...out[15], lines: [{ pv: out[15].lines[0].pv, cp: -211, depth: 16, multiPv: 1 }], moveClassification: MoveClassification.Blunder };
  // 7... Qxc1 (index 14 is after it): mark the opponent's move as a blunder too.
  out[14] = { ...out[14], moveClassification: MoveClassification.Blunder };
  return out;
}

describe("analyzeMoveAt", () => {
  const pos = positions();

  it("analyses the player's blunder: what it does, what it cost, what the engine preferred", () => {
    const a = analyzeMoveAt(MOVES, pos, 15, undefined, "w")!;
    expect(a).not.toBeNull();
    expect(a.label).toBe("8. Nc7+");
    expect(a.byPlayer).toBe(true);
    expect(a.classification).toBe(MoveClassification.Blunder);
    expect(a.caption).toMatch(/check/);
    expect(a.caption).toMatch(/fork/);
    expect(a.evalBefore).toBe("+2.84");
    expect(a.evalAfter).toBe("-2.11");
    expect(a.bestSan).toBe("Qxc1");
    expect(a.engineLine?.sans).toEqual(["Qxc1", "Rb8", "Qf4", "f6"]);
    expect(a.bestCaption).toMatch(/queen/);
    expect(a.playedLine?.sans[0]).toBe("Nc7+");
    expect(a.sentence).toContain("This is where it went wrong.");
    expect(a.sentence).not.toContain("+2.84");
    expect(a.sentence).toContain("The engine preferred 8. Qxc1, which");
  });

  it("analyses the opponent's move from the reader's side", () => {
    const a = analyzeMoveAt(MOVES, pos, 14, undefined, "w")!;
    expect(a.label).toBe("7... Qxc1");
    expect(a.byPlayer).toBe(false);
    expect(a.caption).toMatch(/bishop/);
  });

  it("a move that matches the engine's choice carries no alternative line", () => {
    const a = analyzeMoveAt(MOVES, pos, 1, undefined, "w")!;
    expect(a.label).toBe("1. e4");
    expect(a.bestSan).toBeNull();
    expect(a.engineLine).toBeNull();
    expect(a.sentence).toContain("the engine agrees");
  });

  it("is null at the start position, past the end, and without engine data", () => {
    expect(analyzeMoveAt(MOVES, pos, 0, undefined, "w")).toBeNull();
    expect(analyzeMoveAt(MOVES, pos, 99, undefined, "w")).toBeNull();
    expect(analyzeMoveAt(MOVES, null, 5, undefined, "w")).toBeNull();
  });
});

describe("describeMove", () => {
  const base = analyzeMoveAt(MOVES, positions(), 15, undefined, "w")!;

  it("a best move is the engine's first choice", () => {
    expect(describeMove({ ...base, classification: MoveClassification.Best, bestSan: null, engineLine: null, bestCaption: "" })).toMatch(/The engine's first choice\.$/);
  });

  it("a brilliant move is credited to whoever found it", () => {
    expect(describeMove({ ...base, classification: MoveClassification.Brilliant, bestSan: null, engineLine: null })).toContain("You found the move the engine rates highest");
    expect(describeMove({ ...base, classification: MoveClassification.Brilliant, byPlayer: false, bestSan: null, engineLine: null })).toContain("Your opponent found");
  });

  it("a forced move says so", () => {
    expect(describeMove({ ...base, classification: MoveClassification.Forced })).toContain("The only move here.");
  });

  it("a quiet move with no facts is still described", () => {
    expect(describeMove({ ...base, caption: "", classification: MoveClassification.Good, bestSan: null, engineLine: null })).toBe("A quiet move. Sound, and the engine agrees.");
  });

  it("a miss names the chance", () => {
    expect(describeMove({ ...base, classification: MoveClassification.Miss })).toContain("A chance went by");
  });
});
