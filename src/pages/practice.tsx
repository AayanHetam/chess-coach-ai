"use client";

import { useEffect, useState } from "react";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import BoltIcon from "@mui/icons-material/Bolt";
import PsychologyIcon from "@mui/icons-material/Psychology";
import ExtensionIcon from "@mui/icons-material/Extension";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useRouter } from "next/router";
import { PageTitle } from "@/components/pageTitle";
import PuzzleRush from "@/sections/practice/PuzzleRush";
import PatternTraining from "@/sections/practice/PatternTraining";
import PuzzleStats from "@/sections/practice/PuzzleStats";
import { ErrorBoundary } from "@/components/ErrorBoundary";

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

export default function Practice() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("hub");

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
      <>
        <PageTitle title="Chess Masti AI - Puzzle Rush" />
        <Box sx={PAGE_BOX_SX}>
          <ErrorBoundary name="puzzle-rush">
            <PuzzleRush onBack={() => setMode("hub")} />
          </ErrorBoundary>
        </Box>
      </>
    );
  }

  if (mode === "pattern") {
    return (
      <>
        <PageTitle title="Chess Masti AI - Pattern Training" />
        <Box sx={PAGE_BOX_SX}>
          <ErrorBoundary name="pattern-training">
            <PatternTraining onBack={() => setMode("hub")} />
          </ErrorBoundary>
        </Box>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Chess Masti AI - Practice" />
      <Box sx={{ width: "100%", maxWidth: 880, mx: "auto", p: { xs: 2, md: 3 } }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
          Practice
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Three ways to sharpen your tactics.
        </Typography>

        <Stack spacing={2}>
          <ModeCard
            icon={<ExtensionIcon />}
            title="Puzzles"
            desc="Adaptive puzzles tuned to your rating, with the AI coach. Your main training."
            cta="Open Puzzles"
            onClick={() => router.push("/puzzles")}
            highlight
          />
          <ModeCard
            icon={<BoltIcon />}
            title="Puzzle Rush"
            desc="Solve as many as you can against the clock."
            cta="Start Rush"
            onClick={() => setMode("rush")}
          />
          <ModeCard
            icon={<PsychologyIcon />}
            title="Pattern Training"
            desc="Blindfold pattern-recognition drills."
            cta="Start Pattern"
            onClick={() => setMode("pattern")}
          />
        </Stack>

        <Box sx={{ mt: 3 }}>
          <PuzzleStats compact />
        </Box>
      </Box>
    </>
  );
}

function ModeCard({
  icon,
  title,
  desc,
  cta,
  onClick,
  highlight,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <Paper
      sx={{
        p: { xs: 2, md: 2.5 },
        display: "flex",
        alignItems: "center",
        gap: 2,
        border: highlight ? "1px solid" : undefined,
        borderColor: highlight ? "primary.main" : undefined,
      }}
    >
      <Box
        sx={{
          color: "primary.main",
          display: "flex",
          alignItems: "center",
          fontSize: 32,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {desc}
        </Typography>
      </Box>
      <Button
        variant={highlight ? "contained" : "outlined"}
        endIcon={<ArrowForwardIcon />}
        onClick={onClick}
        sx={{ textTransform: "none", fontWeight: 600, flexShrink: 0 }}
      >
        {cta}
      </Button>
    </Paper>
  );
}
