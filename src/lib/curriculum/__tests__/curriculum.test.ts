import { describe, it, expect } from "vitest";
import type { PuzzleStats } from "@/lib/puzzleRating";
import {
  poolThemeStats,
  isThemeMastered,
  computeCurriculumProgress,
} from "../mastery";
import { SYLLABUS, unitById } from "../syllabus";
import { sessionSizeFor, buildDailySession } from "../dailyPlan";

type ThemeStat = PuzzleStats["themeStats"][string];

function statsWith(
  themeStats: Record<string, ThemeStat>,
  rating = 1300
): PuzzleStats {
  return {
    rating,
    totalAttempts: 0,
    totalSolved: 0,
    totalFailed: 0,
    averageTimeMs: 0,
    currentStreak: 0,
    bestStreak: 0,
    ratingHistory: [],
    themeStats,
    recentSolves: [],
  };
}

function masteredTheme(rating: number): ThemeStat {
  return {
    attempts: 12,
    solved: 11,
    avgTimeMs: 0,
    recentRatings: Array(10).fill(rating),
  };
}

describe("mastery rule", () => {
  it("pools attempts/solved/ratings across a unit's themes", () => {
    const stats = statsWith({
      fork: {
        attempts: 5,
        solved: 4,
        avgTimeMs: 0,
        recentRatings: [1300, 1300],
      },
      "double-attack": {
        attempts: 5,
        solved: 5,
        avgTimeMs: 0,
        recentRatings: [1300, 1300],
      },
    });
    const pool = poolThemeStats(["fork", "double-attack"], stats);
    expect(pool.attempts).toBe(10);
    expect(pool.solved).toBe(9);
    expect(pool.accuracy).toBeCloseTo(0.9);
    expect(pool.avgRecentRating).toBe(1300);
  });

  it("requires ≥10 attempts, ≥80% accuracy, and solving at/above level", () => {
    // mastered: 12 attempts, ~92% acc, ratings == live
    expect(
      isThemeMastered(
        "hanging-piece",
        statsWith({ "hanging-piece": masteredTheme(1300) }, 1300),
        1300
      )
    ).toBe(true);
    // too few attempts
    expect(
      isThemeMastered(
        "hanging-piece",
        statsWith(
          {
            "hanging-piece": {
              attempts: 5,
              solved: 5,
              avgTimeMs: 0,
              recentRatings: [1300],
            },
          },
          1300
        ),
        1300
      )
    ).toBe(false);
    // solved only easy puzzles (avg rating well below level)
    expect(
      isThemeMastered(
        "hanging-piece",
        statsWith({ "hanging-piece": masteredTheme(1000) }, 1300),
        1300
      )
    ).toBe(false);
    // no rating signal
    expect(
      isThemeMastered(
        "hanging-piece",
        statsWith(
          { "hanging-piece": { attempts: 12, solved: 11, avgTimeMs: 0 } },
          1300
        ),
        1300
      )
    ).toBe(false);
  });

  it("computes sequential unlock + current unit", () => {
    // Fresh user: only the first unit unlocked and current.
    const fresh = computeCurriculumProgress(statsWith({}, 1000), 1000);
    expect(fresh.unlockedUnitIds).toEqual([SYLLABUS[0].id]);
    expect(fresh.currentUnitId).toBe(SYLLABUS[0].id);
    expect(fresh.masteredUnitIds).toEqual([]);

    // Mastering the first unit unlocks the second and moves current forward.
    const firstUnit = SYLLABUS[0];
    const ts: Record<string, ThemeStat> = {};
    for (const t of firstUnit.themes) ts[t] = masteredTheme(1000);
    const prog = computeCurriculumProgress(statsWith(ts, 1000), 1000);
    expect(prog.masteredUnitIds).toContain(firstUnit.id);
    expect(prog.unlockedUnitIds).toContain(SYLLABUS[1].id);
    expect(prog.currentUnitId).toBe(SYLLABUS[1].id);
  });
});

describe("daily plan", () => {
  it("sizes the session by time commitment", () => {
    expect(sessionSizeFor("under-10")).toEqual({
      newConcept: 3,
      reviews: 3,
      coach: 0,
    });
    expect(sessionSizeFor("10-30")).toEqual({
      newConcept: 5,
      reviews: 6,
      coach: 1,
    });
    expect(sessionSizeFor("30-plus")).toEqual({
      newConcept: 8,
      reviews: 12,
      coach: 2,
    });
    expect(sessionSizeFor(undefined)).toEqual(sessionSizeFor("10-30"));
  });

  it("drills measured weaknesses first, capped review queue, rating window", () => {
    const session = buildDailySession({
      dailyTimeCommitment: "under-10",
      focusThemes: ["back-rank"],
      liveRating: 1200,
      stats: statsWith({}, 1200),
      dueReviewThemes: ["fork", "pin", "skewer", "endgame"],
    });
    expect(session.newThemes).toEqual(["back-rank", "back-rank", "back-rank"]); // 3 new, weakness-first
    expect(session.reviewThemes).toEqual(["fork", "pin", "skewer"]); // capped at 3
    expect(session.ratingWindow).toEqual({ min: 1080, max: 1320 });
    expect(session.coachInsightTheme).toBeNull(); // under-10 has coach:0
    expect(session.totalPuzzles).toBe(6);
  });

  it("falls back to the current syllabus unit when there are no weaknesses", () => {
    const session = buildDailySession({
      dailyTimeCommitment: "10-30",
      focusThemes: [],
      liveRating: 1000,
      stats: statsWith({}, 1000),
      dueReviewThemes: [],
    });
    const firstUnit = unitById(SYLLABUS[0].id)!;
    expect(session.newThemes.length).toBe(5);
    for (const t of session.newThemes) expect(firstUnit.themes).toContain(t);
    expect(session.coachInsightTheme).toBe(session.newThemes[0]); // coach:1
  });
});

describe("goal intensity scales the daily session", () => {
  const common = {
    dailyTimeCommitment: "10-30" as const,
    focusThemes: [],
    liveRating: 1200,
    stats: statsWith({}, 1200),
    dueReviewThemes: ["fork", "pin", "skewer", "endgame", "back-rank", "promotion"],
  };

  it("gives a stretch goal more work than a comfortable one", () => {
    const steady = buildDailySession({ ...common, intensityTier: "steady" });
    const hard = buildDailySession({ ...common, intensityTier: "hard" });
    expect(hard.newThemes.length).toBeGreaterThan(steady.newThemes.length);
    expect(hard.totalPuzzles).toBeGreaterThan(steady.totalPuzzles);
  });

  it("defaults to steady when no goal has been set", () => {
    expect(buildDailySession(common)).toEqual(
      buildDailySession({ ...common, intensityTier: "steady" })
    );
  });

  it("never inflates the session beyond 1.5x what the user agreed to", () => {
    // Someone chasing +800 points gets the hardest sensible session and an
    // honest timeline — not a workload they never signed up for.
    const steady = buildDailySession({ ...common, intensityTier: "steady" });
    const hard = buildDailySession({ ...common, intensityTier: "hard" });
    expect(hard.newThemes.length / steady.newThemes.length).toBeLessThanOrEqual(1.5);
  });
});

describe("measured weaknesses vs stated preferences", () => {
  const base = {
    dailyTimeCommitment: "10-30" as const,
    liveRating: 1200,
    stats: statsWith({}, 1200),
    dueReviewThemes: [],
  };

  it("trains a freshly measured weakness even if it was never a stated goal", () => {
    const s = buildDailySession({ ...base, focusThemes: [], measuredWeaknesses: ["back-rank"] });
    expect(s.newThemes.every((t) => t === "back-rank")).toBe(true);
  });

  it("still honours a stated preference when nothing has been measured", () => {
    const s = buildDailySession({ ...base, focusThemes: ["fork"], measuredWeaknesses: [] });
    expect(s.newThemes.every((t) => t === "fork")).toBe(true);
  });

  it("puts the measurement FIRST when the two disagree", () => {
    // What the player is weak at today outranks what they picked months ago.
    const s = buildDailySession({
      ...base,
      focusThemes: ["fork"],
      measuredWeaknesses: ["endgame"],
    });
    expect(s.newThemes[0]).toBe("endgame");
  });

  it("does not resurrect a weakness a later placement dropped", () => {
    // THE BUG THIS FIXES: placement used to union its result onto the existing
    // list, so a theme could be added but never retracted — everyone drifted
    // toward "weak at everything" and targeting quietly stopped meaning
    // anything. A re-measure now replaces, so "pin" is simply gone.
    const afterRemeasure = buildDailySession({
      ...base,
      focusThemes: [],
      measuredWeaknesses: ["endgame"], // previous run said ["pin"]
    });
    expect(afterRemeasure.newThemes).not.toContain("pin");
  });

  it("dedupes when a theme is both stated and measured", () => {
    const s = buildDailySession({
      ...base,
      focusThemes: ["fork"],
      measuredWeaknesses: ["fork"],
      dueReviewThemes: [],
    });
    expect(new Set(s.newThemes).size).toBe(1);
  });
});
