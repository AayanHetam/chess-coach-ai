import { describe, it, expect } from "vitest";
import {
  fitDimensionRecalibration,
  applyRecalibration,
  interRaterDisagreement,
} from "../helpfulnessCalibration";

describe("fitDimensionRecalibration", () => {
  it("recovers identity when human == auto", () => {
    const pairs = [0, 0.5, 1, 1.5, 2].map((x) => ({ auto: x, human: x }));
    const cal = fitDimensionRecalibration(pairs);
    expect(cal.slope).toBeCloseTo(1, 5);
    expect(cal.intercept).toBeCloseTo(0, 5);
    expect(cal.maeAfter).toBeCloseTo(0, 5);
    expect(cal.pearson).toBeCloseTo(1, 5);
  });

  it("corrects a judge that systematically over-scores, reducing MAE", () => {
    // human is consistently auto*0.5 (judge inflates ~2x)
    const pairs = [0, 0.5, 1, 1.5, 2].map((x) => ({ auto: x, human: x * 0.5 }));
    const cal = fitDimensionRecalibration(pairs);
    expect(cal.slope).toBeCloseTo(0.5, 5);
    expect(cal.maeAfter).toBeLessThan(cal.maeBefore);
    expect(applyRecalibration(2, cal)).toBeCloseTo(1, 5);
  });

  it("clamps recalibrated output into [0,2]", () => {
    const pairs = [{ auto: 0, human: 0 }, { auto: 1, human: 2 }, { auto: 2, human: 2 }];
    const cal = fitDimensionRecalibration(pairs);
    expect(applyRecalibration(2, cal)).toBeLessThanOrEqual(2);
    expect(applyRecalibration(0, cal)).toBeGreaterThanOrEqual(0);
  });

  it("handles empty input without throwing", () => {
    const cal = fitDimensionRecalibration([]);
    expect(cal.n).toBe(0);
    expect(applyRecalibration(1.5, cal)).toBe(1.5); // identity fallback
  });
});

describe("interRaterDisagreement", () => {
  it("is 0 when all raters agree", () => {
    expect(interRaterDisagreement([[2, 2, 2], [1, 1, 1]])).toBe(0);
  });
  it("grows with disagreement", () => {
    expect(interRaterDisagreement([[0, 2]])).toBe(2);
  });
});
