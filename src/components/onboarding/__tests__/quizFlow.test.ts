import { describe, it, expect } from "vitest";
import {
  resolveSteps,
  isLastStep,
  canAdvanceStep,
  isUsernameValid,
} from "../useOnboardingQuiz";
import { emptyAnswers, type QuizAnswers } from "../quizConfig";

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
    expect(resolveSteps(online).at(-1)).toBe("frequency");
    expect(isLastStep(online, resolveSteps(online).length - 1)).toBe(true);

    const otb = answers({ playStyle: "otb" });
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

  it("routes off-platform players through the three self-assessment scales", () => {
    expect(resolveSteps(answers({ playStyle: "otb" }))).toEqual([
      "play-style",
      "sa-years",
      "sa-spot",
      "sa-tournaments",
      "goals",
      "goal-rating",
      "time",
      "frequency",
    ]);
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

describe("the frequency step", () => {
  it("defaults to a sensible number of days rather than nothing", () => {
    expect(emptyAnswers().daysPerWeek).toBeGreaterThan(0);
  });

  it("requires at least one day a week", () => {
    expect(canAdvanceStep("frequency", answers({ daysPerWeek: 0 }))).toBe(false);
    expect(canAdvanceStep("frequency", answers({ daysPerWeek: 1 }))).toBe(true);
  });
});
