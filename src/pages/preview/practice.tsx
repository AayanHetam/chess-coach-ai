"use client";

import { Chess, type Square } from "chess.js";
import { Box, Button, Stack, Typography } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { motion } from "framer-motion";
import Head from "next/head";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  CheckCircle2,
  Crosshair,
  Flame,
  Lightbulb,
  Puzzle,
  RotateCcw,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { BorderBeam } from "@/components/ui/BorderBeam";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import { NumberTicker } from "@/components/ui/NumberTicker";
import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

const ChessgroundBoard = dynamic(
  () =>
    import("@/components/ui/ChessgroundBoard").then((m) => m.ChessgroundBoard),
  { ssr: false }
);

const practiceTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#F97316" },
    secondary: { main: "#FB923C" },
    background: { default: "#08090C", paper: "rgba(20,22,28,0.6)" },
    text: {
      primary: "rgba(255,255,255,0.94)",
      secondary: "rgba(255,255,255,0.62)",
    },
    divider: "rgba(255,255,255,0.08)",
  },
  typography: {
    fontFamily: "Inter, sans-serif",
    h1: { fontWeight: 800, letterSpacing: "-0.035em" },
    h2: { fontWeight: 700, letterSpacing: "-0.025em" },
    h3: { fontWeight: 700, letterSpacing: "-0.02em" },
    button: { textTransform: "none", fontWeight: 600 },
  },
});

const DARK_SQUARE = "#5C4630";
const LIGHT_SQUARE = "#F0D9B5";

// Today's puzzle — Mate in 2, Anastasia's Mate pattern
// FEN: White Q on e4, N on g5, R on a1; Black K on h7, pawns h6, g7
// Solution: 1.Qxh7+ Kxh7 2.Rh1#  — actually simpler: just Knight fork
// Going with: classic Reti's Mate position
// Position: black K on h8, black R on a8, white N on f7, white R on g7+ etc.
// Simpler — a fork puzzle:
const PUZZLE_FEN = "r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1";
const PUZZLE_SOLUTION = { from: "d5" as Square, to: "c7" as Square };

const THEMES = [
  { id: "fork", label: "Forks", icon: Crosshair, count: 12483, color: "#F97316" },
  { id: "pin", label: "Pins", icon: Target, count: 8924, color: "#FB923C" },
  { id: "skewer", label: "Skewers", icon: ArrowRight, count: 3210, color: "#FBBF24" },
  { id: "discovered", label: "Discovered attacks", icon: Zap, count: 5612, color: "#F97316" },
  { id: "mate-in-2", label: "Mate in 2", icon: Swords, count: 18540, color: "#EA580C" },
  { id: "endgame", label: "Endgames", icon: Flame, count: 9876, color: "#FB923C" },
  { id: "sacrifice", label: "Sacrifices", icon: Sparkles, count: 4321, color: "#F97316" },
  { id: "greek-gift", label: "Greek gift", icon: Lightbulb, count: 892, color: "#FBBF24" },
];

const RECENT_SOLVES = [
  { id: 1, theme: "Knight fork", rating: 1620, ago: "2m", solved: true, attempts: 1 },
  { id: 2, theme: "Mate in 2", rating: 1450, ago: "5m", solved: true, attempts: 2 },
  { id: 3, theme: "Pin", rating: 1820, ago: "8m", solved: false, attempts: 3 },
  { id: 4, theme: "Skewer", rating: 1380, ago: "12m", solved: true, attempts: 1 },
  { id: 5, theme: "Greek gift", rating: 2100, ago: "30m", solved: true, attempts: 4 },
];

export default function PreviewPracticePage() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const [position, setPosition] = useState(PUZZLE_FEN);
  const [status, setStatus] = useState<"playing" | "wrong" | "solved">("playing");
  const [tries, setTries] = useState(0);
  const [hintShown, setHintShown] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState("fork");

  const handleDrop = (from: string, to: string): boolean => {
    if (status === "solved") return false;
    if (from === PUZZLE_SOLUTION.from && to === PUZZLE_SOLUTION.to) {
      const g = new Chess(PUZZLE_FEN);
      g.move({ from: PUZZLE_SOLUTION.from, to: PUZZLE_SOLUTION.to });
      setPosition(g.fen());
      setStatus("solved");
      return true;
    }
    setStatus("wrong");
    setTries((t) => t + 1);
    setTimeout(() => setStatus((s) => (s === "wrong" ? "playing" : s)), 600);
    return false;
  };

  const handleReset = () => {
    setPosition(PUZZLE_FEN);
    setStatus("playing");
    setTries(0);
    setHintShown(false);
  };

  return (
    <ThemeProvider theme={practiceTheme}>
      <Head>
        <title>Chess Masti — Practice</title>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#08090C" />
        <style>{`
          html, body { background-color: #08090C; color-scheme: dark; margin: 0; }
          ::-webkit-scrollbar { width: 10px; height: 10px; }
          ::-webkit-scrollbar-track { background: #08090C; }
          ::-webkit-scrollbar-thumb { background: rgba(249,115,22,0.18); border-radius: 5px; }
          .cg-wrap cg-board square.light { background-color: ${LIGHT_SQUARE} !important; }
          .cg-wrap cg-board square.dark { background-color: ${DARK_SQUARE} !important; }
          .cg-wrap cg-board square.last-move { background-color: rgba(249,115,22,0.42) !important; }
          .cg-wrap coords, .cg-wrap coords coord {
            color: #FFFFFF !important;
            font-weight: 700;
            text-shadow: 0 1px 3px rgba(0,0,0,0.8);
          }
        `}</style>
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
        <NavPill active="practice" badge={{ label: "Practice" }} />

        <Box sx={{ maxWidth: 1400, mx: "auto" }}>
          {/* Hero + interactive puzzle */}
          <RevealOnScroll>
            <Box sx={{ mb: 5 }}>
              <Stack direction="row" alignItems="center" spacing={1.5} mb={2.5}>
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1.5,
                    py: 0.75,
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <Flame size={13} color="#F97316" />
                  <Typography
                    sx={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      letterSpacing: "0.18em",
                      color: "rgba(255,255,255,0.78)",
                      textTransform: "uppercase",
                    }}
                  >
                    Today · {today}
                  </Typography>
                </Box>
              </Stack>
              <Typography
                variant="h1"
                sx={{
                  fontSize: { xs: "2.4rem", md: "3.4rem" },
                  color: "rgba(255,255,255,0.96)",
                  lineHeight: 1.05,
                }}
              >
                One puzzle a day.{" "}
                <Box
                  component="span"
                  sx={{
                    background:
                      "linear-gradient(135deg, #F97316, #FB923C, #FBBF24)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Coached, not just rated.
                </Box>
              </Typography>
            </Box>
          </RevealOnScroll>

          <RevealOnScroll delay={0.08}>
            <Box
              sx={{
                position: "relative",
                borderRadius: "2rem",
                background:
                  "linear-gradient(135deg, rgba(249,115,22,0.06), rgba(20,22,28,0.6))",
                backdropFilter: "blur(16px) saturate(150%)",
                WebkitBackdropFilter: "blur(16px) saturate(150%)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow:
                  "0 16px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
                p: { xs: 4, md: 5 },
                mb: 5,
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "minmax(320px, 480px) 1fr" },
                gap: { xs: 4, md: 5 },
                alignItems: "center",
                overflow: "hidden",
              }}
            >
              <BorderBeam duration={14} />

              <Box sx={{ position: "relative", zIndex: 1 }}>
                <Box
                  sx={{
                    borderRadius: "16px",
                    overflow: "hidden",
                    boxShadow:
                      status === "solved"
                        ? "0 24px 60px rgba(0,0,0,0.5), 0 0 0 2px rgba(34,197,94,0.5)"
                        : status === "wrong"
                        ? "0 24px 60px rgba(0,0,0,0.5), 0 0 0 2px rgba(239,68,68,0.5)"
                        : "0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
                    transition:
                      "box-shadow 240ms cubic-bezier(0.22, 0.61, 0.36, 1)",
                  }}
                >
                  <ChessgroundBoard
                    fen={position}
                    viewOnly={status === "solved"}
                  />
                </Box>
              </Box>

              <Box sx={{ position: "relative", zIndex: 1 }}>
                <Typography
                  sx={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    color: "rgba(255,255,255,0.5)",
                    textTransform: "uppercase",
                    mb: 1,
                  }}
                >
                  Endgame · Knight fork · Rating 1620
                </Typography>
                <Typography
                  variant="h2"
                  sx={{
                    fontSize: { xs: "1.6rem", md: "2.1rem" },
                    color: "rgba(255,255,255,0.96)",
                    mb: 2,
                    lineHeight: 1.1,
                  }}
                >
                  {status === "solved" ? (
                    <>
                      Brilliant.{" "}
                      <Box
                        component="span"
                        sx={{
                          background:
                            "linear-gradient(135deg, #22c55e, #16a34a)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                        }}
                      >
                        Nc7+ wins the rook.
                      </Box>
                    </>
                  ) : (
                    <>White to play. Find the tactic.</>
                  )}
                </Typography>

                {status !== "solved" && (
                  <Typography
                    sx={{
                      color: "rgba(255,255,255,0.62)",
                      fontSize: "1rem",
                      lineHeight: 1.55,
                      mb: 3,
                    }}
                  >
                    Drag the knight to win material. Wrong moves bounce back —
                    same way the coach guards you mid-game.
                    {hintShown && (
                      <Box
                        component="span"
                        sx={{
                          display: "block",
                          mt: 2,
                          p: 2,
                          borderRadius: "10px",
                          background: "rgba(249,115,22,0.08)",
                          border: "1px solid rgba(249,115,22,0.2)",
                          color: "rgba(255,255,255,0.85)",
                          fontSize: "0.92rem",
                          fontStyle: "italic",
                        }}
                      >
                        💡 The knight on d5 attacks both the king and the rook
                        from a single square.
                      </Box>
                    )}
                  </Typography>
                )}

                {status === "solved" && (
                  <Box
                    sx={{
                      p: 2.5,
                      borderRadius: "12px",
                      background: "rgba(34,197,94,0.08)",
                      border: "1px solid rgba(34,197,94,0.25)",
                      mb: 3,
                    }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      <CheckCircle2 size={20} color="#22c55e" />
                      <Box>
                        <Typography
                          sx={{
                            fontSize: "0.95rem",
                            color: "rgba(255,255,255,0.92)",
                            lineHeight: 1.5,
                          }}
                        >
                          Knight to c7 forks the king on e8 and rook on a8. King
                          moves, then Nxa8 wins the rook.
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: "0.82rem",
                            color: "rgba(255,255,255,0.5)",
                            mt: 1,
                          }}
                        >
                          Solved in {tries + 1} {tries === 0 ? "try" : "tries"}{" "}
                          · +{tries === 0 ? "15" : tries === 1 ? "8" : "3"} rating
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>
                )}

                <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap" }}>
                  {status === "solved" ? (
                    <>
                      <Button
                        onClick={handleReset}
                        variant="outlined"
                        startIcon={<RotateCcw size={16} />}
                        sx={{
                          color: "rgba(255,255,255,0.92)",
                          borderColor: "rgba(255,255,255,0.18)",
                          fontWeight: 600,
                          px: 2.5,
                          py: 1.25,
                          borderRadius: "999px",
                          background: "rgba(255,255,255,0.03)",
                        }}
                      >
                        Try again
                      </Button>
                      <Button
                        variant="contained"
                        endIcon={<ArrowRight size={16} />}
                        sx={{
                          bgcolor: "#F97316",
                          color: "#0A0A0A",
                          fontWeight: 700,
                          px: 3,
                          py: 1.4,
                          borderRadius: "999px",
                          boxShadow:
                            "0 0 0 1px rgba(249,115,22,0.5), 0 8px 32px rgba(249,115,22,0.25)",
                          "&:hover": { bgcolor: "#FB923C" },
                        }}
                      >
                        Next puzzle
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={() => setHintShown(true)}
                      disabled={hintShown}
                      variant="outlined"
                      startIcon={<Lightbulb size={16} />}
                      sx={{
                        color: "rgba(255,255,255,0.92)",
                        borderColor: "rgba(255,255,255,0.18)",
                        fontWeight: 600,
                        px: 2.5,
                        py: 1.25,
                        borderRadius: "999px",
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      {hintShown ? "Hint shown" : "Hint"}
                    </Button>
                  )}
                </Stack>
              </Box>
            </Box>
          </RevealOnScroll>

          {/* Stats strip */}
          <RevealOnScroll delay={0.12}>
            <Box
              sx={{
                mb: 5,
                py: 4,
                px: { xs: 3, md: 5 },
                borderRadius: "1.5rem",
                background: "rgba(20,22,28,0.4)",
                border: "1px solid rgba(255,255,255,0.06)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                display: "grid",
                gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
                gap: { xs: 3, md: 2 },
              }}
            >
              {[
                { value: 47, label: "Day streak", suffix: "", color: "#F97316" },
                { value: 1620, label: "Puzzle rating", suffix: "", color: "#FB923C" },
                { value: 234, label: "Solved this month", suffix: "", color: "#FBBF24" },
                { value: 89, label: "Accuracy", suffix: "%", color: "#22c55e" },
              ].map((s) => (
                <Box key={s.label}>
                  <Typography
                    sx={{
                      fontSize: { xs: "2rem", md: "2.6rem" },
                      fontWeight: 800,
                      letterSpacing: "-0.03em",
                      lineHeight: 1,
                      color: s.color,
                    }}
                  >
                    <NumberTicker value={s.value} suffix={s.suffix} />
                  </Typography>
                  <Typography
                    sx={{
                      mt: 1.25,
                      fontSize: "0.78rem",
                      color: "rgba(255,255,255,0.5)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                    }}
                  >
                    {s.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </RevealOnScroll>

          {/* Theme grid */}
          <RevealOnScroll delay={0.16}>
            <Box sx={{ mb: 5 }}>
              <Stack direction="row" alignItems="center" spacing={1.5} mb={2.5}>
                <Puzzle size={14} color="#F97316" />
                <Typography
                  sx={{
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    color: "rgba(255,255,255,0.55)",
                    textTransform: "uppercase",
                  }}
                >
                  Drill by theme
                </Typography>
              </Stack>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "repeat(2, 1fr)",
                    sm: "repeat(3, 1fr)",
                    md: "repeat(4, 1fr)",
                  },
                  gap: 1.5,
                }}
              >
                {THEMES.map((t) => {
                  const Icon = t.icon;
                  const active = selectedTheme === t.id;
                  return (
                    <Box
                      key={t.id}
                      onClick={() => setSelectedTheme(t.id)}
                      sx={{
                        cursor: "pointer",
                        p: 2.5,
                        borderRadius: "1rem",
                        background: active
                          ? "linear-gradient(180deg, rgba(249,115,22,0.1), rgba(20,22,28,0.65))"
                          : "rgba(20,22,28,0.5)",
                        border: active
                          ? "1px solid rgba(249,115,22,0.35)"
                          : "1px solid rgba(255,255,255,0.07)",
                        backdropFilter: "blur(10px)",
                        WebkitBackdropFilter: "blur(10px)",
                        transition: "all 200ms ease",
                        "&:hover": {
                          background: "rgba(20,22,28,0.65)",
                          borderColor: "rgba(249,115,22,0.25)",
                          transform: "translateY(-2px)",
                        },
                      }}
                    >
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: "10px",
                          background: `${t.color}22`,
                          border: `1px solid ${t.color}55`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          mb: 1.5,
                        }}
                      >
                        <Icon size={16} color={t.color} />
                      </Box>
                      <Typography
                        sx={{
                          fontSize: "0.92rem",
                          fontWeight: 700,
                          color: "rgba(255,255,255,0.92)",
                          mb: 0.4,
                        }}
                      >
                        {t.label}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: "0.72rem",
                          color: "rgba(255,255,255,0.42)",
                          fontFamily: "Monaco, Menlo, monospace",
                        }}
                      >
                        {t.count.toLocaleString()} puzzles
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </RevealOnScroll>

          {/* Recent solves */}
          <RevealOnScroll delay={0.2}>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1.5} mb={2}>
                <TrendingUp size={14} color="#F97316" />
                <Typography
                  sx={{
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    color: "rgba(255,255,255,0.55)",
                    textTransform: "uppercase",
                  }}
                >
                  Recent solves
                </Typography>
              </Stack>
              <Stack spacing={1}>
                {RECENT_SOLVES.map((s) => (
                  <Box
                    key={s.id}
                    sx={{
                      px: 2.5,
                      py: 1.5,
                      borderRadius: "12px",
                      background: "rgba(20,22,28,0.5)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto auto auto",
                      gap: 2,
                      alignItems: "center",
                    }}
                  >
                    <Box
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: "8px",
                        background: s.solved
                          ? "rgba(34,197,94,0.12)"
                          : "rgba(239,68,68,0.12)",
                        border: s.solved
                          ? "1px solid rgba(34,197,94,0.3)"
                          : "1px solid rgba(239,68,68,0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {s.solved ? (
                        <CheckCircle2 size={14} color="#22c55e" />
                      ) : (
                        <Crosshair size={14} color="#ef4444" />
                      )}
                    </Box>
                    <Typography
                      sx={{
                        fontSize: "0.92rem",
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.9)",
                      }}
                    >
                      {s.theme}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "0.82rem",
                        color: "rgba(255,255,255,0.5)",
                        fontFamily: "Monaco, Menlo, monospace",
                      }}
                    >
                      {s.rating}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "0.78rem",
                        color: "rgba(255,255,255,0.45)",
                      }}
                    >
                      {s.attempts} {s.attempts === 1 ? "try" : "tries"}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "0.78rem",
                        color: "rgba(255,255,255,0.4)",
                        minWidth: 36,
                        textAlign: "right",
                      }}
                    >
                      {s.ago}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          </RevealOnScroll>

          <Box
            sx={{
              mt: 5,
              pt: 3,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              gap: 1.5,
              alignItems: "center",
              justifyContent: "space-between",
              color: "rgba(255,255,255,0.4)",
              fontSize: "0.78rem",
            }}
          >
            <Box>100,000+ puzzles · spaced repetition · concept-tagged</Box>
            <Stack direction="row" spacing={2.5} alignItems="center">
              <Box>Powered by</Box>
              <Box sx={{ color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
                Claude
              </Box>
              <Box>×</Box>
              <Box sx={{ color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
                Stockfish 17
              </Box>
            </Stack>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
