import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NumberTicker, formatTickerValue } from "@/components/ui/NumberTicker";

/**
 * The homepage stat strip ("3,500+ Engine Elo", "100,000 puzzles indexed",
 * "100% claims fact-checked") is rendered by NumberTicker. The count-up is
 * decoration; what the server sends — and what a crawler, a hidden tab or a
 * reduced-motion user sees — has to be the real figure. It used to be "0".
 */
describe("NumberTicker", () => {
  it("server-renders the real figure, not the count-up's starting zero", () => {
    const html = renderToStaticMarkup(
      createElement(NumberTicker, { value: 100000, suffix: "+" })
    );
    expect(html).toContain("100,000");
    expect(html).toContain("+");
    expect(html).not.toMatch(/>0\+?</);
  });

  it("keeps prefix and suffix around the figure", () => {
    const html = renderToStaticMarkup(
      createElement(NumberTicker, { value: 100, prefix: "~", suffix: "%" })
    );
    expect(html).toContain("~");
    expect(html).toContain("100");
    expect(html).toContain("%");
  });

  it("formats with a pinned locale so server and client markup agree", () => {
    expect(formatTickerValue(3500)).toBe("3,500");
    expect(formatTickerValue(100000)).toBe("100,000");
    expect(formatTickerValue(99.6)).toBe("100");
  });
});
