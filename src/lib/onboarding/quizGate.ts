/**
 * The onboarding quiz is ONE-TIME. This module is the single place that
 * decides what "already done it" means, so the page gate and every CTA that
 * links into the funnel cannot drift apart.
 *
 * Before this existed, three surfaces disagreed: /onboarding had no gate at
 * all, both landing-page hero CTAs pointed at /onboarding unconditionally,
 * and /profile shipped an explicit "Retake quiz" button. A returning user's
 * most obvious click re-ran the quiz they had already completed.
 *
 * Pure by design — no React, no router, no storage — so the rules are
 * unit-testable without mounting a page.
 */

export interface OnboardingViewerState {
  /** Auth is still resolving. Nothing is known yet; assume NOT completed. */
  loading: boolean;
  /** Whether a user is signed in at all. */
  hasUser: boolean;
  /** `profile.onboardingCompletedAt` — epoch ms, set once on quiz unlock. */
  onboardingCompletedAt?: number | null;
}

/**
 * True only when we positively know this viewer finished the quiz.
 *
 * Deliberately conservative on every unknown: while auth is loading, and for
 * signed-out visitors, this is false. Being wrong in that direction shows the
 * quiz to someone who has done it (recoverable — they leave); being wrong the
 * other way locks a genuinely new user out of the only personalization path
 * the product has.
 */
export function hasCompletedOnboarding(state: OnboardingViewerState): boolean {
  if (state.loading || !state.hasUser) return false;
  return typeof state.onboardingCompletedAt === "number" && state.onboardingCompletedAt > 0;
}

/**
 * Whether /onboarding should bounce this viewer to /plan instead of rendering
 * the questions.
 *
 * `submitting` suppresses the gate: a quiz finished in the current session
 * writes `onboardingCompletedAt` and then navigates to /plan itself, so
 * without this the two redirects race during the write.
 */
export function shouldSkipQuiz(
  state: OnboardingViewerState,
  opts: { submitting: boolean } = { submitting: false }
): boolean {
  if (opts.submitting) return false;
  return hasCompletedOnboarding(state);
}

/**
 * Destination for the "Start your plan" CTA. Completed users go straight to
 * the payoff; everyone else — including anonymous visitors and crawlers, who
 * see the SSR render while auth is still `loading` — goes into the funnel.
 */
export function startPlanHref(state: OnboardingViewerState): "/plan" | "/onboarding" {
  return hasCompletedOnboarding(state) ? "/plan" : "/onboarding";
}
