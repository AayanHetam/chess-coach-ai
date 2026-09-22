import { describe, it, expect } from "vitest";
import {
  anyPerfGoalSet,
  emptyPerfDrafts,
  pacePerfGoals,
  parsePerfDrafts,
  parseRatingField,
  perfCardError,
  perfDraftErrors,
  perfDraftsClean,
  perfDraftsFromGoals,
  practiceMinutesLabel,
  prefillCurrents,
  sanitizeRatingInput,
  type PerfDrafts,
} from "../perfGoalDrafts";
import { buildPerfGoalPatch } from "../goalPatch";

/**
 * The per-control goal form is now asked in two places — the onboarding quiz
 * and the /profile setter. These rules are what stops the two from disagreeing
 * about which numbers are acceptable, so a green step that the builder then
 * refuses is the failure mode under test.
 */

const drafts = (over: Partial<PerfDrafts>): PerfDrafts => ({
  ...emptyPerfDrafts(),
  ...over,
});

describe("sanitizeRatingInput", () => {
  it("keeps digits only and caps at four of them", () => {
    expect(sanitizeRatingInput("1a5b0c0")).toBe("1500");
    expect(sanitizeRatingInput("12345")).toBe("1234");
    expect(sanitizeRatingInput("-1500")).toBe("1500");
    expect(sanitizeRatingInput("")).toBe("");
  });
});

describe("parseRatingField", () => {
  it("reads blank as absent, never as zero", () => {
    // A 0 here would sail through Number.isFinite and anchor a goal to a
    // rating nobody has.
    expect(parseRatingField("")).toBeUndefined();
    expect(parseRatingField("   ")).toBeUndefined();
    expect(parseRatingField("1500")).toBe(1500);
  });
});

describe("perfCardError", () => {
  it("is silent for a control with no goal typed", () => {
    // The resting state of every card once currents prefill from the platform.
    expect(perfCardError({ start: "1425", goal: "" })).toBeNull();
    expect(perfCardError({ start: "", goal: "" })).toBeNull();
  });

  it("complains about a goal with nothing to anchor it", () => {
    expect(perfCardError({ start: "", goal: "1800" })).toMatch(
      /current rating/i
    );
  });

  it("complains about a goal at or below the current rating", () => {
    expect(perfCardError({ start: "1425", goal: "1425" })).toMatch(
      /above 1425/
    );
    expect(perfCardError({ start: "1425", goal: "1200" })).toMatch(
      /above 1425/
    );
  });

  it("holds the same window the PATCH route enforces", () => {
    // A mismatch here builds a patch the server rejects, which reads to the
    // user as a dead save button.
    expect(perfCardError({ start: "50", goal: "1800" })).toMatch(/between 100/);
    expect(perfCardError({ start: "1500", goal: "3200" })).toMatch(
      /up to 3000/
    );
    expect(perfCardError({ start: "1500", goal: "2000" })).toBeNull();
  });
});

describe("perfDraftErrors / perfDraftsClean", () => {
  it("reports each offending control by name and nothing else", () => {
    const errors = perfDraftErrors(
      drafts({
        blitz: { start: "1425", goal: "1600" },
        rapid: { start: "1815", goal: "1700" },
      })
    );
    expect(Object.keys(errors)).toEqual(["rapid"]);
  });

  it("is dirty when any single control is bad", () => {
    expect(perfDraftsClean(emptyPerfDrafts())).toBe(true);
    expect(
      perfDraftsClean(drafts({ rapid: { start: "1815", goal: "1700" } }))
    ).toBe(false);
  });
});

describe("anyPerfGoalSet", () => {
  it("is false when only currents are filled", () => {
    // Prefilling three currents must not count as setting a goal, or every
    // platform signup would look like they had aimed at something.
    expect(
      anyPerfGoalSet(
        drafts({
          bullet: { start: "1271", goal: "" },
          blitz: { start: "1425", goal: "" },
          rapid: { start: "1815", goal: "" },
        })
      )
    ).toBe(false);
  });

  it("is true once one goal is typed", () => {
    expect(
      anyPerfGoalSet(drafts({ blitz: { start: "1425", goal: "1600" } }))
    ).toBe(true);
  });
});

describe("prefillCurrents", () => {
  it("fills blank currents and returns the same object when nothing changed", () => {
    const before = emptyPerfDrafts();
    const after = prefillCurrents(before, { blitz: 1425 });
    expect(after.blitz.start).toBe("1425");
    // Identity, so the caller can skip a re-render rather than looping.
    expect(prefillCurrents(after, { blitz: 1425 })).toBe(after);
  });

  it("never overwrites a number the user already typed", () => {
    // The current rating is theirs to correct; we only save them the typing.
    const typed = drafts({ blitz: { start: "1500", goal: "" } });
    expect(prefillCurrents(typed, { blitz: 1425 }).blitz.start).toBe("1500");
  });

  it("ignores controls the platform reported nothing for", () => {
    // Absence stays absence — a rapid box seeded from a control they have
    // never played would be a fabricated rating wearing the platform's badge.
    const after = prefillCurrents(emptyPerfDrafts(), { rapid: undefined });
    expect(after.rapid.start).toBe("");
  });
});

describe("perfDraftsFromGoals", () => {
  it("seeds the form from goals already committed", () => {
    const seeded = perfDraftsFromGoals({ blitz: { start: 1425, goal: 1600 } });
    expect(seeded.blitz).toEqual({ start: "1425", goal: "1600" });
    expect(seeded.rapid).toEqual({ start: "", goal: "" });
  });

  it("is an empty form when there is nothing stored", () => {
    expect(perfDraftsFromGoals(undefined)).toEqual(emptyPerfDrafts());
  });
});

describe("the form and the builder agree", () => {
  it("a clean, participating form always builds a patch", () => {
    // The contract the two callers depend on: if the step let them through
    // and they aimed at something, the save must not silently do nothing.
    const form = drafts({ blitz: { start: "1425", goal: "1600" } });
    expect(perfDraftsClean(form)).toBe(true);
    expect(anyPerfGoalSet(form)).toBe(true);
    const patch = buildPerfGoalPatch({
      drafts: parsePerfDrafts(form),
      platform: "chesscom",
      time: "30-plus",
      daysPerWeek: 4,
    });
    expect(patch).not.toBeNull();
    expect(patch!.perfGoals).toEqual({ blitz: { start: 1425, goal: 1600 } });
  });

  it("every shape the form rejects, the builder refuses too", () => {
    for (const bad of [
      { start: "", goal: "1800" }, // no anchor
      { start: "1425", goal: "1425" }, // not upward
      { start: "1500", goal: "3200" }, // out of window
    ]) {
      const form = drafts({ blitz: bad });
      expect(perfDraftsClean(form), JSON.stringify(bad)).toBe(false);
      expect(
        buildPerfGoalPatch({
          drafts: parsePerfDrafts(form),
          platform: "chesscom",
          time: "30-plus",
          daysPerWeek: 4,
        }),
        JSON.stringify(bad)
      ).toBeNull();
    }
  });
});

describe("pacePerfGoals", () => {
  it("says nothing until there is a schedule and a goal to judge", () => {
    // A silence, never a reassuring "ok" — the banner must not appear before
    // the user has told us how much they practise.
    const form = drafts({ blitz: { start: "1425", goal: "1600" } });
    expect(pacePerfGoals({ drafts: form, daysPerWeek: 4 })).toBeNull();
    expect(pacePerfGoals({ drafts: form, time: "30-plus" })).toBeNull();
    expect(
      pacePerfGoals({
        drafts: emptyPerfDrafts(),
        time: "30-plus",
        daysPerWeek: 4,
      })
    ).toBeNull();
  });

  it("passes a modest goal at a real schedule", () => {
    expect(
      pacePerfGoals({
        drafts: drafts({ blitz: { start: "1425", goal: "1500" } }),
        platform: "chesscom",
        time: "60-plus",
        daysPerWeek: 6,
      })
    ).toBe("ok");
  });

  it("flags a goal the stated pace cannot reach", () => {
    // Same condition that makes buildGoalPatch return null, so the banner is
    // also the explanation for the disabled button.
    const form = drafts({ blitz: { start: "800", goal: "2900" } });
    expect(
      pacePerfGoals({
        drafts: form,
        platform: "chesscom",
        time: "10-30",
        daysPerWeek: 2,
      })
    ).toBe("unreachable");
    expect(
      buildPerfGoalPatch({
        drafts: parsePerfDrafts(form),
        platform: "chesscom",
        time: "10-30",
        daysPerWeek: 2,
      })
    ).toBeNull();
  });

  it("judges the HARDEST participating control, not the first", () => {
    const easy = { start: "1425", goal: "1450" };
    const brutal = { start: "800", goal: "2900" };
    expect(
      pacePerfGoals({
        drafts: drafts({ blitz: easy, rapid: brutal }),
        platform: "chesscom",
        time: "10-30",
        daysPerWeek: 2,
      })
    ).toBe("unreachable");
  });
});

describe("practiceMinutesLabel", () => {
  it("reads as the promise the option made", () => {
    expect(practiceMinutesLabel("10-30")).toBe("15 min");
    expect(practiceMinutesLabel("30-plus")).toBe("30 min");
    expect(practiceMinutesLabel("60-plus")).toBe("an hour");
    expect(practiceMinutesLabel(undefined)).toBeUndefined();
  });
});
