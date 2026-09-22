import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HERO_MASTI_LINE, HeroMastiStage } from "../HeroMasti";

describe("HeroMastiStage", () => {
  it("puts the waving still and the one-line pitch on stage, no sign-in ask", () => {
    const html = renderToStaticMarkup(createElement(HeroMastiStage));
    expect(html).toContain('data-testid="hero-masti"');
    expect(html).toContain('data-masti-mood="wave"');
    // The stage draws from the full still, not the 320px face crop.
    expect(html).toContain("/masti/v4/still/wave@2x.webp 2x");
    expect(html).not.toContain("/masti/v4/anim/");
    expect(html).toContain("Hi, I");
    // The apostrophe is HTML-escaped in SSR output, so match around it.
    expect(html).toContain(HERO_MASTI_LINE.split("I'll")[1]);
    // The page head preloads this still on every viewport, so the figure
    // itself stays lazy.
    expect(html).toContain('loading="lazy"');
    expect(html).not.toMatch(/sign in|free account/i);
    expect(html).not.toContain("data-cm-sign-in");
  });
});
