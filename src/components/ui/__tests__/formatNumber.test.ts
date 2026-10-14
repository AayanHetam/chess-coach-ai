import { describe, it, expect } from "vitest";
import { formatTickerValue } from "@/components/ui/formatNumber";

/**
 * formatTickerValue renders the /plan headline figures. What the server
 * sends, and what a crawler, a hidden tab or a reduced-motion user sees, has
 * to be the real figure, formatted the same way on both sides of hydration.
 */
describe("formatTickerValue", () => {
  it("formats with a pinned locale so server and client markup agree", () => {
    expect(formatTickerValue(3500)).toBe("3,500");
    expect(formatTickerValue(100000)).toBe("100,000");
    expect(formatTickerValue(99.6)).toBe("100");
  });
});
