import { describe, it, expect } from "vitest";
import {
  hasCompletedOnboarding,
  shouldSkipQuiz,
  startPlanHref,
  type OnboardingViewerState,
} from "../quizGate";

const anonymous: OnboardingViewerState = {
  loading: false,
  hasUser: false,
};

const signedInFresh: OnboardingViewerState = {
  loading: false,
  hasUser: true,
  onboardingCompletedAt: undefined,
};

const signedInDone: OnboardingViewerState = {
  loading: false,
  hasUser: true,
  onboardingCompletedAt: 1_754_000_000_000,
};

describe("hasCompletedOnboarding", () => {
  it("is true for a signed-in user carrying a completion timestamp", () => {
    expect(hasCompletedOnboarding(signedInDone)).toBe(true);
  });

  it("is false for a signed-in user who has never answered the quiz", () => {
    expect(hasCompletedOnboarding(signedInFresh)).toBe(false);
  });

  it("is false for an anonymous visitor", () => {
    expect(hasCompletedOnboarding(anonymous)).toBe(false);
  });

  it("is false while auth is still resolving, even with a timestamp present", () => {
    // The flash-then-redirect case. If this returned true mid-load we would
    // gate on a half-resolved profile; if it returned true only AFTER load we
    // would still be correct — so loading must resolve to "not completed".
    expect(
      hasCompletedOnboarding({ ...signedInDone, loading: true })
    ).toBe(false);
  });

  it("treats null and 0 as not-completed, not as completed", () => {
    // Firestore omits the field entirely for pre-quiz users, but a `null`
    // round-trip through JSON must not read as a valid timestamp.
    expect(
      hasCompletedOnboarding({ ...signedInDone, onboardingCompletedAt: null })
    ).toBe(false);
    expect(
      hasCompletedOnboarding({ ...signedInDone, onboardingCompletedAt: 0 })
    ).toBe(false);
  });
});

describe("shouldSkipQuiz", () => {
  it("bounces a completed user away from the questions", () => {
    expect(shouldSkipQuiz(signedInDone)).toBe(true);
  });

  it("lets a signed-in user who has not answered it through", () => {
    expect(shouldSkipQuiz(signedInFresh)).toBe(false);
  });

  it("lets an anonymous visitor through — the quiz is the pre-auth funnel", () => {
    expect(shouldSkipQuiz(anonymous)).toBe(false);
  });

  it("does NOT fire while the current session's answers are being saved", () => {
    // Unlock writes onboardingCompletedAt and then pushes to /plan itself.
    // Gating here would race that navigation against a router.replace.
    expect(shouldSkipQuiz(signedInDone, { submitting: true })).toBe(false);
  });
});

describe("startPlanHref", () => {
  it("sends a completed user straight to the payoff", () => {
    expect(startPlanHref(signedInDone)).toBe("/plan");
  });

  it("sends everyone else into the funnel", () => {
    expect(startPlanHref(signedInFresh)).toBe("/onboarding");
    expect(startPlanHref(anonymous)).toBe("/onboarding");
  });

  it("renders the funnel href during SSR, which is what crawlers should index", () => {
    expect(startPlanHref({ ...signedInDone, loading: true })).toBe("/onboarding");
  });
});
