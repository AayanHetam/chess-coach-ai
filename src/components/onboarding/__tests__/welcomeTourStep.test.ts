import { describe, it, expect } from "vitest";
import { initialTourStep, TOUR_STEP_ORDER } from "../welcomeTourSteps";

/**
 * The tour's cards are Practice → Analyze → Plan. Opening on the card for
 * the surface the visitor is already on is what stops the first card from
 * describing a different tab than the one under it.
 */
describe("initialTourStep", () => {
  it("keeps the tour order the cards are written in", () => {
    expect([...TOUR_STEP_ORDER]).toEqual(["Practice", "Analyze", "Plan"]);
  });

  it("opens on the card for the surface the visitor is on", () => {
    expect(initialTourStep("/puzzles")).toBe(0);
    expect(initialTourStep("/puzzles/1200")).toBe(0);
    expect(initialTourStep("/analysis")).toBe(1);
    expect(initialTourStep("/plan")).toBe(2);
  });

  it("starts from the first card on surfaces that have no card", () => {
    expect(initialTourStep("/play")).toBe(0);
    expect(initialTourStep("/learn")).toBe(0);
    expect(initialTourStep("/scout")).toBe(0);
  });

  it("matches whole path segments, not prefixes of other routes", () => {
    expect(initialTourStep("/planner")).toBe(0);
    expect(initialTourStep("/analysis-legacy")).toBe(0);
  });
});
