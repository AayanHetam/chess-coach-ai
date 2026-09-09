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
    for (const t of EXPERT_TESTIMONIALS) {
      if (!t.photo) continue;
      expect(t.photo.src).toMatch(
        /^\/testimonials\/[a-z0-9-]+\.(jpg|png|webp)$/
      );
      const file = path.join(root, "public", t.photo.src);
      expect(fs.existsSync(file), `${t.name}: missing ${file}`).toBe(true);
      expect(fs.statSync(file).size).toBeGreaterThan(1024);
      if (t.photo.credit) {
        expect(t.photo.credit.licenseUrl).toMatch(/^https:\/\//);
        expect(t.photo.credit.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });

  it("derives initials for the no-photo fallback", () => {
    expect(testimonialInitials("GM Pavel Skatchkov")).toBe("PS");
    expect(testimonialInitials("GM Alex Colovic")).toBe("AC");
    expect(testimonialInitials("Magnus")).toBe("M");
  });

  it("is rendered by the landing page", () => {
    const source = fs.readFileSync(
      path.join(root, "src/pages/index.tsx"),
      "utf8"
    );
    expect(source).toContain('from "@/data/expertTestimonials"');
    expect(source).toContain("<ExpertTestimonials />");
    // Section order: proof (stats, then GM voices), then the final CTA.
    expect(source.indexOf("<StatsStrip />")).toBeLessThan(
      source.indexOf("<ExpertTestimonials />")
    );
    expect(source.indexOf("<ExpertTestimonials />")).toBeLessThan(
      source.indexOf("<FinalCTA />")
    );
  });
});
