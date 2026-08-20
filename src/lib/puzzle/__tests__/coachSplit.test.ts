import { describe, expect, it } from "vitest";
import {
  COACH_MAX_FRACTION,
  COACH_MAX_PX,
  COACH_MIN_PX,
  COACH_STEP_PX,
  DEFAULT_COACH_TRACK,
  clampCoachWidth,
  coachTrack,
  dragCoachWidth,
  maxCoachWidth,
  stepCoachWidth,
} from "../coachSplit";

// A 1640-wide grid — the page's maxWidth, i.e. the roomiest real case.
const GRID = 1600;

describe("maxCoachWidth", () => {
  it("caps at COACH_MAX_PX on a wide grid", () => {
    // 42% of 1600 = 672 > 640, so the absolute cap wins.
    expect(maxCoachWidth(GRID)).toBe(COACH_MAX_PX);
  });

  it("caps at the grid fraction on a narrow grid", () => {
    // 42% of 1200 = 504 < 640, so the fraction wins.
    expect(maxCoachWidth(1200)).toBe(Math.round(1200 * COACH_MAX_FRACTION));
  });

  it("never reports a max below the min, even on an absurdly narrow grid", () => {
    expect(maxCoachWidth(100)).toBe(COACH_MIN_PX);
  });
});

describe("clampCoachWidth", () => {
  it("passes an in-range width through, rounded", () => {
    expect(clampCoachWidth(480.4, GRID)).toBe(480);
  });

  it("floors at COACH_MIN_PX", () => {
    expect(clampCoachWidth(10, GRID)).toBe(COACH_MIN_PX);
  });

  it("ceils at maxCoachWidth for the grid", () => {
    expect(clampCoachWidth(5000, GRID)).toBe(COACH_MAX_PX);
    expect(clampCoachWidth(5000, 1200)).toBe(maxCoachWidth(1200));
  });

  it("returns the min for a non-finite input (hand-edited localStorage)", () => {
    expect(clampCoachWidth(Number.NaN, GRID)).toBe(COACH_MIN_PX);
    expect(clampCoachWidth(Number.POSITIVE_INFINITY, GRID)).toBe(COACH_MIN_PX);
  });
});

describe("dragCoachWidth", () => {
  it("moving the pointer LEFT widens the right-hand coach column", () => {
    expect(dragCoachWidth(480, 1000, 900, GRID)).toBe(580);
  });

  it("moving the pointer RIGHT narrows it", () => {
    expect(dragCoachWidth(480, 1000, 1100, GRID)).toBe(380);
  });

  it("a drag past the edge clamps instead of collapsing the column", () => {
    expect(dragCoachWidth(480, 1000, 3000, GRID)).toBe(COACH_MIN_PX);
    expect(dragCoachWidth(480, 1000, -3000, GRID)).toBe(COACH_MAX_PX);
  });

  it("zero movement is the identity", () => {
    expect(dragCoachWidth(480, 1000, 1000, GRID)).toBe(480);
  });
});

describe("stepCoachWidth", () => {
  it("steps wider and narrower by COACH_STEP_PX", () => {
    expect(stepCoachWidth(480, "wider", GRID)).toBe(480 + COACH_STEP_PX);
    expect(stepCoachWidth(480, "narrower", GRID)).toBe(480 - COACH_STEP_PX);
  });

  it("clamps at both rails", () => {
    expect(stepCoachWidth(COACH_MIN_PX, "narrower", GRID)).toBe(COACH_MIN_PX);
    expect(stepCoachWidth(COACH_MAX_PX, "wider", GRID)).toBe(COACH_MAX_PX);
  });
});

describe("coachTrack", () => {
  it("null (never resized) renders the pre-PR-5 default track unchanged", () => {
    expect(coachTrack(null)).toBe(DEFAULT_COACH_TRACK);
    expect(DEFAULT_COACH_TRACK).toBe("minmax(380px, 30%)");
  });

  it("a stored width renders as a clamp() carrying both rails", () => {
    expect(coachTrack(480)).toBe("clamp(340px, 480px, 42%)");
  });

  it("rounds fractional widths so the track is a valid integer px", () => {
    expect(coachTrack(480.6)).toBe("clamp(340px, 481px, 42%)");
  });
});
