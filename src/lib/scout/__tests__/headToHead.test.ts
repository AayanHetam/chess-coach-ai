import { describe, expect, it } from "vitest";
import {
  biggestEdge,
  biggestGap,
  buildHeadToHead,
  buildRatingSeries,
  compareProfiles,
  expectedScore,
  ratingGapFor,
  ratingTrend,
} from "@/lib/scout/headToHead";
import type { ProfileSnapshot, ScoutGame } from "@/types/scout";

function profile(over: Partial<ProfileSnapshot> = {}): ProfileSnapshot {
  return {
    ovr: 50,
    atk: 50,
    def: 50,
    time: 50,
    mind: 50,
    ratings: { blitz: 1600, rapid: 1700 },
    totalGames: 100,
    spanDays: 90,
    recent: [],
    recentAccuracy: 50,
    winRate: 0.5,
    drawRate: 0,
    lossRate: 0.5,
    archetype: "The All-Rounder",
    phaseElo: {} as ProfileSnapshot["phaseElo"],
    ...over,
  };
}

describe("expectedScore", () => {
  it("is even at equal ratings", () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 9);
  });

  it("matches the textbook 400-point gap", () => {
    // 400 points is 10:1 odds → ~0.909.
    expect(expectedScore(1900, 1500)).toBeCloseTo(0.909, 3);
    expect(expectedScore(1500, 1900)).toBeCloseTo(0.091, 3);
  });

  it("is symmetric — the two expectations sum to 1", () => {
    expect(expectedScore(1720, 1480) + expectedScore(1480, 1720)).toBeCloseTo(1, 9);
  });

  it("round-trips through ratingGapFor", () => {
    expect(ratingGapFor(expectedScore(1500, 1700))).toBeCloseTo(-200, 6);
  });
});

describe("buildHeadToHead", () => {
  it("prefers their rating in the format you are about to play", () => {
    const h = buildHeadToHead({
      yourRating: 1500,
      yourRatingSource: "played",
      theirProfile: profile(),
      timeClass: "blitz",
    })!;

    expect(h.theirRating).toBe(1600);
    expect(h.timeClass).toBe("blitz");
    expect(h.gap).toBe(100);
    expect(h.expected).toBeCloseTo(expectedScore(1500, 1600), 9);
  });

  it("falls back to their best rating when the format has none", () => {
    const h = buildHeadToHead({
      yourRating: 1500,
      yourRatingSource: "played",
      theirProfile: profile(),
      timeClass: "bullet",
    })!;

    expect(h.theirRating).toBe(1700);
    // The comparison is no longer like-for-like, and must not claim to be.
    expect(h.timeClass).toBeUndefined();
  });

  it("carries where your rating came from", () => {
    const h = buildHeadToHead({
      yourRating: 1500,
      yourRatingSource: "self-reported",
      theirProfile: profile(),
    })!;
    expect(h.yourRatingSource).toBe("self-reported");
  });

  it("returns null rather than guessing when a rating is missing", () => {
    expect(
      buildHeadToHead({
        yourRating: 0,
        yourRatingSource: "played",
        theirProfile: profile(),
      })
    ).toBeNull();

    expect(
      buildHeadToHead({
        yourRating: 1500,
        yourRatingSource: "played",
        theirProfile: profile({ ratings: {}, peakRating: undefined }),
      })
    ).toBeNull();
  });
});

describe("buildRatingSeries", () => {
  const game = (i: number, rating: number, timeClass: ScoutGame["timeClass"] = "blitz"): ScoutGame => ({
    id: `g${i}`,
    platform: "chess.com",
    moves: [],
    whiteUsername: "Me",
    blackUsername: "Them",
    whiteRating: rating,
    blackRating: 1500,
    result: "1-0",
    timeClass,
    date: Date.UTC(2026, 0, 1) + i * 86_400_000,
  });

  it("returns their ratings in chronological order", () => {
    const series = buildRatingSeries([game(2, 1620), game(0, 1600), game(1, 1610)], "Me");
    expect(series.map(p => p.rating)).toEqual([1600, 1610, 1620]);
  });

  it("filters by time class", () => {
    const series = buildRatingSeries(
      [game(0, 1600, "blitz"), game(1, 1900, "rapid")],
      "Me",
      { timeClass: "blitz" }
    );
    expect(series).toHaveLength(1);
    expect(series[0].rating).toBe(1600);
  });

  it("downsamples but always keeps the true latest rating", () => {
    // The endpoint is what a reader checks against; a strided sample can drop
    // it, which would show a stale "current" rating.
    const games = Array.from({ length: 500 }, (_, i) => game(i, 1500 + i));
    const series = buildRatingSeries(games, "Me", { maxPoints: 20 });

    expect(series.length).toBeLessThanOrEqual(21);
    expect(series[series.length - 1].rating).toBe(1999);
  });

  it("ignores games without a usable rating or date", () => {
    const bad = { ...game(5, 1600), whiteRating: undefined };
    const undated = { ...game(6, 1600), date: 0 };
    expect(buildRatingSeries([bad, undated], "Me")).toHaveLength(0);
  });

  it("reports the net trend, or null when there is nothing to compare", () => {
    expect(ratingTrend([{ date: 1, rating: 1500 }, { date: 2, rating: 1620 }])).toBe(120);
    expect(ratingTrend([{ date: 1, rating: 1500 }])).toBeNull();
    expect(ratingTrend([])).toBeNull();
  });
});

describe("compareProfiles", () => {
  const you = profile({ atk: 70, def: 40, time: 60, mind: 55 });
  const them = profile({ atk: 50, def: 65, time: 45, mind: 58 });

  it("computes a per-dimension delta from your point of view", () => {
    const cmp = compareProfiles(you, them);
    expect(cmp.find(c => c.key === "atk")!.delta).toBe(20);
    expect(cmp.find(c => c.key === "def")!.delta).toBe(-25);
  });

  it("names the matchup to steer toward and the one to avoid", () => {
    const cmp = compareProfiles(you, them);
    expect(biggestEdge(cmp)!.key).toBe("atk");
    expect(biggestGap(cmp)!.key).toBe("def");
  });

  it("handles an empty comparison without throwing", () => {
    expect(biggestEdge([])).toBeNull();
    expect(biggestGap([])).toBeNull();
  });
});
