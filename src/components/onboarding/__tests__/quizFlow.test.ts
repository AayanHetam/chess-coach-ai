import { describe, it, expect } from "vitest";
import {
  resolveSteps,
  isLastStep,
  canAdvanceStep,
  isUsernameValid,
  quizProgress,
} from "../useOnboardingQuiz";
import { PLAY_STYLE_OPTIONS } from "../quizConfig";
import { emptyAnswers, type QuizAnswers } from "../quizConfig";
import { emptyPerfDrafts } from "@/lib/curriculum/perfGoalDrafts";

const answers = (over: Partial<QuizAnswers> = {}): QuizAnswers => ({
  ...emptyAnswers(),
  ...over,
});

describe("isLastStep — drives the CTA label", () => {
  it("is false on step 1 before a play style is picked", () => {
    // Regression: `resolveSteps` can only return ["play-style"] until the
    // branch is known, so index 0 WAS index length-1 and the CTA rendered
    // "See my results" on question 1 of the acquisition funnel.
    const a = answers();
    expect(resolveSteps(a)).toEqual(["play-style"]);
    expect(isLastStep(a, 0)).toBe(false);
  });

  it("is still false on step 1 once a branch is picked and more steps appear", () => {
    expect(isLastStep(answers({ playStyle: "lichess" }), 0)).toBe(false);
  });

  it("is true on the genuinely final step of each branch", () => {
    const online = answers({ playStyle: "lichess" });
    expect(resolveSteps(online).at(-1)).toBe("handle");
    expect(isLastStep(online, resolveSteps(online).length - 1)).toBe(true);

    const otb = answers({ playStyle: "otb" });
    expect(resolveSteps(otb).at(-1)).toBe("handle");
    expect(isLastStep(otb, resolveSteps(otb).length - 1)).toBe(true);
  });
});

describe("branching", () => {
  it("routes the online platforms to a username step, never a rating step", () => {
    for (const playStyle of ["lichess", "chesscom"] as const) {
      const steps = resolveSteps(answers({ playStyle })) as string[];
      expect(steps).toContain("username");
      expect(steps).not.toContain("rating");
    }
  });

  it("asks a platform player for a goal PER CONTROL, never the single slider", () => {
    // They have a real bullet, blitz and rapid rating, so one blended target
    // across the three is a goal for a player who does not exist. The
    // per-control form is the same one /profile offers.
    for (const playStyle of ["lichess", "chesscom"] as const) {
      expect(resolveSteps(answers({ playStyle }))).toEqual([
        "play-style",
        "username",
        "goals",
        "time",
        "frequency",
        "perf-goals",
        "handle",
      ]);
    }
  });

  it("routes off-platform players through the three self-assessment scales", () => {
    // And keeps the single slider for them: there is one coarse derived
    // rating behind it, so three boxes would be three guesses.
    expect(resolveSteps(answers({ playStyle: "otb" }))).toEqual([
      "play-style",
      "sa-years",
      "sa-spot",
      "sa-tournaments",
      "goals",
      "time",
      "frequency",
      "goal-rating",
      "handle",
    ]);
  });

  it("asks both branches for a handle, last", () => {
    for (const o of PLAY_STYLE_OPTIONS) {
      const steps = resolveSteps(answers({ playStyle: o.key }));
      expect(steps.at(-1), `${o.key} does not end on the handle`).toBe("handle");
    }
  });

  it("puts the goal question after the schedule it is projected from", () => {
    // Regression guard on the ordering comment in resolveSteps: a projection
    // drawn before time/frequency are known falls back to a default pace and
    // tells a 1300 they will reach 1600 in "about 4 years".
    for (const o of PLAY_STYLE_OPTIONS) {
      const steps = resolveSteps(answers({ playStyle: o.key })) as string[];
      const goalStep = steps.indexOf("perf-goals") >= 0 ? "perf-goals" : "goal-rating";
      expect(steps.indexOf("time")).toBeLessThan(steps.indexOf(goalStep));
      expect(steps.indexOf("frequency")).toBeLessThan(steps.indexOf(goalStep));
    }
  });
});

describe("canAdvanceStep on the username step", () => {
  it("blocks an empty or malformed handle, allows a valid one", () => {
    const step = "username" as const;
    expect(canAdvanceStep(step, answers({ playStyle: "lichess" }))).toBe(false);
    expect(
      canAdvanceStep(step, answers({ playStyle: "lichess", username: "has spaces" }))
    ).toBe(false);
    expect(
      canAdvanceStep(step, answers({ playStyle: "lichess", username: "knight_rider-7" }))
    ).toBe(true);
  });

  it("accepts the character set both platforms actually allow, and nothing else", () => {
    expect(isUsernameValid("DrNykterstein")).toBe(true);
    expect(isUsernameValid("  hikaru  ")).toBe(true); // trimmed
    expect(isUsernameValid("../../admin")).toBe(false);
    expect(isUsernameValid("a".repeat(31))).toBe(false);
    expect(isUsernameValid("")).toBe(false);
    expect(isUsernameValid(undefined)).toBe(false);
  });
});

describe("the goal-rating step", () => {
  it("lets someone through without naming a goal", () => {
    // Not everyone arrives with a number in mind, and forcing one would just
    // produce a made-up target that the whole plan then gets built around.
    expect(canAdvanceStep("goal-rating", answers({ playStyle: "lichess" }))).toBe(true);
  });

  it("rejects a goal outside the plausible rating range", () => {
    for (const goalRating of [0, 50, 3500, 99999]) {
      expect(
        canAdvanceStep("goal-rating", answers({ playStyle: "lichess", goalRating })),
        `accepted ${goalRating}`
      ).toBe(false);
    }
  });

  it("accepts a sane goal", () => {
    expect(
      canAdvanceStep("goal-rating", answers({ playStyle: "lichess", goalRating: 1700 }))
    ).toBe(true);
  });
});

describe("the per-control goal step", () => {
  const drafts = (over: Partial<Record<string, { start: string; goal: string }>>) =>
    ({ ...emptyPerfDrafts(), ...over }) as QuizAnswers["perfDrafts"];

  it("lets someone through without naming a goal", () => {
    // Same contract as the slider: nobody is forced to invent a target, and a
    // wall here costs a signup to buy a field.
    expect(
      canAdvanceStep("perf-goals", answers({ playStyle: "lichess" }))
    ).toBe(true);
  });

  it("lets a prefilled current through with no goal beside it", () => {
    // The resting state of every card once the platform lookup lands. If this
    // blocked, the step would be impassable for the majority flow.
    expect(
      canAdvanceStep(
        "perf-goals",
        answers({
          playStyle: "lichess",
          perfDrafts: drafts({ blitz: { start: "1425", goal: "" } }),
        })
      )
    ).toBe(true);
  });

  it("accepts a goal above the current rating", () => {
    expect(
      canAdvanceStep(
        "perf-goals",
        answers({
          playStyle: "lichess",
          perfDrafts: drafts({ blitz: { start: "1425", goal: "1600" } }),
        })
      )
    ).toBe(true);
  });

  it("blocks a goal at or below where they already are", () => {
    for (const goal of ["1425", "1200"]) {
      expect(
        canAdvanceStep(
          "perf-goals",
          answers({
            playStyle: "lichess",
            perfDrafts: drafts({ blitz: { start: "1425", goal } }),
          })
        ),
        `accepted a goal of ${goal} from 1425`
      ).toBe(false);
    }
  });

  it("blocks a goal with no current rating to anchor it", () => {
    // buildPerfGoalPatch refuses this outright, so letting it past the step
    // would produce a dead result screen with nothing saying why.
    expect(
      canAdvanceStep(
        "perf-goals",
        answers({
          playStyle: "lichess",
          perfDrafts: drafts({ rapid: { start: "", goal: "2000" } }),
        })
      )
    ).toBe(false);
  });

  it("blocks one bad control even when another is fine", () => {
    expect(
      canAdvanceStep(
        "perf-goals",
        answers({
          playStyle: "lichess",
          perfDrafts: drafts({
            blitz: { start: "1425", goal: "1600" },
            rapid: { start: "1815", goal: "1700" },
          }),
        })
      )
    ).toBe(false);
  });
});

describe("the handle step", () => {
  it("lets someone through without picking one", () => {
    expect(canAdvanceStep("handle", answers({}))).toBe(true);
    expect(canAdvanceStep("handle", answers({ handle: "   " }))).toBe(true);
  });

  it("accepts a well-formed handle", () => {
    expect(canAdvanceStep("handle", answers({ handle: "lazerwizard" }))).toBe(true);
    expect(canAdvanceStep("handle", answers({ handle: "Lazer-Wizard_7" }))).toBe(true);
  });

  it("rejects what the claim would reject anyway", () => {
    // Catching it here beats a signup that silently fails to claim.
    for (const handle of ["ab", "a".repeat(21), "has spaces", "_leading", "admin"]) {
      expect(
        canAdvanceStep("handle", answers({ handle })),
        `accepted ${handle}`
      ).toBe(false);
    }
  });
});

describe("the frequency step", () => {
  it("defaults to a sensible number of days rather than nothing", () => {
    expect(emptyAnswers().daysPerWeek).toBeGreaterThan(0);
  });

  it("requires at least one day a week", () => {
    expect(canAdvanceStep("frequency", answers({ daysPerWeek: 0 }))).toBe(false);
    expect(canAdvanceStep("frequency", answers({ daysPerWeek: 1 }))).toBe(true);
  });
});

describe("quizProgress — the bar never moves backwards", () => {
  it("does not shrink when question 1 is answered, whichever option is picked", () => {
    // Regression: the pre-branch denominator guessed the SHORTER path, so
    // picking "over the board" on question 1 dropped the bar from 20% to 11%.
    const before = quizProgress(answers(), 0, "questions");
    for (const o of PLAY_STYLE_OPTIONS) {
      const after = quizProgress(answers({ playStyle: o.key }), 0, "questions");
      expect(after, `bar shrank after picking ${o.key}`).toBeGreaterThanOrEqual(before);
    }
  });

  it("increases on every Continue along both branches and ends at 100%", () => {
    for (const playStyle of ["lichess", "otb"] as const) {
      const a = answers({ playStyle });
      const steps = resolveSteps(a);
      let prev = quizProgress(a, 0, "questions");
      expect(prev).toBeGreaterThan(0);
      for (let i = 1; i < steps.length; i++) {
        const p = quizProgress(a, i, "questions");
        expect(p, `${playStyle} step ${i}`).toBeGreaterThan(prev);
        expect(p).toBeLessThan(1);
        prev = p;
      }
      expect(quizProgress(a, steps.length - 1, "result")).toBe(1);
    }
  });
});
