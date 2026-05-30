"use client";

import { Box, Button, Stack, Typography } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import Head from "next/head";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Clock,
  GraduationCap,
  Sparkles,
  Target,
} from "lucide-react";
import { BorderBeam } from "@/components/ui/BorderBeam";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

const learnTheme = createTheme({
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

const CURRICULA = [
  {
    id: "openings-white",
    title: "Open repertoire as White",
    desc: "1.e4 fundamentals — Italian, Ruy López, Scotch, Vienna. Pick a system and learn the ideas, not just the moves.",
    icon: Target,
    color: "#F97316",
    chapters: 12,
    minutes: 180,
  },
  {
    id: "openings-black",
    title: "Solid repertoire as Black",
    desc: "Counter every White first move with a coherent system: Sicilian against 1.e4, Nimzo + QGD against 1.d4.",
    icon: Target,
    color: "#FB923C",
    chapters: 14,
    minutes: 220,
  },
  {
    id: "endgames-essential",
    title: "Essential endgames",
    desc: "Lucena, Philidor, opposition, square rule. The 30 endgame patterns that decide 80% of equal positions.",
    icon: GraduationCap,
    color: "#FBBF24",
    chapters: 9,
    minutes: 140,
  },
  {
    id: "tactics-motifs",
    title: "Tactical motifs, drilled",
    desc: "Forks, pins, skewers, deflection, decoy, discovered attack. Pattern recognition at speed.",
    icon: Sparkles,
    color: "#EA580C",
    chapters: 8,
    minutes: 160,
  },
];

export default function PreviewOpeningsPage() {
  return (
    <ThemeProvider theme={learnTheme}>
      <Head>
        <title>Chess Masti — Learn</title>
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
        <NavPill active="openings" />

        <Box sx={{ maxWidth: 1400, mx: "auto" }}>
          <RevealOnScroll>
            <Box sx={{ maxWidth: 780, mb: 6 }}>
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
                  <BookOpen size={13} color="#F97316" />
                  <Typography
                    sx={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      letterSpacing: "0.18em",
                      color: "rgba(255,255,255,0.78)",
                      textTransform: "uppercase",
                    }}
                  >
                    Learn · Theory
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
                Theory you can{" "}
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
                  actually remember.
                </Box>
              </Typography>
              <Typography
                sx={{
                  mt: 3,
                  fontSize: { xs: "1rem", md: "1.1rem" },
                  lineHeight: 1.55,
                  color: "rgba(255,255,255,0.66)",
                }}
              >
                Most courses dump 200 variations on you and expect you to memorize.
                We teach the underlying ideas, then the coach drills you on
                positions until the moves feel obvious. Engine-grounded. Free.
              </Typography>
            </Box>
          </RevealOnScroll>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
              gap: 2.5,
              mb: 5,
            }}
          >
            {CURRICULA.map((c, i) => {
              const Icon = c.icon;
              return (
                <RevealOnScroll key={c.id} delay={i * 0.08}>
                  <Box
                    sx={{
                      position: "relative",
                      height: "100%",
                      borderRadius: "1.5rem",
                      background: "rgba(20,22,28,0.55)",
                      backdropFilter: "blur(14px) saturate(140%)",
                      WebkitBackdropFilter: "blur(14px) saturate(140%)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                      p: 3.5,
                      transition: "all 220ms ease",
                      "&:hover": {
                        background: "rgba(20,22,28,0.7)",
                        borderColor: "rgba(249,115,22,0.2)",
                        transform: "translateY(-2px)",
                      },
                    }}
                  >
                    <Stack
                      direction="row"
                      alignItems="flex-start"
                      spacing={0}
                      mb={2.5}
                    >
                      <Box
                        sx={{
                          width: 44,
                          height: 44,
                          borderRadius: "12px",
                          background: `${c.color}22`,
                          border: `1px solid ${c.color}55`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon size={20} color={c.color} />
                      </Box>
                      <Box sx={{ flex: 1 }} />
                      <Box
                        sx={{
                          px: 1.25,
                          py: 0.4,
                          borderRadius: "999px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          letterSpacing: "0.14em",
                          color: "rgba(255,255,255,0.55)",
                          textTransform: "uppercase",
                        }}
                      >
                        Coming soon
                      </Box>
                    </Stack>
                    <Typography
                      variant="h3"
                      sx={{
                        fontSize: "1.3rem",
                        color: "rgba(255,255,255,0.96)",
                        mb: 1.5,
                      }}
                    >
                      {c.title}
                    </Typography>
                    <Typography
                      sx={{
                        color: "rgba(255,255,255,0.6)",
                        fontSize: "0.95rem",
                        lineHeight: 1.55,
                        mb: 3,
                      }}
                    >
                      {c.desc}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={3}
                      sx={{
                        pt: 2,
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.5)",
                        fontSize: "0.82rem",
                      }}
                    >
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <BookOpen size={13} />
                        <Box>{c.chapters} chapters</Box>
                      </Stack>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Clock size={13} />
                        <Box>~{c.minutes} min total</Box>
                      </Stack>
                    </Stack>
                  </Box>
                </RevealOnScroll>
              );
            })}
          </Box>

          <RevealOnScroll delay={0.2}>
            <Box
              sx={{
                position: "relative",
                borderRadius: "2rem",
                background:
                  "linear-gradient(135deg, rgba(249,115,22,0.08), rgba(20,22,28,0.6))",
                backdropFilter: "blur(16px) saturate(150%)",
                WebkitBackdropFilter: "blur(16px) saturate(150%)",
                border: "1px solid rgba(249,115,22,0.2)",
                boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
                overflow: "hidden",
                p: { xs: 4, md: 6 },
                textAlign: "center",
                mb: 4,
              }}
            >
              <BorderBeam duration={14} />
              <Typography
                sx={{
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  color: "#FB923C",
                  textTransform: "uppercase",
                  mb: 2,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                Available right now
              </Typography>
              <Typography
                variant="h2"
                sx={{
                  fontSize: { xs: "1.8rem", md: "2.4rem" },
                  color: "rgba(255,255,255,0.96)",
                  mb: 2.5,
                  lineHeight: 1.15,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                Don't wait for the curriculum.{" "}
                <Box
                  component="span"
                  sx={{
                    background:
                      "linear-gradient(135deg, #F97316, #FBBF24)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Start learning today.
                </Box>
              </Typography>
              <Typography
                sx={{
                  color: "rgba(255,255,255,0.65)",
                  fontSize: "1rem",
                  maxWidth: 600,
                  mx: "auto",
                  mb: 3.5,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                Paste any game into the Analyze tab. The AI coach walks you
                through every interesting position with the same depth as a
                themed course.
              </Typography>
              <Stack
                direction="row"
                spacing={2}
                justifyContent="center"
                sx={{ flexWrap: "wrap", position: "relative", zIndex: 1 }}
              >
                <Button
                  component={Link}
                  href="/analysis"
                  variant="contained"
                  endIcon={<ArrowRight size={18} />}
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
                  Analyze a game
                </Button>
                <Button
                  component={Link}
                  href="/preview/practice"
                  variant="outlined"
                  sx={{
                    color: "rgba(255,255,255,0.92)",
                    borderColor: "rgba(255,255,255,0.18)",
                    fontWeight: 600,
                    px: 3,
                    py: 1.4,
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  Daily puzzle
                </Button>
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
            <Box>Free chess education for every player priced out of a coach</Box>
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
