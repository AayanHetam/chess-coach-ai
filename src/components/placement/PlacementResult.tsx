"use client";

import { Box, Button, Chip, Typography } from "@mui/material";
import type { PlacementResult as PlacementResultData } from "@/lib/placement/placementTest";
import { bandLabel } from "@/components/onboarding/quizConfig";
import {
  FOCUS_THEME_LABELS,
  QuizFocusThemeId,
} from "@/components/onboarding/quizThemes";

const ORANGE = "linear-gradient(135deg, #F97316 0%, #EA580C 100%)";
const ORANGE_HOVER = "linear-gradient(135deg, #FB923C 0%, #F97316 100%)";

const CONFIDENCE_COPY: Record<string, string> = {
  high: "We're confident in this number.",
  medium: "A solid estimate — it'll sharpen as you train.",
  low: "A rough first read — retake it anytime for a sharper number.",
};

interface PlacementResultProps {
  result: PlacementResultData;
  onContinue: () => void;
  onRetake: () => void;
}

export default function PlacementResult({
  result,
  onContinue,
  onRetake,
}: PlacementResultProps) {
  const band = bandLabel(result.finalRating);
  const weakLabels = result.focusThemes
    .map((id) => FOCUS_THEME_LABELS[id as QuizFocusThemeId])
    .filter(Boolean);

  return (
    <Box sx={{ textAlign: "center" }}>
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
        Your starting rating
      </Typography>

      <Typography
        sx={{
          color: "#fff",
          fontWeight: 800,
          fontSize: "3.5rem",
          lineHeight: 1,
        }}
      >
        {result.finalRating}
      </Typography>
      <Typography
        sx={{ color: "rgba(255,255,255,0.7)", fontWeight: 600, mt: 0.5 }}
      >
        {band} level
      </Typography>
      <Typography
        sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.82rem", mt: 1 }}
      >
        {CONFIDENCE_COPY[result.confidence]}
        {result.hitRail
          ? " (you topped out the range — a retake will place you higher.)"
          : ""}
      </Typography>

      {weakLabels.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography
            sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.8rem", mb: 1 }}
          >
            We&apos;ll start your training here:
          </Typography>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1,
              justifyContent: "center",
            }}
          >
            {weakLabels.map((label) => (
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

      <Button
        fullWidth
        onClick={onContinue}
        sx={{
          mt: 4,
          py: 1.4,
          borderRadius: "12px",
          textTransform: "none",
          fontWeight: 700,
          fontSize: "1rem",
          color: "#fff",
          background: ORANGE,
          "&:hover": { background: ORANGE_HOVER },
        }}
      >
        Start my training plan
      </Button>
      <Button
        onClick={onRetake}
        sx={{
          mt: 1.25,
          textTransform: "none",
          color: "rgba(255,255,255,0.55)",
          fontSize: "0.82rem",
          "&:hover": {
            color: "rgba(255,255,255,0.85)",
            background: "transparent",
          },
        }}
      >
        Retake the test
      </Button>
    </Box>
  );
}
