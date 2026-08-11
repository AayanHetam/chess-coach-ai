import { describe, expect, it } from "vitest";
import { stepDifficulty } from "@/lib/puzzleDifficulty";

// Mirrors RATING_BANDS in src/pages/puzzles.tsx with the "all" catch-all
// already filtered out, which is how the page calls this.
const BANDS = [
  { id: "beginner", min: 400, max: 1199 },
  { id: "intermediate", min: 1200, max: 1599 },
  { id: "advanced", min: 1600, max: 1999 },
  { id: "expert", min: 2000, max: 3000 },
];

describe("stepDifficulty", () => {
  it("steps up and down from an explicitly selected band", () => {
    expect(stepDifficulty(BANDS, "intermediate", 1400, 1)?.id).toBe("advanced");
    expect(stepDifficulty(BANDS, "intermediate", 1400, -1)?.id).toBe(
      "beginner",
    );
  });

  it("locates the band from the puzzle's rating when none is selected", () => {
    // "all" is a filter state, not a difficulty — a 1750 puzzle should step
    // up to expert, not to intermediate-from-index-0.
    expect(stepDifficulty(BANDS, "all", 1750, 1)?.id).toBe("expert");
    expect(stepDifficulty(BANDS, "all", 1750, -1)?.id).toBe("intermediate");
  });

  it("returns null at the ceiling and the floor instead of wrapping", () => {
    expect(stepDifficulty(BANDS, "expert", 2400, 1)).toBeNull();
    expect(stepDifficulty(BANDS, "beginner", 800, -1)).toBeNull();
  });

  it("clamps a rating below every band to the easiest band", () => {
    expect(stepDifficulty(BANDS, "all", 200, 1)?.id).toBe("intermediate");
    expect(stepDifficulty(BANDS, "all", 200, -1)).toBeNull();
  });

  it("clamps a rating above every band to the hardest band", () => {
    // Regression guard: an earlier version defaulted an out-of-range rating to
    // index 0, which yanked a 3200 player down to beginner on "Easier".
    expect(stepDifficulty(BANDS, "all", 3200, -1)?.id).toBe("advanced");
    expect(stepDifficulty(BANDS, "all", 3200, 1)).toBeNull();
  });

  it("is a no-op on an empty band list", () => {
    expect(stepDifficulty([], "all", 1500, 1)).toBeNull();
  });
});
