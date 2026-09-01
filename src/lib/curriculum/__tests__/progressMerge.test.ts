import { describe, expect, it } from "vitest";
import {
  mergeProgress,
  mergeSrs,
  mergeStats,
  mergeStreak,
  type StoredProgress,
} from "@/lib/curriculum/progressMerge";
import type { PuzzleStats } from "@/lib/puzzleRating";
import type { ThemeSrsCard } from "@/lib/curriculum/puzzleThemeSrs";

function stats(over: Partial<PuzzleStats> = {}): PuzzleStats {
  return {
    rating: 1200,
    totalAttempts: 0,
    totalSolved: 0,
    totalFailed: 0,
    averageTimeMs: 0,
    currentStreak: 0,
    bestStreak: 0,
    ratingHistory: [],
    themeStats: {},
    recentSolves: [],
    ...over,
  };
}

function card(over: Partial<ThemeSrsCard> = {}): ThemeSrsCard {
  return {
    themeId: "fork",
    easeFactor: 2.5,
    interval: 1,
    attempts: 1,
    nextReview: 0,
    lastReviewed: 0,
    ...over,
  };
}

describe("mergeStreak", () => {
  it("takes the copy with the later active day", () => {
    const a = { current: 3, best: 5, lastActiveDay: "2026-08-10" };
    const b = { current: 1, best: 2, lastActiveDay: "2026-08-11" };
    expect(mergeStreak(a, b)).toEqual({
      current: 1,
      best: 5,
      lastActiveDay: "2026-08-11",
    });
  });

  it("keeps the highest best across both copies", () => {
    // The user's personal record must survive a device that never saw it.
    const a = { current: 1, best: 40, lastActiveDay: "2026-01-01" };
    const b = { current: 2, best: 2, lastActiveDay: "2026-08-11" };
    expect(mergeStreak(a, b).best).toBe(40);
  });

  it("falls back to whichever copy has any activity at all", () => {
    const cold = { current: 0, best: 0, lastActiveDay: null };
    const warm = { current: 4, best: 4, lastActiveDay: "2026-08-11" };
    expect(mergeStreak(cold, warm)).toEqual(warm);
    expect(mergeStreak(warm, cold)).toEqual(warm);
  });
});

describe("mergeStats", () => {
  it("takes the copy with more recorded attempts", () => {
    const local = stats({ totalAttempts: 12, rating: 1150 });
    const remote = stats({ totalAttempts: 30, rating: 1300 });
    expect(mergeStats(local, remote).totalAttempts).toBe(30);
  });

  it("does NOT prefer the higher rating", () => {
    // Rating moves both ways; a drop can be the newer truth. Preferring the
    // higher number would quietly ratchet ratings upward on every sync.
    const ahead = stats({ totalAttempts: 50, rating: 1100 });
    const behind = stats({ totalAttempts: 10, rating: 1900 });
    expect(mergeStats(ahead, behind).rating).toBe(1100);
  });

  it("breaks attempt ties on the longer rating history", () => {
    const short = stats({ totalAttempts: 5, ratingHistory: [] });
    const long = stats({
      totalAttempts: 5,
      ratingHistory: [{ rating: 1200, timestamp: 1 }],
    });
    expect(mergeStats(short, long)).toBe(long);
  });
});

describe("mergeSrs", () => {
  it("unions themes drilled on different devices", () => {
    // The scenario the whole per-theme design exists for: forks on the phone,
    // pins on the laptop. Taking either card set wholesale loses half.
    const phone = { fork: card({ themeId: "fork", attempts: 3 }) };
    const laptop = { pin: card({ themeId: "pin", attempts: 2 }) };
    const merged = mergeSrs(phone, laptop);
    expect(Object.keys(merged).sort()).toEqual(["fork", "pin"]);
    expect(merged.fork.attempts).toBe(3);
    expect(merged.pin.attempts).toBe(2);
  });

  it("keeps the more-attempted card for a shared theme", () => {
    const a = { fork: card({ attempts: 2, interval: 1 }) };
    const b = { fork: card({ attempts: 7, interval: 9 }) };
    expect(mergeSrs(a, b).fork.attempts).toBe(7);
    expect(mergeSrs(b, a).fork.attempts).toBe(7);
  });

  it("breaks attempt ties on the later review", () => {
    const older = { fork: card({ attempts: 4, lastReviewed: 1000 }) };
    const newer = { fork: card({ attempts: 4, lastReviewed: 5000 }) };
    expect(mergeSrs(older, newer).fork.lastReviewed).toBe(5000);
    expect(mergeSrs(newer, older).fork.lastReviewed).toBe(5000);
  });

  it("does not mutate either input", () => {
    const a = { fork: card({ attempts: 1 }) };
    const b = { fork: card({ attempts: 9 }) };
    mergeSrs(a, b);
    expect(a.fork.attempts).toBe(1);
    expect(b.fork.attempts).toBe(9);
  });
});

describe("mergeProgress", () => {
  const local: StoredProgress = {
    streak: { current: 2, best: 6, lastActiveDay: "2026-08-11" },
    stats: stats({ totalAttempts: 10 }),
    srs: { fork: card({ themeId: "fork", attempts: 5 }) },
    updatedAt: 200,
  };
  const remote: StoredProgress = {
    streak: { current: 9, best: 9, lastActiveDay: "2026-08-09" },
    stats: stats({ totalAttempts: 40 }),
    srs: { pin: card({ themeId: "pin", attempts: 1 }) },
    updatedAt: 100,
  };

  it("merges each field on its own signal, not one document winner", () => {
    const m = mergeProgress(local, remote);
    // Local is ahead on the streak's day...
    expect(m.streak.lastActiveDay).toBe("2026-08-11");
    // ...while remote is ahead on attempts. A document-level last-write-wins
    // would have thrown one of these away.
    expect(m.stats.totalAttempts).toBe(40);
    expect(Object.keys(m.srs).sort()).toEqual(["fork", "pin"]);
    expect(m.streak.best).toBe(9);
    expect(m.updatedAt).toBe(200);
  });

  it("is order-independent", () => {
    expect(mergeProgress(local, remote)).toEqual(mergeProgress(remote, local));
  });

  it("is idempotent", () => {
    const once = mergeProgress(local, remote);
    expect(mergeProgress(once, once)).toEqual(once);
  });
});

describe("mergeProgress — rush high scores", () => {
  const base = () => {
    const stats = (attempts: number): PuzzleStats =>
      ({
        rating: 1200,
        totalAttempts: attempts,
        totalSolved: attempts,
        totalFailed: 0,
        averageTimeMs: 1000,
        currentStreak: 0,
        bestStreak: 0,
        ratingHistory: [{ rating: 1200, timestamp: 1 }],
        themeStats: {},
        recentSolves: [],
      }) as PuzzleStats;
    const streak = { current: 0, best: 0, lastActiveDay: "" } as never;
    return {
      local: { streak, stats: stats(1), srs: {}, updatedAt: 1 },
      remote: { streak, stats: stats(2), srs: {}, updatedAt: 2 },
    };
  };

  it("merges per-mode maxima — each copy can be ahead in a different mode", () => {
    const { local, remote } = base();
    const m = mergeProgress(
      { ...local, rush: { threeMin: 12, fiveMin: 0, survivalBest: 30 } },
      { ...remote, rush: { threeMin: 8, fiveMin: 21, survivalBest: 25 } },
    );
    // A whole-object winner would throw away either fiveMin 21 or
    // survivalBest 30 — a high score the user actually earned.
    expect(m.rush).toEqual({ threeMin: 12, fiveMin: 21, survivalBest: 30 });
  });

  it("keeps the only copy when the other side predates rush syncing", () => {
    const { local, remote } = base();
    expect(
      mergeProgress({ ...local, rush: { threeMin: 5, fiveMin: 1, survivalBest: 9 } }, remote).rush,
    ).toEqual({ threeMin: 5, fiveMin: 1, survivalBest: 9 });
    expect(mergeProgress(local, remote).rush).toBeUndefined();
  });

  it("stays order-independent and idempotent with rush present on one side", () => {
    const { local, remote } = base();
    const a = { ...local, rush: { threeMin: 3, fiveMin: 4, survivalBest: 5 } };
    expect(mergeProgress(a, remote)).toEqual(mergeProgress(remote, a));
    const once = mergeProgress(a, remote);
    expect(mergeProgress(once, once)).toEqual(once);
  });
});

describe("mergeProgress — coordinate trainer best score", () => {
  const base = () => {
    const streak = { current: 0, best: 0, lastActiveDay: "" } as never;
    const s = { rating: 1200, totalAttempts: 0, totalSolved: 0, totalFailed: 0, averageTimeMs: 0, currentStreak: 0, bestStreak: 0, ratingHistory: [], themeStats: {}, recentSolves: [] } as PuzzleStats;
    return {
      local: { streak, stats: s, srs: {}, updatedAt: 1 },
      remote: { streak, stats: s, srs: {}, updatedAt: 2 },
    };
  };

  it("keeps the higher best score, whichever side it's on", () => {
    const { local, remote } = base();
    const m = mergeProgress(
      { ...local, coordinate: { best: 14 } },
      { ...remote, coordinate: { best: 21 } },
    );
    expect(m.coordinate).toEqual({ best: 21 });
  });

  it("keeps the only copy when the other side predates coordinate syncing", () => {
    const { local, remote } = base();
    expect(
      mergeProgress({ ...local, coordinate: { best: 7 } }, remote).coordinate,
    ).toEqual({ best: 7 });
    expect(mergeProgress(local, remote).coordinate).toBeUndefined();
  });
});
