"use client";

import { Box, Button, TextField, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import QuizProgress from "./QuizProgress";
import QuizStep from "./QuizStep";
import QuizOption from "./QuizOption";
import QuizResult from "./QuizResult";
import { useOnboardingQuiz } from "./useOnboardingQuiz";
import {
  PLAY_STYLE_OPTIONS,
  SELF_ASSESS_QUESTIONS,
  TIME_OPTIONS,
  FREQUENCY_OPTIONS,
  minutesPerDayFor,
  QuizAnswers,
  SelfAssessKey,
} from "./quizConfig";
import { QUIZ_GOAL_OPTIONS } from "./quizThemes";
import GoalRatingPicker from "./GoalRatingPicker";
import PerfGoalStep from "./PerfGoalStep";
import HandleStep from "./HandleStep";
import { useQuizCurrentRating, type QuizRating } from "./useQuizCurrentRating";
import { isUsernameValid } from "./useOnboardingQuiz";
import TacticDiagram from "./TacticDiagram";
import QuizIcon, { type QuizIconName } from "./QuizIcon";
import {
  GOAL_DIAGRAMS,
  GOAL_DIAGRAM_ALT,
  SPOT_DIAGRAMS,
} from "./tacticDiagrams";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

// A step swap is a short cross-fade.
const STEP_TRANSITION = { duration: 0.18, ease: "easeOut" } as const;

/** Play-style option key → its illustration. */
const PLAY_STYLE_ICON: Record<string, QuizIconName> = {
  lichess: "online",
  chesscom: "online",
  otb: "otb",
  new: "new",
};
const PLAY_STYLE_ICON_ALT: Record<string, string> = {
  lichess: "A chess board on a screen",
  chesscom: "A chess board on a screen",
  otb: "Two players either side of a board",
  new: "A single pawn, just starting out",
};

/** Self-assessment score → rank. Mirrors selfAssessScore's 0/1/2. */
const LEVEL_ALT = [
  "Pawn, just starting",
  "Knight, getting there",
  "Queen, confident",
];

/** Days-per-week option → clock fill, reusing the time-budget iconography. */
const FREQUENCY_ICON: Record<number, QuizIconName> = {
  2: "time-low",
  4: "time-mid",
  6: "time-high",
};

const TIME_ICON: Record<string, QuizIconName> = {
  "under-10": "time-low", // legacy band — no option writes it any more
  "10-30": "time-low",
  "30-plus": "time-mid",
  "60-plus": "time-high",
};

interface OnboardingQuizProps {
  /**
   * Called when the user unlocks from the result screen.
   *
   * The rating travels WITH the answers rather than being re-derived: it is
   * the anchor the goal projection was displayed from, and buildPayload cannot
   * work it out again, because the derivation returns undefined on the
   * platform path. The promise would be shown on screen and then quietly not
   * stored. The platform and anchor control come along for the same reason —
   * per-control goals are raw platform numbers, and reading them on the wrong
   * scale silently moves the target.
   */
  onUnlock: (answers: QuizAnswers, rating: QuizRating) => void;
  submitting?: boolean;
  /** True when the viewer is already signed in (mandatory-onboarding flow). */
  authed?: boolean;
}

export default function OnboardingQuiz({
  onUnlock,
  submitting,
  authed,
}: OnboardingQuizProps) {
  const q = useOnboardingQuiz();
  // Reads the visitor's real rating so the goal projection is anchored to them
  // rather than to a guess. Resolves to undefined when unknown, which the
  // picker renders honestly instead of substituting a number.
  const rating = useQuizCurrentRating(q.answers);
  const { currentRating, status: ratingStatus } = rating;

  // Avoid a flash of empty/then-restored content before the draft hydrates.
  if (!q.hydrated) {
    return <Box sx={{ minHeight: 420 }} />;
  }

  const animKey = q.phase === "result" ? "result" : (q.currentStep ?? "none");
  const showStartOver = q.phase === "result" || !q.isFirstStep;

  function renderContent() {
    if (q.phase === "result") {
      return (
        <QuizResult
          answers={q.answers}
          onUnlock={() => onUnlock(q.answers, rating)}
          onBack={q.back}
          submitting={submitting}
          authed={authed}
        />
      );
    }

    const step = q.currentStep;
    switch (step) {
      case "play-style":
        return (
          <QuizStep title="How do you currently play?">
            {PLAY_STYLE_OPTIONS.map((o) => (
              <QuizOption
                key={o.key}
                label={o.label}
                helper={o.helper}
                selected={q.answers.playStyle === o.key}
                onClick={() => q.setPlayStyle(o.key)}
                visual={
                  <QuizIcon
                    name={PLAY_STYLE_ICON[o.key]}
                    px={64}
                    title={PLAY_STYLE_ICON_ALT[o.key]}
                  />
                }
              />
            ))}
          </QuizStep>
        );

      case "username": {
        const platform =
          q.answers.playStyle === "lichess" ? "Lichess" : "Chess.com";
        const typed = (q.answers.username ?? "").trim();
        const malformed = typed.length > 0 && !isUsernameValid(typed);
        return (
          <QuizStep
            title={`What's your ${platform} username?`}
            helper={`We'll read your real rating straight off ${platform}, so there's no need to guess.`}
          >
            <TextField
              label={`${platform} username`}
              placeholder={
                q.answers.playStyle === "lichess"
                  ? "e.g. DrNykterstein"
                  : "e.g. hikaru"
              }
              fullWidth
              autoFocus
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={q.answers.username ?? ""}
              onChange={(e) => q.setUsername(e.target.value)}
              error={malformed}
              helperText={
                malformed
                  ? "Letters, numbers, hyphens and underscores only."
                  : " "
              }
            />
          </QuizStep>
        );
      }

      case "sa-years":
      case "sa-spot":
      case "sa-tournaments": {
        const key = step.replace("sa-", "") as SelfAssessKey;
        const question = SELF_ASSESS_QUESTIONS.find((sq) => sq.key === key);
        if (!question) return null;
        return (
          <QuizStep
            title={question.question}
            /* "Can you spot a fork or a pin?" is unanswerable if you don't know
               what one looks like. Show it. */
            aside={
              key === "spot" ? (
                <TacticDiagram
                  spec={SPOT_DIAGRAMS.fork}
                  px={84}
                  title="A knight attacking a king and a rook at the same time"
                />
              ) : undefined
            }
          >
            {question.options.map((opt) => (
              <QuizOption
                key={opt.label}
                label={opt.label}
                selected={q.answers.selfAssess[key] === opt.score}
                onClick={() => q.setSelfAssess(key, opt.score)}
                visual={
                  <QuizIcon
                    name={`level-${opt.score}` as const}
                    px={52}
                    title={LEVEL_ALT[opt.score]}
                  />
                }
              />
            ))}
          </QuizStep>
        );
      }

      case "goals":
        return (
          <QuizStep
            title="What do you want to improve?"
            helper="Pick a few. Each one is shown on the board."
          >
            {QUIZ_GOAL_OPTIONS.map((o) => (
              <QuizOption
                key={o.key}
                label={o.label}
                helper={o.helper}
                multi
                selected={q.answers.goals.includes(o.key)}
                onClick={() => q.toggleGoal(o.key)}
                visual={
                  GOAL_DIAGRAMS[o.key] ? (
                    <TacticDiagram
                      spec={GOAL_DIAGRAMS[o.key]}
                      px={72}
                      title={GOAL_DIAGRAM_ALT[o.key]}
                    />
                  ) : undefined
                }
              />
            ))}
          </QuizStep>
        );

      case "goal-rating":
        return (
          <QuizStep
            title="What rating do you want to reach?"
            helper={
              currentRating
                ? `You're around ${currentRating} today.`
                : "We'll estimate how long it takes."
            }
          >
            <GoalRatingPicker
              currentRating={currentRating}
              value={q.answers.goalRating}
              onChange={q.setGoalRating}
              minutesPerDay={minutesPerDayFor(q.answers.time)}
              daysPerWeek={q.answers.daysPerWeek ?? 4}
              ratingStatus={ratingStatus}
            />
          </QuizStep>
        );

      case "perf-goals":
        return (
          <QuizStep
            title="Where do you want each time control to be?"
            helper="Set a goal on the ones you play and leave the rest blank."
          >
            <PerfGoalStep
              drafts={q.answers.perfDrafts}
              rating={rating}
              time={q.answers.time}
              daysPerWeek={q.answers.daysPerWeek}
              onChange={q.setPerfDraft}
              onSeedCurrents={q.seedPerfCurrents}
            />
          </QuizStep>
        );

      case "handle":
        return (
          <QuizStep
            title="Pick your handle"
            helper="It's how we'll address you, and you can sign in with it instead of your email. Don't use your full name, since other players can see this."
          >
            <HandleStep value={q.answers.handle ?? ""} onChange={q.setHandle} />
          </QuizStep>
        );

      case "frequency":
        return (
          <QuizStep
            title="How often can you practice?"
            helper="Little and often beats one long session."
          >
            {FREQUENCY_OPTIONS.map((o) => (
              <QuizOption
                key={o.key}
                label={o.label}
                helper={o.helper}
                selected={q.answers.daysPerWeek === o.key}
                onClick={() => q.setDaysPerWeek(o.key)}
                visual={<QuizIcon name={FREQUENCY_ICON[o.key]} px={52} />}
              />
            ))}
          </QuizStep>
        );

      case "time":
        return (
          <QuizStep title="How much time can you practice?">
            {TIME_OPTIONS.map((o) => (
              <QuizOption
                key={o.key}
                label={o.label}
                helper={o.helper}
                selected={q.answers.time === o.key}
                onClick={() => q.setTime(o.key)}
                visual={<QuizIcon name={TIME_ICON[o.key]} px={52} />}
              />
            ))}

            {/* Reminder opt-in. Deliberately a VISIBLE, pre-checked choice on
                the last question rather than a silent default at signup: a
                daily nudge is the mechanism that makes the plan a plan, but
                turning notifications on without the user seeing it is a dark
                pattern — and this product gates under-13 users. Unchecking is
                recorded as an explicit false so we never re-ask. */}
            <Box
              onClick={() => q.setDailyReminder(!q.answers.dailyReminder)}
              role="checkbox"
              aria-checked={q.answers.dailyReminder}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  q.setDailyReminder(!q.answers.dailyReminder);
                }
              }}
              sx={{
                mt: 2.5,
                p: 1.75,
                display: "flex",
                alignItems: "flex-start",
                gap: 1.5,
                cursor: "pointer",
                borderRadius: `${RADIUS.control}px`,
                background: SURFACE.raisedSecondary,
                border: `1px solid ${LINE.hairline}`,
                transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}`,
                "&:hover": {
                  background: SURFACE.raisedTertiary,
                  borderColor: LINE.strong,
                },
                "&:focus-visible": {
                  outline: `2px solid ${TEXT.primary}`,
                  outlineOffset: 2,
                },
              }}
            >
              <Box
                sx={{
                  mt: "2px",
                  width: 20,
                  height: 20,
                  flexShrink: 0,
                  borderRadius: "6px",
                  display: "grid",
                  placeItems: "center",
                  background: q.answers.dailyReminder
                    ? ACCENT.main
                    : "transparent",
                  border: q.answers.dailyReminder
                    ? "none"
                    : `2px solid ${TEXT.tertiary}`,
                }}
              >
                {q.answers.dailyReminder && (
                  <Check size={13} color={TEXT.onAccent} strokeWidth={3.5} />
                )}
              </Box>
              <Box>
                <Typography
                  sx={{
                    ...TYPE.bodySmall,
                    fontWeight: 600,
                    color: TEXT.primary,
                  }}
                >
                  Email me a daily nudge
                </Typography>
                <Typography
                  sx={{ ...TYPE.caption, color: TEXT.secondary, mt: 0.25 }}
                >
                  One short reminder so you don&apos;t break your streak. Turn
                  it off anytime.
                </Typography>
              </Box>
            </Box>
          </QuizStep>
        );

      default:
        return null;
    }
  }

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        px: 2,
        py: { xs: 3, md: 6 },
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 480,
          display: "flex",
          flexDirection: "column",
          gap: 2.5,
          p: { xs: 2.5, md: 3.5 },
          borderRadius: `${RADIUS.card}px`,
          background: SURFACE.raised,
          border: `1px solid ${LINE.hairline}`,
        }}
      >
        {/* Header: progress + start over. minHeight is the small button's
            32px, so the row does not grow when Start over appears. */}
        <Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              minHeight: 32,
              mb: 1.25,
            }}
          >
            {showStartOver && (
              <Button
                onClick={q.startOver}
                size="small"
                sx={{
                  color: TEXT.secondary,
                  fontSize: TYPE.caption.fontSize,
                  minWidth: 0,
                  "&:hover": { color: TEXT.primary },
                }}
              >
                Start over
              </Button>
            )}
          </Box>
          <QuizProgress value={q.progress} />
        </Box>

        {/* Body */}
        <Box sx={{ minHeight: 0 }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={animKey}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={STEP_TRANSITION}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </Box>

        {/* Footer (questions phase only; result screen owns its own actions) */}
        {q.phase === "questions" && (
          <Box sx={{ display: "flex", gap: 1.5 }}>
            {!q.isFirstStep && (
              <Button onClick={q.back} variant="outlined" sx={{ px: 2.5 }}>
                Back
              </Button>
            )}
            <Button
              onClick={q.next}
              disabled={!q.canAdvance}
              variant="contained"
              sx={{
                flex: 1,
                py: 1.3,
                fontSize: TYPE.body.fontSize,
                "&.Mui-disabled": {
                  color: TEXT.tertiary,
                  background: "rgba(255,255,255,0.08)",
                },
              }}
            >
              {q.isLastQuestion ? "See my results" : "Continue"}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
