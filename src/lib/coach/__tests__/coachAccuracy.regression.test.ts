/**
 * Regression tests for the coach's false board facts, written against the
 * surfaces a reader actually sees (docs/coach-accuracy-notes.md):
 *
 *  - the material footer under a drawn line (lineCaptions → ProofLine),
 *  - the `material:` line the model reads (projectLineStory → verbalizer),
 *  - the "why" sentence in the strip under the board (moveAnalysis).
 *
 * Every expectation is board arithmetic on the real games, replayed.
 * These run with COACH_CLAIM_VERIFIER at its test default (on).
 */
import { Chess } from "chess.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoveClassification } from "@/types/enums";
import { buildLineStory, projectLineStory } from "@/lib/contract/lineStory";
import { analyzeMoveAt } from "@/components/preview-analysis/moveAnalysis";
import {
  engineLineAt,
  playedLineAt,
} from "@/components/preview-analysis/coachLines";
import { captionLine } from "../lineCaptions";
import { loadGame, positionEvals } from "./coachAccuracyFixtures";

const gameB = loadGame("gameB");
const opera = loadGame("operaGame");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("BUG 1: the footer states where material ends, not how much it changed", () => {
  it("Game B, the 19.Nxa8 card (depth 16): White starts 2 down, wins a point back, ends 1 DOWN", () => {
    const card = engineLineAt(positionEvals("gameB", 16), gameB.sans, 19, "w")!;
    expect(card.sans).toEqual([
      "Qh6+",
      "Ke7",
      "Nh7",
      "Rh8",
      "Qf6+",
      "Kd7",
      "Qxf7+",
      "Be7",
    ]);
    const footer = captionLine(card.startFen, card.sans, "w").ledger;
    expect(footer).not.toMatch(/come out 1 up/);
    expect(footer).toBe("you're 1 point down at the end");
    expect(captionLine(card.startFen, card.sans, null).ledger).toBe(
      "Black is 1 point up at the end"
    );
  });

  it("the same card at depth 20 (19.Qh4 line): a level trade is not 'material stays level' when White was 2 down", () => {
    const card = engineLineAt(positionEvals("gameB", 20), gameB.sans, 19, "w")!;
    expect(card.sans.slice(0, 5)).toEqual([
      "Qh4",
      "Kf5",
      "Nh3",
      "Nxh3+",
      "Qxh3+",
    ]);
    expect(captionLine(card.startFen, card.sans, "w").ledger).toBe(
      "you're 2 points down at the end"
    );
  });

  it("the model's material line for that card says the end balance and the change, separately", () => {
    const before19 = gameB.fens[36];
    const story = buildLineStory(
      before19,
      ["Qh6+", "Ke7", "Nh7", "Rh8", "Qf6+", "Kd7", "Qxf7+", "Be7"],
      { maxPlies: 6 }
    );
    const material = projectLineStory(story).find((l) =>
      l.startsWith("material:")
    )!;
    expect(material).not.toMatch(/White up 1/);
    expect(material).toBe(
      "material: at the end White is 1 point down; before the line White was 2 points down, so these 8 plies gain White 1 point"
    );
  });
});

describe("BUG 2: no material win that is not on the board (Opera Game, 10...cxb5)", () => {
  const afterNxb5 = opera.fens[19];

  it("after 10...cxb5 11.Bxb5+ White is a point down (a knight for two pawns), and the footer says so", () => {
    const cap = captionLine(afterNxb5, ["cxb5", "Bxb5+"], "w");
    expect(cap.plies[0].full).toMatch(/takes the knight on b5/);
    expect(cap.ledger).toBe("you're 1 point down at the end");
    const material = projectLineStory(
      buildLineStory(afterNxb5, ["cxb5", "Bxb5+"])
    ).find((l) => l.startsWith("material:"))!;
    expect(material).not.toMatch(/Black up 2/);
    expect(material).toBe(
      "material: at the end Black is 1 point up; before the line Black was 1 point down, so these 2 plies gain Black 2 points"
    );
  });

  it("a line that stops in the middle of an exchange gets no footer at all", () => {
    // What happened after 10...cxb5: ... 13.Rxd7, and Black has not recaptured yet.
    const played = playedLineAt(opera.sans, 10, "b")!;
    expect(played.sans.at(-1)).toBe("Rxd7");
    expect(captionLine(played.startFen, played.sans, "w").ledger).toBe("");
  });

  it("the engine line after 10...cxb5 does not name a rook it never wins: White ends 3 up", () => {
    const line = engineLineAt(
      positionEvals("operaGame", 20),
      opera.sans,
      11,
      "w"
    )!;
    expect(line.sans).toEqual([
      "Bxb5+",
      "Nbd7",
      "O-O-O",
      "Rd8",
      "Rxd7",
      "Nxd7",
      "Bxe7",
      "Bxe7",
    ]);
    const footer = captionLine(line.startFen, line.sans, "w").ledger;
    expect(footer).not.toMatch(/rook/);
    expect(footer).toBe("you're 3 points up at the end");
  });

  it("the existing lineCaptions fixture: winning the queen back after losing R+B+P leaves material level", () => {
    const moves = [
      "e4",
      "c5",
      "Nf3",
      "Nc6",
      "d4",
      "cxd4",
      "Nxd4",
      "Qb6",
      "Nf3",
      "Qxb2",
      "Na3",
      "Qxa1",
      "Nb5",
      "Qxc1",
    ];
    const start = loadFenAfter(moves);
    expect(captionLine(start, ["Qxc1", "Rb8", "Qf4", "f6"], "w").ledger).toBe(
      "material is level at the end"
    );
  });
});

describe("BUG 3: the strip's 'why' for 12.Ng5 does not blame a hanging knight", () => {
  const withVerdict = (depth: 16 | 20) => {
    const positions = positionEvals("gameB", depth);
    positions[23] = {
      ...positions[23],
      moveClassification: MoveClassification.Inaccuracy,
    };
    return positions;
  };

  it("depth 16: no 'hanging' in the reason — the engine's reply (12...g6) never takes the knight", () => {
    const a = analyzeMoveAt(gameB.sans, withVerdict(16), 23, undefined, "w")!;
    expect(a.san).toBe("Ng5");
    expect(a.sentence).not.toMatch(/hanging|en prise|can now be taken/);
    expect(a.sentence).toMatch(/^Defends the bishop on h7\./);
  });

  it("depth 20: the move it names instead is 12.Rb1", () => {
    const a = analyzeMoveAt(gameB.sans, withVerdict(20), 23, undefined, "w")!;
    expect(a.bestSan).toBe("Rb1");
    expect(a.sentence).toMatch(/The engine preferred 12\. Rb1/);
    expect(a.sentence).not.toMatch(/hanging|en prise|can now be taken/);
  });

  it("with COACH_CLAIM_VERIFIER off, the legacy sentence is unchanged", () => {
    vi.stubEnv("COACH_CLAIM_VERIFIER", "0");
    vi.stubEnv("NEXT_PUBLIC_COACH_CLAIM_VERIFIER", "0");
    const a = analyzeMoveAt(gameB.sans, withVerdict(16), 23, undefined, "w")!;
    expect(a.sentence).toMatch(
      /^Defends the bishop on h7; leaves the knight on b5 hanging\. A small slip\./
    );
  });

  it("…but a hanging piece the refutation really takes is still the reason (19.Nxa8 drops the g5 knight)", () => {
    const positions = positionEvals("gameB", 20);
    positions[37] = {
      ...positions[37],
      moveClassification: MoveClassification.Blunder,
    };
    const a = analyzeMoveAt(gameB.sans, positions, 37, undefined, "w")!;
    expect(a.sentence).toMatch(/knight on g5/);
  });
});

function loadFenAfter(moves: string[]): string {
  const g = new Chess();
  for (const m of moves) g.move(m);
  return g.fen();
}
