import { describe, expect, it } from "vitest";
import {
  GAME_WINDOWS,
  resultLabel,
  summarizeGameWindow,
} from "@/lib/performance/gameWindow";
import type { RecentGame } from "@/lib/performance/recentGames";

function game(over: Partial<RecentGame> = {}): RecentGame {
  return {
    id: "g",
    platform: "lichess",
    playedAt: 1,
    pgn: "1. e4",
    opponent: "Rival",
    playerColor: "white",
    result: "win",
    speed: "blitz",
    ...over,
  };
}

/** n games, newest-first, alternating win/loss. */
function history(n: number): RecentGame[] {
  return Array.from({ length: n }, (_, i) =>
    game({ id: `g${i}`, playedAt: n - i, result: i % 2 === 0 ? "win" : "loss" })
  );
}

describe("summarizeGameWindow — short history collapses cleanly", () => {
  // Same headline requirement as the puzzle windows: with 6 games played,
  // "last 50" must show exactly what "last 10" shows.
  const six = history(6);

  it("gives identical results for every window that exceeds the history", () => {
    const summaries = GAME_WINDOWS.map((w) => summarizeGameWindow(six, w));
    for (const s of summaries) {
      expect(s.sampleSize).toBe(6);
      expect(s.wins).toBe(3);
      expect(s.losses).toBe(3);
      expect(s.winRate).toBe(50);
    }
  });

  it("flags the oversized windows so the UI can name the real sample", () => {
    expect(summarizeGameWindow(six, 50).truncated).toBe(true);
    expect(summarizeGameWindow(history(50), 50).truncated).toBe(false);
  });

  it("does not glitch on an empty list", () => {
    for (const w of GAME_WINDOWS) {
      const s = summarizeGameWindow([], w);
      expect(s.sampleSize).toBe(0);
      // Null, not 0% — an untouched record is not a losing record.
      expect(s.winRate).toBeNull();
      expect(s.asWhite.winRate).toBeNull();
      expect(s.bySpeed).toEqual([]);
    }
  });
});

describe("summarizeGameWindow — windows differ when the data allows", () => {
  // 12 games: the 10 newest are all wins, the 2 oldest are losses.
  const mixed = [
    ...Array.from({ length: 10 }, (_, i) =>
      game({ id: `new${i}`, playedAt: 100 - i, result: "win" })
    ),
    ...Array.from({ length: 2 }, (_, i) =>
      game({ id: `old${i}`, playedAt: 2 - i, result: "loss" })
    ),
  ];

  it("takes the NEWEST games for a narrow window", () => {
    const last10 = summarizeGameWindow(mixed, 10);
    expect(last10.sampleSize).toBe(10);
    expect(last10.winRate).toBe(100);
  });

  it("includes the older losses in a wider window", () => {
    const last25 = summarizeGameWindow(mixed, 25);
    expect(last25.sampleSize).toBe(12);
    expect(last25.winRate).toBe(83); // 10/12
  });
});

describe("summarizeGameWindow — undecided games", () => {
  it("never counts an underivable result as a loss", () => {
    // The bug this guards: folding "unknown" into losses turns an in-progress
    // game into a defeat on the one number a player looks at first.
    const s = summarizeGameWindow(
      [
        game({ id: "a", result: "win" }),
        game({ id: "b", result: undefined }),
        game({ id: "c", result: undefined }),
      ],
      10
    );
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(0);
    expect(s.undecided).toBe(2);
    // 1/1 decided, not 1/3.
    expect(s.winRate).toBe(100);
  });

  it("reports a null win rate when nothing is decided", () => {
    const s = summarizeGameWindow([game({ result: undefined })], 10);
    expect(s.winRate).toBeNull();
    expect(s.sampleSize).toBe(1);
  });

  it("keeps draws in the win-rate denominator", () => {
    // A draw is a real result you played to; excluding it would inflate the
    // win rate of a drawish player to 100%.
    const s = summarizeGameWindow(
      [game({ id: "a", result: "win" }), game({ id: "b", result: "draw" })],
      10
    );
    expect(s.winRate).toBe(50);
  });
});

describe("summarizeGameWindow — splits", () => {
  const bothColors = [
    game({ id: "w1", playerColor: "white", result: "win" }),
    game({ id: "w2", playerColor: "white", result: "loss" }),
    game({ id: "b1", playerColor: "black", result: "loss" }),
    game({ id: "b2", playerColor: "black", result: "loss" }),
  ];

  it("splits the record by colour", () => {
    const s = summarizeGameWindow(bothColors, 10);
    expect(s.asWhite.winRate).toBe(50);
    expect(s.asBlack.winRate).toBe(0);
    // 0% is correct here — two decided games, both lost. Distinct from null.
    expect(s.asBlack.losses).toBe(2);
  });

  it("ignores games where the colour is unknown in the colour splits", () => {
    const s = summarizeGameWindow(
      [...bothColors, game({ id: "x", playerColor: undefined, result: "win" })],
      10
    );
    expect(s.asWhite.wins + s.asBlack.wins).toBe(1);
    expect(s.wins).toBe(2); // still counted overall
  });

  it("groups by time control, most-played first", () => {
    const s = summarizeGameWindow(
      [
        game({ id: "1", speed: "bullet" }),
        game({ id: "2", speed: "blitz" }),
        game({ id: "3", speed: "blitz" }),
        game({ id: "4", speed: "blitz" }),
      ],
      10
    );
    expect(s.bySpeed.map((b) => b.speed)).toEqual(["blitz", "bullet"]);
    expect(s.bySpeed[0].games).toBe(3);
  });

  it("labels games with no time control rather than dropping them", () => {
    const s = summarizeGameWindow([game({ speed: undefined })], 10);
    expect(s.bySpeed[0].speed).toBe("other");
  });
});

describe("resultLabel", () => {
  it("renders an underivable result as a dash, never as a loss", () => {
    expect(resultLabel("win")).toBe("Win");
    expect(resultLabel("draw")).toBe("Draw");
    expect(resultLabel("loss")).toBe("Loss");
    expect(resultLabel(undefined)).toBe("—");
  });
});
