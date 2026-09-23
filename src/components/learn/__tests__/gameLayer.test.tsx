// The pieces of the /learn game layer that can be checked without a browser.
//
// The ring and the burst are decoration over numbers that are printed in text
// beside them, so what matters here is that they stay decoration: hidden from
// the accessibility tree, deterministic, and absent from server markup where
// they would only be a hundred spans nobody asked for.

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProgressRing } from "../ProgressRing";
import { ConfettiBurst, confettiParticles, CONFETTI_COLOURS } from "../ConfettiBurst";

describe("ProgressRing", () => {
  it("is aria-hidden and carries the clamped value as data", () => {
    const html = renderToStaticMarkup(createElement(ProgressRing, { value: 0.42, colour: "#fff" }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-ring-value="42"');
    expect(html).not.toContain('role="img"');
  });

  it("draws empty for a broken number and full past one", () => {
    expect(renderToStaticMarkup(createElement(ProgressRing, { value: Number.NaN, colour: "#fff" })))
      .toContain('data-ring-value="0"');
    expect(renderToStaticMarkup(createElement(ProgressRing, { value: 3, colour: "#fff" })))
      .toContain('data-ring-value="100"');
  });
});

describe("confetti", () => {
  it("throws every piece somewhere different, in the product's colours", () => {
    const pieces = confettiParticles(1);
    expect(pieces).toHaveLength(18);
    const spots = new Set(pieces.map((p) => `${p.x},${p.y}`));
    expect(spots.size).toBe(pieces.length);
    for (const p of pieces) expect(CONFETTI_COLOURS).toContain(p.colour);
  });

  it("is deterministic per burst and different between bursts", () => {
    expect(confettiParticles(3)).toEqual(confettiParticles(3));
    expect(confettiParticles(3)).not.toEqual(confettiParticles(4));
  });

  it("puts nothing in server markup, even when armed", () => {
    expect(renderToStaticMarkup(createElement(ConfettiBurst, { burst: 5 }))).toBe("");
  });
});
