"use client";

import { Box, Button, TextField, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import QuizProgress from "./QuizProgress";
import QuizStep from "./QuizStep";
import QuizOption from "./QuizOption";
import QuizResult from "./QuizResult";
import { useOnboardingQuiz } from "./useOnboardingQuiz";
import {
  PLAY_STYLE_OPTIONS,
  SELF_ASSESS_QUESTIONS,
  TIME_OPTIONS,
  QuizAnswers,
  SelfAssessKey,
} from "./quizConfig";
import { QUIZ_GOAL_OPTIONS } from "./quizThemes";

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

interface OnboardingQuizProps {
  /** Called when the user unlocks from the result screen. */
  onUnlock: (answers: QuizAnswers) => void;
  submitting?: boolean;
}

export default function OnboardingQuiz({
  onUnlock,
  submitting,
}: OnboardingQuizProps) {
  const q = useOnboardingQuiz();

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
          onUnlock={() => onUnlock(q.answers)}
          onBack={q.back}
          submitting={submitting}
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
              />
            ))}
          </QuizStep>
        );

      case "rating": {
        const platform =
          q.answers.playStyle === "lichess" ? "Lichess" : "Chess.com";
        return (
          <QuizStep
            title={`What's your ${platform} rating?`}
            helper="A rough number is fine — we use it to calibrate your coach."
          >
            <TextField
              type="number"
              label="Rating"
              placeholder="e.g. 1200"
              fullWidth
              value={q.answers.rating ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                q.setRating(v === "" ? undefined : Number(v));
              }}
              sx={ratingInputSx}
              inputProps={{ min: 100, max: 3500, inputMode: "numeric" }}
            />
            <TextField
              label={`${platform} username (optional)`}
              fullWidth
              value={q.answers.username ?? ""}
              onChange={(e) => q.setUsername(e.target.value)}
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
          <QuizStep title={question.question}>
            {question.options.map((opt) => (
              <QuizOption
                key={opt.label}
                label={opt.label}
                selected={q.answers.selfAssess[key] === opt.score}
                onClick={() => q.setSelfAssess(key, opt.score)}
              />
            ))}
          </QuizStep>
        );
      }

      case "goals":
        return (
          <QuizStep
            title="What do you want to improve?"
            helper="Pick all that apply — we'll prioritize these."
          >
            {QUIZ_GOAL_OPTIONS.map((o) => (
              <QuizOption
                key={o.key}
                label={o.label}
                helper={o.helper}
                multi
                selected={q.answers.goals.includes(o.key)}
                onClick={() => q.toggleGoal(o.key)}
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
              />
            ))}
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
