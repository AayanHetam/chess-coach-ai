import { describe, it, expect } from "vitest";
import { forwardProjection, stitchProjection } from "../forwardProjection";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_760_000_000_000;

const base = {
  currentRating: 1200,
  minutesPerDay: 15,
  daysPerWeek: 4,
  fromMs: NOW,
  toMs: NOW + 180 * DAY,
};

describe("forwardProjection", () => {
  it("starts at today's rating so it joins the history line", () => {
    const p = forwardProjection(base);
    expect(p[0].t).toBe(NOW);
    expect(p[0].projected).toBe(1200);
  });

  it("ends on the goal date", () => {
    const p = forwardProjection(base);
    expect(p[p.length - 1].t).toBe(base.toMs);
  });

  it("rises", () => {
    const p = forwardProjection(base);
    expect(p[p.length - 1].projected!).toBeGreaterThan(p[0].projected!);
  });

  it("is CONCAVE — each step gains less than the one before", () => {
    // The whole reason this goes through ratingAfterWeeks instead of drawing a
    // line to the target. A straight line promises late gains at the early
    // rate, which is the expectation that makes people quit at the plateau.
    const p = forwardProjection({ ...base, steps: 12 });
    const gains = p.slice(1).map((pt, i) => pt.projected! - p[i].projected!);

    // Ratings are integers, so adjacent gains wobble by ±1 as the true curve
    // crosses rounding boundaries (13, 14, 13, 14…). That is the rounding, not
    // the model — allow exactly that much slack and no more.
    for (let i = 1; i < gains.length; i++) {
      expect(
        gains[i],
        `step ${i} gained ${gains[i]}, previous gained ${gains[i - 1]}`
      ).toBeLessThanOrEqual(gains[i - 1] + 1);
    }

    // The real assertion: measured over spans long enough for rounding to wash
    // out, later practice must buy strictly less than earlier practice.
    const third = Math.floor(gains.length / 3);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const early = sum(gains.slice(0, third));
    const late = sum(gains.slice(-third));
    expect(
      late,
      `early third gained ${early}, late third ${late}`
    ).toBeLessThan(early);
  });

  it("gains LESS from the same practice at a higher rating", () => {
    // Cost per point rises with rating, so the three controls must not share a
    // curve. This is what makes a per-panel projection honest.
    const low = forwardProjection({ ...base, currentRating: 1000 });
    const high = forwardProjection({ ...base, currentRating: 2000 });
    const gain = (p: typeof low) =>
      p[p.length - 1].projected! - p[0].projected!;
    expect(gain(high)).toBeLessThan(gain(low));
  });

  it("draws nothing without a schedule", () => {
    // A flat line to the target date would still read as a forecast.
    expect(forwardProjection({ ...base, minutesPerDay: 0 })).toEqual([]);
    expect(forwardProjection({ ...base, daysPerWeek: 0 })).toEqual([]);
  });

  it("draws nothing for a target date in the past or now", () => {
    expect(forwardProjection({ ...base, toMs: NOW - DAY })).toEqual([]);
    expect(forwardProjection({ ...base, toMs: NOW })).toEqual([]);
  });

  it("draws nothing for a non-finite rating", () => {
    expect(forwardProjection({ ...base, currentRating: NaN })).toEqual([]);
    expect(
      forwardProjection({
        ...base,
        currentRating: undefined as unknown as number,
      })
    ).toEqual([]);
  });
});

describe("stitchProjection", () => {
  const history = [
    { t: NOW - 60 * DAY, rating: 1150 },
    { t: NOW - 30 * DAY, rating: 1180 },
    { t: NOW, rating: 1200 },
  ];

  it("keeps measured and projected in SEPARATE keys", () => {
    // So the chart can draw history solid and the forecast dashed. One shared
    // key renders one continuous line, giving a forecast the same visual
    // authority as a measurement.
    const out = stitchProjection(history, forwardProjection(base));
    const past = out.filter((p) => p.t < NOW);
    expect(past.every((p) => p.projected === undefined)).toBe(true);
    const future = out.filter((p) => p.t > NOW);
    expect(future.length).toBeGreaterThan(0);
    expect(future.every((p) => p.rating === undefined)).toBe(true);
  });

  it("carries both keys at the join so the lines actually touch", () => {
    const out = stitchProjection(history, forwardProjection(base));
    const join = out.find((p) => p.t === NOW)!;
    expect(join.rating).toBe(1200);
    expect(join.projected).toBe(1200);
  });

  it("returns history untouched when there is no projection", () => {
    const out = stitchProjection(history, []);
    expect(out).toHaveLength(3);
    expect(out.every((p) => p.projected === undefined)).toBe(true);
  });

  it("survives an empty history", () => {
    const out = stitchProjection([], forwardProjection(base));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].projected).toBe(1200);
  });
});

describe("the gap since the last recorded game", () => {
  it("is not credited as practice", () => {
    // Projecting from the last data point instead of today would hand someone
    // who stopped playing in June two months of study they never did, and the
    // curve would claim rating they have not earned.
    const lastPlayed = NOW - 45 * DAY;
    const fromLastPoint = forwardProjection({ ...base, fromMs: lastPlayed });
    const fromToday = forwardProjection({ ...base, fromMs: NOW });
    const end = (p: typeof fromToday) => p[p.length - 1].projected!;
    expect(end(fromLastPoint)).toBeGreaterThan(end(fromToday));

    // And the stitched series must stay FLAT across the unmeasured gap.
    const history = [{ t: lastPlayed, rating: 1200 }];
    const out = stitchProjection(history, fromToday);
    const join = out.find((p) => p.t === lastPlayed)!;
    expect(join.projected).toBe(1200);
    const firstForecast = out.find((p) => p.t === NOW)!;
    expect(firstForecast.projected).toBe(1200);
  });
});
