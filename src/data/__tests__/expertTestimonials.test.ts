import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPERT_TESTIMONIALS,
  testimonialInitials,
} from "@/data/expertTestimonials";

const root = process.cwd();

describe("expert testimonials", () => {
  it("carries both grandmaster quotes verbatim", () => {
    expect(EXPERT_TESTIMONIALS).toEqual([
      expect.objectContaining({
        name: "GM Pavel Skatchkov",
        title: "Grandmaster",
        quote:
          "This project is the future of chess and of humanity as a whole. Therefore, your work is very important.",
      }),
      expect.objectContaining({
        name: "GM Alex Colovic",
        title: "Grandmaster",
        quote:
          "It's commendable what you have done, providing free coaching to those who cannot afford it.",
      }),
    ]);
  });

  it("uses unique ids, title-prefixed names, and trimmed quotes", () => {
    const ids = EXPERT_TESTIMONIALS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of EXPERT_TESTIMONIALS) {
      expect(t.name).toMatch(/^GM /);
      expect(t.quote).toBe(t.quote.trim());
      expect(t.quote.length).toBeGreaterThan(0);
    }
  });

  it("ships every declared photo as a real file under public/", () => {
    // Both grandmasters have a portrait on file; a regression that drops one
    // would silently fall back to initials, so pin the count.
    expect(EXPERT_TESTIMONIALS.filter((t) => t.photo)).toHaveLength(2);
    for (const t of EXPERT_TESTIMONIALS) {
      if (!t.photo) continue;
      expect(t.photo.src).toMatch(
        /^\/testimonials\/[a-z0-9-]+\.(jpg|png|webp)$/
      );
      const file = path.join(root, "public", t.photo.src);
      expect(fs.existsSync(file), `${t.name}: missing ${file}`).toBe(true);
      expect(fs.statSync(file).size).toBeGreaterThan(1024);
      if (t.photo.credit) {
        expect(t.photo.credit.sourceUrl).toMatch(/^https:\/\//);
        // A licence name without its deed URL would render a dangling link.
        if (t.photo.credit.license) {
          expect(t.photo.credit.licenseUrl).toMatch(/^https:\/\//);
        }
      }
    }
  });

  it("derives initials for the no-photo fallback", () => {
    expect(testimonialInitials("GM Pavel Skatchkov")).toBe("PS");
    expect(testimonialInitials("GM Alex Colovic")).toBe("AC");
    expect(testimonialInitials("Magnus")).toBe("M");
  });

  it("is rendered by the landing page, directly under the hero", () => {
    const source = fs.readFileSync(
      path.join(root, "src/pages/index.tsx"),
      "utf8"
    );
    expect(source).toContain('from "@/data/expertTestimonials"');
    expect(source).toContain("<ExpertTestimonials />");
    // Section order: hero, then the grandmasters, then everything else. The
    // endorsement is the first thing a visitor reads after the pitch.
    expect(source.indexOf("<Hero />")).toBeLessThan(
      source.indexOf("<ExpertTestimonials />")
    );
    expect(source.indexOf("<ExpertTestimonials />")).toBeLessThan(
      source.indexOf("<MarqueeStrip />")
    );
    // The hero's one-line signal deep-links to the section.
    expect(source).toContain('id="gm-backed"');
    expect(source).toContain('href="#gm-backed"');
    // Photo credits ship in the footer, not under the section.
    expect(source.indexOf("<TestimonialPhotoCredits />")).toBeGreaterThan(
      source.indexOf("function Footer()")
    );
  });
});
