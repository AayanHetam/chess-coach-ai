"use client";

import {
  Box,
  Button,
  Stack,
  Typography,
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { motion } from "framer-motion";
import Head from "next/head";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Crown,
  Flame,
  Globe,
  Sparkles,
  Swords,
  Trophy,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { BorderBeam } from "@/components/ui/BorderBeam";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

const playTheme = createTheme({
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
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h1: { fontWeight: 800, letterSpacing: "-0.035em" },
    h2: { fontWeight: 700, letterSpacing: "-0.025em" },
    h3: { fontWeight: 700, letterSpacing: "-0.02em" },
    button: { textTransform: "none", fontWeight: 600 },
  },
});

interface Opponent {
  id: "stockfish" | "maia" | "lichess";
  name: string;
  tagline: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  iconColor: string;
  iconBg: string;
  iconBorder: string;
  ratingRange: string;
  description: string;
  badge?: string;
}

const OPPONENTS: Opponent[] = [
  {
    id: "stockfish",
    name: "Stockfish 17",
    tagline: "The strongest engine on earth",
    icon: Zap,
    iconColor: "#F97316",
    iconBg: "rgba(249,115,22,0.14)",
    iconBorder: "rgba(249,115,22,0.4)",
    ratingRange: "1100 – 3600 ELO",
    description:
      "Play the engine that crushes super-GMs. Pick any rating from beginner to silicon-perfect. Runs in your browser, no servers.",
    badge: "FREE",
  },
  {
    id: "maia",
    name: "Maia-2",
    tagline: "Plays like a human at your level",
    icon: Bot,
    iconColor: "#FB923C",
    iconBg: "rgba(251,146,60,0.14)",
    iconBorder: "rgba(251,146,60,0.4)",
    ratingRange: "1100 – 2200 ELO",
    description:
      "Neural-network bot trained on millions of human games. Makes human mistakes, plays human plans. The opponent that actually trains you.",
    badge: "RECOMMENDED",
  },
  {
    id: "lichess",
    name: "Live opponents",
    tagline: "Real humans on Lichess",
    icon: Globe,
    iconColor: "#FBBF24",
    iconBg: "rgba(251,191,36,0.14)",
    iconBorder: "rgba(251,191,36,0.4)",
    ratingRange: "Your Lichess rating",
    description:
      "OAuth into Lichess and find a game on the world's biggest free chess site — without leaving Chess Masti.",
  },
];

interface TimeControl {
  id: string;
  label: string;
  detail: string;
  category: "Bullet" | "Blitz" | "Rapid" | "Classical";
}

const TIME_CONTROLS: TimeControl[] = [
  { id: "1+0", label: "1+0", detail: "Bullet", category: "Bullet" },
  { id: "3+0", label: "3+0", detail: "Blitz", category: "Blitz" },
  { id: "3+2", label: "3+2", detail: "Blitz", category: "Blitz" },
  { id: "5+3", label: "5+3", detail: "Blitz", category: "Blitz" },
  { id: "10+0", label: "10+0", detail: "Rapid", category: "Rapid" },
  { id: "15+10", label: "15+10", detail: "Rapid", category: "Rapid" },
  { id: "30+0", label: "30+0", detail: "Classical", category: "Classical" },
];

const RECENT_GAMES = [
  { id: "1", opp: "Stockfish 1800", result: "Win", color: "white", ago: "3h", eval: "+2.3" },
  { id: "2", opp: "Maia 1500", result: "Win", color: "white", ago: "5h", eval: "+1.8" },
  { id: "3", opp: "Lichess · oltranslator", result: "Loss", color: "black", ago: "1d", eval: "−4.1" },
  { id: "4", opp: "Stockfish 2000", result: "Draw", color: "white", ago: "1d", eval: "+0.2" },
  { id: "5", opp: "Maia 1700", result: "Win", color: "black", ago: "2d", eval: "+3.4" },
];

function OpponentCard({
  opp,
  selected,
  onSelect,
}: {
  opp: Opponent;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = opp.icon;
  return (
    <motion.div
      whileHover={{ scale: 1.012, y: -3 }}
      transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
      onClick={onSelect}
      style={{ cursor: "pointer", display: "flex", height: "100%" }}
    >
      <Box
        sx={{
          position: "relative",
          flex: 1,
          borderRadius: "1.5rem",
          background: selected
            ? "linear-gradient(180deg, rgba(249,115,22,0.08), rgba(20,22,28,0.65))"
            : "rgba(20,22,28,0.5)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          border: selected
            ? "1px solid rgba(249,115,22,0.35)"
            : "1px solid rgba(255,255,255,0.08)",
          boxShadow: selected
            ? "0 16px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(249,115,22,0.18)"
            : "0 8px 32px rgba(0,0,0,0.3)",
          p: 3.5,
          overflow: "hidden",
          transition: "all 240ms ease",
        }}
      >
        {selected && <BorderBeam duration={10} />}
        <Stack
          direction="row"
          spacing={0}
          alignItems="flex-start"
          sx={{ position: "relative", zIndex: 1, mb: 2.5 }}
        >
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: "14px",
              background: opp.iconBg,
              border: `1px solid ${opp.iconBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon size={22} color={opp.iconColor} />
          </Box>
          <Box sx={{ flex: 1 }} />
          {opp.badge && (
            <Box
              sx={{
                px: 1,
                py: 0.4,
                borderRadius: "999px",
                background:
                  opp.badge === "RECOMMENDED"
                    ? "rgba(249,115,22,0.18)"
                    : "rgba(34,197,94,0.14)",
                border:
                  opp.badge === "RECOMMENDED"
                    ? "1px solid rgba(249,115,22,0.4)"
                    : "1px solid rgba(34,197,94,0.32)",
                fontSize: "0.62rem",
                fontWeight: 700,
                letterSpacing: "0.14em",
                color:
                  opp.badge === "RECOMMENDED" ? "#F97316" : "#22c55e",
              }}
            >
              {opp.badge}
            </Box>
          )}
        </Stack>

        <Typography
          variant="h3"
          sx={{
            position: "relative",
            zIndex: 1,
            fontSize: "1.4rem",
            color: "rgba(255,255,255,0.96)",
            mb: 0.5,
          }}
        >
          {opp.name}
        </Typography>
        <Typography
          sx={{
            position: "relative",
            zIndex: 1,
            fontSize: "0.85rem",
            color: "rgba(255,255,255,0.55)",
            mb: 2.5,
          }}
        >
          {opp.tagline}
        </Typography>
        <Typography
          sx={{
            position: "relative",
            zIndex: 1,
            color: "rgba(255,255,255,0.62)",
            fontSize: "0.92rem",
            lineHeight: 1.55,
            mb: 3,
          }}
        >
          {opp.description}
        </Typography>
        <Box
          sx={{
            position: "relative",
            zIndex: 1,
            pt: 2,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box>
            <Typography
              sx={{
                fontSize: "0.65rem",
                fontWeight: 700,
                letterSpacing: "0.14em",
                color: "rgba(255,255,255,0.4)",
                textTransform: "uppercase",
              }}
            >
              Rating range
            </Typography>
            <Typography
              sx={{
                fontSize: "0.88rem",
                fontWeight: 600,
                color: "rgba(255,255,255,0.88)",
                fontFamily: "Monaco, Menlo, monospace",
                mt: 0.5,
              }}
            >
              {opp.ratingRange}
            </Typography>
          </Box>
          <Box
            sx={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: selected
                ? "linear-gradient(135deg, #F97316, #EA580C)"
                : "rgba(255,255,255,0.06)",
              border: selected
                ? "1px solid rgba(249,115,22,0.5)"
                : "1px solid rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {selected && (
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", background: "#0A0A0A" }} />
            )}
          </Box>
        </Box>
      </Box>
    </motion.div>
  );
}

export default function PreviewPlayPage() {
  const [selectedOpp, setSelectedOpp] = useState<Opponent["id"]>("maia");
  const [selectedTime, setSelectedTime] = useState("10+0");
  const [color, setColor] = useState<"white" | "random" | "black">("random");

  const selectedOpponent = OPPONENTS.find((o) => o.id === selectedOpp)!;

  return (
    <ThemeProvider theme={playTheme}>
      <Head>
        <title>Chess Masti — Play</title>
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
        <NavPill active="play" badge={{ label: "Play" }} />

        <Box sx={{ maxWidth: 1400, mx: "auto" }}>
          <RevealOnScroll>
            <Box sx={{ maxWidth: 760, mb: 6 }}>
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
                  <Crown size={13} color="#F97316" />
                  <Typography
                    sx={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      letterSpacing: "0.18em",
                      color: "rgba(255,255,255,0.78)",
                      textTransform: "uppercase",
                    }}
                  >
                    Pick your fight
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
                Pick your opponent.{" "}
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
                  Play with intent.
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
                Three flavors of training partner. Engine that crushes, bot that
                mimics, or live humans. After every game, the coach explains what
                you missed — engine-grounded.
              </Typography>
            </Box>
          </RevealOnScroll>

          {/* Opponent cards */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
              gap: 2.5,
              mb: 4,
            }}
          >
            {OPPONENTS.map((opp, i) => (
              <RevealOnScroll key={opp.id} delay={i * 0.08}>
                <Box sx={{ height: "100%", display: "flex" }}>
                  <OpponentCard
                    opp={opp}
                    selected={selectedOpp === opp.id}
                    onSelect={() => setSelectedOpp(opp.id)}
                  />
                </Box>
              </RevealOnScroll>
            ))}
          </Box>

          {/* Settings strip */}
          <RevealOnScroll delay={0.2}>
            <Box
              sx={{
                p: { xs: 3, md: 4 },
                borderRadius: "1.5rem",
                background:
                  "linear-gradient(135deg, rgba(249,115,22,0.06), rgba(20,22,28,0.6))",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                border: "1px solid rgba(255,255,255,0.08)",
                mb: 4,
              }}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={4}
                alignItems={{ md: "center" }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography
                    sx={{
                      fontSize: "0.66rem",
                      fontWeight: 700,
                      letterSpacing: "0.16em",
                      color: "rgba(255,255,255,0.5)",
                      textTransform: "uppercase",
                      mb: 1.5,
                    }}
                  >
                    Time control
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                    {TIME_CONTROLS.map((tc) => (
                      <Box
                        key={tc.id}
                        onClick={() => setSelectedTime(tc.id)}
                        sx={{
                          cursor: "pointer",
                          px: 1.5,
                          py: 1,
                          borderRadius: "10px",
                          background:
                            selectedTime === tc.id
                              ? "rgba(249,115,22,0.18)"
                              : "rgba(255,255,255,0.04)",
                          border:
                            selectedTime === tc.id
                              ? "1px solid rgba(249,115,22,0.4)"
                              : "1px solid rgba(255,255,255,0.08)",
                          transition: "all 180ms ease",
                          textAlign: "center",
                          minWidth: 64,
                          "&:hover": {
                            background:
                              selectedTime === tc.id
                                ? "rgba(249,115,22,0.22)"
                                : "rgba(255,255,255,0.07)",
                          },
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: "0.92rem",
                            fontWeight: 700,
                            color:
                              selectedTime === tc.id
                                ? "#FB923C"
                                : "rgba(255,255,255,0.9)",
                            fontFamily: "Monaco, Menlo, monospace",
                            lineHeight: 1,
                          }}
                        >
                          {tc.label}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: "0.6rem",
                            color: "rgba(255,255,255,0.45)",
                            mt: 0.4,
                            letterSpacing: "0.08em",
                          }}
                        >
                          {tc.detail}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>

                <Box sx={{ width: { xs: "100%", md: "auto" } }}>
                  <Typography
                    sx={{
                      fontSize: "0.66rem",
                      fontWeight: 700,
                      letterSpacing: "0.16em",
                      color: "rgba(255,255,255,0.5)",
                      textTransform: "uppercase",
                      mb: 1.5,
                    }}
                  >
                    Your color
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    {(["white", "random", "black"] as const).map((c) => (
                      <Box
                        key={c}
                        onClick={() => setColor(c)}
                        sx={{
                          cursor: "pointer",
                          width: 56,
                          height: 56,
                          borderRadius: "12px",
                          background:
                            color === c
                              ? "rgba(249,115,22,0.18)"
                              : "rgba(255,255,255,0.04)",
                          border:
                            color === c
                              ? "1px solid rgba(249,115,22,0.4)"
                              : "1px solid rgba(255,255,255,0.08)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 180ms ease",
                        }}
                      >
                        <Box
                          sx={{
                            width: 24,
                            height: 24,
                            borderRadius: c === "random" ? "6px" : "50%",
                            background:
                              c === "white"
                                ? "#F0D9B5"
                                : c === "black"
                                ? "#3D2F22"
                                : "linear-gradient(135deg, #F0D9B5 50%, #3D2F22 50%)",
                            border: "1px solid rgba(255,255,255,0.1)",
                          }}
                        />
                      </Box>
                    ))}
                  </Stack>
                </Box>
              </Stack>

              <Box sx={{ mt: 4, display: "flex", justifyContent: "flex-end" }}>
                <Button
                  variant="contained"
                  endIcon={<ArrowRight size={18} />}
                  sx={{
                    bgcolor: "#F97316",
                    color: "#0A0A0A",
                    fontWeight: 700,
                    fontSize: "1rem",
                    px: 4,
                    py: 1.6,
                    borderRadius: "999px",
                    boxShadow:
                      "0 0 0 1px rgba(249,115,22,0.5), 0 8px 32px rgba(249,115,22,0.25)",
                    "&:hover": {
                      bgcolor: "#FB923C",
                      transform: "translateY(-1px)",
                    },
                  }}
                >
                  Play {selectedOpponent.name} · {selectedTime}
                </Button>
              </Box>
            </Box>
          </RevealOnScroll>

          {/* Recent games */}
          <RevealOnScroll delay={0.25}>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1.5} mb={2}>
                <Trophy size={16} color="#F97316" />
                <Typography
                  sx={{
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    color: "rgba(255,255,255,0.55)",
                    textTransform: "uppercase",
                  }}
                >
                  Recent games
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Typography
                  component={Link}
                  href="/preview/analysis"
                  sx={{
                    fontSize: "0.82rem",
                    color: "rgba(255,255,255,0.55)",
                    textDecoration: "none",
                    "&:hover": { color: "#FB923C" },
                  }}
                >
                  Analyze →
                </Typography>
              </Stack>
              <Stack spacing={1}>
                {RECENT_GAMES.map((g) => (
                  <Box
                    key={g.id}
                    sx={{
                      px: 2.5,
                      py: 1.75,
                      borderRadius: "12px",
                      background: "rgba(20,22,28,0.5)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(80px, 100px) 1fr 80px 80px 60px",
                      gap: 2,
                      alignItems: "center",
                      transition: "all 180ms ease",
                      "&:hover": {
                        background: "rgba(20,22,28,0.65)",
                        borderColor: "rgba(255,255,255,0.12)",
                      },
                    }}
                  >
                    <Box
                      sx={{
                        px: 1.25,
                        py: 0.4,
                        borderRadius: "999px",
                        background:
                          g.result === "Win"
                            ? "rgba(34,197,94,0.14)"
                            : g.result === "Loss"
                            ? "rgba(239,68,68,0.14)"
                            : "rgba(255,255,255,0.06)",
                        border:
                          g.result === "Win"
                            ? "1px solid rgba(34,197,94,0.3)"
                            : g.result === "Loss"
                            ? "1px solid rgba(239,68,68,0.3)"
                            : "1px solid rgba(255,255,255,0.1)",
                        textAlign: "center",
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color:
                          g.result === "Win"
                            ? "#86efac"
                            : g.result === "Loss"
                            ? "#fca5a5"
                            : "rgba(255,255,255,0.7)",
                      }}
                    >
                      {g.result}
                    </Box>
                    <Typography
                      sx={{
                        fontSize: "0.92rem",
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.9)",
                      }}
                    >
                      {g.opp}
                    </Typography>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.75,
                        color: "rgba(255,255,255,0.5)",
                        fontSize: "0.82rem",
                      }}
                    >
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: g.color === "white" ? "#F0D9B5" : "#3D2F22",
                          border: "1px solid rgba(255,255,255,0.15)",
                        }}
                      />
                      {g.color}
                    </Box>
                    <Typography
                      sx={{
                        fontSize: "0.82rem",
                        color: "rgba(255,255,255,0.6)",
                        fontFamily: "Monaco, Menlo, monospace",
                        textAlign: "right",
                      }}
                    >
                      {g.eval}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "0.78rem",
                        color: "rgba(255,255,255,0.4)",
                        textAlign: "right",
                      }}
                    >
                      {g.ago}
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
            <Stack direction="row" spacing={2} alignItems="center">
              <Swords size={13} />
              <Box>Maia-2 is the bot that actually improves your rating.</Box>
            </Stack>
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
