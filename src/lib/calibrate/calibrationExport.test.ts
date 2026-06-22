import { describe, it, expect } from "vitest";
import { buildExport, cleanCoachText, isItemFullyRated } from "./calibrationExport";

const items = [
  {
    id: "a",
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    movePlayedSan: "e4",
    bestMoveSan: "e4",
    evalDeltaCpMoverPov: 0,
    classification: "best",
    userRating: 1200,
    tier: "fast",
    coachText: "x",
  },
  {
    id: "b",
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    movePlayedSan: "e4",
    bestMoveSan: "d4",
    evalDeltaCpMoverPov: -100,
    classification: "inaccuracy",
    userRating: 1200,
    tier: "fast",
    coachText: "y",
  },
];

const full = { d1: 2, d2: 1, d3: 0, d4: 2, d5: 1, d6: 2, d7: 1 } as const;

describe("isItemFullyRated", () => {
  it("is false for undefined", () => {
    expect(isItemFullyRated(undefined)).toBe(false);
  });

  it("is false when a dim is missing", () => {
    expect(isItemFullyRated({ d1: 0, d2: 0, d3: 0, d4: 0, d5: 0, d6: 0 })).toBe(
      false
    );
  });

  it("is true when all 7 dims (including zeros) are present", () => {
    expect(
      isItemFullyRated({ d1: 0, d2: 0, d3: 0, d4: 0, d5: 0, d6: 0, d7: 0 })
    ).toBe(true);
  });
});

describe("buildExport", () => {
  it("includes only fully-rated items and counts the excluded", () => {
    const ratings = { a: { ...full }, b: { d1: 1 } };
    const { payload, excludedCount } = buildExport("Casey", items, ratings);
    expect(excludedCount).toBe(1);
    expect(payload.rater).toBe("Casey");
    expect(payload.ratings).toHaveLength(1);
    expect(payload.ratings[0]).toEqual({ id: "a", ...full });
    expect(payload.generatedNote).toContain("1 items");
  });

  it("never zero-fills a partially-rated item", () => {
    const ratings = { a: { d1: 2, d2: 1 } };
    const { payload, excludedCount } = buildExport("Casey", items, ratings);
    expect(payload.ratings).toHaveLength(0);
    expect(excludedCount).toBe(2);
  });

  it("preserves an explicit zero score in the export", () => {
    const ratings = { a: { ...full, d3: 0 } } as const;
    const { payload } = buildExport("Casey", items, ratings);
    expect(payload.ratings[0].d3).toBe(0);
  });

  it("treats N/A as a valid (rated) value and preserves it in the export", () => {
    const ratings = { a: { ...full, d2: "na" } } as const;
    expect(isItemFullyRated(ratings.a)).toBe(true);
    const { payload } = buildExport("Casey", items, ratings);
    expect(payload.ratings[0].d2).toBe("na");
  });

  it("cleanCoachText strips control tags but keeps the prose", () => {
    const raw =
      "Let's walk through it.\n\n[INSIGHT:7:b:mistake:-1.05:-1.15:dxc3:Nxd4]\nThis was a clever pawn grab.\n[WHY]\nIdea: snatch c3.\nProblem: opens a queen move.\n[CONTINUATION:7:b]\n[MAIA_CONTINUATION:7:b]\n[/WHY]\n[THREATS]";
    const cleaned = cleanCoachText(raw);
    expect(cleaned).not.toMatch(/\[INSIGHT|\[WHY|\[CONTINUATION|\[MAIA|\[THREATS|\[\/WHY/);
    expect(cleaned).toContain("This was a clever pawn grab.");
    expect(cleaned).toContain("Idea: snatch c3.");
    expect(cleaned).toContain("Problem: opens a queen move.");
    expect(cleaned).not.toMatch(/\n{3,}/); // collapsed blank lines
  });

  it("exports a note-only item (rater flagged an issue without full ratings)", () => {
    const { payload, excludedCount } = buildExport("Casey", items, { a: { d1: 2 } }, { a: "duplicate position" });
    const row = payload.ratings.find((r) => r.id === "a");
    expect(row?.notes).toBe("duplicate position");
    expect(row?.d1).toBe(2);
    expect(excludedCount).toBe(1); // item b: no rating, no note
  });
});
