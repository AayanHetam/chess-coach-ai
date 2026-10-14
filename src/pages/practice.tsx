"use client";

import { useEffect, useState } from "react";
import { Box, Button, Grid, Paper, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import Head from "next/head";
import { useAtomValue } from "jotai";
import BoltIcon from "@mui/icons-material/Bolt";
import PsychologyIcon from "@mui/icons-material/Psychology";
import ExtensionIcon from "@mui/icons-material/Extension";
import GridOnIcon from "@mui/icons-material/GridOn";
import PsychologyAltIcon from "@mui/icons-material/PsychologyAlt";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { useRouter } from "next/router";
import { PageTitle } from "@/components/pageTitle";
import PuzzleRush from "@/sections/practice/PuzzleRush";
import PatternTraining from "@/sections/practice/PatternTraining";
import CoordinateTrainer from "@/sections/practice/CoordinateTrainer";
import GuessTheMove from "@/sections/practice/GuessTheMove";
import PuzzleStats from "@/sections/practice/PuzzleStats";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { chessMastiDarkTheme } from "@/theme/chessMasti";
import { NavPill } from "@/components/ui/NavPill";
import { ACCENT, LINE, RADIUS, SURFACE, TEXT, TYPE } from "@/theme/tokens";
import {
  getSolveRate,
  puzzleStatsAtom,
  puzzleRushScoresAtom,
} from "@/lib/puzzleRating";
import { coordinateTrainerBestAtom } from "@/lib/coordinateTrainer";
import { MastiSays, scoreMood } from "@/components/masti";

/**
 * /practice — a thin modes hub.
 *
 * Standard theme-browser puzzle solving was merged into the unified /puzzles
 * surface (adaptive, ELO-wired, AI-coached), so this page now just routes to
 * the five ways to train: Puzzles (→ /puzzles), Puzzle Rush, Pattern
 * Training, Coordinate Trainer, and Guess the Move. Legacy/AI-coach deep
 * links (`/practice?theme=…`) forward to `/puzzles?theme=…`;
 * `?mode=rush|pattern|coordinate|guess` opens those modes directly.
 */

type Mode = "hub" | "rush" | "pattern" | "coordinate" | "guess";

const PAGE_BOX_SX = { width: "100%", maxWidth: "100vw", p: { xs: 1, md: 2 } };

export default function Practice() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("hub");
  const stats = useAtomValue(puzzleStatsAtom);
  const rushScores = useAtomValue(puzzleRushScoresAtom);
  const bestRush = Math.max(
    rushScores.threeMin,
    rushScores.fiveMin,
    rushScores.survivalBest
  );
  const coordinateBest = useAtomValue(coordinateTrainerBestAtom);

  // Masti greets the hub from the solve rate the page already shows (the
  // Puzzles card and PuzzleStats read the same atom): no attempts is a wave,
  // a strong rate a celebration, a weak one a worried face. He reads the
  // stats, never a board.
  const heroMood = scoreMood(stats.totalSolved, stats.totalAttempts);
  const solveRate = getSolveRate(stats);
  const heroLine =
    heroMood === "excited"
      ? `You're solving ${solveRate}% of your puzzles. Pick a mode and let's push it higher.`
      : heroMood === "idea"
        ? `${solveRate}% solved so far. Every miss has one idea in it, and I'll point it out.`
        : heroMood === "nervous"
          ? `${solveRate}% solved. Check every capture and every check before you move, and that number climbs.`
          : heroMood === "defeated"
            ? "Nothing solved yet. Every player starts here. Let's find your first one."
            : "Nothing on the scoreboard yet. Pick a mode and I'll keep count.";

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
    if (m === "coordinate") {
      setMode("coordinate");
      return;
    }
    if (m === "guess") {
      setMode("guess");
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
          <meta name="theme-color" content={SURFACE.page} />
        </Head>

        <Box
          sx={{
            minHeight: "100vh",
            color: TEXT.primary,
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
          <meta name="theme-color" content={SURFACE.page} />
        </Head>

        <Box
          sx={{
            minHeight: "100vh",
            color: TEXT.primary,
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

  if (mode === "coordinate") {
    return (
      <ThemeProvider theme={chessMastiDarkTheme}>
        <PageTitle title="Chess Masti AI - Coordinate Trainer" />
        <Head>
          <meta name="color-scheme" content="dark" />
          <meta name="theme-color" content={SURFACE.page} />
        </Head>

        <Box
          sx={{
            minHeight: "100vh",
            color: TEXT.primary,
            pt: 2,
            pb: 4,
            px: { xs: 2, md: 3 },
          }}
        >
          <NavPill active="practice" />

          <Box sx={PAGE_BOX_SX}>
            <ErrorBoundary name="coordinate-trainer">
              <CoordinateTrainer onBack={() => setMode("hub")} />
            </ErrorBoundary>
          </Box>
        </Box>
      </ThemeProvider>
    );
  }

  if (mode === "guess") {
    return (
      <ThemeProvider theme={chessMastiDarkTheme}>
        <PageTitle title="Chess Masti AI - Guess the Move" />
        <Head>
          <meta name="color-scheme" content="dark" />
          <meta name="theme-color" content={SURFACE.page} />
        </Head>

        <Box
          sx={{
            minHeight: "100vh",
            color: TEXT.primary,
            pt: 2,
            pb: 4,
            px: { xs: 2, md: 3 },
          }}
        >
          <NavPill active="practice" />

          <Box sx={PAGE_BOX_SX}>
            <ErrorBoundary name="guess-the-move">
              <GuessTheMove onBack={() => setMode("hub")} />
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
        <meta name="theme-color" content={SURFACE.page} />
      </Head>

      <Box
        sx={{
          minHeight: "100vh",
          color: TEXT.primary,
          pt: 2,
          pb: 4,
          px: { xs: 2, md: 3 },
        }}
      >
        <NavPill active="practice" />

        <Box
          sx={{
            width: "100%",
            maxWidth: 1120,
            mx: "auto",
            py: { xs: 2, md: 3 },
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 2,
              mb: 4,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h4" sx={{ mb: 0.5, color: TEXT.primary }}>
                Practice
              </Typography>
              <Typography sx={{ color: TEXT.secondary }}>
                Five ways to sharpen your game.
              </Typography>
            </Box>
            {/* The hub's one animated figure. 96px keeps him under the fluid
                threshold, so the row simply wraps under the heading on phones. */}
            <MastiSays
              mood={heroMood}
              size={96}
              side="right"
              maxWidth={340}
              priority
              data-testid="practice-masti"
            >
              {heroLine}
            </MastiSays>
          </Box>

          <Grid container spacing={2.5} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <ModeCard
                icon={<ExtensionIcon fontSize="inherit" />}
                title="Puzzles"
                desc="Adaptive puzzles tuned to your rating, with Masti walking through every miss. Your main training."
                cta="Open puzzles"
                primary
                onClick={() => router.push("/puzzles")}
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
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <ModeCard
                icon={<BoltIcon fontSize="inherit" />}
                title="Puzzle rush"
                desc="Solve as many as you can against the clock: 3 minutes, 5 minutes, or survival with 3 lives."
                cta="Start rush"
                onClick={() => setMode("rush")}
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
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <ModeCard
                icon={<PsychologyIcon fontSize="inherit" />}
                title="Pattern training"
                desc="Memorize a position, then find the move with the pieces hidden."
                cta="Start training"
                onClick={() => setMode("pattern")}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <ModeCard
                icon={<GridOnIcon fontSize="inherit" />}
                title="Coordinate trainer"
                desc="A square is named. Click it on the blank board as fast as you can."
                cta="Start drill"
                onClick={() => setMode("coordinate")}
                stat={
                  coordinateBest.best > 0
                    ? {
                        icon: <EmojiEventsIcon sx={{ fontSize: 16 }} />,
                        label: `Best ${coordinateBest.best}`,
                      }
                    : undefined
                }
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <ModeCard
                icon={<PsychologyAltIcon fontSize="inherit" />}
                title="Guess the move"
                desc="Step through a real master game and guess the next move before it's revealed."
                cta="Start guessing"
                onClick={() => setMode("guess")}
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
  stat,
  primary = false,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: string;
  onClick: () => void;
  stat?: { icon: React.ReactNode; label: string };
  /** The hub's one contained button: the main training. The rest are outlined. */
  primary?: boolean;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        p: { xs: 2.5, md: 3 },
        borderRadius: `${RADIUS.card}px`,
        background: SURFACE.raised,
        border: `1px solid ${LINE.hairline}`,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          fontSize: 22,
          color: ACCENT.main,
          mb: 1.5,
        }}
      >
        {icon}
      </Box>

      <Typography sx={{ ...TYPE.h5, color: TEXT.primary, mb: 0.75 }}>
        {title}
      </Typography>
      <Typography
        variant="body2"
        sx={{ color: TEXT.secondary, flex: 1, mb: 2 }}
      >
        {desc}
      </Typography>

      {stat && (
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.6,
            mb: 2,
            px: 1,
            py: 0.25,
            width: "fit-content",
            borderRadius: `${RADIUS.small}px`,
            color: TEXT.primary,
            background: SURFACE.raisedSecondary,
          }}
        >
          {stat.icon}
          <Typography
            variant="caption"
            sx={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}
          >
            {stat.label}
          </Typography>
        </Box>
      )}

      <Button
        variant={primary ? "contained" : "outlined"}
        fullWidth
        endIcon={<ArrowForwardIcon />}
        onClick={onClick}
        sx={{ mt: "auto" }}
      >
        {cta}
      </Button>
    </Paper>
  );
}
