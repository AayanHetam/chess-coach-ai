import { describe, it, expect } from "vitest";
import {
  PLACEMENT_LENGTH,
  PLACEMENT_THEME_PLAN,
  PLACEMENT_K_SCHEDULE,
  seedEstimate,
  placementWindow,
  applyPlacementElo,
  computeConfidence,
  buildThemeStrength,
  pickFocusThemes,
  finalizePlacement,
  PlacementItem,
} from "../placementTest";
import { QUIZ_FOCUS_THEME_IDS } from "@/components/onboarding/quizThemes";

/** Simulate a whole test where the user solves iff puzzleRating <= trueStrength. */
function simulate(trueStrength: number, seed: number): PlacementItem[] {
  let estimate = seedEstimate(seed);
  const history: PlacementItem[] = [];
  for (let i = 0; i < PLACEMENT_LENGTH; i++) {
    // UI would fetch near the estimate; model the puzzle as exactly at estimate.
    const puzzleRating = estimate;
    const solved = puzzleRating <= trueStrength;
    estimate = applyPlacementElo(estimate, puzzleRating, solved, i);
    history.push({
      theme: PLACEMENT_THEME_PLAN[i],
      puzzleRating,
      solved,
      estimateAfter: estimate,
    });
  }
  return history;
}

describe("placement theme plan", () => {
  it("has exactly 20 slots, all from the verified has-edge theme set", () => {
    expect(PLACEMENT_THEME_PLAN).toHaveLength(PLACEMENT_LENGTH);
    expect(PLACEMENT_K_SCHEDULE).toHaveLength(PLACEMENT_LENGTH);
    const allowed = new Set<string>(QUIZ_FOCUS_THEME_IDS);
    for (const t of PLACEMENT_THEME_PLAN) expect(allowed.has(t)).toBe(true);
  });

  it("double-samples the six fundamentals", () => {
    const counts: Record<string, number> = {};
    for (const t of PLACEMENT_THEME_PLAN) counts[t] = (counts[t] ?? 0) + 1;
    for (const f of [
      "fork",
      "pin",
      "hanging-piece",
      "back-rank",
      "mating-attack",
      "discovered-attack",
    ]) {
      expect(counts[f]).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("seedEstimate", () => {
  it("clamps into [600, 2200] and defaults to 1000", () => {
    expect(seedEstimate(undefined)).toBe(1000);
    expect(seedEstimate(400)).toBe(600);
    expect(seedEstimate(3000)).toBe(2200);
    expect(seedEstimate(1450)).toBe(1450);
  });
});

describe("placementWindow", () => {
  it("is wider early, tighter late", () => {
    expect(placementWindow(0)).toBe(250);
    expect(placementWindow(4)).toBe(250);
    expect(placementWindow(5)).toBe(150);
    expect(placementWindow(19)).toBe(150);
  });
});

describe("adaptive convergence", () => {
  it("climbs toward a strong player's level (seeded realistically) without runaway", () => {
    // Seeded near their level (as onboarding's self-report provides), a strong
    // player climbs to advanced and stays bounded by the K-schedule + clamp —
    // never blasts to the 3500 Elo cap.
    const history = simulate(2000, 1500);
    const final = history[history.length - 1].estimateAfter;
    expect(final).toBeGreaterThan(1700);
    expect(final).toBeLessThanOrEqual(2800);
  });

  it("has bounded single-test reach from a far-off seed (≈ sum(K)/2)", () => {
    // From a 1000 seed, 20 all-solved items can only lift the estimate ~430 pts
    // (sum of the K-schedule / 2). This is why a low-seeded strong player gets a
    // low-confidence under-estimate + a retest prompt rather than a false 2000.
    const history = simulate(3000, 1000); // always solves
    const final = history[history.length - 1].estimateAfter;
    expect(final).toBeGreaterThan(1300);
    expect(final).toBeLessThan(1600);
  });

  it("converges down for a weak player without flooring instantly", () => {
    const history = simulate(700, 1500);
    const final = history[history.length - 1].estimateAfter;
    expect(final).toBeLessThan(1200);
    expect(final).toBeGreaterThanOrEqual(400);
  });

  it("lands near the true strength for a mid player seeded at it", () => {
    const history = simulate(1300, 1300);
    const final = history[history.length - 1].estimateAfter;
    expect(Math.abs(final - 1300)).toBeLessThan(250);
  });
});

describe("computeConfidence", () => {
  it("is low when too few items completed", () => {
    const history = simulate(1300, 1300).slice(0, 6);
    expect(computeConfidence(history)).toBe("low");
  });

  it("is high when the tail estimate is stable", () => {
    const stable: PlacementItem[] = Array.from({ length: 12 }, (_, i) => ({
      theme: "fork",
      puzzleRating: 1300,
      solved: i % 2 === 0,
      estimateAfter: 1300 + (i % 2), // swing of 1
    }));
    expect(computeConfidence(stable)).toBe("high");
  });
});

describe("theme strength + focus themes", () => {
  it("scores per theme and picks the weakest missed themes", () => {
    const history: PlacementItem[] = [
      { theme: "fork", puzzleRating: 1200, solved: true, estimateAfter: 1250 },
      { theme: "fork", puzzleRating: 1250, solved: true, estimateAfter: 1300 },
      {
        theme: "back-rank",
        puzzleRating: 1200,
        solved: false,
        estimateAfter: 1250,
      },
      {
        theme: "back-rank",
        puzzleRating: 1200,
        solved: false,
        estimateAfter: 1200,
      },
      { theme: "pin", puzzleRating: 1200, solved: false, estimateAfter: 1180 },
      { theme: "pin", puzzleRating: 1180, solved: true, estimateAfter: 1200 },
    ];
    const strength = buildThemeStrength(history);
    expect(strength["fork"].score).toBe(1);
    expect(strength["back-rank"].score).toBe(0);
    expect(strength["pin"].score).toBe(0.5);

    const focus = pickFocusThemes(strength);
    // weakest first: back-rank (0) then pin (0.5); fork (1.0) excluded (not missed)
    expect(focus[0]).toBe("back-rank");
    expect(focus[1]).toBe("pin");
    expect(focus).not.toContain("fork");
  });

  it("returns no focus themes when the user missed nothing", () => {
    const history: PlacementItem[] = [
      { theme: "fork", puzzleRating: 1200, solved: true, estimateAfter: 1250 },
      { theme: "pin", puzzleRating: 1200, solved: true, estimateAfter: 1300 },
    ];
    expect(pickFocusThemes(buildThemeStrength(history))).toEqual([]);
  });
});

describe("finalizePlacement", () => {
  it("uses the seed and low confidence when no items were completed", () => {
    const res = finalizePlacement([], seedEstimate(1100));
    expect(res.itemsCompleted).toBe(0);
    expect(res.finalRating).toBe(1100);
    expect(res.confidence).toBe("low");
    expect(res.focusThemes).toEqual([]);
  });

  it("produces a full result for a complete run", () => {
    const history = simulate(1300, 1300);
    const res = finalizePlacement(history, seedEstimate(1300));
    expect(res.itemsCompleted).toBe(20);
    expect(res.finalRating).toBe(history[history.length - 1].estimateAfter);
    expect(["low", "medium", "high"]).toContain(res.confidence);
  });
});
