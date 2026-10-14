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
import {
  GOAL_PERFS,
  hasCompleteGoal,
  type GoalPerf,
  type PerfGoals,
} from "@/lib/curriculum/goalPatch";
import { useRatingHistory } from "@/lib/rating/useRatingHistory";
import type { TimeCommitment } from "@/components/onboarding/quizConfig";
import {
  ACCENT,
  LINE,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

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

// A status banner: the tint on the surface, the status colour on the icon.
// On track is not a status, so it sits on the plain card surface.
const TONE: Record<GoalPace, { color: string; bg: string }> = {
  ahead: { color: STATUS.success, bg: STATUS.successTint },
  on_track: { color: TEXT.secondary, bg: SURFACE.raised },
  behind: { color: STATUS.warning, bg: STATUS.warningTint },
  reached: { color: STATUS.success, bg: STATUS.successTint },
};

function paceLabel(pace: GoalPace, weeks: number): string {
  const w = Math.round(Math.abs(weeks));
  switch (pace) {
    case "reached":
      return "Goal reached";
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
  /** Per-control targets, when the goal was set control-by-control. */
  perfGoals?: PerfGoals;
}

export default function GoalProgressCard({
  goalRating,
  goalStartRating,
  goalSetAt,
  goalTargetDate,
  dailyTimeCommitment,
  practiceDaysPerWeek,
  currentRating,
  perfGoals,
}: GoalProgressCardProps) {
  // Live per-control ratings, raw platform numbers — the same scale perfGoals
  // stores and the same single request the setter and trend panels share.
  const { data: history } = useRatingHistory(365);
  const progress = useMemo(() => {
    // The SAME predicate /plan uses to decide whether to offer the goal setter
    // instead of this card. Two hand-written copies would eventually disagree,
    // and the failure is silent in the worst direction: the page believes a
    // goal exists, this card refuses to draw one, and the user gets a blank
    // space with no way to set it.
    const fields = {
      goalRating,
      goalStartRating,
      goalSetAt,
      practiceDaysPerWeek,
      dailyTimeCommitment,
    };
    if (!hasCompleteGoal(fields)) return null;

    return goalProgress({
      startRating: fields.goalStartRating,
      goalRating: fields.goalRating,
      currentRating,
      goalSetAt: fields.goalSetAt,
      minutesPerDay: minutesPerDayFor(fields.dailyTimeCommitment),
      daysPerWeek: fields.practiceDaysPerWeek,
    });
  }, [
    goalRating,
    goalStartRating,
    goalSetAt,
    dailyTimeCommitment,
    practiceDaysPerWeek,
    currentRating,
  ]);

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
        borderRadius: `${RADIUS.card}px`,
        background: tone.bg,
        border: `1px solid ${LINE.hairline}`,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Typography sx={{ ...TYPE.h5, color: TEXT.primary }}>
          {goalRating}
          {goalTargetDate ? ` by ${formatTargetDate(goalTargetDate)}` : ""}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            color: TEXT.primary,
          }}
        >
          <Icon size={16} strokeWidth={1.75} color={tone.color} />
          <Typography
            component="span"
            sx={{ fontSize: "0.8rem", fontWeight: 600, color: "inherit" }}
          >
            {paceLabel(progress.pace, progress.weeksVsPlan)}
          </Typography>
        </Box>
      </Box>

      {/* Journey bar: start → now → goal. */}
      <Box
        sx={{
          mt: 1.25,
          position: "relative",
          height: 6,
          borderRadius: 3,
          background: LINE.hairline,
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            width: `${progress.fractionComplete * 100}%`,
            borderRadius: 3,
            background: tone.color,
            transition: "width 400ms ease-out",
          }}
        />
      </Box>

      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.75 }}>
        <Typography sx={{ color: TEXT.secondary, fontSize: "0.75rem" }}>
          {goalStartRating} at the start
        </Typography>
        <Typography
          sx={{ color: TEXT.primary, fontSize: "0.75rem", fontWeight: 600 }}
        >
          now {currentRating}
        </Typography>
        <Typography sx={{ color: TEXT.secondary, fontSize: "0.75rem" }}>
          {goalRating}
        </Typography>
      </Box>

      {progress.pace !== "reached" && (
        <Typography
          sx={{ color: TEXT.secondary, fontSize: "0.75rem", mt: 0.75 }}
        >
          The plan expected {progress.expectedRating} by now.
        </Typography>
      )}

      {/* Control-by-control progress, for goals set that way. Raw platform
          numbers throughout — the scale the goals were typed in and the trend
          panels plot. The pace verdict above stays singular: one promise, one
          "ahead/behind"; these rows show distance covered, not new claims. */}
      {perfGoals && Object.keys(perfGoals).length > 0 && (
        <Box
          sx={{
            mt: 1.5,
            pt: 1.25,
            borderTop: `1px solid ${LINE.hairline}`,
            display: "flex",
            flexDirection: "column",
            gap: 0.75,
          }}
        >
          {GOAL_PERFS.filter((perf) => perfGoals[perf]).map((perf) => (
            <PerfProgressRow
              key={perf}
              perf={perf}
              start={perfGoals[perf]!.start}
              goal={perfGoals[perf]!.goal}
              now={
                history?.status === "ok"
                  ? history.trends.find((t) => t.perf === perf)?.current
                  : undefined
              }
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

const PERF_LABEL: Record<GoalPerf, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
};

function PerfProgressRow({
  perf,
  start,
  goal,
  now,
}: {
  perf: GoalPerf;
  start: number;
  goal: number;
  now?: number;
}) {
  const span = goal - start;
  // Progress is only drawn from a MEASURED current. With no recent rated
  // games there is no fill and no fraction — an empty bar would claim "zero
  // progress", which is a measurement we did not make.
  const fraction =
    now !== undefined && span > 0
      ? Math.max(0, Math.min(1, (now - start) / span))
      : undefined;
  const reached = now !== undefined && now >= goal;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
      <Typography
        sx={{
          ...TYPE.label,
          width: 52,
          flexShrink: 0,
          color: TEXT.secondary,
        }}
      >
        {PERF_LABEL[perf]}
      </Typography>

      <Box
        sx={{
          flex: 1,
          position: "relative",
          height: 4,
          borderRadius: 2,
          background: LINE.hairline,
        }}
      >
        {fraction !== undefined && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              width: `${fraction * 100}%`,
              borderRadius: 2,
              background: reached ? STATUS.success : ACCENT.main,
              transition: "width 400ms ease-out",
            }}
          />
        )}
      </Box>

      <Typography
        sx={{
          flexShrink: 0,
          color: reached ? STATUS.success : TEXT.secondary,
          fontSize: "0.75rem",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          minWidth: 96,
          textAlign: "right",
        }}
      >
        {now === undefined
          ? `${goal} · no recent games`
          : reached
            ? `${goal} reached`
            : `${now} · ${goal - now} to go`}
      </Typography>
    </Box>
  );
}
