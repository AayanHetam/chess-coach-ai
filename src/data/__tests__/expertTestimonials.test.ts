import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TESTIMONIALS_HEADING } from "@/components/landing/HomeTestimonials";
import {
  EXPERT_TESTIMONIALS,
  testimonialInitials,
} from "@/data/expertTestimonials";

const root = process.cwd();

describe("expert testimonials", () => {
  it("carries every quote verbatim, grandmasters first", () => {
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
      expect.objectContaining({
        name: "FM Aayush Bhattacherjee",
        title: "FIDE Master",
        quote:
          "It is truly inspiring to see you using your skills to support and empower other players. It is an impressive platform with great potential, and it could very well represent the future of chess coaching. I wish you all the best with this initiative and hope it achieves great success.",
      }),
    ]);
  });

  it("uses unique ids, title-prefixed names that match the credential, and trimmed quotes", () => {
    // The name carries the FIDE title prefix and the caption spells it out.
    // The two must agree: "FM" under a caption reading "Grandmaster" would
    // be title inflation on a page whose whole point is credibility.
    const CREDENTIAL_FOR_PREFIX: Record<string, string> = {
      GM: "Grandmaster",
      IM: "International Master",
      FM: "FIDE Master",
      WGM: "Woman Grandmaster",
      WIM: "Woman International Master",
      CM: "Candidate Master",
      NM: "National Master",
    };
    const ids = EXPERT_TESTIMONIALS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of EXPERT_TESTIMONIALS) {
      const prefix = t.name.match(/^(GM|IM|FM|WGM|WIM|CM|NM) /)?.[1];
      expect(
        prefix,
        `${t.name}: name must start with a title prefix`
      ).toBeDefined();
      expect(t.title, `${t.name}: caption must spell out ${prefix}`).toBe(
        CREDENTIAL_FOR_PREFIX[prefix as string]
      );
      expect(t.quote).toBe(t.quote.trim());
      expect(t.quote.length).toBeGreaterThan(0);
    }
  });

  it("ships every declared photo as a real file under public/", () => {
    // All three have a portrait on file; a regression that drops one would
    // silently fall back to initials, so pin the count.
    expect(EXPERT_TESTIMONIALS.filter((t) => t.photo)).toHaveLength(3);
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
    expect(testimonialInitials("FM Aayush Bhattacherjee")).toBe("AB");
    expect(testimonialInitials("Magnus")).toBe("M");
  });

  it("is rendered by the landing page, under the four doors", () => {
    const page = fs.readFileSync(
      path.join(root, "src/pages/index.tsx"),
      "utf8"
    );
    const section = fs.readFileSync(
      path.join(root, "src/components/landing/HomeTestimonials.tsx"),
      "utf8"
    );
    expect(section).toContain('from "@/data/expertTestimonials"');
    expect(page).toContain("<HomeTestimonials />");
    // Section order: the hero, the four doors, then the masters. The
    // endorsement is a credibility signal for whoever scrolls, never a
    // choice on the first screen.
    expect(page.indexOf("<Hero />")).toBeLessThan(
      page.indexOf("<HomeChoices />")
    );
    expect(page.indexOf("<HomeChoices />")).toBeLessThan(
      page.indexOf("<HomeTestimonials />")
    );
    // The anchor stays for links from outside the page.
    expect(section).toContain('id="gm-backed"');
    // The heading is written against the roster. Each card's caption spells
    // out the person's own title, so the heading must not claim one for the
    // group that not everyone holds: "grandmasters" over an FM's card would
    // overstate his title.
    expect(TESTIMONIALS_HEADING).toBe("What chess masters say.");
    const allGrandmasters = EXPERT_TESTIMONIALS.every(
      (t) => t.title === "Grandmaster"
    );
    if (!allGrandmasters) {
      expect(TESTIMONIALS_HEADING).not.toMatch(/grandmaster/i);
    }
  });
});
