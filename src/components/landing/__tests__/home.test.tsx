import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HERO_HEADLINE, HERO_SUBLINE, Hero, START_LABEL } from "../Hero";
import { HERO_MASTI_GREETING } from "../HeroMasti";
import { HomeMasters, MASTERS_LABEL } from "../HomeMasters";
import { EXPERT_TESTIMONIALS } from "@/data/expertTestimonials";

/**
 * The home page is one screen: Masti, one sentence, one button and the
 * masters, and it stays that way by test. The visible word count is a
 * budget here, and the landing files are grepped for the glass-and-glow
 * idioms the 2026-09-23 simplification removed. landing.spec adds the
 * pixels: the page does not scroll. A new section has to earn its words in
 * this file and its height there.
 */

const root = process.cwd();

/**
 * Visible text of SSR output: Emotion's inline style blocks, tags and
 * attributes gone, entities decoded.
 */
function visibleText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

describe("home page: the one screen", () => {
  const html = renderToStaticMarkup(createElement(Hero));
  const text = visibleText(html);

  it("is Masti, one sentence, one button and the masters", () => {
    expect(html).toContain('data-testid="hero-masti"');
    expect(text).toContain(HERO_MASTI_GREETING);
    expect(html).toContain("<h1");
    expect(text).toContain(HERO_HEADLINE);
    expect(text).toContain(HERO_SUBLINE);
    expect(text).toContain(START_LABEL);
    expect(html).toContain('data-testid="home-masters"');
    expect(text).toContain(MASTERS_LABEL);
  });

  it("keeps the search phrase in the headline", () => {
    // landing.spec, prod/smoke.spec and the crawlers all look for it.
    expect(HERO_HEADLINE).toMatch(/chess coach/i);
  });

  it("sends a first visitor into the funnel", () => {
    // SSR renders with auth still loading, so the button is the quiz; a
    // user who has finished it is routed to /plan on the client.
    expect(html).toContain('href="/onboarding"');
  });

  it("says it in twenty words or fewer", () => {
    expect(wordCount(text)).toBeLessThanOrEqual(20);
  });

  it("asks for no sign-in", () => {
    expect(html).not.toMatch(/sign in|free account|no card/i);
    expect(html).not.toContain("data-cm-sign-in");
  });
});

describe("home page: the masters", () => {
  const html = renderToStaticMarkup(createElement(HomeMasters));

  it("shows every titled player as a face named by their own title", () => {
    for (const t of EXPERT_TESTIMONIALS) {
      expect(html).toContain(`aria-label="${t.name}, ${t.title}"`);
    }
    expect(visibleText(html)).toContain(MASTERS_LABEL);
  });

  it("keeps each quote whole in the face's tooltip, off the first paint", () => {
    // The tooltip renders only when open, so the page's first paint carries
    // none of the quote; the source hands it over untouched.
    const src = fs.readFileSync(
      path.join(root, "src/components/landing/HomeMasters.tsx"),
      "utf8"
    );
    expect(src).toContain("{t.quote}");
    for (const t of EXPERT_TESTIMONIALS) {
      expect(html).not.toContain(t.quote);
    }
  });

  it("names the group by a title every one of them holds", () => {
    expect(MASTERS_LABEL).toBe("Backed by chess masters");
    const allGrandmasters = EXPERT_TESTIMONIALS.every(
      (t) => t.title === "Grandmaster"
    );
    if (!allGrandmasters) {
      expect(MASTERS_LABEL).not.toMatch(/grandmaster/i);
    }
  });
});

describe("home page: flat, not glowing", () => {
  const files = [
    "src/pages/index.tsx",
    "src/components/landing/Hero.tsx",
    "src/components/landing/HeroMasti.tsx",
    "src/components/landing/HomeMasters.tsx",
    "src/components/landing/launchTheme.ts",
  ];

  it("uses no gradients, glass, glow, marquee or scroll reveals", () => {
    const glow =
      /linear-gradient|radial-gradient|conic-gradient|backdropFilter|blur\(|boxShadow|BackgroundClip|BorderBeam|GradientBackdrop|RevealOnScroll|MarqueeStrip|framer-motion/;
    for (const file of files) {
      const src = fs.readFileSync(path.join(root, file), "utf8");
      expect(src, file).not.toMatch(glow);
    }
  });
});
