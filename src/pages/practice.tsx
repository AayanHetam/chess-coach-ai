"use client";

import { useEffect, useState } from "react";
import { Box, Button, Grid, Paper, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import Head from "next/head";
import { useAtomValue } from "jotai";
import BoltIcon from "@mui/icons-material/Bolt";
import PsychologyIcon from "@mui/icons-material/Psychology";
import ExtensionIcon from "@mui/icons-material/Extension";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { useRouter } from "next/router";
import { PageTitle } from "@/components/pageTitle";
import PuzzleRush from "@/sections/practice/PuzzleRush";
import PatternTraining from "@/sections/practice/PatternTraining";
import PuzzleStats from "@/sections/practice/PuzzleStats";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { chessMastiDarkTheme } from "@/theme/chessMasti";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import { ACCENTS, type Accent } from "@/components/ui/accents";
import { puzzleStatsAtom, puzzleRushScoresAtom } from "@/lib/puzzleRating";

/**
 * /practice — a thin modes hub.
 *
 * Standard theme-browser puzzle solving was merged into the unified /puzzles
 * surface (adaptive, ELO-wired, AI-coached), so this page now just routes to
 * the three ways to train: Puzzles (→ /puzzles), Puzzle Rush, and Pattern
 * Training. Legacy/AI-coach deep links (`/practice?theme=…`) forward to
 * `/puzzles?theme=…`; `?mode=rush|pattern` opens those modes directly.
 */

type Mode = "hub" | "rush" | "pattern";

const PAGE_BOX_SX = { width: "100%", maxWidth: "100vw", p: { xs: 1, md: 2 } };

/** Practice/training surface identity — the violet the NavPill pill wears. */
const VIOLET = ACCENTS.violet;

export default function Practice() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("hub");
  const stats = useAtomValue(puzzleStatsAtom);
  const rushScores = useAtomValue(puzzleRushScoresAtom);
  const bestRush = Math.max(
    rushScores.threeMin,
    rushScores.fiveMin,
    rushScores.survivalBest,
  );

  useEffect(() => {
    if (!router.isReady) return;
    const m = router.query.mode;
    if (m === "rush") {
      setMode("rush");
      return;
    }
    if (m === "pattern") {
      setMode("pattern");
      return;
    }
    // Forward standard-mode deep links to the unified puzzle surface.
    const theme = router.query.theme;
    if (theme) {
      const t = Array.isArray(theme) ? theme[0] : theme;
      router.replace(`/puzzles?theme=${encodeURIComponent(t)}`);
    }
  }, [router.isReady, router.query.mode, router.query.theme, router]);

  if (mode === "rush") {
    return (
      <ThemeProvider theme={chessMastiDarkTheme}>
        <PageTitle title="Chess Masti AI - Puzzle Rush" />
        <Head>
          <meta name="color-scheme" content="dark" />
          <meta name="theme-color" content="#08090C" />
          <style>{`html,body{background-color:#08090C;color-scheme:dark;margin:0;}::-webkit-scrollbar{width:10px;height:10px;}::-webkit-scrollbar-track{background:#08090C;}::-webkit-scrollbar-thumb{background:${VIOLET.soft};border-radius:5px;}`}</style>
        </Head>

        <GradientBackdrop />

        <Box
          sx={{
            minHeight: "100vh",
            color: "rgba(255,255,255,0.94)",
            pt: 2,
            pb: 4,
            px: { xs: 2, md: 3 },
          }}
        >
          <NavPill active="practice" />

          <Box sx={PAGE_BOX_SX}>
            <ErrorBoundary name="puzzle-rush">
              <PuzzleRush onBack={() => setMode("hub")} />
            </ErrorBoundary>
          </Box>
        </Box>
      </ThemeProvider>
    );
  }

  if (mode === "pattern") {
    return (
      <ThemeProvider theme={chessMastiDarkTheme}>
        <PageTitle title="Chess Masti AI - Pattern Training" />
        <Head>
          <meta name="color-scheme" content="dark" />
          <meta name="theme-color" content="#08090C" />
          <style>{`html,body{background-color:#08090C;color-scheme:dark;margin:0;}::-webkit-scrollbar{width:10px;height:10px;}::-webkit-scrollbar-track{background:#08090C;}::-webkit-scrollbar-thumb{background:${VIOLET.soft};border-radius:5px;}`}</style>
        </Head>

        <GradientBackdrop />

        <Box
          sx={{
            minHeight: "100vh",
            color: "rgba(255,255,255,0.94)",
            pt: 2,
            pb: 4,
            px: { xs: 2, md: 3 },
          }}
        >
          <NavPill active="practice" />

          <Box sx={PAGE_BOX_SX}>
            <ErrorBoundary name="pattern-training">
              <PatternTraining onBack={() => setMode("hub")} />
            </ErrorBoundary>
          </Box>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={chessMastiDarkTheme}>
      <PageTitle title="Chess Masti AI - Practice" />
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#08090C" />
        <style>{`html,body{background-color:#08090C;color-scheme:dark;margin:0;}::-webkit-scrollbar{width:10px;height:10px;}::-webkit-scrollbar-track{background:#08090C;}::-webkit-scrollbar-thumb{background:${VIOLET.soft};border-radius:5px;}`}</style>
      </Head>

      <GradientBackdrop />

      <Box
        sx={{
          minHeight: "100vh",
          color: "rgba(255,255,255,0.94)",
          pt: 2,
          pb: 4,
          px: { xs: 2, md: 3 },
        }}
      >
        <NavPill active="practice" />

        <Box sx={{ width: "100%", maxWidth: 1120, mx: "auto", py: { xs: 2, md: 3 } }}>
          <Typography
            sx={{
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontSize: "0.72rem",
              color: VIOLET.bright,
              mb: 0.75,
            }}
          >
            Train
          </Typography>
          <Typography
            variant="h4"
            sx={{ fontWeight: 800, mb: 0.5, color: "rgba(255,255,255,0.94)" }}
          >
            Practice
          </Typography>
          <Typography sx={{ mb: 4, color: "rgba(255,255,255,0.62)" }}>
            Three ways to sharpen your tactics.
          </Typography>

          <Grid container spacing={2.5} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <ModeCard
                icon={<ExtensionIcon fontSize="inherit" />}
                title="Puzzles"
                desc="Adaptive puzzles tuned to your rating, with the AI coach walking through every miss. Your main training."
                cta="Open Puzzles"
                onClick={() => router.push("/puzzles")}
                accent={ACCENTS.violet}
                stat={
                  stats.totalAttempts > 0
                    ? {
                        icon: <TrendingUpIcon sx={{ fontSize: 16 }} />,
                        label: `Rating ${stats.rating}`,
                      }
                    : undefined
                }
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <ModeCard
                icon={<BoltIcon fontSize="inherit" />}
                title="Puzzle Rush"
                desc="Solve as many as you can against the clock — 3-minute, 5-minute, or 3-lives Survival."
                cta="Start Rush"
                onClick={() => setMode("rush")}
                accent={ACCENTS.ember}
                stat={
                  bestRush > 0
                    ? {
                        icon: <EmojiEventsIcon sx={{ fontSize: 16 }} />,
                        label: `Best ${bestRush}`,
                      }
                    : undefined
                }
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <ModeCard
                icon={<PsychologyIcon fontSize="inherit" />}
                title="Pattern Training"
                desc="Blindfold pattern-recognition drills — memorize the position, then find the move with the pieces hidden."
                cta="Start Pattern"
                onClick={() => setMode("pattern")}
                accent={ACCENTS.cyan}
              />
            </Grid>
          </Grid>

          <PuzzleStats />
        </Box>
      </Box>
    </ThemeProvider>
  );
}

function ModeCard({
  icon,
  title,
  desc,
  cta,
  onClick,
  accent,
  stat,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: string;
  onClick: () => void;
  accent: Accent;
  stat?: { icon: React.ReactNode; label: string };
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        p: { xs: 2.5, md: 3 },
        borderRadius: "1.75rem",
        overflow: "hidden",
        background: `radial-gradient(120% 70% at 50% 0%, ${accent.tint}, transparent 70%), rgba(20,22,28,0.55)`,
        backdropFilter: "blur(14px) saturate(140%)",
        WebkitBackdropFilter: "blur(14px) saturate(140%)",
        border: `1px solid ${accent.border}`,
        boxShadow: "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
        transition: "all 200ms ease",
        "&:hover": {
          transform: "translateY(-3px)",
          borderColor: accent.base,
          boxShadow: `0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06), ${accent.glow}`,
        },
      }}
    >
      <Box
        sx={{
          width: 52,
          height: 52,
          borderRadius: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 26,
          color: accent.bright,
          background: accent.soft,
          border: `1px solid ${accent.border}`,
          mb: 2,
        }}
      >
        {icon}
      </Box>

      <Typography
        sx={{
          fontWeight: 800,
          fontSize: "1.15rem",
          color: "rgba(255,255,255,0.94)",
          mb: 0.75,
        }}
      >
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.6)", flex: 1, mb: 2 }}>
        {desc}
      </Typography>

      {stat && (
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.6,
            mb: 2,
            px: 1.25,
            py: 0.5,
            width: "fit-content",
            borderRadius: "999px",
            color: accent.bright,
            background: accent.soft,
            border: `1px solid ${accent.border}`,
          }}
        >
          {stat.icon}
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, fontFamily: "Monaco, monospace" }}
          >
            {stat.label}
          </Typography>
        </Box>
      )}

      <Button
        variant="contained"
        fullWidth
        endIcon={<ArrowForwardIcon />}
        onClick={onClick}
        sx={{
          mt: "auto",
          bgcolor: "#F97316",
          color: "#0A0A0A",
          "&:hover": { bgcolor: "#FB923C" },
          boxShadow: "0 6px 18px rgba(249,115,22,0.32)",
          textTransform: "none",
          fontWeight: 700,
          borderRadius: "999px",
        }}
      >
        {cta}
      </Button>
    </Paper>
  );
}
