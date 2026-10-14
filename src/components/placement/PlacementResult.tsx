"use client";

import { Box, Button, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { ChevronRight } from "lucide-react";
import type {
  PlacementResult as PlacementResultData,
  ThemeStrength,
} from "@/lib/placement/placementTest";
import { bandLabel } from "@/components/onboarding/quizConfig";
import { FOCUS_THEME_LABELS } from "@/components/onboarding/quizThemes";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

const CONFIDENCE_COPY: Record<string, string> = {
  high: "We're confident in this number.",
  medium: "A solid estimate. It'll sharpen as you train.",
  low: "A rough first read. Retake it anytime for a sharper number.",
};

/** kebab theme id → human label, with a title-case fallback. */
function themeLabel(id: string): string {
  const known = (FOCUS_THEME_LABELS as Record<string, string>)[id];
  if (known) return known;
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Bar colour by accuracy: a status, so the status colours carry it. */
function scoreColor(score: number): string {
  if (score >= 0.8) return STATUS.success;
  if (score >= 0.5) return STATUS.warning;
  return STATUS.error;
}

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
  const router = useRouter();
  const band = bandLabel(result.finalRating);

  // Per-theme strength, weakest first. Only themes we actually tested.
  const strengths: Array<[string, ThemeStrength]> = Object.entries(
    result.themeStrength
  )
    .filter(([, s]) => s.seen > 0)
    .sort((a, b) => a[1].score - b[1].score || b[1].seen - a[1].seen);

  const weakSet = new Set(result.focusThemes);

  return (
    <Box sx={{ textAlign: "center" }}>
      <Typography sx={{ ...TYPE.label, color: TEXT.secondary, mb: 1 }}>
        Your starting rating
      </Typography>

      <Typography
        sx={{
          ...TYPE.h1,
          color: TEXT.primary,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {result.finalRating}
      </Typography>
      <Typography sx={{ ...TYPE.h5, color: TEXT.primary, mt: 0.5 }}>
        {band} level
      </Typography>
      <Typography sx={{ ...TYPE.caption, color: TEXT.secondary, mt: 1 }}>
        {CONFIDENCE_COPY[result.confidence]}
        {result.hitRail
          ? " (You topped out the range; a retake will place you higher.)"
          : ""}
      </Typography>

      {strengths.length > 0 && (
        <Box sx={{ mt: 3.5, textAlign: "left" }}>
          <Typography
            sx={{
              ...TYPE.caption,
              color: TEXT.secondary,
              mb: 1.25,
              textAlign: "center",
            }}
          >
            Where you stand. Tap a weak area to drill it now.
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {strengths.map(([id, s]) => {
              const isWeak = weakSet.has(id) || s.score < 1;
              return (
                <Box
                  key={id}
                  // A weak area is a real button (it opens the drill); a
                  // strong one is a plain row.
                  component={isWeak ? "button" : "div"}
                  type={isWeak ? "button" : undefined}
                  onClick={
                    isWeak
                      ? () =>
                          router.push(
                            `/puzzles?theme=${encodeURIComponent(id)}`
                          )
                      : undefined
                  }
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    width: "100%",
                    px: 1.5,
                    py: 1,
                    minHeight: 44,
                    borderRadius: `${RADIUS.small}px`,
                    font: "inherit",
                    textAlign: "left",
                    color: TEXT.primary,
                    cursor: isWeak ? "pointer" : "default",
                    background: SURFACE.raisedSecondary,
                    // The weak state is the word "Needs work"; the hairline
                    // only quietly agrees.
                    border: isWeak
                      ? `1px solid ${ACCENT.border}`
                      : `1px solid ${LINE.hairline}`,
                    transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}`,
                    "&:hover": isWeak
                      ? { background: SURFACE.raisedTertiary }
                      : undefined,
                    "&:active": isWeak
                      ? { background: SURFACE.raisedTertiary }
                      : undefined,
                    "&:focus-visible": {
                      outline: `2px solid ${TEXT.primary}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        mb: 0.5,
                      }}
                    >
                      <Typography
                        sx={{
                          ...TYPE.bodySmall,
                          fontWeight: 600,
                          color: TEXT.primary,
                        }}
                      >
                        {themeLabel(id)}
                      </Typography>
                      <Typography
                        sx={{
                          ...TYPE.caption,
                          fontWeight: 600,
                          color: isWeak ? ACCENT.hover : TEXT.secondary,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {isWeak ? "Needs work" : `${s.solved}/${s.seen}`}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        height: 6,
                        borderRadius: 3,
                        background: "rgba(255,255,255,0.08)",
                        overflow: "hidden",
                      }}
                    >
                      <Box
                        sx={{
                          width: `${Math.round(s.score * 100)}%`,
                          height: "100%",
                          borderRadius: 3,
                          background: scoreColor(s.score),
                        }}
                      />
                    </Box>
                  </Box>
                  {isWeak && (
                    <ChevronRight
                      size={16}
                      strokeWidth={1.75}
                      color={TEXT.secondary}
                      style={{ flexShrink: 0 }}
                    />
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      <Button
        fullWidth
        variant="contained"
        onClick={onContinue}
        sx={{ mt: 4, py: 1.4, fontSize: TYPE.body.fontSize }}
      >
        Start my training plan
      </Button>
      <Button
        onClick={onRetake}
        sx={{
          mt: 1.25,
          color: TEXT.secondary,
          fontSize: TYPE.bodySmall.fontSize,
          "&:hover": { color: TEXT.primary },
        }}
      >
        Retake the test
      </Button>
    </Box>
  );
}
