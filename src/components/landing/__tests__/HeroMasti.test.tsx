import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HERO_MASTI_LINE,
  HeroMastiGreeting,
  HeroMastiMini,
} from "../HeroMasti";

describe("HeroMasti", () => {
  it("greets with the waving still and the one-line pitch, no sign-in ask", () => {
    const html = renderToStaticMarkup(createElement(HeroMastiGreeting));
    expect(html).toContain('data-testid="hero-masti"');
    expect(html).toContain('data-masti-mood="wave"');
    expect(html).toContain("/masti/v4/still/wave@2x.webp 2x");
    expect(html).not.toContain("/masti/v4/anim/");
    expect(html).toContain("Hi, I");
    // The apostrophe is HTML-escaped in SSR output, so match around it.
    expect(html).toContain(HERO_MASTI_LINE.split("I'll")[1]);
    expect(html).toContain('loading="eager"');
    expect(html).not.toMatch(/sign in|free account/i);
    expect(html).not.toContain("data-cm-sign-in");
  });

  it("the phone mini is decorative and eager", () => {
    const html = renderToStaticMarkup(createElement(HeroMastiMini));
    expect(html).toContain('data-testid="hero-masti-mini"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('loading="eager"');
  });
});
