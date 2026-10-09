import { describe, it, expect } from "vitest";
import type { PositionEval } from "@/types/eval";
import {
  buildGameStory,
  findDecisive,
  ordinal,
  parseResult,
  positionWin,
  TURNING_POINT_SWING,
} from "../gameStory";

/** Positions from White-relative centipawns at one depth. */
function positions(
  cps: Array<number | null | { mate: number } | { depth: number; cp: number }>,
  depth = 16
): PositionEval[] {
  return cps.map((v) => {
    if (v === null) return { lines: [{ pv: [], depth, multiPv: 1 }] };
    if (typeof v === "object" && "mate" in v)
      return { lines: [{ pv: [], depth, multiPv: 1, mate: v.mate }] };
    if (typeof v === "object")
      return { lines: [{ pv: [], depth: v.depth, multiPv: 1, cp: v.cp }] };
    return { lines: [{ pv: [], depth, multiPv: 1, cp: v }] };
  });
}

const SANS = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6"];

describe("parseResult and ordinal", () => {
  it("reads the PGN result header and nothing else", () => {
    expect(parseResult("1-0")).toBe("1-0");
    expect(parseResult(" 0-1 ")).toBe("0-1");
    expect(parseResult("1/2-1/2")).toBe("1/2-1/2");
    expect(parseResult("½-½")).toBe("1/2-1/2");
    expect(parseResult("*")).toBeNull();
    expect(parseResult(undefined)).toBeNull();
  });

  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
    ]);
  });
});

describe("positionWin honours the floor", () => {
  it("reads a scored position and refuses a sentinel or an unscored line", () => {
    expect(positionWin(positions([0])[0])).toBe(50);
    // A mate saturates the Lichess curve at the 1000 cp cap, just short of 100.
    expect(positionWin(positions([{ mate: 3 }])[0])).toBeGreaterThan(97);
    expect(positionWin(positions([{ mate: -3 }])[0])).toBeLessThan(3);
    expect(positionWin(positions([200], 0)[0])).toBeNull(); // depth-0 timeout sentinel
    expect(positionWin(positions([null])[0])).toBeNull(); // no cp, no mate
    expect(positionWin(undefined)).toBeNull();
  });
});

describe("the decisive move", () => {
  it("is the first move that took the winner from the balance to a lead never given back", () => {
    // Equal, equal, then Black's 2nd move hands White +300 for good.
    const story = buildGameStory({
      positions: positions([20, 10, 15, -5, 300, 290, 320, 310, 350]),
      sans: SANS,
      white: "Aayan",
      black: "Rival",
      result: "1-0",
      playerColor: null,
    });
    expect(story.winner).toBe("w");
    expect(story.decisive).toMatchObject({
      ply: 4,
      label: "2...Nc6",
      color: "b",
    });
    expect(story.line).toBe(
      "Aayan vs Rival, Aayan won. The game turned at 2...Nc6 (Rival's move): after it Rival never got back to equal."
    );
    expect(story.names).toBe("Aayan vs Rival");
    expect(story.terminal).toBe("1-0");
  });

  it("is null when the loser got back to equal afterwards, and the later swing counts instead", () => {
    // White goes +300 at ply 4, Black recovers past equal at ply 6, then loses for good at ply 8.
    const story = buildGameStory({
      positions: positions([0, 0, 0, 0, 300, 280, -20, -10, 400]),
      sans: SANS,
      white: "W",
      black: "B",
      result: "1-0",
      playerColor: null,
    });
    expect(story.decisive?.ply).toBe(8);
  });

  it("is null when the winner led from the first scored position", () => {
    const story = buildGameStory({
      positions: positions([400, 410, 420, 430, 440, 450, 460, 470, 480]),
      sans: SANS,
      white: "W",
      black: "B",
      result: "1-0",
      playerColor: "w",
    });
    expect(story.decisive).toBeNull();
    expect(story.turningPoints).toEqual([]);
    expect(story.line).toBe("W vs B, W won. No big swings: a steady game.");
  });

  it("never reads a sentinel, an unscored line or a mixed-depth pair as a swing", () => {
    const story = buildGameStory({
      positions: positions([
        0,
        0,
        { depth: 12, cp: 0 },
        300,
        null,
        310,
        320,
        330,
        340,
      ]),
      sans: SANS,
      white: "W",
      black: "B",
      result: "1-0",
      playerColor: null,
      declaredDepth: 16,
    });
    // ply 3 (d16 → d12) and ply 4 (d12 → d16) are not comparable; ply 5 is unscored;
    // what is left never crosses from the balance to a lead, so nothing decided it.
    expect(story.decisive).toBeNull();
    expect(story.turningPoints).toEqual([]);
  });

  it("findDecisive alone", () => {
    expect(findDecisive([], "w")).toBeNull();
    expect(
      findDecisive(
        [
          {
            ply: 1,
            moveNumber: 1,
            color: "w",
            san: "e4",
            label: "1.e4",
            winBefore: 50,
            winAfter: 80,
            swing: -30,
          },
        ],
        null
      )
    ).toBeNull();
  });
});

describe("the line knows the reader's side", () => {
  const base = {
    positions: positions([20, 10, 15, -5, 300, 290, 320, 310, 350]),
    sans: SANS,
    white: "Aayan",
    black: "Rival",
    result: "1-0" as const,
  };

  it("the reader lost: your move, and you never got back", () => {
    const story = buildGameStory({ ...base, playerColor: "b" });
    expect(story.line).toBe(
      "Aayan vs Rival, Aayan won. The game turned at 2...Nc6 (your move): after it you never got back to equal."
    );
  });

  it("the reader won: the opponent's move, and they never got back", () => {
    const story = buildGameStory({ ...base, playerColor: "w" });
    expect(story.line).toBe(
      "Aayan vs Rival, Aayan won. The game turned at 2...Nc6 (your opponent's move): after it your opponent never got back to equal."
    );
  });

  it("reads chess.js's placeholder for a missing name as no name", () => {
    const story = buildGameStory({
      ...base,
      white: "?",
      black: " ? ",
      playerColor: null,
    });
    expect(story.names).toBe("White vs Black");
  });

  it("falls back to White and Black when the headers are empty", () => {
    const story = buildGameStory({
      ...base,
      white: "",
      black: undefined,
      playerColor: null,
    });
    expect(story.line).toBe(
      "White vs Black, White won. The game turned at 2...Nc6 (Black's move): after it Black never got back to equal."
    );
  });
});

describe("without a result, a draw, or before the sweep", () => {
  it("names a winner from the final verdict when the header is missing", () => {
    const story = buildGameStory({
      positions: positions([0, 0, 0, 0, -300, -310, -320, -330, -340]),
      sans: SANS,
      white: "W",
      black: "B",
      result: "*",
      playerColor: null,
    });
    expect(story.result).toBeNull();
    expect(story.winner).toBe("b");
    expect(story.line).toBe(
      "W vs B. The game turned at 2...Nc6 (B's move): after it W never got back to equal."
    );
  });

  it("a draw has no winner and no decisive move; the biggest swing is named", () => {
    // Black gives White +250 at ply 2 and White gives it straight back at ply 3.
    const story = buildGameStory({
      positions: positions([0, 0, 250, 0, 0, 0, 0, 0, 0]),
      sans: SANS,
      white: "W",
      black: "B",
      result: "1/2-1/2",
      playerColor: "w",
    });
    expect(story.winner).toBeNull();
    expect(story.decisive).toBeNull();
    expect(story.turningPoints.map((t) => t.label)).toEqual([
      "1...e5",
      "2.Nf3",
    ]);
    expect(story.line).toBe(
      "W vs B, drawn. No single move decided it; the biggest swing was 1...e5 (your opponent's move)."
    );
    expect(story.terminal).toBe("1/2-1/2");
  });

  it("before the sweep the line is the names and the result alone", () => {
    expect(
      buildGameStory({
        positions: null,
        sans: SANS,
        white: "W",
        black: "B",
        result: "0-1",
        playerColor: "w",
      }).line
    ).toBe("W vs B, B won.");
    expect(
      buildGameStory({
        positions: [],
        sans: SANS,
        white: "W",
        black: "B",
        result: null,
        playerColor: null,
      }).line
    ).toBe("W vs B.");
  });

  it("turning points are the three biggest swings in game order", () => {
    // The mover's losses only: Black at ply 2, White at ply 3, Black at ply 6;
    // the gains in between (ply 4 for Black) are not turning points.
    const story = buildGameStory({
      positions: positions([0, 0, 250, 0, 0, 0, 250, 250, 250]),
      sans: SANS,
      white: "W",
      black: "B",
      result: "1/2-1/2",
      playerColor: null,
    });
    expect(story.turningPoints.map((t) => t.ply)).toEqual([2, 3, 6]);
    expect(
      story.turningPoints.every((t) => t.swing >= TURNING_POINT_SWING)
    ).toBe(true);
  });
});
