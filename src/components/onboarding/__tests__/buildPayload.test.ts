import { describe, it, expect } from "vitest";
import {
  buildPayload,
  scoreToRating,
  bandLabel,
  derivedRating,
  derivedFocusThemes,
  emptyAnswers,
  isQuizHandleValid,
  QuizAnswers,
} from "../quizConfig";
import { emptyPerfDrafts } from "@/lib/curriculum/perfGoalDrafts";
import { hasCompleteGoal } from "@/lib/curriculum/goalPatch";

function answers(partial: Partial<QuizAnswers>): QuizAnswers {
  return { ...emptyAnswers(), ...partial };
}

describe("scoreToRating", () => {
  it("maps self-assessment score to a rating inside the right deriveSkillTier band", () => {
    expect(scoreToRating(0)).toBe(700); // beginner (<1000)
    expect(scoreToRating(1)).toBe(700);
    expect(scoreToRating(2)).toBe(1300); // intermediate (1000-1599)
    expect(scoreToRating(4)).toBe(1300);
    expect(scoreToRating(5)).toBe(1750); // advanced (>=1600)
    expect(scoreToRating(6)).toBe(1750);
  });
});

describe("bandLabel", () => {
  it("mirrors deriveSkillTier breakpoints", () => {
    expect(bandLabel(700)).toBe("Beginner");
    expect(bandLabel(999)).toBe("Beginner");
    expect(bandLabel(1000)).toBe("Intermediate");
    expect(bandLabel(1300)).toBe("Intermediate");
    expect(bandLabel(1599)).toBe("Intermediate");
    expect(bandLabel(1600)).toBe("Advanced");
    expect(bandLabel(1750)).toBe("Advanced");
  });
});

describe("derivedRating", () => {
  it("returns undefined on the platform path — the quiz does not ask for a rating", () => {
    // We collect a username and read the real rating from Lichess / Chess.com
    // after signup, so at quiz time there is genuinely nothing to report.
    expect(derivedRating(answers({ playStyle: "lichess" }))).toBeUndefined();
    expect(derivedRating(answers({ playStyle: "chesscom" }))).toBeUndefined();
  });

  it("does NOT fall through to the self-assessment score on the platform path", () => {
    // The trap this guards: a platform user answers no self-assessment
    // questions, so selfAssessScore is 0 and scoreToRating(0) is 700. Falling
    // through would stamp EVERY online player as a 700 beginner — a fabricated
    // rating indistinguishable from a real one (SILENT_SUBSTITUTION A1).
    const online = answers({ playStyle: "lichess", selfAssess: {} });
    expect(derivedRating(online)).not.toBe(700);
    expect(derivedRating(online)).toBeUndefined();
  });

  it("falls back to the self-assessment score off the online path", () => {
    // otb/new ignore any stray rating value and use the self-assessment.
    expect(
      derivedRating(
        answers({
          playStyle: "new",
          selfAssess: { years: 2, spot: 2, tournaments: 2 },
        })
      )
    ).toBe(1750);
    expect(derivedRating(answers({ playStyle: "otb", selfAssess: {} }))).toBe(
      700
    );
  });
});

describe("derivedFocusThemes", () => {
  it("collects and dedupes canonical kebab ids from selected goals", () => {
    const themes = derivedFocusThemes(answers({ goals: ["tactics", "endgame"] }));
    expect(themes).toEqual([
      "hanging-piece",
      "fork",
      "double-attack",
      "pin",
      "skewer",
      "discovered-attack",
      "back-rank",
      "endgame",
      "promotion",
      "advanced-pawn",
    ]);
  });

  it("is empty for non-themed goals (general / openings)", () => {
    expect(
      derivedFocusThemes(answers({ goals: ["general", "openings"] }))
    ).toEqual([]);
  });
});

describe("buildPayload", () => {
  it("platform path stores platform + username and NO rating", () => {
    const p = buildPayload(
      answers({
        playStyle: "lichess",
        username: "  knightrider  ",
        goals: ["tactics"],
        time: "10-30",
      })
    );
    // Absent, not zero, not 700, not 1500 — the lookup supplies the real one.
    expect("selfReportedRating" in p).toBe(false);
    expect(p.primaryPlatform).toBe("lichess");
    expect(p.lichessUsername).toBe("knightrider"); // trimmed
    expect(p.chesscomUsername).toBeUndefined();
    expect(p.focusThemes).toEqual([
      "hanging-piece",
      "fork",
      "double-attack",
      "pin",
      "skewer",
      "discovered-attack",
      "back-rank",
    ]);
    expect(p.studyGoals).toEqual(["tactics"]);
    expect(p.dailyTimeCommitment).toBe("10-30");
  });

  it("routes the username to the chess.com field for that platform", () => {
    const p = buildPayload(
      answers({
        playStyle: "chesscom",
        username: "magnus",
        goals: ["endgame"],
      })
    );
    expect(p.chesscomUsername).toBe("magnus");
    expect(p.lichessUsername).toBeUndefined();
    expect(p.studyGoals).toEqual(["endgames"]);
    // The Endgame category seeds all three endgame-family themes.
    expect(p.focusThemes).toEqual(["endgame", "promotion", "advanced-pawn"]);
  });

  it("omits an empty/blank username rather than clobbering with a blank", () => {
    const p = buildPayload(
      answers({
        playStyle: "lichess",
        username: "   ",
        goals: ["tactics"],
      })
    );
    expect("lichessUsername" in p).toBe(false);
    expect("chesscomUsername" in p).toBe(false);
  });

  it("self-assessment path sets no platform/username and a representative rating", () => {
    const p = buildPayload(
      answers({
        playStyle: "new",
        selfAssess: { years: 1, spot: 1, tournaments: 0 },
        goals: ["tactics"],
      })
    );
    expect(p.selfReportedRating).toBe(1300); // score 2 -> intermediate
    expect("primaryPlatform" in p).toBe(false);
    expect("lichessUsername" in p).toBe(false);
    expect(p.focusThemes).toContain("hanging-piece");
  });

  it("dedupes studyGoals when several categories share one study goal", () => {
    // Tactics and General both map to the "tactics" study goal.
    const p = buildPayload(
      answers({ playStyle: "otb", goals: ["tactics", "general"] })
    );
    expect(p.studyGoals).toEqual(["tactics"]); // both map to one study goal
    // General contributes no themes (it is deliberately unseeded), so the
    // union is exactly the Tactics family, in definition order.
    expect(p.focusThemes).toEqual([
      "hanging-piece",
      "fork",
      "double-attack",
      "pin",
      "skewer",
      "discovered-attack",
      "back-rank",
    ]);
  });

  it("omits focusThemes entirely when only non-themed goals are picked", () => {
    const p = buildPayload(answers({ playStyle: "new", goals: ["general"] }));
    expect("focusThemes" in p).toBe(false);
    expect(p.studyGoals).toEqual(["tactics"]); // general -> tactics study focus
  });

  it("omits studyGoals and dailyTimeCommitment when nothing implies them", () => {
    const p = buildPayload(answers({ playStyle: "lichess" }));
    expect("studyGoals" in p).toBe(false);
    expect("dailyTimeCommitment" in p).toBe(false);
    expect("focusThemes" in p).toBe(false);
    // No rating on the platform path — see derivedRating's contract.
    expect("selfReportedRating" in p).toBe(false);
  });

  // Reminder consent. This field turns notifications on for a real person, so
  // it must be carried exactly as answered — never inferred, never dropped.
  it("opts the user in when the pre-checked box is left alone", () => {
    const p = buildPayload(answers({ playStyle: "new", dailyReminder: true }));
    expect(p.reminderPrefs).toEqual({ enabled: true });
  });

  it("records an explicit decline rather than leaving it undefined", () => {
    // Undefined would read as "never asked" and get the user re-prompted,
    // which is exactly what unchecking the box is meant to prevent.
    const p = buildPayload(answers({ playStyle: "new", dailyReminder: false }));
    expect(p.reminderPrefs).toEqual({ enabled: false });
  });

  it("always emits reminderPrefs, on every quiz path", () => {
    const online = buildPayload(
      answers({ playStyle: "lichess", dailyReminder: true }),
    );
    const selfAssessed = buildPayload(
      answers({ playStyle: "otb", dailyReminder: true }),
    );
    expect(online.reminderPrefs).toBeDefined();
    expect(selfAssessed.reminderPrefs).toBeDefined();
  });
});

describe("goal-driven planning fields", () => {
  it("carries the goal rating and practice frequency into the profile", () => {
    const p = buildPayload(
      answers({ playStyle: "lichess", goalRating: 1700, daysPerWeek: 6 })
    );
    expect(p.goalRating).toBe(1700);
    expect(p.practiceDaysPerWeek).toBe(6);
  });

  it("omits the goal entirely when the user never set one", () => {
    // Absent, not zero — a 0 goal would make every projection nonsense, and
    // "no goal" is a legitimate answer.
    const p = buildPayload(answers({ playStyle: "lichess", goalRating: undefined }));
    expect("goalRating" in p).toBe(false);
  });
});

describe("the promised target date", () => {
  it("is computed and stored when goal, time and frequency are all known", () => {
    const p = buildPayload(
      answers({
        playStyle: "otb",
        selfAssess: { years: 2, spot: 2, tournaments: 2 }, // → 1750
        goalRating: 1900,
        time: "30-plus",
        daysPerWeek: 6,
      })
    );
    expect(typeof p.goalTargetDate).toBe("number");
    expect(p.goalTargetDate!).toBeGreaterThan(Date.now());
    // The baseline must be the derived rating, not the (absent) parameter.
    // Storing `undefined` here still produces a valid-looking date, so /plan
    // would bail on the missing baseline and render nothing — a card that
    // vanishes for the self-assessment path only.
    expect(p.goalStartRating).toBe(1750);
    expect(typeof p.goalSetAt).toBe("number");
  });

  it("is omitted when any input is missing, rather than guessed", () => {
    // A date built on a schedule the user never gave would be a deadline we
    // invented for them.
    const noGoal = buildPayload(answers({ playStyle: "otb", time: "30-plus", daysPerWeek: 6 }));
    expect("goalTargetDate" in noGoal).toBe(false);

    const noTime = buildPayload(answers({ playStyle: "otb", goalRating: 1900, daysPerWeek: 6 }));
    expect("goalTargetDate" in noTime).toBe(false);
  });

  it("anchors the promise to the LIVE platform rating on the platform path", () => {
    // The bug this replaces: the goal step shows a projection built from the
    // real rating /api/ratings/preview just fetched, and then buildPayload
    // re-derived the anchor with derivedRating() — which returns undefined on
    // the platform path. The date was promised on screen and dropped on the
    // way to Firestore, so /plan had nothing to hold the user to and rendered
    // no card at all. The rating the quiz displayed must be the rating it
    // stores.
    const p = buildPayload(
      answers({ playStyle: "lichess", username: "x", goalRating: 1900, time: "30-plus", daysPerWeek: 6 }),
      1650
    );
    expect(p.goalStartRating).toBe(1650);
    expect(typeof p.goalSetAt).toBe("number");
    expect(typeof p.goalTargetDate).toBe("number");
    expect(p.goalTargetDate!).toBeGreaterThan(Date.now());
    // Still not a self-report: the number came from Lichess, not from them.
    expect("selfReportedRating" in p).toBe(false);
  });

  it("is omitted when the platform lookup gave us nothing to anchor to", () => {
    // Lookup 404'd, or the account has no established rating. Absence stays
    // absence — a promise projected from a fabricated 1500 is worse than none.
    const p = buildPayload(
      answers({ playStyle: "lichess", username: "x", goalRating: 1900, time: "30-plus", daysPerWeek: 6 })
    );
    expect("goalTargetDate" in p).toBe(false);
    expect("goalStartRating" in p).toBe(false);
  });
});

describe("per-control goals from the quiz", () => {
  const withGoals = (
    over: Partial<Record<"bullet" | "blitz" | "rapid", { start: string; goal: string }>>
  ) => ({ ...emptyPerfDrafts(), ...over });

  it("stores each control's target and an overall goal derived from one anchor", () => {
    // The platform branch asks control by control, so buildPayload routes
    // through buildPerfGoalPatch. The overall pair still has to come out,
    // because it is what GoalProgressCard and the trend forecast read.
    const p = buildPayload(
      answers({
        playStyle: "chesscom",
        username: "aayan",
        time: "30-plus",
        daysPerWeek: 4,
        perfDrafts: withGoals({
          blitz: { start: "1425", goal: "1600" },
          rapid: { start: "1815", goal: "2000" },
        }),
      }),
      1815,
      { platform: "chesscom", perf: "rapid" }
    );
    expect(p.perfGoals).toEqual({
      blitz: { start: 1425, goal: 1600 },
      rapid: { start: 1815, goal: 2000 },
    });
    // Anchored on the control the platform rating came from.
    expect(p.goalStartRating).toBe(1815);
    expect(p.goalRating).toBe(2000);
    // And renderable, which is the whole point of writing it at all.
    expect(hasCompleteGoal(p)).toBe(true);
  });

  it("falls back to the highest established control when the anchor sat one out", () => {
    // selectCalibrationRating's "highest established rating wins", applied to
    // whichever controls the user actually aimed at.
    const p = buildPayload(
      answers({
        playStyle: "chesscom",
        time: "30-plus",
        daysPerWeek: 4,
        perfDrafts: withGoals({
          bullet: { start: "1271", goal: "1400" },
          rapid: { start: "1815", goal: "2000" },
        }),
      }),
      1815,
      { platform: "chesscom", perf: "classical" }
    );
    expect(p.goalStartRating).toBe(1815);
  });

  it("writes no goal at all when the form was left blank", () => {
    // Absent, not zero. Skipping the step is a legitimate answer and /profile
    // asks again.
    const p = buildPayload(
      answers({
        playStyle: "chesscom",
        time: "30-plus",
        daysPerWeek: 4,
        perfDrafts: emptyPerfDrafts(),
      }),
      1815,
      { platform: "chesscom", perf: "rapid" }
    );
    expect("perfGoals" in p).toBe(false);
    expect("goalRating" in p).toBe(false);
    expect("goalTargetDate" in p).toBe(false);
    // The schedule is still theirs, and the daily planner needs it.
    expect(p.dailyTimeCommitment).toBe("30-plus");
    expect(p.practiceDaysPerWeek).toBe(4);
  });

  it("refuses the whole patch rather than keeping the controls that parsed", () => {
    // "We kept two of your three goals" is not a thing any screen says, and
    // the step blocks this shape anyway — this is the second line of defence.
    const p = buildPayload(
      answers({
        playStyle: "chesscom",
        time: "30-plus",
        daysPerWeek: 4,
        perfDrafts: withGoals({
          blitz: { start: "1425", goal: "1600" },
          rapid: { start: "1815", goal: "1700" }, // downward
        }),
      }),
      1815,
      { platform: "chesscom", perf: "rapid" }
    );
    expect("perfGoals" in p).toBe(false);
    expect("goalRating" in p).toBe(false);
  });

  it("drops them when the user backed up and left the platform branch", () => {
    // Back does not clear answers, so the draft still carries what they typed
    // on the chess.com branch. Writing it anyway would store per-control goals
    // from a form they can no longer see, on a scale they are no longer on.
    const p = buildPayload(
      answers({
        playStyle: "otb",
        selfAssess: { years: 2, spot: 2, tournaments: 2 },
        time: "30-plus",
        daysPerWeek: 4,
        perfDrafts: withGoals({ blitz: { start: "1425", goal: "1600" } }),
      })
    );
    expect("perfGoals" in p).toBe(false);
  });

  it("reads lichess numbers on the lichess scale", () => {
    // Lichess runs ~200 points hot against the calibration scale, so storing
    // a raw lichess 2000 as the overall goal would move the target.
    const raw = { rapid: { start: "1815", goal: "2000" } };
    const lichess = buildPayload(
      answers({ playStyle: "lichess", time: "30-plus", daysPerWeek: 4, perfDrafts: withGoals(raw) }),
      undefined,
      { platform: "lichess", perf: "rapid" }
    );
    const chesscom = buildPayload(
      answers({ playStyle: "chesscom", time: "30-plus", daysPerWeek: 4, perfDrafts: withGoals(raw) }),
      undefined,
      { platform: "chesscom", perf: "rapid" }
    );
    expect(lichess.goalRating).not.toBe(chesscom.goalRating);
    // The per-control numbers stay RAW either way — they are what we show.
    expect(lichess.perfGoals).toEqual(chesscom.perfGoals);
  });
});

describe("isQuizHandleValid", () => {
  it("treats no handle as fine — the step is optional", () => {
    expect(isQuizHandleValid(undefined)).toBe(true);
    expect(isQuizHandleValid("  ")).toBe(true);
  });

  it("applies the same format rules the claim will", () => {
    expect(isQuizHandleValid("lazerwizard")).toBe(true);
    expect(isQuizHandleValid("ab")).toBe(false);
    expect(isQuizHandleValid("admin")).toBe(false);
    expect(isQuizHandleValid("has spaces")).toBe(false);
  });

  it("never smuggles the handle into the profile patch", () => {
    // Claiming is an atomic transaction on its own endpoint, and the profile
    // PATCH route refuses the field — folding it in would silently drop it.
    const p = buildPayload(answers({ playStyle: "new", handle: "lazerwizard" }));
    expect("handle" in p).toBe(false);
  });
});
