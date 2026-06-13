import { describe, it, expect } from "vitest";
import { ageInYears, isUnderCoppaAge } from "../age";

const now = new Date("2026-06-13T00:00:00Z");

describe("ageInYears", () => {
  it("counts whole years, not yet had birthday this year", () => {
    // Born 2014-12-01 → on 2026-06-13 is 11 (birthday not reached).
    expect(ageInYears(new Date("2014-12-01"), now)).toBe(11);
  });

  it("counts the birthday once it has passed", () => {
    // Born 2014-01-01 → on 2026-06-13 is 12.
    expect(ageInYears(new Date("2014-01-01"), now)).toBe(12);
  });
});

describe("isUnderCoppaAge", () => {
  it("true for an 11-year-old", () => {
    expect(isUnderCoppaAge(new Date("2015-01-01"), now)).toBe(true);
  });

  it("false the day they turn 13", () => {
    expect(isUnderCoppaAge(new Date("2013-06-13"), now)).toBe(false);
  });

  it("true the day before they turn 13", () => {
    expect(isUnderCoppaAge(new Date("2013-06-14"), now)).toBe(true);
  });

  it("false for an adult", () => {
    expect(isUnderCoppaAge(new Date("1990-01-01"), now)).toBe(false);
  });
});
