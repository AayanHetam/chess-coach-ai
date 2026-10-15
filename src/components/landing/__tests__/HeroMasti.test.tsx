import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HERO_MASTI_GREETING, HeroMastiStage } from "../HeroMasti";
import { MASTI_VERSION } from "@/components/masti/manifest";

describe("HeroMastiStage", () => {
  it("puts the waving still and one word on stage, no sign-in ask", () => {
    const html = renderToStaticMarkup(createElement(HeroMastiStage));
    expect(html).toContain('data-testid="hero-masti"');
    expect(html).toContain('data-masti-mood="wave"');
    // The stage draws from the full still, not the 320px face crop.
    expect(html).toContain(`/masti/${MASTI_VERSION}/still/wave@2x.webp 2x`);
    expect(html).not.toContain("/anim/");
    expect(html).toContain(HERO_MASTI_GREETING);
    // The page head preloads this still on every viewport, so the figure
    // itself stays lazy.
    expect(html).toContain('loading="lazy"');
    expect(html).not.toMatch(/sign in|free account/i);
    expect(html).not.toContain("data-cm-sign-in");
  });
});
