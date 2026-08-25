import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildGoalPatch,
  buildPerfGoalPatch,
  hasCompleteGoal,
} from "../goalPatch";
import { normalizeRating } from "@/lib/rating/platformRatings";
import { projectToGoal } from "../improvementModel";
import {
  buildPayload,
  type QuizAnswers,
} from "@/components/onboarding/quizConfig";

/**
 * The goal fields are written by two callers — the onboarding quiz and the
 * /plan setter — and read by one (GoalProgressCard). Every bug in this area so
 * far has been a disagreement between two copies of the same rule, so these
 * tests are mostly about agreement rather than arithmetic.
 */

const base = {
  currentRating: 1400,
  goalRating: 1700,
  time: "10-30" as const,
  daysPerWeek: 4,
};

describe("buildGoalPatch", () => {
  it("produces a complete, self-consistent goal", () => {
    const p = buildGoalPatch({ ...base, now: 1_700_000_000_000 });
    expect(p).not.toBeNull();
    expect(p!.goalStartRating).toBe(1400);
    expect(p!.goalRating).toBe(1700);
    expect(p!.goalSetAt).toBe(1_700_000_000_000);
    expect(p!.goalTargetDate).toBeGreaterThan(p!.goalSetAt);
    expect(p!.practiceDaysPerWeek).toBe(4);
    expect(p!.dailyTimeCommitment).toBe("10-30");
  });

  it("whatever it returns is always renderable", () => {
    // The property that actually matters: NEVER a patch that stores fine and
    // then silently refuses to draw — the original bug, in a new place.
    //
    // Null is a legitimate answer here, not a failure. +300 at 8 min twice a
    // week from 1900 runs past the model's 12-year ceiling, because each
    // further point costs more than the last. The setter surfaces that as
    // GoalProjection's "pick a nearer milestone" note with the save button
    // disabled, rather than promising a date in 2040.
    let built = 0;
    for (const currentRating of [700, 1200, 1400, 1900, 2300]) {
      for (const daysPerWeek of [2, 4, 6]) {
        for (const time of ["under-10", "10-30", "30-plus"] as const) {
          const p = buildGoalPatch({
            currentRating,
            goalRating: currentRating + 300,
            time,
            daysPerWeek,
          });
          if (p === null) continue;
          built++;
          expect(
            hasCompleteGoal(p),
            `built but not renderable: ${currentRating}/${daysPerWeek}/${time}`
          ).toBe(true);
        }
      }
    }
    // Guard the guard: if a change made buildGoalPatch return null everywhere,
    // the loop above would vacuously pass without asserting anything at all.
    expect(built).toBeGreaterThan(30);
  });

  it("declines a goal that is unreachable at the chosen pace", () => {
    // Better an honest "pick a nearer milestone" than a date a decade out.
    expect(
      buildGoalPatch({
        currentRating: 1900,
        goalRating: 2200,
        time: "under-10",
        daysPerWeek: 2,
      })
    ).toBeNull();
  });

  it("returns null rather than a partial goal when an input is missing", () => {
    expect(buildGoalPatch({ ...base, goalRating: undefined })).toBeNull();
    expect(buildGoalPatch({ ...base, daysPerWeek: undefined })).toBeNull();
    expect(buildGoalPatch({ ...base, time: undefined })).toBeNull();
  });

  it("refuses to anchor a promise it has no rating for", () => {
    // Lookup 404'd or the account has no established rating. A date projected
    // from a stand-in 1500 would look authoritative and mean nothing.
    expect(buildGoalPatch({ ...base, currentRating: undefined })).toBeNull();
  });

  it("returns null for a goal at or below where they already are", () => {
    expect(buildGoalPatch({ ...base, goalRating: 1400 })).toBeNull();
    expect(buildGoalPatch({ ...base, goalRating: 1200 })).toBeNull();
  });

  it("carries valid per-control goals through untouched", () => {
    const p = buildGoalPatch({
      ...base,
      perfGoals: {
        blitz: { start: 1425, goal: 1600 },
        rapid: { start: 1805, goal: 2000 },
      },
    });
    expect(p).not.toBeNull();
    expect(p!.perfGoals).toEqual({
      blitz: { start: 1425, goal: 1600 },
      rapid: { start: 1805, goal: 2000 },
    });
    // And the patch stays renderable — perfGoals must never break the reader.
    expect(hasCompleteGoal(p)).toBe(true);
  });

  it("omits the perfGoals key entirely when none were given", () => {
    // Firestore rejects explicit `undefined` values in a patch, so absence has
    // to be absence, not a key set to undefined.
    const p = buildGoalPatch(base);
    expect(p).not.toBeNull();
    expect("perfGoals" in p!).toBe(false);
  });

  it("refuses the WHOLE patch when any per-control entry is bad", () => {
    // Dropping the bad control and keeping the rest would store a goal the
    // user did not set. One bad entry, no patch — the UI mirrors this with an
    // inline error, so null is never a mystery.
    const cases = [
      { blitz: { start: 1425, goal: 1425 } }, // not above current
      { blitz: { start: 1425, goal: 1300 } }, // below current
      { blitz: { start: 90, goal: 1600 } }, // start under the floor
      { blitz: { start: 1425, goal: 3200 } }, // goal over the ceiling
      { blitz: { start: NaN, goal: 1600 } },
      {}, // provided-but-empty: nothing was actually set
      { blitz: { start: 1425, goal: 1600 }, rapid: { start: 1805, goal: 1700 } },
    ];
    for (const perfGoals of cases) {
      expect(
        buildGoalPatch({ ...base, perfGoals }),
        `should refuse ${JSON.stringify(perfGoals)}`
      ).toBeNull();
    }
  });
});

describe("buildPerfGoalPatch", () => {
  const schedule = { time: "10-30" as const, daysPerWeek: 4 };

  it("skips prefilled-but-untouched controls and keeps the typed ones", () => {
    // Currents arrive prefilled from the platform, so "start filled, goal
    // empty" is the resting state of every card — not participation.
    const p = buildPerfGoalPatch({
      drafts: {
        bullet: { start: 1289 },
        blitz: { start: 1425 },
        rapid: { start: 1805, goal: 2000 },
      },
      platform: "chesscom",
      anchorPerf: "rapid",
      ...schedule,
    });
    expect(p).not.toBeNull();
    expect(p!.perfGoals).toEqual({ rapid: { start: 1805, goal: 2000 } });
    expect(p!.goalRating).toBe(2000);
    expect(p!.goalStartRating).toBe(1805);
  });

  it("anchors the overall goal on the platform-rating control when it participates", () => {
    const p = buildPerfGoalPatch({
      drafts: {
        bullet: { start: 2100, goal: 2200 }, // higher current…
        rapid: { start: 1805, goal: 2000 }, // …but rapid is the anchor perf
      },
      platform: "chesscom",
      anchorPerf: "rapid",
      ...schedule,
    });
    expect(p).not.toBeNull();
    // The overall pair /plan scores against resolveUserRating must stay on the
    // control platformRating came from, or "now vs goal" compares two perfs.
    expect(p!.goalStartRating).toBe(1805);
    expect(p!.goalRating).toBe(2000);
    expect(p!.perfGoals).toEqual({
      bullet: { start: 2100, goal: 2200 },
      rapid: { start: 1805, goal: 2000 },
    });
  });

  it("falls back to the highest current when the anchor control sat out", () => {
    const p = buildPerfGoalPatch({
      drafts: {
        bullet: { start: 1289, goal: 1500 },
        blitz: { start: 1425, goal: 1600 },
      },
      platform: "chesscom",
      anchorPerf: "rapid", // rapid not participating
      ...schedule,
    });
    expect(p).not.toBeNull();
    // Same "highest established rating wins" rule as selectCalibrationRating.
    expect(p!.goalStartRating).toBe(1425);
    expect(p!.goalRating).toBe(1600);
  });

  it("normalizes Lichess numbers for the overall goal but stores raw per control", () => {
    const p = buildPerfGoalPatch({
      drafts: { blitz: { start: 1800, goal: 2000 } },
      platform: "lichess",
      anchorPerf: "blitz",
      ...schedule,
    });
    expect(p).not.toBeNull();
    // Overall: calibration scale (Chess.com-like), same as platformRating.
    expect(p!.goalStartRating).toBe(normalizeRating(1800, "lichess"));
    expect(p!.goalRating).toBe(normalizeRating(2000, "lichess"));
    expect(p!.goalStartRating).not.toBe(1800);
    // Per-control: the platform's own numbers, what the panels draw.
    expect(p!.perfGoals).toEqual({ blitz: { start: 1800, goal: 2000 } });
  });

  it("refuses a goal typed with no current to anchor it", () => {
    expect(
      buildPerfGoalPatch({
        drafts: { blitz: { goal: 1600 } },
        platform: "chesscom",
        ...schedule,
      })
    ).toBeNull();
  });

  it("refuses when nothing participates at all", () => {
    expect(
      buildPerfGoalPatch({
        drafts: { blitz: { start: 1425 } },
        platform: "chesscom",
        ...schedule,
      })
    ).toBeNull();
    expect(
      buildPerfGoalPatch({ drafts: {}, platform: "chesscom", ...schedule })
    ).toBeNull();
  });

  it("still requires the schedule, like every goal", () => {
    const drafts = { rapid: { start: 1805, goal: 2000 } };
    expect(
      buildPerfGoalPatch({ drafts, platform: "chesscom", daysPerWeek: 4 })
    ).toBeNull();
    expect(
      buildPerfGoalPatch({ drafts, platform: "chesscom", time: "10-30" })
    ).toBeNull();
  });

  it("whatever it returns is renderable by the same reader as always", () => {
    const p = buildPerfGoalPatch({
      drafts: { rapid: { start: 1400, goal: 1700 } },
      platform: "chesscom",
      anchorPerf: "rapid",
      ...schedule,
    });
    expect(p).not.toBeNull();
    expect(hasCompleteGoal(p)).toBe(true);
  });
});

describe("hasCompleteGoal", () => {
  const complete = {
    goalRating: 1700,
    goalStartRating: 1400,
    goalSetAt: 1_700_000_000_000,
    practiceDaysPerWeek: 4,
    dailyTimeCommitment: "10-30",
  };

  it("accepts a complete goal", () => {
    expect(hasCompleteGoal(complete)).toBe(true);
  });

  it("rejects a goal missing any single field", () => {
    for (const key of Object.keys(complete) as (keyof typeof complete)[]) {
      const partial = { ...complete, [key]: undefined };
      expect(hasCompleteGoal(partial), `should reject missing ${key}`).toBe(
        false
      );
    }
  });

  it("rejects an unrecognised time commitment", () => {
    // A legacy or hand-edited value maps to 0 minutes/day, which would divide
    // the projection by zero rather than simply render nothing.
    expect(
      hasCompleteGoal({ ...complete, dailyTimeCommitment: "45-plus" })
    ).toBe(false);
  });

  it("rejects null and undefined profiles", () => {
    expect(hasCompleteGoal(null)).toBe(false);
    expect(hasCompleteGoal(undefined)).toBe(false);
  });
});

describe("the quiz and the /plan setter agree", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("write identical goal fields for identical inputs", () => {
    // Same user, same answers, two doors into the same state. If these ever
    // diverge, a goal set on /plan behaves differently from one set at signup.
    const answers: QuizAnswers = {
      playStyle: "lichess",
      username: "someone",
      selfAssess: {},
      goals: ["tactics"],
      time: "10-30",
      goalRating: 1700,
      daysPerWeek: 4,
      dailyReminder: true,
    };

    // Freeze the clock. Both doors stamp their own Date.now() inside
    // buildGoalPatch, so on a real clock the two calls can land either side
    // of a millisecond boundary and goalTargetDate differs by exactly 1ms --
    // a failure that says nothing about agreement, which is what this test is
    // actually for. Frozen, a difference here means real divergence.
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    const fromQuiz = buildPayload(answers, 1400);
    const fromPlan = buildGoalPatch(base);

    expect(fromPlan).not.toBeNull();
    expect(fromQuiz.goalRating).toBe(fromPlan!.goalRating);
    expect(fromQuiz.goalStartRating).toBe(fromPlan!.goalStartRating);
    expect(fromQuiz.goalTargetDate).toBe(fromPlan!.goalTargetDate);
    expect(fromQuiz.practiceDaysPerWeek).toBe(fromPlan!.practiceDaysPerWeek);
    expect(fromQuiz.dailyTimeCommitment).toBe(fromPlan!.dailyTimeCommitment);

    // And the quiz's own output must be renderable, which is the whole bug.
    expect(hasCompleteGoal(fromQuiz)).toBe(true);
  });
});

describe("projectToGoal never reports a NaN date as ok", () => {
  it("downgrades a non-finite rating instead of promising Invalid Date", () => {
    // Found by mutation-testing buildGoalPatch: with its own guard removed,
    // projectToGoal returned status "ok" with targetDate NaN. Anything
    // trusting the status — GoalProjection does — would render the string
    // "Invalid Date" as the promised month.
    const p = projectToGoal({
      currentRating: undefined as unknown as number,
      goalRating: 1700,
      minutesPerDay: 15,
      daysPerWeek: 4,
    });
    expect(p.status).not.toBe("ok");
    expect(p.targetDate).toBeUndefined();
  });
});
