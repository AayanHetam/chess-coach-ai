import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HERO_HEADLINE, HERO_SUBLINE, Hero, START_LABEL } from "../Hero";
import { CHOICES_HEADING, HOME_CHOICES, HomeChoices } from "../HomeChoices";
import { HERO_MASTI_GREETING } from "../HeroMasti";

/**
 * The home page is Masti, one sentence, one button and four doors, and it
 * stays that way by test: the visible word count of the first screen is a
 * budget here, and the landing files are grepped for the glass-and-glow
 * idioms the 2026-09-23 simplification removed. A new section has to earn
 * its words in this file.
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

describe("home page: the first screen", () => {
  const html = renderToStaticMarkup(createElement(Hero));
  const text = visibleText(html);

  it("is Masti, one sentence and one button", () => {
    expect(html).toContain('data-testid="hero-masti"');
    expect(text).toContain(HERO_MASTI_GREETING);
    expect(html).toContain("<h1");
    expect(text).toContain(HERO_HEADLINE);
    expect(text).toContain(HERO_SUBLINE);
    expect(text).toContain(START_LABEL);
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

  it("says it in under twenty words", () => {
    expect(wordCount(text)).toBeLessThanOrEqual(20);
  });

  it("asks for no sign-in", () => {
    expect(html).not.toMatch(/sign in|free account|no card/i);
    expect(html).not.toContain("data-cm-sign-in");
  });
});

describe("home page: the four doors", () => {
  const html = renderToStaticMarkup(createElement(HomeChoices));
  const text = visibleText(html);

  it("are Play, Practice, Analyze and Learn, in the nav's words and order", () => {
    expect(HOME_CHOICES.map((c) => [c.label, c.href])).toEqual([
      ["Play", "/play"],
      ["Practice", "/practice"],
      ["Analyze", "/analysis"],
      ["Learn", "/learn"],
    ]);
    for (const c of HOME_CHOICES) {
      expect(html).toContain(`href="${c.href}"`);
      expect(html).toContain(`data-testid="home-choice-${c.id}"`);
      expect(text).toContain(c.label);
      expect(text).toContain(c.hint);
    }
    expect(text).toContain(CHOICES_HEADING);
  });

  it("say one word each plus a short hint, under thirty words in all", () => {
    for (const c of HOME_CHOICES) {
      expect(wordCount(c.label), c.id).toBe(1);
      expect(wordCount(c.hint), c.id).toBeLessThanOrEqual(4);
    }
    expect(wordCount(text)).toBeLessThanOrEqual(30);
  });
});

describe("home page: flat, not glowing", () => {
  const files = [
    "src/pages/index.tsx",
    "src/components/landing/Hero.tsx",
    "src/components/landing/HeroMasti.tsx",
    "src/components/landing/HomeChoices.tsx",
    "src/components/landing/HomeTestimonials.tsx",
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
