import { describe, expect, it } from "vitest";
import { findThemeReference } from "@/lib/puzzle/themeReference";

describe("findThemeReference", () => {
  it("finds a glossary entry for a plain theme name", () => {
    const ref = findThemeReference(["fork"]);
    expect(ref?.source).toBe("glossary");
    expect(ref?.title).toBe("Fork");
    expect(ref?.summary.length).toBeGreaterThan(20);
    expect(ref?.detail).toBeTruthy();
  });

  it("bridges the three theme vocabularies to one glossary key", () => {
    // Lichess camelCase from the CSV feed, kebab from Neo4j/curriculum, and
    // the glossary's own spaced English must all resolve to the same entry.
    const camel = findThemeReference(["discoveredAttack"]);
    const kebab = findThemeReference(["discovered-attack"]);
    const spaced = findThemeReference(["discovered attack"]);
    expect(camel?.title).toBe(kebab?.title);
    expect(kebab?.title).toBe(spaced?.title);
    expect(camel?.source).toBe("glossary");
  });

  it("handles multi-word camelCase themes", () => {
    const ref = findThemeReference(["backRankMate"]);
    expect(ref?.source).toBe("glossary");
    expect(ref?.title.toLowerCase()).toContain("back rank");
  });

  it("resolves camelCase themes through the syllabus fallback too", () => {
    // kingsideAttack -> kingside-attack, a real syllabus unit theme. Worth
    // pinning: the kebab conversion is what makes the fallback reachable at
    // all from the CSV feed's camelCase vocabulary.
    const ref = findThemeReference(["kingsideAttack"]);
    expect(ref?.source).toBe("syllabus");
    expect(ref?.summary.length).toBeGreaterThan(10);
  });

  it("falls back to the curriculum unit when the glossary has nothing", () => {
    // hanging-piece is a syllabus unit theme but not a glossary term.
    const ref = findThemeReference(["hanging-piece"]);
    expect(ref?.source).toBe("syllabus");
    expect(ref?.summary.length).toBeGreaterThan(10);
    expect(ref?.detail).toBeUndefined();
  });

  it("prefers a real definition over a unit blurb", () => {
    // A glossary hit anywhere in the list beats a syllabus hit earlier in it:
    // defining the motif is more useful than pitching the unit holding it.
    const ref = findThemeReference(["hanging-piece", "skewer"]);
    expect(ref?.source).toBe("glossary");
    expect(ref?.title).toBe("Skewer");
  });

  it("returns null rather than inventing an explanation", () => {
    // The whole point: ~55 of the ~70 Lichess themes have no static text. The
    // tool must go quiet, not generate a plausible-sounding definition.
    // "attraction" and "clearance" are real Lichess motifs that appear in
    // neither the 15-term glossary nor the 12-unit syllabus.
    expect(findThemeReference(["attraction"])).toBeNull();
    expect(findThemeReference(["clearance", "quietMove"])).toBeNull();
    // Structural corpus tags are not motifs at all.
    expect(findThemeReference(["crushing", "short"])).toBeNull();
  });

  it("handles empty and missing theme lists", () => {
    expect(findThemeReference([])).toBeNull();
    expect(findThemeReference(undefined)).toBeNull();
  });

  it("ignores unknown themes and keeps looking", () => {
    const ref = findThemeReference(["crushing", "veryLong", "pin"]);
    expect(ref?.title).toBe("Pin");
  });
});
