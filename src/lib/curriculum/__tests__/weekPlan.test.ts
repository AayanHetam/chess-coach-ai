import { describe, it, expect } from "vitest";
import type { PuzzleStats } from "@/lib/puzzleRating";
import type { ThemeSrsCard } from "../puzzleThemeSrs";
import { createCard } from "../puzzleThemeSrs";
import { buildWeekPlan } from "../weekPlan";
import { sessionSizeFor } from "../dailyPlan";

const DAY_MS = 24 * 60 * 60 * 1000;
// A fixed, weekday-agnostic "now" so tests never depend on the wall clock.
const NOW = 1_700_000_000_000;

function statsWith(rating = 1300): PuzzleStats {
  return {
    rating,
    totalAttempts: 0,
    totalSolved: 0,
    totalFailed: 0,
    averageTimeMs: 0,
    currentStreak: 0,
    bestStreak: 0,
    ratingHistory: [],
    themeStats: {},
    recentSolves: [],
  };
}

/** A reviewed card whose next review lands `daysFromNow` out. */
function dueCard(themeId: string, daysFromNow: number): ThemeSrsCard {
  return {
    ...createCard(themeId),
    attempts: 1,
    interval: Math.max(1, Math.round(daysFromNow)),
    lastReviewed: NOW,
    nextReview: NOW + daysFromNow * DAY_MS,
  };
}

describe("buildWeekPlan", () => {
  it("returns `days` entries with only day 0 flagged today", () => {
    const plan = buildWeekPlan(
      { stats: statsWith(), srs: {}, liveRating: 1300 },
      NOW,
    );
    expect(plan).toHaveLength(7);
    expect(plan[0].isToday).toBe(true);
    expect(plan.slice(1).every((d) => !d.isToday)).toBe(true);
    expect(plan.map((d) => d.dayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Days advance by exactly one DAY_MS.
    expect(plan[1].startMs - plan[0].startMs).toBe(DAY_MS);
  });

  it("places each SRS review on the day it actually comes due", () => {
    const srs = {
      fork: dueCard("fork", 3.4), // → day 3
      pin: dueCard("pin", 1.1), // → day 1
      endgame: dueCard("endgame", 6.9), // → day 6
      skewer: dueCard("skewer", 20), // outside the 7-day window
    };
    const plan = buildWeekPlan(
      { stats: statsWith(), srs, liveRating: 1300 },
      NOW,
    );
    expect(plan[3].reviewThemes).toContain("fork");
    expect(plan[1].reviewThemes).toContain("pin");
    expect(plan[6].reviewThemes).toContain("endgame");
    // The far-future card appears on no day this week.
    expect(plan.some((d) => d.reviewThemes.includes("skewer"))).toBe(false);
  });

  it("buckets overdue + never-reviewed cards onto today", () => {
    const srs = {
      fork: createCard("fork"), // never reviewed → always due
      pin: dueCard("pin", -2), // overdue
    };
    const plan = buildWeekPlan(
      { stats: statsWith(), srs, liveRating: 1300 },
      NOW,
    );
    expect(plan[0].reviewThemes).toEqual(
      expect.arrayContaining(["fork", "pin"]),
    );
  });

  it("today resolves concrete new themes; future days carry only a count", () => {
    const plan = buildWeekPlan(
      {
        stats: statsWith(),
        srs: {},
        liveRating: 1300,
        focusThemes: ["fork", "pin"],
        dailyTimeCommitment: "under-10",
      },
      NOW,
    );
    const size = sessionSizeFor("under-10");
    expect(plan[0].newThemes.length).toBe(size.newConcept);
    expect(plan[1].newThemes).toEqual([]);
    expect(plan[1].newCount).toBe(size.newConcept);
  });

  it("estimates minutes from total puzzle count", () => {
    const plan = buildWeekPlan(
      { stats: statsWith(), srs: {}, liveRating: 1300 },
      NOW,
    );
    for (const d of plan) {
      expect(d.totalPuzzles).toBe(d.newCount + d.reviewThemes.length);
      expect(d.estMinutes).toBeGreaterThanOrEqual(1);
      expect(d.estMinutes).toBe(Math.round(d.totalPuzzles * 1.5));
    }
  });

  it("caps a day's reviews at the session review size", () => {
    // 30 cards all due in the day-2 window.
    const srs: Record<string, ThemeSrsCard> = {};
    for (let i = 0; i < 30; i++) srs[`t${i}`] = dueCard(`t${i}`, 2.2);
    const plan = buildWeekPlan(
      {
        stats: statsWith(),
        srs,
        liveRating: 1300,
        dailyTimeCommitment: "under-10",
      },
      NOW,
    );
    const size = sessionSizeFor("under-10");
    expect(plan[2].reviewThemes.length).toBe(size.reviews);
  });
});
