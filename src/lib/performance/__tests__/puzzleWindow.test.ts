import { describe, expect, it } from "vitest";
import {
  accuracyBand,
  PUZZLE_WINDOWS,
  summarizePuzzleWindow,
  type PuzzleWindow,
} from "@/lib/performance/puzzleWindow";
import type { PuzzleStats, PuzzleSolveRecord } from "@/lib/puzzleRating";

function solve(over: Partial<PuzzleSolveRecord> = {}): PuzzleSolveRecord {
  return {
    puzzleId: "p",
    puzzleRating: 1300,
    solved: true,
    timeMs: 1000,
    theme: "fork",
    timestamp: 1,
    ...over,
  };
}

function stats(over: Partial<PuzzleStats> = {}): PuzzleStats {
  const recentSolves = over.recentSolves ?? [];
  const totalAttempts = over.totalAttempts ?? recentSolves.length;
  const totalSolved =
    over.totalSolved ?? recentSolves.filter((s) => s.solved).length;
  return {
    rating: 1300,
    totalAttempts,
    totalSolved,
    totalFailed: totalAttempts - totalSolved,
    averageTimeMs: 1000,
    currentStreak: 0,
    bestStreak: 0,
    ratingHistory: [],
    themeStats: {},
    recentSolves,
    ...over,
  } as PuzzleStats;
}

/** n solves, alternating solved/failed so accuracy is a clean 50%. */
function history(n: number): PuzzleSolveRecord[] {
  return Array.from({ length: n }, (_, i) =>
    solve({ puzzleId: `p${i}`, solved: i % 2 === 0, timestamp: i })
  );
}

describe("summarizePuzzleWindow — short history collapses cleanly", () => {
  // The headline requirement: with only 10 puzzles solved, asking for the last
  // 500 must show exactly what the last 20 shows. No empty chart, no NaN, no
  // differently-shaped answer.
  const tenPuzzles = stats({ recentSolves: history(10) });

  it("gives identical results for every window that exceeds the history", () => {
    const windows: PuzzleWindow[] = [20, 50, 100, 500, "all"];
    const summaries = windows.map((w) => summarizePuzzleWindow(tenPuzzles, w));
    for (const s of summaries) {
      expect(s.sampleSize).toBe(10);
      expect(s.solved).toBe(5);
      expect(s.overallAccuracy).toBe(50);
      expect(s.themes).toHaveLength(1);
      expect(s.themes[0].attempts).toBe(10);
    }
  });

  it("marks the oversized windows as truncated so the UI can say so", () => {
    expect(summarizePuzzleWindow(tenPuzzles, 500).truncated).toBe(true);
    expect(summarizePuzzleWindow(tenPuzzles, 20).truncated).toBe(true);
  });

  it("does not glitch on an empty history", () => {
    const empty = stats({ recentSolves: [] });
    for (const w of PUZZLE_WINDOWS) {
      const s = summarizePuzzleWindow(empty, w);
      expect(s.sampleSize).toBe(0);
      expect(s.themes).toEqual([]);
      // Null, not 0 — "no data" and "you got everything wrong" are different
      // statements and the second one is demoralising and false.
      expect(s.overallAccuracy).toBeNull();
      expect(s.difficulty.every((d) => d.accuracy === null)).toBe(true);
    }
  });
});

describe("summarizePuzzleWindow — windows actually differ when data allows", () => {
  // 25 solves: the last 20 must differ from all 25 when the older ones differ.
  // First 5 all failed, remaining 20 all solved.
  const mixed = stats({
    recentSolves: [
      ...Array.from({ length: 5 }, (_, i) =>
        solve({ puzzleId: `old${i}`, solved: false, timestamp: i })
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        solve({ puzzleId: `new${i}`, solved: true, timestamp: 10 + i })
      ),
    ],
  });

  it("shows only the most recent puzzles for a narrow window", () => {
    const last20 = summarizePuzzleWindow(mixed, 20);
    expect(last20.sampleSize).toBe(20);
    expect(last20.overallAccuracy).toBe(100);
    expect(last20.truncated).toBe(false);
  });

  it("includes the older failures in a wider window", () => {
    const last50 = summarizePuzzleWindow(mixed, 50);
    expect(last50.sampleSize).toBe(25);
    expect(last50.overallAccuracy).toBe(80); // 20/25
  });

  it("takes the NEWEST puzzles, not the oldest", () => {
    // The whole point of a recency window. Reversed slicing would give 0%.
    expect(summarizePuzzleWindow(mixed, 20).overallAccuracy).toBe(100);
  });
});

describe("summarizePuzzleWindow — 'all' uses lifetime totals", () => {
  it("reports lifetime figures even when the solve log is capped", () => {
    // A heavy user: 2000 lifetime attempts but only the last 500 logged.
    const heavy = stats({
      recentSolves: history(500),
      totalAttempts: 2000,
      totalSolved: 1200,
      themeStats: {
        fork: { attempts: 1200, solved: 700, avgTimeMs: 1000 },
        pin: { attempts: 800, solved: 500, avgTimeMs: 1000 },
      },
    });
    const all = summarizePuzzleWindow(heavy, "all");
    expect(all.sampleSize).toBe(2000);
    expect(all.overallAccuracy).toBe(60); // 1200/2000
    expect(all.themes.map((t) => t.theme)).toEqual(["fork", "pin"]);
    // Flagged, because the difficulty breakdown can only see the logged 500.
    expect(all.truncated).toBe(true);
  });

  it("is not truncated when the log covers the whole history", () => {
    const light = stats({
      recentSolves: history(30),
      themeStats: { fork: { attempts: 30, solved: 15, avgTimeMs: 1000 } },
    });
    expect(summarizePuzzleWindow(light, "all").truncated).toBe(false);
  });

  it("never treats 'all' as truncated just because a number is missing", () => {
    // Guards the comparison itself: `30 < "all"` is false via NaN, which is the
    // right answer for the wrong reason. tsc caught this before the test did.
    // A numbered window over the same data IS truncated; "all" is not.
    const light = stats({ recentSolves: history(30) });
    expect(summarizePuzzleWindow(light, 50).truncated).toBe(true);
    expect(summarizePuzzleWindow(light, "all").truncated).toBe(false);
  });
});

describe("summarizePuzzleWindow — difficulty buckets", () => {
  it("buckets by puzzle rating and never divides by zero", () => {
    const s = summarizePuzzleWindow(
      stats({
        recentSolves: [
          solve({ puzzleRating: 900, solved: true }),
          solve({ puzzleRating: 1100, solved: false }),
          solve({ puzzleRating: 1500, solved: true }),
          solve({ puzzleRating: 2400, solved: true }),
        ],
      }),
      50
    );
    const under1200 = s.difficulty.find((d) => d.label === "Under 1200")!;
    expect(under1200.attempts).toBe(2);
    expect(under1200.accuracy).toBe(50);
    // An empty band reports null, not 0%.
    expect(
      s.difficulty.find((d) => d.label === "1600–1999")!.accuracy
    ).toBeNull();
    expect(s.difficulty.find((d) => d.label === "2000+")!.accuracy).toBe(100);
  });

  it("ignores solves with a missing or nonsense rating", () => {
    const s = summarizePuzzleWindow(
      stats({
        recentSolves: [
          solve({ puzzleRating: undefined as unknown as number }),
          solve({ puzzleRating: Number.NaN }),
          solve({ puzzleRating: 1300 }),
        ],
      }),
      50
    );
    const total = s.difficulty.reduce((n, d) => n + d.attempts, 0);
    expect(total).toBe(1);
  });
});

describe("summarizePuzzleWindow — themes", () => {
  it("orders themes by attempts, most-practised first", () => {
    const s = summarizePuzzleWindow(
      stats({
        recentSolves: [
          solve({ theme: "pin" }),
          solve({ theme: "fork" }),
          solve({ theme: "fork" }),
          solve({ theme: "fork" }),
        ],
      }),
      50
    );
    expect(s.themes.map((t) => t.theme)).toEqual(["fork", "pin"]);
  });

  it("labels untagged puzzles rather than dropping them", () => {
    const s = summarizePuzzleWindow(
      stats({ recentSolves: [solve({ theme: "" })] }),
      50
    );
    expect(s.themes[0].theme).toBe("untagged");
  });
});

describe("accuracyBand", () => {
  it("maps to the reference dashboard's bands", () => {
    expect(accuracyBand(null)).toBe("none");
    expect(accuracyBand(0)).toBe("low");
    expect(accuracyBand(59)).toBe("low");
    expect(accuracyBand(60)).toBe("fair");
    expect(accuracyBand(69)).toBe("fair");
    expect(accuracyBand(70)).toBe("ok");
    expect(accuracyBand(79)).toBe("ok");
    expect(accuracyBand(80)).toBe("good");
    expect(accuracyBand(89)).toBe("good");
    expect(accuracyBand(90)).toBe("great");
    expect(accuracyBand(100)).toBe("great");
  });
});
