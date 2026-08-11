import { describe, expect, it } from "vitest";
import { formatSolveClock } from "@/lib/puzzle/solveClock";

describe("formatSolveClock", () => {
  it("shows M:SS with a zero-padded seconds field", () => {
    expect(formatSolveClock(0)).toBe("0:00");
    expect(formatSolveClock(7_000)).toBe("0:07");
    expect(formatSolveClock(65_000)).toBe("1:05");
  });

  it("does not pad the leading unit", () => {
    // "00:07" reads like a countdown about to expire. This is a stopwatch.
    expect(formatSolveClock(7_000)).not.toBe("00:07");
  });

  it("rolls over to H:MM:SS past an hour", () => {
    expect(formatSolveClock(3_600_000)).toBe("1:00:00");
    expect(formatSolveClock(3_661_000)).toBe("1:01:01");
    expect(formatSolveClock(45_296_000)).toBe("12:34:56");
  });

  it("truncates rather than rounds partial seconds", () => {
    // Rounding up would show 0:01 the instant the puzzle loads.
    expect(formatSolveClock(999)).toBe("0:00");
    expect(formatSolveClock(1_999)).toBe("0:01");
  });

  it("clamps nonsense input to zero instead of rendering NaN", () => {
    // A backgrounded tab and a clock adjustment can both produce these.
    expect(formatSolveClock(-5_000)).toBe("0:00");
    expect(formatSolveClock(Number.NaN)).toBe("0:00");
    expect(formatSolveClock(Number.POSITIVE_INFINITY)).toBe("0:00");
  });

  it("handles the minute and hour boundaries exactly", () => {
    expect(formatSolveClock(59_999)).toBe("0:59");
    expect(formatSolveClock(60_000)).toBe("1:00");
    expect(formatSolveClock(3_599_999)).toBe("59:59");
  });
});
