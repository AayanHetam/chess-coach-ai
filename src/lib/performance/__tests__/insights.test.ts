import { describe, expect, it } from "vitest";
import { computeGameInsights } from "@/lib/performance/insights";
import { MoveClassification } from "@/types/enums";
import type { Game } from "@/types/game";
import type { PositionEval } from "@/types/eval";

function pos(cp: number, classification?: MoveClassification): PositionEval {
  return {
    lines: [{ pv: [], cp, depth: 16, multiPv: 1 }],
    moveClassification: classification,
  };
}

function blackBlunderGame(id: number): Game {
  return {
    id,
    pgn: "",
    white: { name: "Magnus" },
    black: { name: "Hikaru" },
    date: "2026.08.20",
    eval: {
      positions: [
        pos(20),
        pos(30, MoveClassification.Opening), // ply1, white
        pos(25, MoveClassification.Opening), // ply2, black
        pos(40, MoveClassification.Best), // ply3, white
        pos(900, MoveClassification.Blunder), // ply4, black — the blunder
      ],
      accuracy: { white: 96.2, black: 41.8 },
      settings: { engine: "stockfish_17" as never, date: "", depth: 16, multiPv: 3 },
    },
  };
}

describe("computeGameInsights", () => {
  it("returns the empty summary when no usernames are known", () => {
    const insights = computeGameInsights([blackBlunderGame(1)], []);
    expect(insights.gamesAnalyzed).toBe(0);
    expect(insights.avgAccuracy).toBeNull();
  });

  it("excludes games where neither side matches a known username", () => {
    const insights = computeGameInsights([blackBlunderGame(1)], ["someone_else"]);
    expect(insights.gamesAnalyzed).toBe(0);
  });

  it("excludes games with no completed analysis", () => {
    const noEval: Game = {
      id: 2,
      pgn: "",
      white: { name: "Magnus" },
      black: { name: "Hikaru" },
    };
    const insights = computeGameInsights([noEval], ["hikaru"]);
    expect(insights.gamesAnalyzed).toBe(0);
  });

  it("attributes the game to the matching side, case-insensitively", () => {
    const insights = computeGameInsights([blackBlunderGame(1)], ["HIKARU"]);
    expect(insights.gamesAnalyzed).toBe(1);
    expect(insights.avgAccuracy).toBe(41.8);
    expect(insights.accuracyTrend).toEqual([
      { gameId: 1, date: "2026.08.20", accuracy: 41.8 },
    ]);
  });

  it("counts classifications for the user's own moves only, not the opponent's", () => {
    const insights = computeGameInsights([blackBlunderGame(1)], ["hikaru"]);
    // Black (the matched user) played the Opening move at ply2 and the
    // Blunder at ply4. White's Best at ply3 must NOT be counted.
    expect(insights.classificationCounts[MoveClassification.Blunder]).toBe(1);
    expect(insights.classificationCounts[MoveClassification.Opening]).toBe(1);
    expect(insights.classificationCounts[MoveClassification.Best]).toBeUndefined();
  });

  it("buckets phase accuracy off the real opening boundary, bisecting the rest", () => {
    const insights = computeGameInsights([blackBlunderGame(1)], ["hikaru"]);
    // Black's only opening-phase move is ply2 (inside the classifier's
    // detected opening); the blunder at ply4 falls past the midpoint of the
    // remaining plies, landing in "endgame".
    expect(insights.phaseAccuracy.opening).not.toBeNull();
    expect(insights.phaseAccuracy.endgame).not.toBeNull();
    expect(insights.phaseAccuracy.middlegame).toBeNull();
    // The blunder tanks endgame-phase accuracy well below the opening move.
    expect(insights.phaseAccuracy.endgame!).toBeLessThan(
      insights.phaseAccuracy.opening!,
    );
  });

  it("averages across multiple attributable games", () => {
    const g1 = blackBlunderGame(1);
    const g2 = { ...blackBlunderGame(2), eval: { ...blackBlunderGame(2).eval!, accuracy: { white: 90, black: 88 } } };
    const insights = computeGameInsights([g1, g2], ["hikaru"]);
    expect(insights.gamesAnalyzed).toBe(2);
    expect(insights.avgAccuracy).toBeCloseTo((41.8 + 88) / 2, 5);
  });
});
