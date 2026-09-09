import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EXPERT_TESTIMONIALS } from "@/data/expertTestimonials";

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

  it("uses unique ids, title-prefixed names, and untrimmed-free quotes", () => {
    const ids = EXPERT_TESTIMONIALS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of EXPERT_TESTIMONIALS) {
      expect(t.name).toMatch(/^GM /);
      expect(t.quote).toBe(t.quote.trim());
      expect(t.quote.length).toBeGreaterThan(0);
    }
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
