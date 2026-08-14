"use client";

import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { TrendingDown, TrendingUp, Target, Check } from "lucide-react";
import {
  goalProgress,
  formatTargetDate,
  type GoalPace,
} from "@/lib/curriculum/improvementModel";
import { minutesPerDayFor } from "@/components/onboarding/quizConfig";
import type { TimeCommitment } from "@/components/onboarding/quizConfig";

/**
 * "1600 by January — you're 3 weeks ahead."
 *
 * The quiz makes a promise and then, until now, never mentioned it again. A
 * target the user sees once at signup does no work; a target they're measured
 * against every time they open the plan is the thing that actually pulls them
 * back.
 *
 * Progress is measured against the ORIGINAL baseline stored at signup, never
 * re-derived from today's rating. Re-baselining would move the goalposts on
 * every visit, so the card could never say "behind" — and a status that can
 * only ever be good is decoration, not feedback.
 */

const TONE: Record<GoalPace, { color: string; bg: string; border: string }> = {
  ahead: { color: "#4ADE80", bg: "rgba(74,222,128,0.10)", border: "rgba(74,222,128,0.35)" },
  on_track: { color: "#FB923C", bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.28)" },
  behind: { color: "#FBBF24", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.30)" },
  reached: { color: "#4ADE80", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.4)" },
};

function paceLabel(pace: GoalPace, weeks: number): string {
  const w = Math.round(Math.abs(weeks));
  switch (pace) {
    case "reached":
      return "Goal reached 🎉";
    case "ahead":
      return w <= 1 ? "Slightly ahead of plan" : `${w} weeks ahead of plan`;
    case "behind":
      // Deliberately not scolding. The plan slipping is information, not a
      // telling-off, and a nagging dashboard is one people stop opening.
      return w <= 1 ? "Just behind plan" : `${w} weeks behind plan`;
    case "on_track":
      return "Right on track";
  }
}

interface GoalProgressCardProps {
  goalRating?: number;
  goalStartRating?: number;
  goalSetAt?: number;
  goalTargetDate?: number;
  dailyTimeCommitment?: TimeCommitment;
  practiceDaysPerWeek?: number;
  currentRating: number;
}

export default function GoalProgressCard({
  goalRating,
  goalStartRating,
  goalSetAt,
  goalTargetDate,
  dailyTimeCommitment,
  practiceDaysPerWeek,
  currentRating,
}: GoalProgressCardProps) {
  const progress = useMemo(() => {
    if (!goalRating || !goalStartRating || !goalSetAt || !practiceDaysPerWeek) return null;
    const minutesPerDay = minutesPerDayFor(dailyTimeCommitment);
    if (!minutesPerDay) return null;
    return goalProgress({
      startRating: goalStartRating,
      goalRating,
      currentRating,
      goalSetAt,
      minutesPerDay,
      daysPerWeek: practiceDaysPerWeek,
    });
  }, [goalRating, goalStartRating, goalSetAt, dailyTimeCommitment, practiceDaysPerWeek, currentRating]);

  // No goal set — render nothing rather than an empty promise.
  if (!progress || !goalRating) return null;

  const tone = TONE[progress.pace];
  const Icon =
    progress.pace === "reached"
      ? Check
      : progress.pace === "ahead"
        ? TrendingUp
        : progress.pace === "behind"
          ? TrendingDown
          : Target;

  return (
    <Box
      sx={{
        p: 2,
        mb: 2.5,
        borderRadius: "16px",
        background: tone.bg,
        border: `1px solid ${tone.border}`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: "1.1rem" }}>
          {goalRating}
          {goalTargetDate ? ` by ${formatTargetDate(goalTargetDate)}` : ""}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: tone.color }}>
          <Icon size={14} strokeWidth={2.5} />
          <Typography component="span" sx={{ fontSize: "0.8rem", fontWeight: 700, color: "inherit" }}>
            {paceLabel(progress.pace, progress.weeksVsPlan)}
          </Typography>
        </Box>
      </Box>

      {/* Journey bar: start → now → goal. */}
      <Box sx={{ mt: 1.25, position: "relative", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)" }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            width: `${progress.fractionComplete * 100}%`,
            borderRadius: 3,
            background: `linear-gradient(90deg, rgba(249,115,22,0.7), ${tone.color})`,
            transition: "width 400ms ease-out",
          }}
        />
      </Box>

      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.75 }}>
        <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.75rem" }}>
          {goalStartRating} at the start
        </Typography>
        <Typography sx={{ color: "rgba(255,255,255,0.75)", fontSize: "0.75rem", fontWeight: 700 }}>
          now {currentRating}
        </Typography>
        <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.75rem" }}>
          {goalRating}
        </Typography>
      </Box>

      {progress.pace !== "reached" && (
        <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.75rem", mt: 0.75 }}>
          The plan expected {progress.expectedRating} by now.
        </Typography>
      )}
    </Box>
  );
}
