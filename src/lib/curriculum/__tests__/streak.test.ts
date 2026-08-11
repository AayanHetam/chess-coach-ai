import { describe, expect, it } from "vitest";
import { bumpStreak, dayKey, type StreakState } from "@/lib/curriculum/streak";

/**
 * The streak is the programme's core habit metric, and as of the program-first
 * restructure it is bumped from every training surface rather than only from
 * SessionRunner. That makes same-day idempotency load-bearing: /puzzles calls
 * it on EVERY graded puzzle, so a non-idempotent bump would inflate a single
 * session into a 40-day streak.
 */

const fresh: StreakState = { current: 0, best: 0, lastActiveDay: null };

describe("bumpStreak", () => {
  it("starts a streak at 1 from a cold state", () => {
    expect(bumpStreak(fresh, "2026-08-10")).toEqual({
      current: 1,
      best: 1,
      lastActiveDay: "2026-08-10",
    });
  });

  it("is idempotent within the same day", () => {
    const once = bumpStreak(fresh, "2026-08-10");
    // Forty graded puzzles in one sitting must not equal a 40-day streak.
    let state = once;
    for (let i = 0; i < 40; i++) state = bumpStreak(state, "2026-08-10");
    expect(state).toEqual(once);
    expect(state.current).toBe(1);
  });

  it("increments on a consecutive day", () => {
    const d1 = bumpStreak(fresh, "2026-08-10");
    const d2 = bumpStreak(d1, "2026-08-11");
    expect(d2.current).toBe(2);
    expect(d2.best).toBe(2);
  });

  it("resets to 1 after a missed day but preserves best", () => {
    let s = bumpStreak(fresh, "2026-08-10");
    s = bumpStreak(s, "2026-08-11");
    s = bumpStreak(s, "2026-08-12");
    expect(s.current).toBe(3);
    // Skip the 13th.
    const after = bumpStreak(s, "2026-08-14");
    expect(after.current).toBe(1);
    expect(after.best).toBe(3);
  });

  it("crosses a month boundary as consecutive", () => {
    const s = bumpStreak(
      { current: 4, best: 9, lastActiveDay: "2026-08-31" },
      "2026-09-01",
    );
    expect(s.current).toBe(5);
    expect(s.best).toBe(9);
  });

  it("crosses a year boundary as consecutive", () => {
    const s = bumpStreak(
      { current: 2, best: 2, lastActiveDay: "2026-12-31" },
      "2027-01-01",
    );
    expect(s.current).toBe(3);
  });
});

describe("dayKey", () => {
  it("formats local dates as zero-padded YYYY-MM-DD", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(dayKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("uses LOCAL date parts, not UTC", () => {
    // 2026-08-10 23:30 local. A UTC-based implementation would report the
    // 11th for anyone east of Greenwich, silently splitting one evening's
    // training across two "days" and breaking the streak.
    expect(dayKey(new Date(2026, 7, 10, 23, 30))).toBe("2026-08-10");
  });
});
