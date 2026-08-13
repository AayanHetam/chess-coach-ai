"use client";

import { useEffect, useMemo } from "react";
import { Box, Slider, Typography } from "@mui/material";
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
    return <Hint>Reading your rating…</Hint>;
  }

  // No anchor: say so rather than projecting from a number we invented.
  if (!currentRating) {
    return (
      <>
        <Hint>
          {ratingStatus === "not_found"
            ? "We couldn't find that account, so we can't estimate a timeline yet — you can still set a goal."
            : ratingStatus === "no_established_rating"
              ? "No established rating on that account yet, so there's nothing to project from — you can still set a goal."
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
        <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: "2rem", lineHeight: 1 }}>
          {goal}
        </Typography>
        <Typography sx={{ color: "#FB923C", fontWeight: 700, fontSize: "0.9rem" }}>
          +{goal - currentRating}
        </Typography>
      </Box>

      <Slider
        value={goal}
        min={min}
        max={max}
        step={25}
        onChange={(_, v) => onChange(Array.isArray(v) ? v[0] : v)}
        sx={{
          color: "#F97316",
          "& .MuiSlider-rail": { backgroundColor: "rgba(255,255,255,0.14)", opacity: 1 },
          "& .MuiSlider-thumb": {
            width: 22,
            height: 22,
            boxShadow: "0 0 0 6px rgba(249,115,22,0.16)",
            "&:hover, &.Mui-focusVisible": {
              boxShadow: "0 0 0 9px rgba(249,115,22,0.22)",
            },
          },
        }}
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
              sx={{
                appearance: "none",
                font: "inherit",
                cursor: "pointer",
                px: 1.5,
                py: 0.6,
                borderRadius: "999px",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: active ? "#FB923C" : "rgba(255,255,255,0.7)",
                background: active ? "rgba(249,115,22,0.14)" : "rgba(255,255,255,0.04)",
                border: active
                  ? "1px solid rgba(249,115,22,0.5)"
                  : "1px solid rgba(255,255,255,0.1)",
                transition: "all 180ms ease-out",
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
        <Typography sx={{ color: "rgba(255,255,255,0.38)", fontSize: "0.72rem", mt: 1 }}>
          Starting point estimated from your answers — the placement test will
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
    <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.88rem", mb: 1.5 }}>
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
      <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: "2rem", lineHeight: 1, mb: 0.5 }}>
        {goal}
      </Typography>
      <Slider
        value={goal}
        min={800}
        max={2400}
        step={25}
        onChange={(_, v) => onChange(Array.isArray(v) ? v[0] : v)}
        sx={{ color: "#F97316" }}
      />
    </Box>
  );
}
