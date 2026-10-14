"use client";

import { useEffect, useMemo } from "react";
import { Box, Slider, Typography } from "@mui/material";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";
import GoalProjection from "./GoalProjection";
import type { QuizRatingStatus } from "./useQuizCurrentRating";

/**
 * The goal-rating question — the one the whole plan is built around.
 *
 * A slider rather than a text box: it makes the choice a two-second gesture and
 * lets the projection update live underneath, which is where the persuasion
 * lives. Bounds are anchored to where the player actually is, so the range
 * offered is always a range that means something to them.
 */

const SUGGESTED_STEPS = [100, 200, 300, 500];

// The slider: ember track, flat thumb, a white ring when focused by keyboard.
const sliderSx = {
  color: ACCENT.main,
  "& .MuiSlider-rail": {
    backgroundColor: "rgba(255,255,255,0.14)",
    opacity: 1,
  },
  "& .MuiSlider-thumb": {
    width: 22,
    height: 22,
    boxShadow: "none",
    "&:hover, &.Mui-active": { boxShadow: "none" },
    "&.Mui-focusVisible": {
      boxShadow: "none",
      outline: `2px solid ${TEXT.primary}`,
      outlineOffset: 2,
    },
  },
} as const;

// The goal number: a section-sized figure, never heavier than 600.
const goalNumberSx = {
  ...TYPE.h2,
  color: TEXT.primary,
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
} as const;

interface GoalRatingPickerProps {
  currentRating?: number;
  value?: number;
  onChange: (v: number | undefined) => void;
  minutesPerDay: number;
  daysPerWeek: number;
  ratingStatus: QuizRatingStatus;
}

export default function GoalRatingPicker({
  currentRating,
  value,
  onChange,
  minutesPerDay,
  daysPerWeek,
  ratingStatus,
}: GoalRatingPickerProps) {
  // A goal a few hundred points up is the one almost everyone wants, so it is
  // the default — but only once we actually know where they are.
  const suggested = currentRating ? roundTo25(currentRating + 300) : undefined;

  useEffect(() => {
    if (value === undefined && suggested !== undefined) onChange(suggested);
    // Only seeds the first time a current rating becomes known.
  }, [suggested, value, onChange]);

  const { min, max } = useMemo(() => {
    if (!currentRating) return { min: 800, max: 2400 };
    return {
      min: roundTo25(currentRating + 50),
      max: Math.min(3000, roundTo25(currentRating + 800)),
    };
  }, [currentRating]);

  if (ratingStatus === "loading") {
    return <Hint>Reading your rating</Hint>;
  }

  // No anchor: say so rather than projecting from a number we invented.
  if (!currentRating) {
    return (
      <>
        <Hint>
          {ratingStatus === "not_found"
            ? "We couldn't find that account, so we can't estimate a timeline yet. You can still set a goal."
            : ratingStatus === "no_established_rating"
              ? "No established rating on that account yet, so there's nothing to project from. You can still set a goal."
              : "Once we know your rating we'll estimate how long this takes."}
        </Hint>
        <FreeGoal value={value} onChange={onChange} />
      </>
    );
  }

  const goal = value ?? suggested ?? min;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 0.5 }}>
        <Typography sx={goalNumberSx}>{goal}</Typography>
        <Typography
          sx={{
            ...TYPE.bodySmall,
            fontWeight: 600,
            color: ACCENT.hover,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          +{goal - currentRating}
        </Typography>
      </Box>

      <Slider
        value={goal}
        min={min}
        max={max}
        step={25}
        onChange={(_, v) => onChange(Array.isArray(v) ? v[0] : v)}
        sx={sliderSx}
      />

      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 0.5 }}>
        {SUGGESTED_STEPS.map((step) => {
          const target = roundTo25(currentRating + step);
          if (target > max) return null;
          const active = goal === target;
          return (
            <Box
              key={step}
              component="button"
              type="button"
              onClick={() => onChange(target)}
              aria-pressed={active}
              sx={{
                appearance: "none",
                font: "inherit",
                cursor: "pointer",
                px: 1.5,
                py: 0.6,
                minHeight: 32,
                borderRadius: `${RADIUS.pill}px`,
                fontSize: TYPE.caption.fontSize,
                fontWeight: 600,
                color: active ? ACCENT.hover : TEXT.primary,
                background: active ? ACCENT.tint : SURFACE.raisedSecondary,
                border: active
                  ? `1px solid ${ACCENT.border}`
                  : `1px solid ${LINE.hairline}`,
                transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}, color ${MOTION.hover}, transform ${MOTION.press}`,
                "&:hover": active ? undefined : { borderColor: LINE.strong },
                "&:active": { transform: MOTION.pressScale },
                "&:focus-visible": {
                  outline: "2px solid #FFFFFF",
                  outlineOffset: 2,
                },
              }}
            >
              +{step}
            </Box>
          );
        })}
      </Box>

      <GoalProjection
        currentRating={currentRating}
        goalRating={goal}
        minutesPerDay={minutesPerDay}
        daysPerWeek={daysPerWeek}
      />

      {ratingStatus === "self_assessed" && (
        <Typography sx={{ ...TYPE.caption, color: TEXT.secondary, mt: 1 }}>
          Starting point estimated from your answers. The placement test will
          sharpen it.
        </Typography>
      )}
    </Box>
  );
}

function roundTo25(n: number): number {
  return Math.round(n / 25) * 25;
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary, mb: 1.5 }}>
      {children}
    </Typography>
  );
}

/** Goal input with no current-rating anchor — no slider bounds to speak of. */
function FreeGoal({
  value,
  onChange,
}: {
  value?: number;
  onChange: (v: number | undefined) => void;
}) {
  const goal = value ?? 1500;
  return (
    <Box>
      <Typography sx={{ ...goalNumberSx, mb: 0.5 }}>{goal}</Typography>
      <Slider
        value={goal}
        min={800}
        max={2400}
        step={25}
        onChange={(_, v) => onChange(Array.isArray(v) ? v[0] : v)}
        sx={sliderSx}
      />
    </Box>
  );
}
