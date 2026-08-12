import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "@/lib/performance/relativeTime";

const NOW = 1_760_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
  it("steps through the units", () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - 5 * MIN, NOW)).toBe("5m ago");
    expect(formatRelativeTime(NOW - 3 * HOUR, NOW)).toBe("3h ago");
    expect(formatRelativeTime(NOW - 2 * DAY, NOW)).toBe("2d ago");
    expect(formatRelativeTime(NOW - 10 * DAY, NOW)).toBe("1w ago");
    expect(formatRelativeTime(NOW - 60 * DAY, NOW)).toBe("2mo ago");
    expect(formatRelativeTime(NOW - 400 * DAY, NOW)).toBe("1y ago");
  });

  it("does not report a future game as 'in -4 minutes'", () => {
    // Platform clocks run slightly ahead of ours often enough that this shows
    // up in practice on a game finished seconds ago.
    expect(formatRelativeTime(NOW + 5000, NOW)).toBe("just now");
  });

  it("returns an empty string for a missing or nonsense timestamp", () => {
    // Better a blank cell than "56y ago" from an epoch-0 default.
    expect(formatRelativeTime(0, NOW)).toBe("");
    expect(formatRelativeTime(Number.NaN, NOW)).toBe("");
  });

  it("crosses each boundary at the right moment", () => {
    expect(formatRelativeTime(NOW - 59_999, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - MIN, NOW)).toBe("1m ago");
    expect(formatRelativeTime(NOW - 59 * MIN, NOW)).toBe("59m ago");
    expect(formatRelativeTime(NOW - HOUR, NOW)).toBe("1h ago");
    expect(formatRelativeTime(NOW - 23 * HOUR, NOW)).toBe("23h ago");
    expect(formatRelativeTime(NOW - DAY, NOW)).toBe("1d ago");
  });
});
