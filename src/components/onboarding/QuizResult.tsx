"use client";

import { useMemo } from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import {
  QuizAnswers,
  bandLabel,
  derivedRating,
  derivedFocusThemes,
  usesRatingPath,
  TIME_OPTIONS,
} from "./quizConfig";
import {
  FOCUS_THEME_LABELS,
  QuizFocusThemeId,
  QUIZ_GOAL_OPTIONS,
} from "./quizThemes";

const ORANGE = "linear-gradient(135deg, #F97316 0%, #EA580C 100%)";
const ORANGE_HOVER = "linear-gradient(135deg, #FB923C 0%, #F97316 100%)";

const BAND_BLURB: Record<string, string> = {
  Beginner: "We'll keep things plain-English and focus on not losing material.",
  Intermediate:
    "We'll sharpen pattern recognition and the plans behind the moves.",
  Advanced: "We'll go deep — imbalances, prophylaxis, and clean technique.",
};

interface QuizResultProps {
  answers: QuizAnswers;
  /** Open the signup gate (or, for an already-signed-in user, persist + route). */
  onUnlock: () => void;
  onBack: () => void;
  submitting?: boolean;
}

export default function QuizResult({
  answers,
  onUnlock,
  onBack,
  submitting = false,
}: QuizResultProps) {
  const rating = derivedRating(answers);
  const band = bandLabel(rating);
  const showRating =
    usesRatingPath(answers.playStyle) && typeof answers.rating === "number";

  const weaknessLabels = useMemo(() => {
    const ids = derivedFocusThemes(answers) as QuizFocusThemeId[];
    return ids
      .slice(0, 3)
      .map((id) => FOCUS_THEME_LABELS[id])
      .filter(Boolean);
  }, [answers]);

  const planLines = useMemo(() => {
    const selected = QUIZ_GOAL_OPTIONS.filter((o) =>
      answers.goals.includes(o.key)
    );
    const goals = new Set(selected.map((o) => o.studyGoal));
    const lines: string[] = [];
    lines.push(
      `Coaching calibrated to ${band.toLowerCase()} level on every game you analyze.`
    );
    if (weaknessLabels.length > 0) {
      lines.push(
        `A puzzle queue seeded with ${weaknessLabels.join(", ").toLowerCase()}.`
      );
    } else {
      lines.push("A balanced puzzle queue across core tactics and endgames.");
    }
    if (goals.has("endgames"))
      lines.push("Endgame technique drills as you progress.");
    if (goals.has("openings"))
      lines.push("Guidance on the openings you actually play.");
    const time = TIME_OPTIONS.find((t) => t.key === answers.time);
    if (time)
      lines.push(`Sessions sized for your "${time.label.toLowerCase()}" goal.`);
    return lines;
  }, [answers, band, weaknessLabels]);

  return (
    <Box>
      <Typography
        sx={{
          color: "#FB923C",
          fontWeight: 700,
          fontSize: "0.78rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          mb: 1,
        }}
      >
        Your chess profile
      </Typography>

      <Typography
        component="h2"
        sx={{
          color: "#fff",
          fontWeight: 700,
          fontSize: "1.5rem",
          lineHeight: 1.2,
          mb: 0.5,
        }}
      >
        You&apos;re an {band.toLowerCase()} player
        {showRating ? ` (~${rating})` : ""}.
      </Typography>
      <Typography
        sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.92rem", mb: 2.5 }}
      >
        {BAND_BLURB[band]}
      </Typography>

      {weaknessLabels.length > 0 && (
        <Box sx={{ mb: 2.5 }}>
          <Typography
            sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.8rem", mb: 1 }}
          >
            We&apos;ll start with what&apos;s holding you back:
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {weaknessLabels.map((label) => (
              <Chip
                key={label}
                label={label}
                sx={{
                  color: "rgba(255,255,255,0.92)",
                  background: "rgba(249,115,22,0.14)",
                  border: "1px solid rgba(249,115,22,0.4)",
                  fontWeight: 600,
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      <Box
        sx={{
          borderRadius: "16px",
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.03)",
          p: 2,
          mb: 3,
        }}
      >
        <Typography
          sx={{
            color: "rgba(255,255,255,0.85)",
            fontWeight: 600,
            fontSize: "0.9rem",
            mb: 1,
          }}
        >
          Your training plan covers
        </Typography>
        <Box
          component="ul"
          sx={{
            m: 0,
            pl: 2.5,
            display: "flex",
            flexDirection: "column",
            gap: 0.75,
          }}
        >
          {planLines.map((line) => (
            <Typography
              component="li"
              key={line}
              sx={{
                color: "rgba(255,255,255,0.7)",
                fontSize: "0.86rem",
                lineHeight: 1.45,
              }}
            >
              {line}
            </Typography>
          ))}
        </Box>
      </Box>

      <Button
        fullWidth
        onClick={onUnlock}
        disabled={submitting}
        sx={{
          py: 1.4,
          borderRadius: "12px",
          textTransform: "none",
          fontWeight: 700,
          fontSize: "1rem",
          color: "#fff",
          background: ORANGE,
          "&:hover": { background: ORANGE_HOVER },
          "&.Mui-disabled": {
            color: "rgba(255,255,255,0.5)",
            background: "rgba(249,115,22,0.4)",
          },
        }}
      >
        Unlock your full plan + first puzzles
      </Button>
      <Typography
        sx={{
          color: "rgba(255,255,255,0.4)",
          fontSize: "0.76rem",
          textAlign: "center",
          mt: 1.25,
        }}
      >
        Create a free account to save your profile and start training.
      </Typography>

      <Box sx={{ textAlign: "center", mt: 1.5 }}>
        <Button
          onClick={onBack}
          sx={{
            textTransform: "none",
            color: "rgba(255,255,255,0.55)",
            fontSize: "0.82rem",
            "&:hover": {
              color: "rgba(255,255,255,0.85)",
              background: "transparent",
            },
          }}
        >
          ← Edit my answers
        </Button>
      </Box>
    </Box>
  );
}
