"use client";

import { Box, Button, Stack, Typography } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { motion } from "framer-motion";
import Head from "next/head";
import {
  Award,
  Brain,
  Calendar,
  Crown,
  Edit3,
  Eye,
  Flame,
  Heart,
  Palette,
  Sparkles,
  Swords,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { BorderBeam } from "@/components/ui/BorderBeam";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import { NumberTicker } from "@/components/ui/NumberTicker";
import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

const profileTheme = createTheme({
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

const PROFILE = {
  name: "Aayan H.",
  handle: "aayanmasti",
  rating: 1720,
  ratingDelta: 47,
  joined: "March 2025",
  streak: 47,
  totalPuzzles: 1247,
  totalGames: 312,
  winRate: 58,
};

const COACH_PERSONALITIES = [
  { id: "tough", label: "Tough Love", icon: Swords, desc: "Brutally honest, no participation trophies" },
  { id: "patient", label: "Patient Mentor", icon: Heart, desc: "Encouraging, walks you through gently", default: true },
  { id: "scholar", label: "Scholar", icon: Brain, desc: "Deep theory, historical context, opening lore" },
  { id: "tactician", label: "Tactician", icon: Zap, desc: "Sharp, pattern-first, motif-obsessed" },
];

const BOARD_THEMES = [
  { id: "wood", label: "Wood", dark: "#5C4630", light: "#F0D9B5", current: true },
  { id: "slate", label: "Slate", dark: "#1F2A3A", light: "#5E7493" },
  { id: "moss", label: "Moss", dark: "#769656", light: "#EEEED2" },
  { id: "obsidian", label: "Obsidian", dark: "#1A1A1A", light: "#3A3A3A" },
];

const RECENT_ACTIVITY = [
  { type: "puzzle", title: "Solved Knight Fork (1620)", time: "2m", icon: Flame, color: "#22c55e" },
  { type: "game", title: "Beat Maia-1700 (white)", time: "15m", icon: Trophy, color: "#F97316" },
  { type: "puzzle", title: "Failed Pin (1820)", time: "32m", icon: Award, color: "#ef4444" },
  { type: "lesson", title: "Coach: Italian Game refresher", time: "1h", icon: Brain, color: "#FB923C" },
  { type: "game", title: "Analyzed Kasparov vs Topalov 1999", time: "2h", icon: Eye, color: "#FBBF24" },
];

export default function PreviewProfilePage() {
  const [coach, setCoach] = useState("patient");
  const [theme, setTheme] = useState("wood");

  return (
    <ThemeProvider theme={profileTheme}>
      <Head>
        <title>Chess Masti — Profile</title>
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
        <NavPill active="profile" badge={{ label: "Profile" }} />

        <Box sx={{ maxWidth: 1400, mx: "auto" }}>
          {/* Profile hero */}
          <RevealOnScroll>
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
                mb: 4,
              }}
            >
              <BorderBeam duration={14} />
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={4}
                alignItems={{ md: "center" }}
                sx={{ position: "relative", zIndex: 1 }}
              >
                <Box
                  sx={{
                    width: 120,
                    height: 120,
                    borderRadius: "50%",
                    background:
                      "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "3.4rem",
                    fontWeight: 800,
                    color: "#0A0A0A",
                    flexShrink: 0,
                    boxShadow:
                      "0 0 32px rgba(249,115,22,0.4), inset 0 -8px 16px rgba(0,0,0,0.2)",
                  }}
                >
                  {PROFILE.name.charAt(0)}
                </Box>

                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography
                      variant="h1"
                      sx={{
                        fontSize: { xs: "2rem", md: "2.6rem" },
                        color: "rgba(255,255,255,0.96)",
                        lineHeight: 1,
                      }}
                    >
                      {PROFILE.name}
                    </Typography>
                    <Box
                      sx={{
                        px: 1.25,
                        py: 0.4,
                        borderRadius: "999px",
                        background: "rgba(249,115,22,0.15)",
                        border: "1px solid rgba(249,115,22,0.35)",
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          letterSpacing: "0.12em",
                          color: "#FB923C",
                        }}
                      >
                        PRO
                      </Typography>
                    </Box>
                  </Stack>
                  <Typography
                    sx={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: "0.95rem",
                      fontFamily: "Monaco, Menlo, monospace",
                      mb: 2,
                    }}
                  >
                    @{PROFILE.handle} · joined {PROFILE.joined}
                  </Typography>
                  <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap" }}>
                    <Box>
                      <Stack direction="row" alignItems="baseline" spacing={1}>
                        <Typography
                          sx={{
                            fontSize: "2rem",
                            fontWeight: 800,
                            color: "rgba(255,255,255,0.96)",
                            lineHeight: 1,
                            fontFamily: "Monaco, Menlo, monospace",
                          }}
                        >
                          {PROFILE.rating}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            color: "#22c55e",
                          }}
                        >
                          +{PROFILE.ratingDelta}
                        </Typography>
                      </Stack>
                      <Typography
                        sx={{
                          fontSize: "0.66rem",
                          letterSpacing: "0.14em",
                          color: "rgba(255,255,255,0.5)",
                          textTransform: "uppercase",
                          mt: 0.4,
                          fontWeight: 700,
                        }}
                      >
                        Current rating
                      </Typography>
                    </Box>
                  </Stack>
                </Box>

                <Stack direction="row" spacing={1.5}>
                  <Button
                    variant="outlined"
                    startIcon={<Edit3 size={16} />}
                    sx={{
                      color: "rgba(255,255,255,0.85)",
                      borderColor: "rgba(255,255,255,0.18)",
                      fontWeight: 600,
                      px: 2.5,
                      py: 1.2,
                      borderRadius: "999px",
                    }}
                  >
                    Edit profile
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </RevealOnScroll>

          {/* Stats grid */}
          <RevealOnScroll delay={0.08}>
            <Box
              sx={{
                mb: 4,
                display: "grid",
                gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
                gap: 1.5,
              }}
            >
              {[
                { value: PROFILE.streak, label: "Day streak", icon: Flame, color: "#F97316" },
                { value: PROFILE.totalPuzzles, label: "Puzzles solved", icon: Brain, color: "#FB923C" },
                { value: PROFILE.totalGames, label: "Games played", icon: Swords, color: "#FBBF24" },
                { value: PROFILE.winRate, suffix: "%", label: "Win rate", icon: Trophy, color: "#22c55e" },
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
                        fontSize: "1.8rem",
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

          {/* Coach personality + Theme picker (two cards) */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr" },
              gap: 2.5,
              mb: 4,
            }}
          >
            <RevealOnScroll delay={0.12}>
              <Box
                sx={{
                  p: 3.5,
                  borderRadius: "1.5rem",
                  background: "rgba(20,22,28,0.55)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  height: "100%",
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1.5} mb={2.5}>
                  <Brain size={14} color="#F97316" />
                  <Typography
                    sx={{
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      letterSpacing: "0.16em",
                      color: "rgba(255,255,255,0.55)",
                      textTransform: "uppercase",
                    }}
                  >
                    Coach personality
                  </Typography>
                </Stack>
                <Stack spacing={1.25}>
                  {COACH_PERSONALITIES.map((p) => {
                    const Icon = p.icon;
                    const active = coach === p.id;
                    return (
                      <Box
                        key={p.id}
                        onClick={() => setCoach(p.id)}
                        sx={{
                          cursor: "pointer",
                          p: 2,
                          borderRadius: "12px",
                          background: active
                            ? "linear-gradient(180deg, rgba(249,115,22,0.1), rgba(20,22,28,0.6))"
                            : "rgba(255,255,255,0.03)",
                          border: active
                            ? "1px solid rgba(249,115,22,0.35)"
                            : "1px solid rgba(255,255,255,0.07)",
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                          transition: "all 180ms ease",
                          "&:hover": {
                            background: active
                              ? "linear-gradient(180deg, rgba(249,115,22,0.14), rgba(20,22,28,0.65))"
                              : "rgba(255,255,255,0.06)",
                          },
                        }}
                      >
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: "10px",
                            background: active
                              ? "rgba(249,115,22,0.18)"
                              : "rgba(255,255,255,0.04)",
                            border: active
                              ? "1px solid rgba(249,115,22,0.4)"
                              : "1px solid rgba(255,255,255,0.08)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Icon size={16} color={active ? "#F97316" : "rgba(255,255,255,0.7)"} />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography
                            sx={{
                              fontSize: "0.95rem",
                              fontWeight: 700,
                              color: "rgba(255,255,255,0.92)",
                            }}
                          >
                            {p.label}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: "0.78rem",
                              color: "rgba(255,255,255,0.5)",
                              mt: 0.3,
                            }}
                          >
                            {p.desc}
                          </Typography>
                        </Box>
                        {active && (
                          <Box
                            sx={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#F97316",
                              boxShadow: "0 0 8px rgba(249,115,22,0.6)",
                            }}
                          />
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            </RevealOnScroll>

            <RevealOnScroll delay={0.16}>
              <Box
                sx={{
                  p: 3.5,
                  borderRadius: "1.5rem",
                  background: "rgba(20,22,28,0.55)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  height: "100%",
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1.5} mb={2.5}>
                  <Palette size={14} color="#F97316" />
                  <Typography
                    sx={{
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      letterSpacing: "0.16em",
                      color: "rgba(255,255,255,0.55)",
                      textTransform: "uppercase",
                    }}
                  >
                    Board theme
                  </Typography>
                </Stack>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 1.5,
                  }}
                >
                  {BOARD_THEMES.map((t) => {
                    const active = theme === t.id;
                    return (
                      <Box
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        sx={{
                          cursor: "pointer",
                          p: 1.5,
                          borderRadius: "12px",
                          background: active
                            ? "rgba(249,115,22,0.08)"
                            : "rgba(255,255,255,0.03)",
                          border: active
                            ? "1px solid rgba(249,115,22,0.32)"
                            : "1px solid rgba(255,255,255,0.07)",
                          transition: "all 180ms ease",
                        }}
                      >
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, 1fr)",
                            gridTemplateRows: "repeat(4, 1fr)",
                            aspectRatio: "1",
                            borderRadius: "8px",
                            overflow: "hidden",
                            mb: 1.25,
                            border: "1px solid rgba(255,255,255,0.05)",
                          }}
                        >
                          {Array.from({ length: 16 }).map((_, i) => {
                            const row = Math.floor(i / 4);
                            const col = i % 4;
                            const isLight = (row + col) % 2 === 0;
                            return (
                              <Box
                                key={i}
                                sx={{
                                  background: isLight ? t.light : t.dark,
                                }}
                              />
                            );
                          })}
                        </Box>
                        <Typography
                          sx={{
                            fontSize: "0.82rem",
                            fontWeight: 700,
                            color: active ? "#FB923C" : "rgba(255,255,255,0.85)",
                            textAlign: "center",
                          }}
                        >
                          {t.label}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            </RevealOnScroll>
          </Box>

          {/* Recent activity */}
          <RevealOnScroll delay={0.2}>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1.5} mb={2}>
                <Calendar size={14} color="#F97316" />
                <Typography
                  sx={{
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    color: "rgba(255,255,255,0.55)",
                    textTransform: "uppercase",
                  }}
                >
                  Recent activity
                </Typography>
              </Stack>
              <Stack spacing={1}>
                {RECENT_ACTIVITY.map((a, i) => {
                  const Icon = a.icon;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.3 }}
                    >
                      <Box
                        sx={{
                          px: 2.5,
                          py: 1.75,
                          borderRadius: "12px",
                          background: "rgba(20,22,28,0.5)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                        }}
                      >
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: "8px",
                            background: `${a.color}22`,
                            border: `1px solid ${a.color}55`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Icon size={14} color={a.color} />
                        </Box>
                        <Typography
                          sx={{
                            flex: 1,
                            fontSize: "0.92rem",
                            color: "rgba(255,255,255,0.88)",
                          }}
                        >
                          {a.title}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: "0.78rem",
                            color: "rgba(255,255,255,0.4)",
                            fontFamily: "Monaco, Menlo, monospace",
                          }}
                        >
                          {a.time}
                        </Typography>
                      </Box>
                    </motion.div>
                  );
                })}
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
            <Box>Your preferences sync across all your devices automatically</Box>
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
