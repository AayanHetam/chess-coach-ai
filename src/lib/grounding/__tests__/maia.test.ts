import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  shouldCallMaia,
  probToVisibility,
  maiaResultToContext,
  queryMaiaAtRating,
  __clearMaiaCache,
} from "../maia";
import type { MaiaProbResult } from "../maia";

// ─── shouldCallMaia — trigger gate ────────────────────────────────────────────

describe("shouldCallMaia", () => {
  it("returns false when MAIA_API_URL not configured", () => {
    // No env var in test runtime → fail-closed
    expect(shouldCallMaia(1500, "e2e4")).toBe(false);
  });

  it("returns false when userRating is null or undefined", () => {
    expect(shouldCallMaia(null, "e2e4")).toBe(false);
    expect(shouldCallMaia(undefined, "e2e4")).toBe(false);
  });

  it("returns false when bestMoveUci is missing", () => {
    expect(shouldCallMaia(1500, null)).toBe(false);
    expect(shouldCallMaia(1500, undefined)).toBe(false);
    expect(shouldCallMaia(1500, "")).toBe(false);
  });

  it("returns false when bestMoveUci is malformed", () => {
    expect(shouldCallMaia(1500, "e2")).toBe(false);       // too short
    expect(shouldCallMaia(1500, "e2e4xx")).toBe(false);   // too long
  });

  it("returns false when rating is outside [100, 3500]", () => {
    expect(shouldCallMaia(50, "e2e4")).toBe(false);
    expect(shouldCallMaia(4000, "e2e4")).toBe(false);
  });
});

// ─── probToVisibility — threshold mapping ─────────────────────────────────────

describe("probToVisibility", () => {
  it("HIGH at or above 0.50", () => {
    expect(probToVisibility(0.50)).toBe("HIGH");
    expect(probToVisibility(0.75)).toBe("HIGH");
    expect(probToVisibility(1.00)).toBe("HIGH");
  });

  it("MED in [0.25, 0.50)", () => {
    expect(probToVisibility(0.25)).toBe("MED");
    expect(probToVisibility(0.35)).toBe("MED");
    expect(probToVisibility(0.499)).toBe("MED");
  });

  it("LOW in [0.15, 0.25)", () => {
    expect(probToVisibility(0.15)).toBe("LOW");
    expect(probToVisibility(0.20)).toBe("LOW");
    expect(probToVisibility(0.249)).toBe("LOW");
  });

  it("NONE below 0.15 (the suppression trigger)", () => {
    expect(probToVisibility(0.0)).toBe("NONE");
    expect(probToVisibility(0.05)).toBe("NONE");
    expect(probToVisibility(0.149)).toBe("NONE");
  });

  it("NONE for null/undefined/NaN", () => {
    expect(probToVisibility(null)).toBe("NONE");
    expect(probToVisibility(undefined)).toBe("NONE");
    expect(probToVisibility(NaN)).toBe("NONE");
  });
});

// ─── maiaResultToContext — prompt injection text ──────────────────────────────

const HIGH_VIS: MaiaProbResult = {
  fen: "test",
  rating: 1500,
  best_move_uci: "e2e4",
  prob_plays_best: 0.62,
  likely_moves: [{ move: "e4", probability: 0.62 }],
  model: "maia2",
  source: "live",
};

const NONE_VIS: MaiaProbResult = {
  fen: "test",
  rating: 1200,
  best_move_uci: "g1f3",
  prob_plays_best: 0.08,
  likely_moves: [
    { move: "d4", probability: 0.32 },
    { move: "Nc3", probability: 0.15 },
    { move: "Nf3", probability: 0.08 },
  ],
  model: "maia2",
  source: "live",
};

describe("maiaResultToContext", () => {
  it("returns empty string when result is null", () => {
    expect(maiaResultToContext(null, "Nf6")).toBe("");
  });

  it("emits suppression rule when prob < 0.15 (NONE visibility)", () => {
    const ctx = maiaResultToContext(NONE_VIS, "Nf3");
    expect(ctx).toContain("USER VISIBILITY");
    expect(ctx).toContain("8.0%");
    expect(ctx).toContain("1200-rated");
    expect(ctx).toContain("Do NOT use");
    expect(ctx).toContain("obvious");
    expect(ctx).toContain("clearly");
    // Frames the rating-appropriate alternative
    expect(ctx).toContain("d4");
  });

  it("emits informational context when prob >= 0.50 (HIGH visibility)", () => {
    const ctx = maiaResultToContext(HIGH_VIS, "e4");
    expect(ctx).toContain("USER VISIBILITY");
    expect(ctx).toContain("62.0%");
    expect(ctx).toContain("most players at this rating");
    // No suppression rule for HIGH
    expect(ctx).not.toContain("Do NOT use");
  });

  it("uses bestMoveSan when provided, falls back to UCI", () => {
    const withSan = maiaResultToContext(HIGH_VIS, "e4");
    expect(withSan).toContain("best move e4");

    const withoutSan = maiaResultToContext(HIGH_VIS, null);
    expect(withoutSan).toContain("best move e2e4");
  });

  it("MED tier uses 'clearly expected' language", () => {
    const medResult: MaiaProbResult = { ...HIGH_VIS, prob_plays_best: 0.30 };
    const ctx = maiaResultToContext(medResult, "e4");
    expect(ctx).toContain("expected move");
    expect(ctx).not.toContain("Do NOT use");
  });

  it("LOW tier uses 'findable but not automatic' language", () => {
    const lowResult: MaiaProbResult = { ...HIGH_VIS, prob_plays_best: 0.18 };
    const ctx = maiaResultToContext(lowResult, "e4");
    expect(ctx).toContain("findable but not automatic");
    expect(ctx).not.toContain("Do NOT use");
  });
});

// ─── queryMaiaAtRating — HTTP client safety ───────────────────────────────────

describe("queryMaiaAtRating", () => {
  beforeEach(() => { __clearMaiaCache(); });
  afterEach(() => { __clearMaiaCache(); });

  it("returns null when MAIA_API_URL is not set", async () => {
    const result = await queryMaiaAtRating(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      1500,
      "e2e4",
    );
    expect(result).toBeNull();
  });
});
