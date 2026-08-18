import { describe, expect, it } from "vitest";
import {
  computeAnalytics,
  TIME_BUCKET_MIN_GAMES,
  wilsonBounds,
} from "@/lib/scoutAnalytics";
import type { ScoutGame } from "@/types/scout";

const ME = "Target";

/** A game finishing at a given local hour, with a chosen outcome for ME. */
function game(
  i: number,
  hour: number,
  outcome: "win" | "loss" | "draw",
  termination: ScoutGame["termination"] = "resign"
): ScoutGame {
  // Build from local-time parts so the bucket the test asserts is the bucket
  // the code computes — both go through the same local calendar.
  const d = new Date(2026, 0, 5 + (i % 7), hour, 30, 0);
  return {
    id: `g${i}-${hour}`,
    platform: "chess.com",
    moves: ["e4", "e5"],
    numMoves: 40,
    whiteUsername: ME,
    blackUsername: "other",
    whiteRating: 1500,
    blackRating: 1500,
    result: outcome === "win" ? "1-0" : outcome === "loss" ? "0-1" : "1/2-1/2",
    timeClass: "blitz",
    termination,
    date: d.getTime(),
  };
}

describe("clock windows", () => {
  it("buckets the record by hour", () => {
    const games = [
      ...Array.from({ length: 10 }, (_, i) => game(i, 14, "win")),
      ...Array.from({ length: 10 }, (_, i) => game(100 + i, 2, "loss")),
    ];

    const { clockWindows } = computeAnalytics(games, ME);

    expect(clockWindows.sampled).toBe(20);
    expect(clockWindows.byHour[14].games).toBe(10);
    expect(clockWindows.byHour[14].scorePct).toBe(100);
    expect(clockWindows.byHour[2].games).toBe(10);
    expect(clockWindows.byHour[2].scorePct).toBe(0);
  });

  it("names the weakest and strongest reliable hour", () => {
    const games = [
      ...Array.from({ length: 12 }, (_, i) => game(i, 14, "win")),
      ...Array.from({ length: 12 }, (_, i) => game(100 + i, 2, "loss")),
    ];

    const { clockWindows } = computeAnalytics(games, ME);

    expect(clockWindows.weakestHour?.index).toBe(2);
    expect(clockWindows.strongestHour?.index).toBe(14);
    expect(clockWindows.busiestHour?.games).toBe(12);
  });

  // The guard that matters: one unlucky late-night game must not render as a
  // confident "0% at 3 AM".
  it("does not report a rate from a thin sample", () => {
    const games = [
      ...Array.from({ length: 12 }, (_, i) => game(i, 14, "win")),
      game(999, 3, "loss"), // n=1 at 03:00
    ];

    const { clockWindows } = computeAnalytics(games, ME);

    expect(clockWindows.byHour[3].games).toBe(1);
    expect(clockWindows.byHour[3].reliable).toBe(false);
    // CONTROL: the thin bucket's raw score really is 0, so this test would pass
    // vacuously if `reliable` were ignored downstream. Assert the selector
    // skipped it rather than merely that the flag is set.
    expect(clockWindows.byHour[3].scorePct).toBe(0);
    expect(clockWindows.weakestHour?.index).toBe(14);
  });

  it("reports the timeout share of losses per bucket", () => {
    const games = [
      ...Array.from({ length: 5 }, (_, i) => game(i, 23, "loss", "timeout")),
      ...Array.from({ length: 5 }, (_, i) => game(50 + i, 23, "loss", "resign")),
    ];

    const { clockWindows } = computeAnalytics(games, ME);

    expect(clockWindows.byHour[23].losses).toBe(10);
    expect(clockWindows.byHour[23].timeoutPct).toBe(50);
  });

  it("drops games with no usable timestamp rather than bucketing them at epoch", () => {
    const good = Array.from({ length: 10 }, (_, i) => game(i, 14, "win"));
    const undated = { ...game(500, 14, "win"), date: 0 };

    const { clockWindows } = computeAnalytics([...good, undated], ME);

    expect(clockWindows.sampled).toBe(10);
    // Hour 0 of 1 Jan 1970 would land here if a zero date were trusted.
    expect(clockWindows.byHour[0].games).toBe(0);
  });

  it("exposes the sample floor it enforces", () => {
    expect(TIME_BUCKET_MIN_GAMES).toBeGreaterThan(1);
  });
});

describe("clock window extremes are sample-weighted", () => {
  // The case that motivated this: on raw rate, a barely-reliable 10-game bucket
  // at 60% outranked a 96-game bucket at 50% and got printed as "AVOID".
  it("does not let a thin bucket outrank a well-evidenced one on noise", () => {
    const games = [
      ...Array.from({ length: 6 }, (_, i) => game(i, 7, "win")),
      ...Array.from({ length: 4 }, (_, i) => game(50 + i, 7, "loss")),
      ...Array.from({ length: 48 }, (_, i) => game(200 + i, 21, "win")),
      ...Array.from({ length: 48 }, (_, i) => game(400 + i, 21, "loss")),
    ];

    const { clockWindows } = computeAnalytics(games, ME);

    // CONTROL: the thin bucket really does hold the higher raw rate, so a pass
    // here means the ranking overrode it rather than never facing the choice.
    expect(clockWindows.byHour[7].scorePct).toBe(60);
    expect(clockWindows.byHour[21].scorePct).toBe(50);
    expect(clockWindows.byHour[7].reliable).toBe(true);

    expect(clockWindows.strongestHour?.index).toBe(21);
  });

  // The converse guard: shrinkage must not be so aggressive that a genuinely
  // extreme small sample is ignored. 9/10 is real evidence.
  it("still respects a small sample that is genuinely extreme", () => {
    const games = [
      ...Array.from({ length: 9 }, (_, i) => game(i, 7, "win")),
      game(90, 7, "loss"),
      ...Array.from({ length: 116 }, (_, i) => game(200 + i, 21, "win")),
      ...Array.from({ length: 84 }, (_, i) => game(400 + i, 21, "loss")),
    ];

    const { clockWindows } = computeAnalytics(games, ME);

    expect(clockWindows.strongestHour?.index).toBe(7);
  });

  it("wilsonBounds brackets the observed rate and widens as n shrinks", () => {
    const tight = wilsonBounds(0.5, 400);
    const loose = wilsonBounds(0.5, 10);

    expect(tight.lower).toBeLessThan(0.5);
    expect(tight.upper).toBeGreaterThan(0.5);
    expect(loose.upper - loose.lower).toBeGreaterThan(tight.upper - tight.lower);
  });
});
