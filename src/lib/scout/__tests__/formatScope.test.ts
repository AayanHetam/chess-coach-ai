import { describe, expect, it } from "vitest";
import {
  MIN_GAMES_PER_FORMAT,
  availableFormats,
  scopeGames,
} from "@/lib/scout/formatScope";
import { computeAnalytics } from "@/lib/scoutAnalytics";
import type { ScoutGame, TimeClass } from "@/types/scout";

const ME = "Target";

function game(i: number, timeClass: TimeClass | undefined, rating: number, win: boolean): ScoutGame {
  return {
    id: `g${i}`,
    platform: "chess.com",
    moves: ["e4", "e5"],
    numMoves: 40,
    whiteUsername: ME,
    blackUsername: "other",
    whiteRating: rating,
    blackRating: rating,
    result: win ? "1-0" : "0-1",
    timeClass,
    termination: "resignation",
    date: Date.UTC(2026, 0, 1) + i * 3_600_000,
  };
}

const games: ScoutGame[] = [
  ...Array.from({ length: 40 }, (_, i) => game(i, "blitz", 1600, i % 2 === 0)),
  ...Array.from({ length: 25 }, (_, i) => game(100 + i, "rapid", 2100, true)),
  ...Array.from({ length: 4 }, (_, i) => game(200 + i, "bullet", 1200, false)),
  ...Array.from({ length: 6 }, (_, i) => game(300 + i, undefined, 1500, true)),
];

describe("availableFormats", () => {
  it("orders by volume and drops formats too thin to stand alone", () => {
    expect(availableFormats(games)).toEqual([
      { tc: "blitz", games: 40 },
      { tc: "rapid", games: 25 },
    ]);
  });

  it("never offers 'unknown' — that is missing data, not a format", () => {
    expect(availableFormats(games).some(f => f.tc === "unknown")).toBe(false);
  });

  it("offers nothing when no format clears the floor", () => {
    const thin = Array.from({ length: MIN_GAMES_PER_FORMAT - 1 }, (_, i) =>
      game(i, "blitz", 1500, true)
    );
    expect(availableFormats(thin)).toEqual([]);
  });
});

describe("scopeGames", () => {
  it("returns everything for 'all'", () => {
    expect(scopeGames(games, "all")).toHaveLength(games.length);
  });

  it("narrows to a single format", () => {
    const blitz = scopeGames(games, "blitz");
    expect(blitz).toHaveLength(40);
    expect(blitz.every(g => g.timeClass === "blitz")).toBe(true);
  });
});

describe("scoping actually re-reads the dossier", () => {
  it("produces a different profile per format, not a relabelled one", () => {
    // The whole point of the filter: a 2100 rapid player and a 1600 blitz
    // player are different opponents. If these matched, the filter would be
    // decorative.
    const all = computeAnalytics(scopeGames(games, "all"), ME).profile;
    const blitz = computeAnalytics(scopeGames(games, "blitz"), ME).profile;
    const rapid = computeAnalytics(scopeGames(games, "rapid"), ME).profile;

    expect(blitz.ovr).not.toBe(rapid.ovr);
    expect(rapid.ovr).toBeGreaterThan(blitz.ovr);
    expect(blitz.totalGames).toBe(40);
    expect(rapid.totalGames).toBe(25);
    expect(all.totalGames).toBeGreaterThan(blitz.totalGames);
  });
});
