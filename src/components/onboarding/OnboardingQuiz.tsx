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
import { useQuizCurrentRating } from "./useQuizCurrentRating";
import { isUsernameValid } from "./useOnboardingQuiz";
import TacticDiagram from "./TacticDiagram";
import QuizIcon, { type QuizIconName } from "./QuizIcon";
import { GOAL_DIAGRAMS, GOAL_DIAGRAM_ALT, SPOT_DIAGRAMS } from "./tacticDiagrams";

const EASE = [0.22, 0.61, 0.36, 1] as const;
const ORANGE = "linear-gradient(135deg, #F97316 0%, #EA580C 100%)";
const ORANGE_HOVER = "linear-gradient(135deg, #FB923C 0%, #F97316 100%)";

const ratingInputSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: "12px",
    color: "rgba(255,255,255,0.94)",
    "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
    "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
    "&.Mui-focused fieldset": {
      borderColor: "rgba(249,115,22,0.55)",
      borderWidth: "1px",
    },
  },
  "& .MuiInputLabel-root": {
    color: "rgba(255,255,255,0.55)",
    "&.Mui-focused": { color: "#FB923C" },
  },
} as const;

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
const LEVEL_ALT = ["Pawn — just starting", "Knight — getting there", "Queen — confident"];

/** Days-per-week option → clock fill, reusing the time-budget iconography. */
const FREQUENCY_ICON: Record<number, QuizIconName> = {
  2: "time-low",
  4: "time-mid",
  6: "time-high",
};

const TIME_ICON: Record<string, QuizIconName> = {
  "under-10": "time-low",
  "10-30": "time-mid",
  "30-plus": "time-high",
};

interface OnboardingQuizProps {
  /**
   * Called when the user unlocks from the result screen.
   *
   * `currentRating` is the anchor the goal projection was displayed from — the
   * live platform number when they gave a username. It has to travel with the
   * answers: buildPayload cannot re-derive it, because the derivation returns
   * undefined on the platform path, and the promise would be shown on screen
   * and then quietly not stored.
   */
  onUnlock: (answers: QuizAnswers, currentRating?: number) => void;
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
  const { currentRating, status: ratingStatus } = useQuizCurrentRating(q.answers);

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
          onUnlock={() => onUnlock(q.answers, currentRating)}
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
            helper={`We'll read your real rating straight off ${platform} — no need to guess.`}
          >
            <TextField
              label={`${platform} username`}
              placeholder={
                q.answers.playStyle === "lichess" ? "e.g. DrNykterstein" : "e.g. hikaru"
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
              sx={ratingInputSx}
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
            helper="Pick a few — each one is shown on the board."
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

      case "frequency":
        return (
          <QuizStep
            title="How often can you practise?"
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
                borderRadius: "12px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                transition: "background 180ms ease-out",
                "&:hover": { background: "rgba(255,255,255,0.06)" },
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
                    ? "linear-gradient(135deg, #F97316, #EA580C)"
                    : "transparent",
                  border: q.answers.dailyReminder
                    ? "none"
                    : "2px solid rgba(255,255,255,0.3)",
                }}
              >
                {q.answers.dailyReminder && (
                  <Check size={13} color="#0A0907" strokeWidth={3.5} />
                )}
              </Box>
              <Box>
                <Typography
                  sx={{
                    color: "rgba(255,255,255,0.92)",
                    fontWeight: 600,
                    fontSize: "0.92rem",
                  }}
                >
                  Email me a daily nudge
                </Typography>
                <Typography
                  sx={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: "0.8rem",
                    mt: 0.25,
                  }}
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
          borderRadius: "24px",
          background:
            "linear-gradient(180deg, rgba(20,22,28,0.92) 0%, rgba(12,14,20,0.92) 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(20px) saturate(150%)",
          WebkitBackdropFilter: "blur(20px) saturate(150%)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header: progress + start over */}
        <Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              minHeight: 28,
              mb: 1.25,
            }}
          >
            <Typography
              sx={{
                color: "rgba(255,255,255,0.5)",
                fontSize: "0.74rem",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Chess Masti
            </Typography>
            {showStartOver && (
              <Button
                onClick={q.startOver}
                sx={{
                  textTransform: "none",
                  color: "rgba(255,255,255,0.45)",
                  fontSize: "0.78rem",
                  minWidth: 0,
                  p: "2px 6px",
                  "&:hover": {
                    color: "rgba(255,255,255,0.8)",
                    background: "transparent",
                  },
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
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </Box>

        {/* Footer (questions phase only; result screen owns its own actions) */}
        {q.phase === "questions" && (
          <Box sx={{ display: "flex", gap: 1.5 }}>
            {!q.isFirstStep && (
              <Button
                onClick={q.back}
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  px: 2.5,
                  borderRadius: "12px",
                  color: "rgba(255,255,255,0.8)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  "&:hover": { background: "rgba(255,255,255,0.05)" },
                }}
              >
                Back
              </Button>
            )}
            <Button
              onClick={q.next}
              disabled={!q.canAdvance}
              sx={{
                flex: 1,
                py: 1.3,
                borderRadius: "12px",
                textTransform: "none",
                fontWeight: 700,
                fontSize: "0.98rem",
                color: "#fff",
                background: ORANGE,
                "&:hover": { background: ORANGE_HOVER },
                "&.Mui-disabled": {
                  color: "rgba(255,255,255,0.4)",
                  background: "rgba(255,255,255,0.06)",
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
