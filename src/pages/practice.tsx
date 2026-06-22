"use client";

import { useEffect, useState } from "react";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import Head from "next/head";
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
import { chessMastiDarkTheme } from "@/theme/chessMasti";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";

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
      <ThemeProvider theme={chessMastiDarkTheme}>
        <PageTitle title="Chess Masti AI - Puzzle Rush" />
        <Head>
          <meta name="color-scheme" content="dark" />
          <meta name="theme-color" content="#08090C" />
          <style>{`html,body{background-color:#08090C;color-scheme:dark;margin:0;}::-webkit-scrollbar{width:10px;height:10px;}::-webkit-scrollbar-track{background:#08090C;}::-webkit-scrollbar-thumb{background:rgba(249,115,22,0.18);border-radius:5px;}`}</style>
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
          <style>{`html,body{background-color:#08090C;color-scheme:dark;margin:0;}::-webkit-scrollbar{width:10px;height:10px;}::-webkit-scrollbar-track{background:#08090C;}::-webkit-scrollbar-thumb{background:rgba(249,115,22,0.18);border-radius:5px;}`}</style>
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
        <style>{`html,body{background-color:#08090C;color-scheme:dark;margin:0;}::-webkit-scrollbar{width:10px;height:10px;}::-webkit-scrollbar-track{background:#08090C;}::-webkit-scrollbar-thumb{background:rgba(249,115,22,0.18);border-radius:5px;}`}</style>
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

        <Box sx={{ width: "100%", maxWidth: 880, mx: "auto", py: { xs: 2, md: 3 } }}>
          <Typography
            sx={{
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontSize: "0.72rem",
              color: "#FB923C",
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
          <Typography sx={{ mb: 3, color: "rgba(255,255,255,0.62)" }}>
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
      elevation={0}
      sx={{
        p: { xs: 2, md: 2.5 },
        display: "flex",
        alignItems: "center",
        gap: 2,
        borderRadius: "1.5rem",
        overflow: "hidden",
        background: highlight
          ? "linear-gradient(135deg, rgba(249,115,22,0.08), rgba(20,22,28,0.6))"
          : "rgba(20,22,28,0.55)",
        backdropFilter: "blur(14px) saturate(140%)",
        WebkitBackdropFilter: "blur(14px) saturate(140%)",
        border: highlight
          ? "1px solid rgba(249,115,22,0.35)"
          : "1px solid rgba(255,255,255,0.08)",
        boxShadow: highlight
          ? "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(249,115,22,0.18)"
          : "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
        transition: "all 180ms ease",
        "&:hover": {
          transform: "translateY(-2px)",
          borderColor: highlight
            ? "rgba(249,115,22,0.5)"
            : "rgba(255,255,255,0.16)",
        },
      }}
    >
      <Box
        sx={{
          color: "#FB923C",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 32,
          ...(highlight && {
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: "12px",
            background: "rgba(249,115,22,0.12)",
            border: "1px solid rgba(249,115,22,0.25)",
          }),
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: "1.05rem",
            color: "rgba(255,255,255,0.94)",
          }}
        >
          {title}
        </Typography>
        <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.62)" }}>
          {desc}
        </Typography>
      </Box>
      <Button
        variant={highlight ? "contained" : "outlined"}
        endIcon={<ArrowForwardIcon />}
        onClick={onClick}
        sx={
          highlight
            ? {
                bgcolor: "#F97316",
                color: "#0A0A0A",
                "&:hover": { bgcolor: "#FB923C" },
                boxShadow: "0 6px 18px rgba(249,115,22,0.32)",
                textTransform: "none",
                fontWeight: 700,
                flexShrink: 0,
                borderRadius: "999px",
              }
            : {
                color: "rgba(255,255,255,0.85)",
                borderColor: "rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.04)",
                "&:hover": {
                  borderColor: "rgba(249,115,22,0.4)",
                  color: "#FB923C",
                  background: "rgba(249,115,22,0.12)",
                },
                textTransform: "none",
                fontWeight: 600,
                flexShrink: 0,
                borderRadius: "999px",
              }
        }
      >
        {cta}
      </Button>
    </Paper>
  );
}
