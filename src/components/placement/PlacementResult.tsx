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

const ORANGE = "linear-gradient(135deg, #F97316 0%, #EA580C 100%)";
const ORANGE_HOVER = "linear-gradient(135deg, #FB923C 0%, #F97316 100%)";

const CONFIDENCE_COPY: Record<string, string> = {
  high: "We're confident in this number.",
  medium: "A solid estimate — it'll sharpen as you train.",
  low: "A rough first read — retake it anytime for a sharper number.",
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

/** Bar colour by accuracy — orange-forward so it stays on-brand. */
function scoreColor(score: number): string {
  if (score >= 0.8) return "#34D399";
  if (score >= 0.5) return "#FBBF24";
  return "#FB7185";
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
    result.themeStrength,
  )
    .filter(([, s]) => s.seen > 0)
    .sort((a, b) => a[1].score - b[1].score || b[1].seen - a[1].seen);

  const weakSet = new Set(result.focusThemes);

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

      {strengths.length > 0 && (
        <Box sx={{ mt: 3.5, textAlign: "left" }}>
          <Typography
            sx={{
              color: "rgba(255,255,255,0.55)",
              fontSize: "0.8rem",
              mb: 1.25,
              textAlign: "center",
            }}
          >
            Where you stand — tap a weak area to drill it now.
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.9 }}>
            {strengths.map(([id, s]) => {
              const isWeak = weakSet.has(id) || s.score < 1;
              return (
                <Box
                  key={id}
                  onClick={
                    isWeak
                      ? () =>
                          router.push(
                            `/puzzles?theme=${encodeURIComponent(id)}`,
                          )
                      : undefined
                  }
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    px: 1.5,
                    py: 1,
                    borderRadius: "12px",
                    cursor: isWeak ? "pointer" : "default",
                    background: isWeak
                      ? "rgba(249,115,22,0.08)"
                      : "rgba(255,255,255,0.03)",
                    border: isWeak
                      ? "1px solid rgba(249,115,22,0.3)"
                      : "1px solid rgba(255,255,255,0.06)",
                    transition: "background 160ms ease, border-color 160ms ease",
                    "&:hover": isWeak
                      ? {
                          background: "rgba(249,115,22,0.14)",
                          borderColor: "rgba(249,115,22,0.5)",
                        }
                      : undefined,
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
                          color: "#fff",
                          fontWeight: 600,
                          fontSize: "0.86rem",
                        }}
                      >
                        {themeLabel(id)}
                      </Typography>
                      <Typography
                        sx={{
                          color: isWeak ? "#FB923C" : "rgba(255,255,255,0.5)",
                          fontWeight: 600,
                          fontSize: "0.78rem",
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
                          transition: "width 600ms cubic-bezier(0.23,1,0.32,1)",
                        }}
                      />
                    </Box>
                  </Box>
                  {isWeak && (
                    <ChevronRight
                      size={16}
                      color="#FB923C"
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
