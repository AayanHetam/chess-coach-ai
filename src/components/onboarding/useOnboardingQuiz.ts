import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DRAFT_STORAGE_KEY,
  emptyAnswers,
  QuizAnswers,
  PlayStyle,
  SelfAssessKey,
  SelfAssessScore,
  TimeCommitment,
  usesPlatformPath,
} from "./quizConfig";

/**
 * Quiz state machine. One question per screen with a branch after step 1
 * (platform-username path vs self-assessment path). Answers are mirrored to a
 * localStorage DRAFT so a refresh resumes; the draft is NOT the flush payload
 * (that's written separately by the result screen on "unlock").
 */

export type StepId =
  | "play-style"
  | "username"
  | "sa-years"
  | "sa-spot"
  | "sa-tournaments"
  | "goals"
  | "time";

export type QuizPhase = "questions" | "result";

/** The ordered, branch-resolved step list for the current answers. */
function resolveSteps(answers: QuizAnswers): StepId[] {
  const steps: StepId[] = ["play-style"];
  if (!answers.playStyle) return steps;
  if (usesPlatformPath(answers.playStyle)) {
    steps.push("username");
  } else {
    steps.push("sa-years", "sa-spot", "sa-tournaments");
  }
  steps.push("goals", "time");
  return steps;
}

/**
 * Both platforms allow only these characters in a handle, so anything else is
 * a typo we can catch before the user leaves the step rather than a confusing
 * "account not found" after signup.
 */
const USERNAME_RE = /^[A-Za-z0-9_-]{1,30}$/;

export function isUsernameValid(u: string | undefined): boolean {
  return typeof u === "string" && USERNAME_RE.test(u.trim());
}

function canAdvanceStep(step: StepId, a: QuizAnswers): boolean {
  switch (step) {
    case "play-style":
      return !!a.playStyle;
    case "username":
      return isUsernameValid(a.username);
    case "sa-years":
      return a.selfAssess.years !== undefined;
    case "sa-spot":
      return a.selfAssess.spot !== undefined;
    case "sa-tournaments":
      return a.selfAssess.tournaments !== undefined;
    case "goals":
      return a.goals.length > 0;
    case "time":
      return !!a.time;
    default:
      return false;
  }
}

export interface OnboardingQuizApi {
  answers: QuizAnswers;
  steps: StepId[];
  stepIndex: number;
  currentStep: StepId | null;
  phase: QuizPhase;
  progress: number;
  canAdvance: boolean;
  isFirstStep: boolean;
  isLastQuestion: boolean;
  hydrated: boolean;
  next: () => void;
  back: () => void;
  startOver: () => void;
  setPlayStyle: (v: PlayStyle) => void;
  setUsername: (v: string) => void;
  setSelfAssess: (key: SelfAssessKey, score: SelfAssessScore) => void;
  toggleGoal: (key: string) => void;
  setTime: (v: TimeCommitment) => void;
  setDailyReminder: (v: boolean) => void;
}

export function useOnboardingQuiz(): OnboardingQuizApi {
  const [answers, setAnswers] = useState<QuizAnswers>(emptyAnswers);
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<QuizPhase>("questions");
  const [hydrated, setHydrated] = useState(false);

  // Hydrate the draft once on mount (client only).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          answers?: QuizAnswers;
          stepIndex?: number;
        };
        if (parsed?.answers) {
          const restored: QuizAnswers = {
            ...emptyAnswers(),
            ...parsed.answers,
            selfAssess: parsed.answers.selfAssess ?? {},
            goals: parsed.answers.goals ?? [],
          };
          setAnswers(restored);
          const maxIdx = Math.max(0, resolveSteps(restored).length - 1);
          setStepIndex(Math.min(parsed.stepIndex ?? 0, maxIdx));
        }
      }
    } catch {
      // Corrupt draft — ignore and start fresh.
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist the draft on every change (after hydration so we never overwrite a
  // good draft with the initial empty state during SSR/first paint).
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({ answers, stepIndex })
      );
    } catch {
      // Storage full / unavailable — non-fatal.
    }
  }, [answers, stepIndex, hydrated]);

  const steps = useMemo(() => resolveSteps(answers), [answers]);
  const currentStep = phase === "result" ? null : (steps[stepIndex] ?? null);
  const canAdvance = currentStep ? canAdvanceStep(currentStep, answers) : true;
  const isLastQuestion = stepIndex === steps.length - 1;
  const isFirstStep = stepIndex === 0 && phase === "questions";

  // Progress: estimate the denominator before the branch is known (online path
  // is the common/shorter case) so the bar doesn't jump to 100% on step 1.
  const estimatedTotal = answers.playStyle ? steps.length : 4;
  const progress =
    phase === "result"
      ? 1
      : Math.min(1, (stepIndex + 1) / (estimatedTotal + 1));

  const next = useCallback(() => {
    setStepIndex((idx) => {
      const list = resolveSteps(answers);
      const step = list[idx];
      if (!step || !canAdvanceStep(step, answers)) return idx;
      if (idx >= list.length - 1) {
        setPhase("result");
        return idx;
      }
      return idx + 1;
    });
  }, [answers]);

  const back = useCallback(() => {
    setPhase((p) => {
      if (p === "result") return "questions";
      return p;
    });
    setStepIndex((idx) => (phase === "result" ? idx : Math.max(0, idx - 1)));
  }, [phase]);

  const startOver = useCallback(() => {
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setAnswers(emptyAnswers());
    setStepIndex(0);
    setPhase("questions");
  }, []);

  const setPlayStyle = useCallback((v: PlayStyle) => {
    setAnswers((a) => ({ ...a, playStyle: v }));
  }, []);
  const setUsername = useCallback((v: string) => {
    setAnswers((a) => ({ ...a, username: v }));
  }, []);
  const setSelfAssess = useCallback(
    (key: SelfAssessKey, score: SelfAssessScore) => {
      setAnswers((a) => ({
        ...a,
        selfAssess: { ...a.selfAssess, [key]: score },
      }));
    },
    []
  );
  const toggleGoal = useCallback((key: string) => {
    setAnswers((a) => ({
      ...a,
      goals: a.goals.includes(key)
        ? a.goals.filter((g) => g !== key)
        : [...a.goals, key],
    }));
  }, []);
  const setTime = useCallback((v: TimeCommitment) => {
    setAnswers((a) => ({ ...a, time: v }));
  }, []);
  const setDailyReminder = useCallback((v: boolean) => {
    setAnswers((a) => ({ ...a, dailyReminder: v }));
  }, []);

  return {
    answers,
    steps,
    stepIndex,
    currentStep,
    phase,
    progress,
    canAdvance,
    isFirstStep,
    isLastQuestion,
    hydrated,
    next,
    back,
    startOver,
    setPlayStyle,
    setUsername,
    setSelfAssess,
    toggleGoal,
    setTime,
    setDailyReminder,
  };
}
