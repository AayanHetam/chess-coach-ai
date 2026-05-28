"use client";

import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { motion } from "framer-motion";
import Head from "next/head";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Crosshair,
  Eye,
  Flame,
  Lightbulb,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { BorderBeam } from "@/components/ui/BorderBeam";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import { NumberTicker } from "@/components/ui/NumberTicker";
import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

const scoutTheme = createTheme({
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

// Mock scout data — DrNykterstein is Magnus Carlsen's actual Lichess handle.
const MOCK_SCOUT = {
  handle: "DrNykterstein",
  realName: "Magnus Carlsen",
  blitzRating: 3193,
  bulletRating: 3201,
  rapidRating: 2870,
  totalGames: 48372,
  blunderRate: 0.4,
  timeTrouble: 12,
  stalkerScore: 87,
  topOpenings: [
    { name: "Sicilian Defense", asWhite: 0, asBlack: 4823, winRate: 71 },
    { name: "Ruy López", asWhite: 5612, asBlack: 0, winRate: 76 },
    { name: "Catalan", asWhite: 2104, asBlack: 0, winRate: 73 },
    { name: "King's Indian", asWhite: 0, asBlack: 1893, winRate: 64 },
  ],
  weaknesses: [
    {
      title: "Closed positions",
      desc: "Win rate drops to 62% in fully blocked structures (vs 78% open).",
      severity: "medium",
    },
    {
      title: "Endgame time scrambles",
      desc: "Blunders increase 4× under 30 seconds. Trade pieces or aim for complex endgames.",
      severity: "high",
    },
    {
      title: "King's Indian as White",
      desc: "Below average (61% win rate) against Petrosian-style setups.",
      severity: "low",
    },
  ],
  gamePlan: [
    "Play 1.d4 — avoid his Sicilian wheelhouse entirely.",
    "Steer for closed/maneuvering positions (Stonewall, KID Petrosian, London).",
    "If you reach a clear endgame, simplify and trust the clock — that's his weak link.",
    "Avoid sharp open positions where his calculation lead is biggest.",
  ],
};

export default function PreviewScoutPage() {
  const [handle, setHandle] = useState(MOCK_SCOUT.handle);
  const [submitted, setSubmitted] = useState(true);

  return (
    <ThemeProvider theme={scoutTheme}>
      <Head>
        <title>Chess Masti — Scout</title>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#08090C" />
        <style>{`
          html, body { background-color: #08090C; color-scheme: dark; margin: 0; }
          ::-webkit-scrollbar { width: 10px; height: 10px; }
          ::-webkit-scrollbar-track { background: #08090C; }
          ::-webkit-scrollbar-thumb { background: rgba(249,115,22,0.18); border-radius: 5px; }
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
        <NavPill active="scout" badge={{ label: "Scout" }} />

        <Box sx={{ maxWidth: 1400, mx: "auto" }}>
          {/* Hero + search */}
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
                  <Eye size={13} color="#F97316" />
                  <Typography
                    sx={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      letterSpacing: "0.18em",
                      color: "rgba(255,255,255,0.78)",
                      textTransform: "uppercase",
                    }}
                  >
                    Stalker Score™
                  </Typography>
                </Box>
              </Stack>
              <Typography
                variant="h1"
                sx={{
                  fontSize: { xs: "2.4rem", md: "3.4rem" },
                  color: "rgba(255,255,255,0.96)",
                  lineHeight: 1.05,
                  mb: 3,
                }}
              >
                Scout your next opponent.{" "}
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
                  Walk in with a plan.
                </Box>
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ maxWidth: 720 }}>
                <TextField
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSubmitted(true);
                  }}
                  placeholder="Lichess or Chess.com handle..."
                  fullWidth
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "rgba(20,22,28,0.6)",
                      borderRadius: "999px",
                      fontSize: "1rem",
                      "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
                      "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
                      "&.Mui-focused fieldset": {
                        borderColor: "rgba(249,115,22,0.5)",
                      },
                    },
                    "& .MuiOutlinedInput-input": {
                      px: 3,
                      py: 1.6,
                      color: "rgba(255,255,255,0.95)",
                    },
                  }}
                />
                <Button
                  onClick={() => setSubmitted(true)}
                  variant="contained"
                  endIcon={<Crosshair size={18} />}
                  sx={{
                    bgcolor: "#F97316",
                    color: "#0A0A0A",
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    px: 3.5,
                    py: 1.6,
                    borderRadius: "999px",
                    boxShadow:
                      "0 0 0 1px rgba(249,115,22,0.5), 0 8px 32px rgba(249,115,22,0.25)",
                    whiteSpace: "nowrap",
                    "&:hover": {
                      bgcolor: "#FB923C",
                      transform: "translateY(-1px)",
                    },
                  }}
                >
                  Scout
                </Button>
              </Stack>
            </Box>
          </RevealOnScroll>

          {submitted && (
            <>
              {/* Player header + Stalker Score */}
              <RevealOnScroll delay={0.08}>
                <Box
                  sx={{
                    position: "relative",
                    p: { xs: 4, md: 5 },
                    borderRadius: "2rem",
                    background:
                      "linear-gradient(135deg, rgba(249,115,22,0.08), rgba(20,22,28,0.6))",
                    backdropFilter: "blur(16px) saturate(150%)",
                    WebkitBackdropFilter: "blur(16px) saturate(150%)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
                    overflow: "hidden",
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1.3fr 1fr" },
                    gap: { xs: 4, md: 6 },
                    alignItems: "center",
                    mb: 4,
                  }}
                >
                  <BorderBeam duration={12} />

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
                      Now scouting
                    </Typography>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                      <Typography
                        variant="h2"
                        sx={{
                          fontSize: { xs: "1.8rem", md: "2.4rem" },
                          color: "rgba(255,255,255,0.96)",
                          fontFamily: "Monaco, Menlo, monospace",
                        }}
                      >
                        {MOCK_SCOUT.handle}
                      </Typography>
                      <Box
                        sx={{
                          px: 1.25,
                          py: 0.4,
                          borderRadius: "999px",
                          background: "rgba(249,115,22,0.15)",
                          border: "1px solid rgba(249,115,22,0.35)",
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          letterSpacing: "0.12em",
                          color: "#FB923C",
                        }}
                      >
                        WORLD #1
                      </Box>
                    </Stack>
                    <Typography
                      sx={{
                        color: "rgba(255,255,255,0.6)",
                        fontSize: "1.05rem",
                        mb: 3,
                      }}
                    >
                      Magnus Carlsen — the GOAT. Even his blunders are
                      instructive.
                    </Typography>
                    <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap" }}>
                      {[
                        { label: "Blitz", value: MOCK_SCOUT.blitzRating },
                        { label: "Bullet", value: MOCK_SCOUT.bulletRating },
                        { label: "Rapid", value: MOCK_SCOUT.rapidRating },
                      ].map((r) => (
                        <Box key={r.label}>
                          <Typography
                            sx={{
                              fontSize: "1.4rem",
                              fontWeight: 800,
                              color: "rgba(255,255,255,0.94)",
                              lineHeight: 1,
                              fontFamily: "Monaco, Menlo, monospace",
                            }}
                          >
                            {r.value}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: "0.66rem",
                              letterSpacing: "0.14em",
                              color: "rgba(255,255,255,0.5)",
                              textTransform: "uppercase",
                              mt: 0.5,
                              fontWeight: 700,
                            }}
                          >
                            {r.label}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Box>

                  {/* Stalker Score gauge */}
                  <Box
                    sx={{
                      position: "relative",
                      zIndex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Box
                      sx={{
                        position: "relative",
                        width: 200,
                        height: 200,
                      }}
                    >
                      <svg viewBox="0 0 200 200" style={{ width: "100%", height: "100%" }}>
                        <defs>
                          <linearGradient id="stalkerGrad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#F97316" />
                            <stop offset="100%" stopColor="#FBBF24" />
                          </linearGradient>
                        </defs>
                        {/* Background ring */}
                        <circle
                          cx="100"
                          cy="100"
                          r="80"
                          fill="none"
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth="12"
                        />
                        {/* Progress arc */}
                        <motion.circle
                          cx="100"
                          cy="100"
                          r="80"
                          fill="none"
                          stroke="url(#stalkerGrad)"
                          strokeWidth="12"
                          strokeLinecap="round"
                          strokeDasharray={`${(MOCK_SCOUT.stalkerScore / 100) * 503} 503`}
                          transform="rotate(-90 100 100)"
                          initial={{ strokeDashoffset: 503 }}
                          animate={{ strokeDashoffset: 0 }}
                          transition={{ duration: 1.6, ease: [0.22, 0.61, 0.36, 1] }}
                        />
                      </svg>
                      <Box
                        sx={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: "3.4rem",
                            fontWeight: 800,
                            color: "rgba(255,255,255,0.96)",
                            lineHeight: 1,
                            background:
                              "linear-gradient(135deg, #F97316, #FBBF24)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                          }}
                        >
                          <NumberTicker value={MOCK_SCOUT.stalkerScore} />
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: "0.66rem",
                            fontWeight: 700,
                            letterSpacing: "0.18em",
                            color: "rgba(255,255,255,0.5)",
                            textTransform: "uppercase",
                            mt: 0.5,
                          }}
                        >
                          Stalker score
                        </Typography>
                      </Box>
                    </Box>
                    <Typography
                      sx={{
                        fontSize: "0.78rem",
                        color: "rgba(255,255,255,0.45)",
                        textAlign: "center",
                        mt: 1.5,
                        maxWidth: 240,
                      }}
                    >
                      High threat · prepare deeply
                    </Typography>
                  </Box>
                </Box>
              </RevealOnScroll>

              {/* Stats bento */}
              <RevealOnScroll delay={0.12}>
                <Box
                  sx={{
                    mb: 4,
                    display: "grid",
                    gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
                    gap: 1.5,
                  }}
                >
                  {[
                    {
                      label: "Games played",
                      value: MOCK_SCOUT.totalGames,
                      icon: TrendingUp,
                      color: "#F97316",
                    },
                    {
                      label: "Blunder rate",
                      value: MOCK_SCOUT.blunderRate,
                      suffix: "%",
                      icon: TrendingDown,
                      color: "#22c55e",
                    },
                    {
                      label: "Time trouble",
                      value: MOCK_SCOUT.timeTrouble,
                      suffix: "%",
                      icon: Clock,
                      color: "#FBBF24",
                    },
                    {
                      label: "Openings",
                      value: 47,
                      icon: Target,
                      color: "#FB923C",
                    },
                  ].map((s) => {
                    const Icon = s.icon;
                    return (
                      <Box
                        key={s.label}
                        sx={{
                          p: 2.5,
                          borderRadius: "1rem",
                          background: "rgba(20,22,28,0.5)",
                          border: "1px solid rgba(255,255,255,0.07)",
                          backdropFilter: "blur(10px)",
                          WebkitBackdropFilter: "blur(10px)",
                        }}
                      >
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: "8px",
                            background: `${s.color}22`,
                            border: `1px solid ${s.color}55`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            mb: 1.5,
                          }}
                        >
                          <Icon size={14} color={s.color} />
                        </Box>
                        <Typography
                          sx={{
                            fontSize: "1.6rem",
                            fontWeight: 800,
                            color: "rgba(255,255,255,0.94)",
                            lineHeight: 1,
                            letterSpacing: "-0.02em",
                          }}
                        >
                          <NumberTicker value={s.value} suffix={s.suffix ?? ""} />
                        </Typography>
                        <Typography
                          sx={{
                            mt: 1,
                            fontSize: "0.72rem",
                            color: "rgba(255,255,255,0.5)",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            fontWeight: 600,
                          }}
                        >
                          {s.label}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              </RevealOnScroll>

              {/* Top openings */}
              <RevealOnScroll delay={0.16}>
                <Box
                  sx={{
                    mb: 4,
                    p: 3.5,
                    borderRadius: "1.5rem",
                    background: "rgba(20,22,28,0.55)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5} mb={2.5}>
                    <Target size={14} color="#F97316" />
                    <Typography
                      sx={{
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        letterSpacing: "0.16em",
                        color: "rgba(255,255,255,0.55)",
                        textTransform: "uppercase",
                      }}
                    >
                      Most-played openings
                    </Typography>
                  </Stack>
                  <Stack spacing={1.5}>
                    {MOCK_SCOUT.topOpenings.map((o) => {
                      const total = o.asWhite + o.asBlack;
                      return (
                        <Box
                          key={o.name}
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "1.5fr 2fr auto",
                            gap: 2,
                            alignItems: "center",
                          }}
                        >
                          <Box>
                            <Typography
                              sx={{
                                fontSize: "0.95rem",
                                fontWeight: 600,
                                color: "rgba(255,255,255,0.9)",
                              }}
                            >
                              {o.name}
                            </Typography>
                            <Typography
                              sx={{
                                fontSize: "0.72rem",
                                color: "rgba(255,255,255,0.42)",
                                mt: 0.3,
                              }}
                            >
                              as {o.asWhite > 0 ? "White" : "Black"} ·{" "}
                              {total.toLocaleString()} games
                            </Typography>
                          </Box>
                          <Box
                            sx={{
                              height: 8,
                              borderRadius: "4px",
                              background: "rgba(255,255,255,0.05)",
                              overflow: "hidden",
                            }}
                          >
                            <Box
                              sx={{
                                width: `${o.winRate}%`,
                                height: "100%",
                                background:
                                  "linear-gradient(90deg, #F97316, #FBBF24)",
                              }}
                            />
                          </Box>
                          <Typography
                            sx={{
                              fontSize: "0.92rem",
                              fontWeight: 700,
                              color: "#FB923C",
                              fontFamily: "Monaco, Menlo, monospace",
                              textAlign: "right",
                            }}
                          >
                            {o.winRate}%
                          </Typography>
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              </RevealOnScroll>

              {/* Weaknesses + plan */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  gap: 2.5,
                  mb: 5,
                }}
              >
                <RevealOnScroll delay={0.2}>
                  <Box
                    sx={{
                      height: "100%",
                      p: 3.5,
                      borderRadius: "1.5rem",
                      background: "rgba(20,22,28,0.55)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1.5} mb={2.5}>
                      <AlertTriangle size={14} color="#EF4444" />
                      <Typography
                        sx={{
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          letterSpacing: "0.16em",
                          color: "rgba(255,255,255,0.55)",
                          textTransform: "uppercase",
                        }}
                      >
                        Weak spots
                      </Typography>
                    </Stack>
                    <Stack spacing={2}>
                      {MOCK_SCOUT.weaknesses.map((w) => (
                        <Box key={w.title} sx={{ display: "flex", gap: 1.5 }}>
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              mt: 0.8,
                              flexShrink: 0,
                              background:
                                w.severity === "high"
                                  ? "#ef4444"
                                  : w.severity === "medium"
                                  ? "#FBBF24"
                                  : "#22c55e",
                              boxShadow:
                                w.severity === "high"
                                  ? "0 0 8px rgba(239,68,68,0.6)"
                                  : "none",
                            }}
                          />
                          <Box>
                            <Typography
                              sx={{
                                fontSize: "0.95rem",
                                fontWeight: 700,
                                color: "rgba(255,255,255,0.92)",
                                mb: 0.5,
                              }}
                            >
                              {w.title}
                            </Typography>
                            <Typography
                              sx={{
                                fontSize: "0.85rem",
                                color: "rgba(255,255,255,0.58)",
                                lineHeight: 1.5,
                              }}
                            >
                              {w.desc}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                </RevealOnScroll>

                <RevealOnScroll delay={0.24}>
                  <Box
                    sx={{
                      position: "relative",
                      height: "100%",
                      p: 3.5,
                      borderRadius: "1.5rem",
                      background:
                        "linear-gradient(135deg, rgba(249,115,22,0.08), rgba(20,22,28,0.6))",
                      border: "1px solid rgba(249,115,22,0.25)",
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                      overflow: "hidden",
                    }}
                  >
                    <BorderBeam duration={11} />
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1.5}
                      mb={2.5}
                      sx={{ position: "relative", zIndex: 1 }}
                    >
                      <Lightbulb size={14} color="#F97316" />
                      <Typography
                        sx={{
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          letterSpacing: "0.16em",
                          color: "#FB923C",
                          textTransform: "uppercase",
                        }}
                      >
                        Your game plan
                      </Typography>
                    </Stack>
                    <Stack spacing={1.5} sx={{ position: "relative", zIndex: 1 }}>
                      {MOCK_SCOUT.gamePlan.map((step, i) => (
                        <Box
                          key={i}
                          sx={{
                            display: "flex",
                            gap: 1.5,
                            alignItems: "flex-start",
                          }}
                        >
                          <Box
                            sx={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              background:
                                "linear-gradient(135deg, #F97316, #EA580C)",
                              color: "#0A0A0A",
                              fontSize: "0.72rem",
                              fontWeight: 800,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              mt: 0.2,
                            }}
                          >
                            {i + 1}
                          </Box>
                          <Typography
                            sx={{
                              fontSize: "0.92rem",
                              color: "rgba(255,255,255,0.88)",
                              lineHeight: 1.55,
                            }}
                          >
                            {step}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                </RevealOnScroll>
              </Box>
            </>
          )}

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
            <Box>Pulled from Lichess + Chess.com public game history</Box>
            <Stack direction="row" spacing={2.5} alignItems="center">
              <Box>Engine-grounded by</Box>
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
