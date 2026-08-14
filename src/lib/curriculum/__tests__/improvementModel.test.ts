import { describe, it, expect } from "vitest";
import {
  hoursPer100,
  hoursBetween,
  guidedHoursBetween,
  effectiveWeeklyHours,
  spacingFactor,
  ratingAfterWeeks,
  projectToGoal,
  intensityTier,
  sessionSizeMultiplier,
  MODEL,
} from "../improvementModel";

const WEEKS_PER_MONTH = 52 / 12;
const monthsAt = (hours: number, weeklyHours: number) => hours / weeklyHours / WEEKS_PER_MONTH;

describe("the cost curve reproduces published timelines", () => {
  // These are the anchors the constants were fitted against. If someone tunes
  // MODEL and these drift, the model has stopped matching the evidence it
  // claims to be based on — which is the only thing making it more than a
  // guess with decimal places.
  it("1000→1500 at 5h/week lands inside the published 8-14 months", () => {
    const m = monthsAt(hoursBetween(1000, 1500), 5);
    expect(m).toBeGreaterThan(8);
    expect(m).toBeLessThan(14);
  });

  it("1400→1800 at 5h/week lands inside the published 1-3 years", () => {
    const yrs = monthsAt(hoursBetween(1400, 1800), 5) / 12;
    expect(yrs).toBeGreaterThan(1);
    expect(yrs).toBeLessThan(3);
  });

  it("1600→1800 at 5h/week lands inside the published 12-18 months", () => {
    const m = monthsAt(hoursBetween(1600, 1800), 5);
    expect(m).toBeGreaterThan(12);
    expect(m).toBeLessThan(18);
  });
});

describe("cost rises with rating — the whole premise", () => {
  it("costs strictly more per 100 points the higher you are", () => {
    let prev = 0;
    for (const r of [800, 1000, 1200, 1400, 1600, 1800, 2000, 2200]) {
      const h = hoursPer100(r);
      expect(h).toBeGreaterThan(prev);
      prev = h;
    }
  });

  it("makes the SAME 200-point gain far more expensive higher up", () => {
    const cheap = hoursBetween(1000, 1200);
    const dear = hoursBetween(2000, 2200);
    expect(dear / cheap).toBeGreaterThan(8);
  });

  it("integrates the curve rather than applying one flat rate", () => {
    // A flat-rate model would make hoursBetween(1000,1400) equal to
    // 4 * hoursPer100(1000). The real answer must be larger, because the cost
    // climbs across the span.
    expect(hoursBetween(1000, 1400)).toBeGreaterThan(4 * hoursPer100(1000));
    expect(hoursBetween(1000, 1400)).toBeLessThan(4 * hoursPer100(1400));
  });
});

describe("effectiveWeeklyHours", () => {
  it("counts a normal-length session at face value", () => {
    // Under the session reference there is no discount at all — a concave
    // curve here would rate 30 minutes as worth more than 30 minutes, which
    // flatters small commitments and this estimate must not do that.
    expect(effectiveWeeklyHours(30, 4)).toBeCloseTo((30 * 4) / 60 * spacingFactor(4), 5);
  });

  it("discounts the SESSION, not the week — daily practice is not cramming", () => {
    // The bug this replaces: the concave discount was applied to the weekly
    // TOTAL, so an hour every day was taxed exactly like seven hours crammed
    // into one Sunday. The cited rationale is about long SESSIONS, and spacing
    // already separates the two cases.
    const daily = effectiveWeeklyHours(60, 7); // 7 short-ish sittings
    const crammed = effectiveWeeklyHours(420, 1); // same 7 raw hours, one go
    expect(daily).toBeGreaterThan(crammed * 1.5);
  });

  it("discounts marathon weeks", () => {
    const ten = effectiveWeeklyHours(120, 5); // 10 raw hours
    expect(ten).toBeLessThan(10);
    expect(ten).toBeGreaterThan(5);
  });

  it("never rewards doing less", () => {
    let prev = -1;
    for (let mins = 5; mins <= 240; mins += 5) {
      const v = effectiveWeeklyHours(mins, 5);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it("prefers the same minutes spread across more days", () => {
    // 210 min/week either way; spacing should favour the spread version.
    const crammed = effectiveWeeklyHours(105, 2);
    const spread = effectiveWeeklyHours(35, 6);
    expect(spread).toBeGreaterThan(crammed);
  });

  it("does not reward skipping the rest day", () => {
    expect(spacingFactor(7)).toBeLessThan(spacingFactor(6));
  });

  it("is zero when no time is offered", () => {
    expect(effectiveWeeklyHours(0, 5)).toBe(0);
    expect(effectiveWeeklyHours(30, 0)).toBe(0);
  });
});

describe("ratingAfterWeeks is the exact inverse of hoursBetween", () => {
  it("round-trips against the GUIDED hours the product actually quotes", () => {
    // The curve and the headline must agree; if ratingAfterWeeks inverted the
    // unguided baseline the chart would end short of the goal it promises.
    const weekly = effectiveWeeklyHours(60, 5);
    const weeks = guidedHoursBetween(1200, 1600) / weekly;
    expect(ratingAfterWeeks(1200, weeks, weekly)).toBeCloseTo(1600, 0);
  });

  it("produces a CONCAVE curve — early points come faster than later ones", () => {
    // A straight line would misrepresent improvement entirely.
    const weekly = effectiveWeeklyHours(60, 5);
    const firstHalf = ratingAfterWeeks(1200, 26, weekly) - 1200;
    const secondHalf =
      ratingAfterWeeks(1200, 52, weekly) - ratingAfterWeeks(1200, 26, weekly);
    expect(firstHalf).toBeGreaterThan(secondHalf);
  });

  it("never goes backwards and never stalls at zero effort", () => {
    expect(ratingAfterWeeks(1500, 0, 5)).toBe(1500);
    expect(ratingAfterWeeks(1500, 10, 0)).toBe(1500);
  });
});

describe("projectToGoal", () => {
  const schedule = { minutesPerDay: 60, daysPerWeek: 5 };

  it("reproduces the 1200→1700 case at a range of intensities", () => {
    // Sanity anchor from the research: ~436 hours, so roughly 10 months at
    // 10 h/week and roughly 20 at 5 h/week.
    const hours = hoursBetween(1200, 1700);
    expect(hours).toBeGreaterThan(380);
    expect(hours).toBeLessThan(500);
  });

  it("returns a BAND, never a bare point estimate", () => {
    const p = projectToGoal({ currentRating: 1200, goalRating: 1700, ...schedule });
    expect(p.status).toBe("ok");
    expect(p.fastMonths).toBeLessThan(p.months!);
    expect(p.slowMonths).toBeGreaterThan(p.months!);
    // The band must be wide enough to be honest about ~40% explained variance.
    expect(p.slowMonths! / p.fastMonths!).toBeGreaterThan(2);
  });

  it("flags a goal at or below the current rating instead of projecting", () => {
    const p = projectToGoal({ currentRating: 1600, goalRating: 1500, ...schedule });
    expect(p.status).toBe("already_there");
    expect(p.months).toBeUndefined();
    expect(p.curve).toEqual([]);
  });

  it("flags an absurd goal rather than drawing a 40-year chart", () => {
    const p = projectToGoal({
      currentRating: 1000,
      goalRating: 2900,
      minutesPerDay: 15,
      daysPerWeek: 2,
    });
    expect(p.status).toBe("unrealistic");
    expect(p.curve).toEqual([]);
  });

  it("says so when no time is offered, rather than dividing by zero", () => {
    const p = projectToGoal({
      currentRating: 1200,
      goalRating: 1500,
      minutesPerDay: 0,
      daysPerWeek: 0,
    });
    expect(p.status).toBe("no_schedule");
    expect(Number.isFinite(p.totalHours)).toBe(true);
  });

  it("starts the curve at today's rating and ends at the goal", () => {
    const p = projectToGoal({ currentRating: 1150, goalRating: 1500, ...schedule });
    expect(p.curve[0].rating).toBe(1150);
    expect(p.curve[0].weeks).toBe(0);
    expect(p.curve.at(-1)!.rating).toBeGreaterThanOrEqual(1499);
    expect(p.curve.at(-1)!.rating).toBeLessThanOrEqual(1501);
  });

  it("gets faster when the user commits more time", () => {
    const light = projectToGoal({ currentRating: 1200, goalRating: 1600, minutesPerDay: 20, daysPerWeek: 3 });
    const heavy = projectToGoal({ currentRating: 1200, goalRating: 1600, minutesPerDay: 90, daysPerWeek: 6 });
    expect(heavy.months!).toBeLessThan(light.months!);
  });
});

describe("intensity drives the plan, but is capped", () => {
  it("reads a one-year-paced goal as steady", () => {
    const p = projectToGoal({ currentRating: 1200, goalRating: 1400, minutesPerDay: 45, daysPerWeek: 5 });
    expect(intensityTier(p.intensity)).toBe("steady");
  });

  it("escalates for a goal that outruns the stated schedule", () => {
    const p = projectToGoal({ currentRating: 1200, goalRating: 1900, minutesPerDay: 20, daysPerWeek: 3 });
    expect(["focused", "hard"]).toContain(intensityTier(p.intensity));
  });

  it("never inflates the session beyond 1.5x what the user signed up for", () => {
    // Someone chasing +800 points does not get an 8x workload — they get the
    // hardest sensible session and an honest timeline. Silently multiplying
    // the commitment someone agreed to is how people quit.
    for (const t of ["steady", "focused", "hard"] as const) {
      expect(sessionSizeMultiplier(t)).toBeLessThanOrEqual(1.5);
      expect(sessionSizeMultiplier(t)).toBeGreaterThanOrEqual(1);
    }
    expect(sessionSizeMultiplier(intensityTier(99))).toBe(1.5);
  });
});

describe("the documented constants are the ones actually in use", () => {
  it("exposes them for tuning rather than burying them in the maths", () => {
    expect(MODEL.HOURS_PER_100_AT_REF).toBe(48);
    expect(MODEL.REFERENCE_RATING).toBe(1250);
    expect(MODEL.E_FOLDING_POINTS).toBe(380);
    expect(hoursPer100(MODEL.REFERENCE_RATING)).toBeCloseTo(MODEL.HOURS_PER_100_AT_REF, 6);
  });
});


describe("guided practice is faster than the unguided literature baseline", () => {
  it("applies the multiplier, and never silently drops it", () => {
    expect(guidedHoursBetween(1300, 1600)).toBeCloseTo(
      hoursBetween(1300, 1600) * MODEL.GUIDED_PRACTICE_MULTIPLIER,
      6
    );
    expect(MODEL.GUIDED_PRACTICE_MULTIPLIER).toBeLessThan(1);
  });

  it("reproduces the founder's calibration anchor: 1300 → 1600 in ~4 months of daily practice", () => {
    // Aayan's coaching experience, and the reason the multiplier exists. The
    // unguided curve says ~9.6 months for the same schedule; the published
    // rates it is fitted to all measure SELF-DIRECTED players, which is not
    // what this product delivers. If someone retunes the constants, this is
    // the test that says the product claim changed.
    const p = projectToGoal({
      currentRating: 1300,
      goalRating: 1600,
      minutesPerDay: 60,
      daysPerWeek: 7,
    });
    expect(p.months!).toBeGreaterThan(3);
    expect(p.months!).toBeLessThan(5);
  });

  it("keeps the higher bands slow — the curve still bites above 1800", () => {
    const club = projectToGoal({ currentRating: 1300, goalRating: 1600, minutesPerDay: 60, daysPerWeek: 7 });
    const expert = projectToGoal({ currentRating: 1800, goalRating: 2100, minutesPerDay: 60, daysPerWeek: 7 });
    // Same 300 points, far more expensive higher up, guided or not.
    expect(expert.months!).toBeGreaterThan(club.months! * 3);
  });
});
