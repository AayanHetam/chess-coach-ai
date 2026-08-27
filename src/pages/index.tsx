"use client";

import { Chess, type Square } from "chess.js";
import { Box, Button, Stack, Typography } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { motion } from "framer-motion";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clipboard,
  Cpu,
  Crosshair,
  Download,
  Flame,
  Globe,
  GraduationCap,
  Lightbulb,
  Link2,
  Minus,
  MousePointerClick,
  Puzzle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wrench,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { DrawShape } from "@/components/ui/ChessgroundBoard";
import { surfaceAccent, type Accent } from "@/components/ui/accents";

const ChessgroundBoard = dynamic(
  () =>
    import("@/components/ui/ChessgroundBoard").then((m) => m.ChessgroundBoard),
  { ssr: false }
);

// Board square colors for puzzle demo (matches analysis page)
const PUZZLE_DARK = "#5C4630";
const PUZZLE_LIGHT = "#F0D9B5";
import { BentoCard } from "@/components/ui/BentoCard";
import { BorderBeam } from "@/components/ui/BorderBeam";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import { NumberTicker } from "@/components/ui/NumberTicker";
import { RevealOnScroll } from "@/components/ui/RevealOnScroll";
import { InternalHomeCard } from "@/components/intern/InternalHomeCard";
import { useAuth } from "@/contexts/AuthContext";
import { startPlanHref } from "@/lib/onboarding/quizGate";
import { homePageJsonLd } from "@/app/_seo/JsonLd";

const HOME_TITLE = "Chess Masti AI — engine-grounded chess coaching, free";
const HOME_DESC =
  "AI chess coach: Stockfish 17 evaluates first, Claude explains, a hallucination validator checks every claim. 100,000+ Lichess puzzles in a Neo4j graph. Free.";
const HOME_OG_IMAGE = "https://chessmasti.com/social-networks-1200x630.png";

/**
 * Identity accents for the product surfaces this page advertises — the same
 * colours the in-app nav and /plan wear (SURFACE_ACCENTS), so the landing
 * page teaches the site's colour language before the visitor signs in.
 * Ember stays the action colour: the hero, every CTA, and the coach itself
 * keep their palette untouched. All values are static constants, so nothing
 * here can diverge between prerender and hydration.
 */
const PRACTICE_ACCENT = surfaceAccent("practice"); // violet
const ANALYSIS_ACCENT = surfaceAccent("analysis"); // cyan
const PLAY_ACCENT = surfaceAccent("play"); // jade
const SCOUT_ACCENT = surfaceAccent("scout"); // rose

/**
 * The /plan GlassCard accent recipe, shaped for BentoCard's `style` prop:
 * faint radial tint at the card top, accent border, soft glow. The glass
 * base stays BentoCard's own rgba(20,22,28,0.55).
 */
function bentoAccentStyle(a: Accent): CSSProperties {
  return {
    background: `radial-gradient(120% 55% at 50% 0%, ${a.tint}, transparent 70%), linear-gradient(180deg, rgba(20,22,28,0.55), rgba(20,22,28,0.55))`,
    border: `1px solid ${a.border}`,
    boxShadow: `0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06), ${a.glow}`,
  };
}

/** Decorative top hairline from the /plan card treatment (its ::before). */
function AccentHairline({ a }: { a: Accent }) {
  return (
    <Box
      aria-hidden
      sx={{
        position: "absolute",
        top: 0,
        left: "8%",
        right: "8%",
        height: "1.5px",
        background: `linear-gradient(90deg, transparent, ${a.base}, transparent)`,
        opacity: 0.65,
        pointerEvents: "none",
      }}
    />
  );
}

const launchTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#F97316" },
    background: { default: "#08090C", paper: "rgba(20,22,28,0.55)" },
    text: {
      primary: "rgba(255,255,255,0.94)",
      secondary: "rgba(255,255,255,0.62)",
    },
  },
  typography: {
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h1: {
      fontWeight: 800,
      letterSpacing: "-0.035em",
      lineHeight: 1.02,
    },
    h2: { fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.08 },
    h3: { fontWeight: 700, letterSpacing: "-0.02em" },
    overline: {
      letterSpacing: "0.18em",
      fontWeight: 700,
      fontSize: "0.72rem",
    },
    button: {
      textTransform: "none",
      fontWeight: 600,
      letterSpacing: "0.005em",
    },
  },
});

function EyebrowBadge({ children }: { children: ReactNode }) {
  return (
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
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <Sparkles size={13} color="#F97316" />
      <Typography
        variant="overline"
        sx={{ color: "rgba(255,255,255,0.78)", lineHeight: 1 }}
      >
        {children}
      </Typography>
    </Box>
  );
}

function PrimaryCTA({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      component={Link}
      href={href}
      variant="contained"
      disableElevation
      endIcon={<ArrowRight size={18} />}
      sx={{
        bgcolor: "#F97316",
        color: "#0A0A0A",
        fontWeight: 700,
        fontSize: "0.95rem",
        px: 3,
        py: 1.4,
        borderRadius: "999px",
        boxShadow:
          "0 0 0 1px rgba(249,115,22,0.5), 0 8px 32px rgba(249,115,22,0.25)",
        transition: "all 220ms cubic-bezier(0.22, 0.61, 0.36, 1)",
        "&:hover": {
          bgcolor: "#FB923C",
          transform: "translateY(-1px)",
          boxShadow:
            "0 0 0 1px rgba(249,115,22,0.7), 0 12px 40px rgba(249,115,22,0.4)",
        },
      }}
    >
      {children}
    </Button>
  );
}

/**
 * The "Start your plan" hero CTA, routed by onboarding state.
 *
 * Visitors and not-yet-personalized users go into the quiz; anyone who has
 * already answered it goes straight to /plan. Before this, both landing CTAs
 * pointed at /onboarding unconditionally, so a returning user's most obvious
 * click re-ran the quiz they had already completed.
 *
 * SSR renders the /onboarding href (auth is still `loading` on first paint),
 * which is also the right target for the crawlers that index this page.
 */
function StartPlanCTA() {
  const { user, profile, loading } = useAuth();
  const href = startPlanHref({
    loading,
    hasUser: !!user,
    onboardingCompletedAt: profile?.onboardingCompletedAt,
  });
  return <PrimaryCTA href={href}>Start your plan</PrimaryCTA>;
}

function GhostCTA({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      component={Link}
      href={href}
      variant="outlined"
      sx={{
        color: "rgba(255,255,255,0.92)",
        borderColor: "rgba(255,255,255,0.18)",
        fontWeight: 600,
        fontSize: "0.95rem",
        px: 3,
        py: 1.4,
        borderRadius: "999px",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        background: "rgba(255,255,255,0.03)",
        transition: "all 220ms cubic-bezier(0.22, 0.61, 0.36, 1)",
        "&:hover": {
          borderColor: "rgba(255,255,255,0.32)",
          background: "rgba(255,255,255,0.06)",
          transform: "translateY(-1px)",
        },
      }}
    >
      {children}
    </Button>
  );
}

function GlassChatPreview() {
  const messages = [
    {
      role: "user" as const,
      text: "Was 14.Bxh6 sound?",
    },
    {
      role: "ai" as const,
      text: "Stockfish says +1.8 — sharp but holding. The cleaner path was 14.Nd5 first; you'd be +2.4 with no defensive work. Want the full line?",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1], delay: 0.2 }}
      style={{
        position: "relative",
        borderRadius: "1.5rem",
        background: "rgba(20,22,28,0.55)",
        backdropFilter: "blur(18px) saturate(160%)",
        WebkitBackdropFilter: "blur(18px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow:
          "0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.08)",
        padding: "28px",
        overflow: "hidden",
      }}
    >
      <BorderBeam duration={11} />
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.25}
        sx={{ mb: 2.5 }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #F97316 0%, #A855F7 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 20px rgba(249,115,22,0.4)",
          }}
        >
          <Sparkles size={16} color="#0A0A0A" />
        </Box>
        <Box>
          <Typography
            sx={{
              fontSize: "0.88rem",
              fontWeight: 600,
              color: "rgba(255,255,255,0.94)",
              lineHeight: 1.1,
            }}
          >
            Coach
          </Typography>
          <Typography
            sx={{
              fontSize: "0.7rem",
              color: "rgba(255,255,255,0.5)",
              lineHeight: 1.1,
            }}
          >
            Stockfish-grounded · live
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#22c55e",
            boxShadow: "0 0 12px rgba(34,197,94,0.6)",
          }}
        />
      </Stack>

      <Stack spacing={1.5}>
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.4,
              ease: [0.22, 0.61, 0.36, 1],
              delay: 0.6 + i * 0.25,
            }}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "88%",
              marginLeft: m.role === "user" ? "auto" : 0,
            }}
          >
            <Box
              sx={{
                px: 2,
                py: 1.25,
                borderRadius: "1rem",
                background:
                  m.role === "user"
                    ? "linear-gradient(135deg, #F97316 0%, #FB923C 100%)"
                    : "rgba(255,255,255,0.05)",
                border:
                  m.role === "user"
                    ? "1px solid rgba(255,255,255,0.18)"
                    : "1px solid rgba(255,255,255,0.08)",
                color: m.role === "user" ? "#0A0A0A" : "rgba(255,255,255,0.92)",
                fontSize: "0.92rem",
                fontWeight: m.role === "user" ? 600 : 400,
                lineHeight: 1.45,
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              {m.text}
            </Box>
          </motion.div>
        ))}
      </Stack>

      <Box
        sx={{
          mt: 2.5,
          pt: 2,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <ShieldCheck size={14} color="#22c55e" />
        <Typography
          sx={{
            fontSize: "0.72rem",
            color: "rgba(255,255,255,0.5)",
            letterSpacing: "0.02em",
          }}
        >
          Every claim validated against the engine
        </Typography>
      </Box>
    </motion.div>
  );
}

function Hero() {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1.05fr 0.95fr" },
        gap: { xs: 6, md: 8 },
        alignItems: "center",
        py: { xs: 6, md: 10 },
      }}
    >
      <Box>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <EyebrowBadge>
            DEMOCRATIZING HIGH-QUALITY CHESS EDUCATION
          </EyebrowBadge>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.7,
            ease: [0.22, 0.61, 0.36, 1],
            delay: 0.1,
          }}
        >
          <Typography
            variant="h1"
            sx={{
              mt: 3,
              fontSize: { xs: "2.6rem", sm: "3.4rem", md: "4.2rem" },
              color: "rgba(255,255,255,0.96)",
            }}
          >
            Chess coaching,{" "}
            <Box
              component="span"
              sx={{
                background:
                  "linear-gradient(135deg, #F97316 0%, #FB923C 50%, #FBBF24 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              for everyone.
            </Box>
          </Typography>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.7,
            ease: [0.22, 0.61, 0.36, 1],
            delay: 0.2,
          }}
        >
          <Typography
            sx={{
              mt: 3,
              fontSize: { xs: "1.05rem", md: "1.2rem" },
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.66)",
              maxWidth: 560,
            }}
          >
            World-class chess coaching has been out of reach for many players.
            We&apos;re changing that. Stockfish 17 + a smart AI coach + a
            hallucination validator deliver{" "}
            <Box
              component="span"
              sx={{ color: "rgba(255,255,255,0.92)", fontWeight: 600 }}
            >
              the same caliber, free for everyone.
            </Box>
          </Typography>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.7,
            ease: [0.22, 0.61, 0.36, 1],
            delay: 0.32,
          }}
        >
          <Stack direction="row" spacing={2} sx={{ mt: 4.5, flexWrap: "wrap" }}>
            {/* Program-first (2026-08-10): the plan is the product, so it
                leads. "Analyze a game" stays as the secondary action — it is
                the conversion path for AEO traffic arriving on coach queries
                and must not be removed. */}
            <StartPlanCTA />
            <GhostCTA href="/analysis">Analyze a game</GhostCTA>
          </Stack>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.55 }}
        >
          <Stack
            direction="row"
            spacing={3}
            sx={{
              mt: 5,
              color: "rgba(255,255,255,0.42)",
              fontSize: "0.78rem",
              letterSpacing: "0.04em",
              flexWrap: "wrap",
            }}
          >
            <Box>Engine-grounded AI coaching</Box>
            <Box>·</Box>
            <Box>No sign-up required</Box>
            <Box>·</Box>
            <Box>Lichess sync</Box>
          </Stack>
        </motion.div>
      </Box>

      <Box sx={{ perspective: "1200px" }}>
        <GlassChatPreview />
      </Box>
    </Box>
  );
}

function MarqueeStrip() {
  const items = [
    "Stockfish 17",
    "Engine-grounded AI coach",
    "Hallucination validator",
    "100,000+ Lichess puzzles",
    "Maia-2 humanlike opponent",
    "Neo4j puzzle graph",
    "Lichess OAuth sync",
  ];
  const row = [...items, ...items];
  return (
    <Box
      sx={{
        my: { xs: 6, md: 8 },
        py: 2.5,
        borderTop: "1px solid rgba(255,255,255,0.06)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        overflow: "hidden",
        position: "relative",
        WebkitMaskImage:
          "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
        maskImage:
          "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
      }}
    >
      <motion.div
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
        style={{ display: "flex", gap: 48, whiteSpace: "nowrap" }}
      >
        {row.map((item, i) => (
          <Box
            key={i}
            sx={{
              fontSize: "0.92rem",
              fontWeight: 500,
              color: "rgba(255,255,255,0.42)",
              letterSpacing: "0.02em",
              display: "flex",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            <Sparkles size={12} color="rgba(249,115,22,0.6)" />
            {item}
          </Box>
        ))}
      </motion.div>
    </Box>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: "01",
      icon: Clipboard,
      iconColor: "#F97316",
      iconBg: "rgba(249,115,22,0.12)",
      iconBorder: "rgba(249,115,22,0.3)",
      title: "Drop your game.",
      body: "Paste a PGN, a Lichess link, or play one live — the coach picks up wherever you are.",
    },
    {
      number: "02",
      icon: Cpu,
      iconColor: "#A855F7",
      iconBg: "rgba(168,85,247,0.12)",
      iconBorder: "rgba(168,85,247,0.3)",
      title: "Engine + AI analyze.",
      body: "Stockfish 17 evaluates every move. Our AI coach turns the numbers into a plain-English lesson. A validator checks every claim before you see it.",
    },
    {
      number: "03",
      icon: TrendingUp,
      iconColor: "#22c55e",
      iconBg: "rgba(34,197,94,0.12)",
      iconBorder: "rgba(34,197,94,0.3)",
      title: "You improve.",
      body: "Drill same-motif puzzles the coach surfaces, then face Maia-2 at your rating. Progress, on loop.",
    },
  ];

  return (
    <Box sx={{ py: { xs: 6, md: 10 } }}>
      <RevealOnScroll>
        <Box sx={{ maxWidth: 720, mb: 6 }}>
          <EyebrowBadge>HOW IT WORKS</EyebrowBadge>
          <Typography
            variant="h2"
            sx={{
              mt: 2.5,
              fontSize: { xs: "2rem", md: "2.8rem" },
              color: "rgba(255,255,255,0.96)",
            }}
          >
            Three steps from{" "}
            <Box
              component="span"
              sx={{
                background: "linear-gradient(135deg, #F97316, #A855F7)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              game played
            </Box>{" "}
            to lesson learned.
          </Typography>
        </Box>
      </RevealOnScroll>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
          gap: 2.5,
        }}
      >
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <RevealOnScroll key={step.number} delay={i * 0.1}>
              <Box
                sx={{
                  position: "relative",
                  borderRadius: "1.5rem",
                  background: "rgba(20,22,28,0.55)",
                  backdropFilter: "blur(14px) saturate(140%)",
                  WebkitBackdropFilter: "blur(14px) saturate(140%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow:
                    "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
                  p: 4,
                  height: "100%",
                  transition: "all 240ms cubic-bezier(0.22, 0.61, 0.36, 1)",
                  "&:hover": {
                    transform: "translateY(-3px)",
                    boxShadow:
                      "0 16px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1)",
                  },
                }}
              >
                <Stack direction="row" alignItems="center" spacing={2} mb={3}>
                  <Typography
                    sx={{
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      letterSpacing: "0.18em",
                      color: "rgba(255,255,255,0.4)",
                      fontFamily: "Monaco, Menlo, monospace",
                    }}
                  >
                    {step.number}
                  </Typography>
                  <Box
                    sx={{
                      flex: 1,
                      height: 1,
                      background:
                        "linear-gradient(90deg, rgba(255,255,255,0.12), transparent)",
                    }}
                  />
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: "10px",
                      background: step.iconBg,
                      border: `1px solid ${step.iconBorder}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={20} color={step.iconColor} />
                  </Box>
                </Stack>
                <Typography
                  variant="h3"
                  sx={{
                    fontSize: "1.35rem",
                    color: "rgba(255,255,255,0.96)",
                    mb: 1.5,
                  }}
                >
                  {step.title}
                </Typography>
                <Typography
                  sx={{
                    color: "rgba(255,255,255,0.6)",
                    fontSize: "0.95rem",
                    lineHeight: 1.55,
                  }}
                >
                  {step.body}
                </Typography>
              </Box>
            </RevealOnScroll>
          );
        })}
      </Box>
    </Box>
  );
}

function BentoSection() {
  return (
    <Box sx={{ py: { xs: 4, md: 6 } }}>
      <RevealOnScroll>
        <Box sx={{ maxWidth: 720, mb: 6 }}>
          <EyebrowBadge>THE COACHING STACK</EyebrowBadge>
          <Typography
            variant="h2"
            sx={{
              mt: 2.5,
              fontSize: { xs: "2rem", md: "2.8rem" },
              color: "rgba(255,255,255,0.96)",
            }}
          >
            GM-caliber coaching,{" "}
            <Box
              component="span"
              sx={{
                background: "linear-gradient(135deg, #F97316, #A855F7)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              free for everyone.
            </Box>
          </Typography>
          <Typography
            sx={{
              mt: 2.5,
              fontSize: "1.05rem",
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            Stockfish-grounded analysis, motif drilling, and opponent prep work
            together in one free coaching experience. Here&apos;s the stack that
            makes it possible.
          </Typography>
        </Box>
      </RevealOnScroll>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(12, 1fr)" },
          gridAutoRows: { md: "minmax(220px, auto)" },
          gap: 2.5,
        }}
      >
        <BentoCard
          gridColumn={{ xs: "1 / -1", md: "span 7" }}
          beam
          revealDelay={0}
          style={bentoAccentStyle(ANALYSIS_ACCENT)}
        >
          <AccentHairline a={ANALYSIS_ACCENT} />
          <Stack
            sx={{ height: "100%", justifyContent: "space-between" }}
            spacing={3}
          >
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: "12px",
                background: ANALYSIS_ACCENT.soft,
                border: `1px solid ${ANALYSIS_ACCENT.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Cpu size={22} color={ANALYSIS_ACCENT.bright} />
            </Box>
            <Box>
              <Typography
                variant="h3"
                sx={{
                  fontSize: "1.5rem",
                  color: "rgba(255,255,255,0.96)",
                  mb: 1.5,
                }}
              >
                Stockfish 17, in your browser.
              </Typography>
              <Typography
                sx={{
                  color: "rgba(255,255,255,0.62)",
                  lineHeight: 1.55,
                  fontSize: "0.98rem",
                  mb: 3,
                }}
              >
                The world's strongest engine evaluates every move via WASM —
                locally. Coaching commentary always starts from real numbers,
                then the coaching request is sent securely to Anthropic or the
                configured OpenAI fallback.
              </Typography>
              <Stack direction="row" spacing={1.5}>
                {["+1.8", "Best: Nd5", "Depth 22"].map((tag) => (
                  <Box
                    key={tag}
                    sx={{
                      px: 1.5,
                      py: 0.5,
                      borderRadius: "8px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontSize: "0.78rem",
                      color: "rgba(255,255,255,0.78)",
                      fontFamily: "Monaco, Menlo, monospace",
                    }}
                  >
                    {tag}
                  </Box>
                ))}
              </Stack>
            </Box>
          </Stack>
        </BentoCard>

        <BentoCard
          gridColumn={{ xs: "1 / -1", md: "span 5" }}
          revealDelay={0.08}
        >
          <Stack
            sx={{ height: "100%", justifyContent: "space-between" }}
            spacing={3}
          >
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: "12px",
                background: "rgba(34,197,94,0.12)",
                border: "1px solid rgba(34,197,94,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShieldCheck size={22} color="#22c55e" />
            </Box>
            <Box>
              <Typography
                sx={{
                  fontSize: "3.5rem",
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                  background: "linear-gradient(135deg, #22c55e, #16a34a)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                <NumberTicker value={100} suffix="%" />
              </Typography>
              <Typography
                variant="h3"
                sx={{
                  fontSize: "1.15rem",
                  color: "rgba(255,255,255,0.94)",
                  mt: 1,
                }}
              >
                Of claims fact-checked.
              </Typography>
              <Typography
                sx={{
                  color: "rgba(255,255,255,0.58)",
                  fontSize: "0.92rem",
                  mt: 1.5,
                  lineHeight: 1.5,
                }}
              >
                A chess.js validator checks every move, line, and evaluation the
                coach mentions. Hallucinations don't reach the page.
              </Typography>
            </Box>
          </Stack>
        </BentoCard>

        <BentoCard
          gridColumn={{ xs: "1 / -1", md: "span 4" }}
          revealDelay={0.16}
          style={bentoAccentStyle(PRACTICE_ACCENT)}
        >
          <AccentHairline a={PRACTICE_ACCENT} />
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "12px",
              background: PRACTICE_ACCENT.soft,
              border: `1px solid ${PRACTICE_ACCENT.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 3,
            }}
          >
            <Puzzle size={22} color={PRACTICE_ACCENT.bright} />
          </Box>
          <Typography
            sx={{
              fontSize: "2.6rem",
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-0.03em",
              color: "rgba(255,255,255,0.96)",
            }}
          >
            <NumberTicker value={100000} suffix="+" />
          </Typography>
          <Typography
            variant="h3"
            sx={{
              fontSize: "1.1rem",
              color: "rgba(255,255,255,0.94)",
              mt: 1,
            }}
          >
            Lichess puzzles, indexed.
          </Typography>
          <Typography
            sx={{
              color: "rgba(255,255,255,0.56)",
              fontSize: "0.9rem",
              mt: 1.25,
              lineHeight: 1.5,
            }}
          >
            FEN cosine-similarity reranks puzzles to your weak motifs.
          </Typography>
        </BentoCard>

        <BentoCard
          gridColumn={{ xs: "1 / -1", md: "span 4" }}
          beam
          beamDelay={2}
          revealDelay={0.24}
          style={bentoAccentStyle(PLAY_ACCENT)}
        >
          <AccentHairline a={PLAY_ACCENT} />
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "12px",
              background: PLAY_ACCENT.soft,
              border: `1px solid ${PLAY_ACCENT.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 3,
            }}
          >
            <Bot size={22} color={PLAY_ACCENT.bright} />
          </Box>
          <Typography
            variant="h3"
            sx={{
              fontSize: "1.3rem",
              color: "rgba(255,255,255,0.96)",
              mb: 1.5,
            }}
          >
            Beat the bot that plays like you.
          </Typography>
          <Typography
            sx={{
              color: "rgba(255,255,255,0.58)",
              fontSize: "0.9rem",
              lineHeight: 1.55,
            }}
          >
            Maia-2 mimics human moves at your rating. No more 3500-Elo crushing
            — train against your actual ceiling.
          </Typography>
        </BentoCard>

        <BentoCard
          gridColumn={{ xs: "1 / -1", md: "span 4" }}
          revealDelay={0.32}
        >
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "12px",
              background: "rgba(59,130,246,0.12)",
              border: "1px solid rgba(59,130,246,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 3,
            }}
          >
            <Link2 size={22} color="#3B82F6" />
          </Box>
          <Typography
            variant="h3"
            sx={{
              fontSize: "1.3rem",
              color: "rgba(255,255,255,0.96)",
              mb: 1.5,
            }}
          >
            One-click Lichess sync.
          </Typography>
          <Typography
            sx={{
              color: "rgba(255,255,255,0.58)",
              fontSize: "0.9rem",
              lineHeight: 1.55,
            }}
          >
            OAuth 2.0 PKCE in. Pull your games, push your repertoire, play live
            — without leaving the coach.
          </Typography>
        </BentoCard>

        <BentoCard
          gridColumn={{ xs: "1 / -1", md: "span 12" }}
          revealDelay={0.1}
          style={bentoAccentStyle(SCOUT_ACCENT)}
        >
          <AccentHairline a={SCOUT_ACCENT} />
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={4}
            alignItems={{ md: "center" }}
            sx={{ height: "100%" }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: "14px",
                background: SCOUT_ACCENT.soft,
                border: `1px solid ${SCOUT_ACCENT.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Crosshair size={28} color={SCOUT_ACCENT.bright} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="h3"
                sx={{
                  fontSize: { xs: "1.4rem", md: "1.7rem" },
                  color: "rgba(255,255,255,0.96)",
                  mb: 1,
                }}
              >
                Scout your next opponent.{" "}
                <Box
                  component="span"
                  sx={{ color: "rgba(255,255,255,0.5)", fontWeight: 500 }}
                >
                  Tells show you what to play.
                </Box>
              </Typography>
              <Typography
                sx={{
                  color: "rgba(255,255,255,0.58)",
                  fontSize: "1rem",
                  lineHeight: 1.55,
                  maxWidth: 720,
                }}
              >
                Drop a Lichess or Chess.com handle. We surface their opening
                tendencies, blunder patterns, and time-trouble breakpoints — so
                you walk in with a plan, not a hope.
              </Typography>
            </Box>
            <Box>
              <GhostCTA href="/scout">Try Scout</GhostCTA>
            </Box>
          </Stack>
        </BentoCard>
      </Box>
    </Box>
  );
}

function DailyPuzzleSection() {
  // Classic knight fork puzzle — White N on d5, Black K on e8 + R on a8.
  // Solution: 1.Nc7+ forks K and R, winning the rook next move.
  const initialFen = "r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1";
  const solution = { from: "d5" as Square, to: "c7" as Square };
  // Computed after mount, never during render.
  //
  // This page is statically prerendered, so anything derived from the clock
  // at render time is the BUILD machine's clock, frozen into the HTML. From
  // the day after a deploy onward the server said one date and every browser
  // said another: React hit a text mismatch (#425), hydration failed (#418)
  // and the entire root was discarded and re-rendered on the client (#423).
  // Production was doing that on every single homepage visit -- the SSR HTML
  // read AUGUST 22 while browsers read AUGUST 23.
  //
  // Deferring to an effect makes the server render and the client's FIRST
  // render agree by construction: both emit no date. The viewer then gets
  // their own local date a tick later, which is the only correct one anyway,
  // since "today" varies by timezone as well as by how stale the build is.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      })
    );
  }, []);

  const [position, setPosition] = useState(initialFen);
  const [status, setStatus] = useState<"playing" | "wrong" | "solved">(
    "playing"
  );
  const [tries, setTries] = useState(0);
  const [hintShown, setHintShown] = useState(false);

  // Compute legal destinations for chessground to highlight on click
  const dests = useMemo(() => {
    if (status === "solved") return new Map<string, string[]>();
    const c = new Chess(position);
    const map = new Map<string, string[]>();
    c.moves({ verbose: true }).forEach((m) => {
      const arr = map.get(m.from) ?? [];
      arr.push(m.to);
      map.set(m.from, arr);
    });
    return map;
  }, [position, status]);

  // Green arrow hint (revealed when "Hint" clicked) + red flash on wrong
  const shapes = useMemo<DrawShape[]>(() => {
    const out: DrawShape[] = [];
    if (hintShown && status !== "solved") {
      out.push({ orig: solution.from, brush: "paleGreen" });
    }
    return out;
  }, [hintShown, status]);

  const handleMove = (from: string, to: string) => {
    if (status === "solved") return;
    if (from === solution.from && to === solution.to) {
      const g = new Chess(initialFen);
      g.move({ from: solution.from, to: solution.to });
      setPosition(g.fen());
      setStatus("solved");
      return;
    }
    // Wrong move — flash board, revert position
    setStatus("wrong");
    setTries((t) => t + 1);
    setTimeout(() => {
      setPosition(initialFen);
      setStatus((s) => (s === "wrong" ? "playing" : s));
    }, 650);
  };

  const handleReset = () => {
    setPosition(initialFen);
    setStatus("playing");
    setTries(0);
    setHintShown(false);
  };

  // Build the "Open in /analysis" link with the puzzle FEN encoded
  const analysisLink = `/analysis?puzzleFen=${encodeURIComponent(initialFen)}&solution=${encodeURIComponent(`${solution.from}-${solution.to}`)}`;
  const askCoachLink = `/analysis?puzzleFen=${encodeURIComponent(initialFen)}&solution=${encodeURIComponent(`${solution.from}-${solution.to}`)}&prompt=${encodeURIComponent("Help me understand why Nc7+ wins here.")}`;

  return (
    <Box sx={{ py: { xs: 6, md: 10 } }}>
      <RevealOnScroll>
        <Box sx={{ maxWidth: 720, mb: 6 }}>
          <EyebrowBadge>
            PUZZLE OF THE DAY{today ? ` · ${today.toUpperCase()}` : ""}
          </EyebrowBadge>
          <Typography
            variant="h2"
            sx={{
              mt: 2.5,
              fontSize: { xs: "2rem", md: "2.8rem" },
              color: "rgba(255,255,255,0.96)",
            }}
          >
            One puzzle a day.{" "}
            <Box
              component="span"
              sx={{
                background: "linear-gradient(135deg, #F97316, #A855F7)",
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

      <RevealOnScroll delay={0.1}>
        <Box
          sx={{
            position: "relative",
            borderRadius: "2rem",
            background: `linear-gradient(135deg, ${PRACTICE_ACCENT.tint}, rgba(20,22,28,0.6))`,
            backdropFilter: "blur(16px) saturate(150%)",
            WebkitBackdropFilter: "blur(16px) saturate(150%)",
            border: `1px solid ${PRACTICE_ACCENT.border}`,
            boxShadow: `0 16px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06), ${PRACTICE_ACCENT.glow}`,
            p: { xs: 4, md: 6 },
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1.05fr 0.95fr" },
            gap: { xs: 4, md: 6 },
            alignItems: "center",
            overflow: "hidden",
            "&::before": {
              content: '""',
              position: "absolute",
              top: 0,
              left: "8%",
              right: "8%",
              height: "1.5px",
              background: `linear-gradient(90deg, transparent, ${PRACTICE_ACCENT.base}, transparent)`,
              opacity: 0.65,
              pointerEvents: "none",
            },
          }}
        >
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              width: "50%",
              height: "150%",
              top: "-25%",
              right: "-15%",
              background: `radial-gradient(ellipse at center, ${PRACTICE_ACCENT.soft}, transparent 60%)`,
              pointerEvents: "none",
            }}
          />

          <Box sx={{ position: "relative", zIndex: 1 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: "10px",
                  background: PRACTICE_ACCENT.soft,
                  border: `1px solid ${PRACTICE_ACCENT.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Flame size={20} color={PRACTICE_ACCENT.bright} />
              </Box>
              <Box>
                <Typography
                  sx={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                    color: "rgba(255,255,255,0.5)",
                    textTransform: "uppercase",
                  }}
                >
                  Today's puzzle
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.92rem",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.92)",
                  }}
                >
                  Endgame · Knight fork
                </Typography>
              </Box>
            </Stack>

            <Typography
              variant="h3"
              sx={{
                fontSize: { xs: "1.6rem", md: "2rem" },
                color: "rgba(255,255,255,0.96)",
                mt: 2,
                mb: 2,
                lineHeight: 1.15,
              }}
            >
              {status === "solved" ? (
                <>
                  Brilliant.{" "}
                  <Box
                    component="span"
                    sx={{
                      background: "linear-gradient(135deg, #22c55e, #16a34a)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    Nc7+ wins the rook.
                  </Box>
                </>
              ) : (
                <>White to play. Find the winning move.</>
              )}
            </Typography>

            {status !== "solved" && (
              <Typography
                sx={{
                  color: "rgba(255,255,255,0.6)",
                  fontSize: "1rem",
                  lineHeight: 1.55,
                  mb: 3,
                }}
              >
                Drag the knight to win material. Wrong moves bounce back — same
                way the coach guards you mid-game.
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
                    💡 The knight on d5 can attack both the king and the rook
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
                      must move, then Nxa8 wins the rook.
                    </Typography>
                    {tries > 0 && (
                      <Typography
                        sx={{
                          fontSize: "0.82rem",
                          color: "rgba(255,255,255,0.5)",
                          mt: 1,
                        }}
                      >
                        Solved in {tries + 1} {tries === 0 ? "try" : "tries"}.
                      </Typography>
                    )}
                  </Box>
                </Stack>
              </Box>
            )}

            <Stack direction="row" spacing={1.25} sx={{ flexWrap: "wrap" }}>
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
                      px: 2.25,
                      py: 1.2,
                      borderRadius: "999px",
                      background: "rgba(255,255,255,0.03)",
                      "&:hover": {
                        borderColor: "rgba(255,255,255,0.32)",
                        background: "rgba(255,255,255,0.06)",
                      },
                    }}
                  >
                    Try again
                  </Button>
                  <PrimaryCTA href="/puzzles">More puzzles</PrimaryCTA>
                  <Button
                    component={Link}
                    href={askCoachLink}
                    variant="outlined"
                    startIcon={<Sparkles size={16} />}
                    sx={{
                      color: "#FB923C",
                      borderColor: "rgba(249,115,22,0.32)",
                      fontWeight: 600,
                      px: 2.25,
                      py: 1.2,
                      borderRadius: "999px",
                      background: "rgba(249,115,22,0.08)",
                      "&:hover": {
                        borderColor: "rgba(249,115,22,0.5)",
                        background: "rgba(249,115,22,0.14)",
                      },
                    }}
                  >
                    Ask the coach
                  </Button>
                  <Button
                    component={Link}
                    href={analysisLink}
                    variant="outlined"
                    sx={{
                      color: "rgba(255,255,255,0.78)",
                      borderColor: "rgba(255,255,255,0.12)",
                      fontWeight: 600,
                      px: 2.25,
                      py: 1.2,
                      borderRadius: "999px",
                      background: "rgba(255,255,255,0.02)",
                      "&:hover": {
                        borderColor: "rgba(255,255,255,0.28)",
                        background: "rgba(255,255,255,0.05)",
                      },
                    }}
                  >
                    Open in /analysis
                  </Button>
                </>
              ) : (
                <>
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
                      "&.Mui-disabled": {
                        color: "rgba(255,255,255,0.3)",
                        borderColor: "rgba(255,255,255,0.08)",
                      },
                      "&:hover": {
                        borderColor: "rgba(255,255,255,0.32)",
                        background: "rgba(255,255,255,0.06)",
                      },
                    }}
                  >
                    {hintShown ? "Hint shown" : "Show hint"}
                  </Button>
                  <Button
                    component={Link}
                    href={askCoachLink}
                    variant="outlined"
                    startIcon={<Sparkles size={16} />}
                    sx={{
                      color: "#FB923C",
                      borderColor: "rgba(249,115,22,0.3)",
                      fontWeight: 600,
                      px: 2.5,
                      py: 1.25,
                      borderRadius: "999px",
                      background: "rgba(249,115,22,0.06)",
                      "&:hover": {
                        borderColor: "rgba(249,115,22,0.5)",
                        background: "rgba(249,115,22,0.12)",
                      },
                    }}
                  >
                    Ask the coach
                  </Button>
                  <GhostCTA href="/puzzles">Skip to full deck</GhostCTA>
                </>
              )}
            </Stack>

            <Stack
              direction="row"
              spacing={3}
              sx={{
                mt: 3.5,
                color: "rgba(255,255,255,0.42)",
                fontSize: "0.78rem",
                letterSpacing: "0.04em",
                flexWrap: "wrap",
              }}
            >
              <Box>100,000+ puzzles in the deck</Box>
              <Box>·</Box>
              <Box>Adaptive to your rating</Box>
            </Stack>
          </Box>

          <Box
            sx={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Box
              sx={{
                position: "relative",
                borderRadius: "16px",
                overflow: "hidden",
                boxShadow:
                  status === "solved"
                    ? "0 24px 60px rgba(0,0,0,0.5), 0 0 0 2px rgba(34,197,94,0.45), inset 0 1px 0 rgba(255,255,255,0.04)"
                    : status === "wrong"
                      ? "0 24px 60px rgba(0,0,0,0.5), 0 0 0 2px rgba(239,68,68,0.5), inset 0 1px 0 rgba(255,255,255,0.04)"
                      : "0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.04)",
                maxWidth: 380,
                width: "100%",
                aspectRatio: "1",
                transition:
                  "box-shadow 240ms cubic-bezier(0.22, 0.61, 0.36, 1)",
              }}
            >
              <ChessgroundBoard
                fen={position}
                viewOnly={status === "solved"}
                movableColor="white"
                dests={dests}
                onMove={handleMove}
                shapes={shapes}
              />
            </Box>
          </Box>
        </Box>
      </RevealOnScroll>
    </Box>
  );
}

function Comparison() {
  const columns = [
    {
      name: "DIY tools",
      tagline: "Stockfish + textbooks",
      icon: Wrench,
      highlighted: false,
      features: [
        {
          label: "Engine-grounded analysis",
          status: "yes" as const,
          note: "Raw",
        },
        { label: "Plain-English explanations", status: "no" as const },
        { label: "Personalized to your weaknesses", status: "no" as const },
        { label: "Available 24/7", status: "yes" as const },
        { label: "Catches AI hallucinations", status: "na" as const },
      ],
    },
    {
      name: "Chess Masti",
      tagline: "Engine-grounded coaching",
      icon: Sparkles,
      highlighted: true,
      features: [
        {
          label: "Engine-grounded analysis",
          status: "yes" as const,
          note: "Curated",
        },
        { label: "Plain-English explanations", status: "yes" as const },
        { label: "Personalized to your weaknesses", status: "yes" as const },
        { label: "Available 24/7", status: "yes" as const },
        {
          label: "Catches AI hallucinations",
          status: "yes" as const,
          note: "Validator",
        },
      ],
    },
    {
      name: "GM coach",
      tagline: "Human expert",
      icon: GraduationCap,
      highlighted: false,
      features: [
        { label: "Engine-grounded analysis", status: "partial" as const },
        { label: "Plain-English explanations", status: "yes" as const },
        { label: "Personalized to your weaknesses", status: "yes" as const },
        { label: "Available 24/7", status: "no" as const },
        { label: "Catches AI hallucinations", status: "na" as const },
      ],
    },
  ];

  const renderStatusIcon = (
    status: "yes" | "no" | "partial" | "na",
    highlighted: boolean
  ) => {
    if (status === "yes") {
      return (
        <Box
          sx={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: highlighted
              ? "rgba(249,115,22,0.18)"
              : "rgba(34,197,94,0.15)",
            border: highlighted
              ? "1px solid rgba(249,115,22,0.4)"
              : "1px solid rgba(34,197,94,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Check
            size={11}
            color={highlighted ? "#F97316" : "#22c55e"}
            strokeWidth={3}
          />
        </Box>
      );
    }
    if (status === "no") {
      return (
        <Box
          sx={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <X size={11} color="rgba(255,255,255,0.4)" strokeWidth={3} />
        </Box>
      );
    }
    if (status === "partial") {
      return (
        <Box
          sx={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "rgba(234,179,8,0.12)",
            border: "1px solid rgba(234,179,8,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Minus size={11} color="#eab308" strokeWidth={3} />
        </Box>
      );
    }
    return (
      <Box
        sx={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.02)",
          border: "1px dashed rgba(255,255,255,0.1)",
          flexShrink: 0,
        }}
      />
    );
  };

  return (
    <Box sx={{ py: { xs: 6, md: 10 } }}>
      <RevealOnScroll>
        <Box sx={{ maxWidth: 720, mb: 6 }}>
          <EyebrowBadge>COMPARE THE EXPERIENCE</EyebrowBadge>
          <Typography
            variant="h2"
            sx={{
              mt: 2.5,
              fontSize: { xs: "2rem", md: "2.8rem" },
              color: "rgba(255,255,255,0.96)",
            }}
          >
            Coaching built around your games.{" "}
            <Box
              component="span"
              sx={{
                background: "linear-gradient(135deg, #F97316, #A855F7)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Clear, grounded, and always available.
            </Box>
          </Typography>
        </Box>
      </RevealOnScroll>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
          gap: 2.5,
          alignItems: "stretch",
        }}
      >
        {columns.map((col, i) => {
          const Icon = col.icon;
          return (
            <RevealOnScroll
              key={col.name}
              delay={i * 0.1}
              style={{ height: "100%" }}
            >
              <Box
                sx={{
                  position: "relative",
                  borderRadius: "1.5rem",
                  background: col.highlighted
                    ? "linear-gradient(180deg, rgba(249,115,22,0.08), rgba(20,22,28,0.65))"
                    : "rgba(20,22,28,0.5)",
                  backdropFilter: "blur(14px) saturate(140%)",
                  WebkitBackdropFilter: "blur(14px) saturate(140%)",
                  border: col.highlighted
                    ? "1px solid rgba(249,115,22,0.35)"
                    : "1px solid rgba(255,255,255,0.08)",
                  boxShadow: col.highlighted
                    ? "0 16px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(249,115,22,0.18), inset 0 1px 0 rgba(255,255,255,0.08)"
                    : "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
                  p: 4,
                  height: "100%",
                  overflow: "hidden",
                }}
              >
                {col.highlighted && <BorderBeam duration={10} />}
                <Box sx={{ position: "relative", zIndex: 1 }}>
                  {col.highlighted && (
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.5,
                        px: 1.25,
                        py: 0.4,
                        borderRadius: "999px",
                        background: "rgba(249,115,22,0.18)",
                        border: "1px solid rgba(249,115,22,0.35)",
                        mb: 2,
                      }}
                    >
                      <Sparkles size={11} color="#F97316" />
                      <Typography
                        sx={{
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          letterSpacing: "0.14em",
                          color: "#F97316",
                          textTransform: "uppercase",
                        }}
                      >
                        Featured
                      </Typography>
                    </Box>
                  )}
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    mb={1.5}
                  >
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: "10px",
                        background: col.highlighted
                          ? "rgba(249,115,22,0.18)"
                          : "rgba(255,255,255,0.05)",
                        border: col.highlighted
                          ? "1px solid rgba(249,115,22,0.4)"
                          : "1px solid rgba(255,255,255,0.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon
                        size={18}
                        color={
                          col.highlighted ? "#F97316" : "rgba(255,255,255,0.7)"
                        }
                      />
                    </Box>
                    <Box>
                      <Typography
                        sx={{
                          fontSize: "1.2rem",
                          fontWeight: 700,
                          color: "rgba(255,255,255,0.96)",
                          lineHeight: 1.1,
                        }}
                      >
                        {col.name}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: "0.78rem",
                          color: "rgba(255,255,255,0.5)",
                          lineHeight: 1.1,
                          mt: 0.5,
                        }}
                      >
                        {col.tagline}
                      </Typography>
                    </Box>
                  </Stack>

                  <Box
                    sx={{
                      height: 1,
                      background:
                        "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
                      my: 3,
                    }}
                  />

                  <Stack spacing={1.5}>
                    {col.features.map((f) => (
                      <Stack
                        key={f.label}
                        direction="row"
                        alignItems="center"
                        spacing={1.5}
                      >
                        {renderStatusIcon(f.status, col.highlighted)}
                        <Typography
                          sx={{
                            fontSize: "0.92rem",
                            color:
                              f.status === "no" || f.status === "na"
                                ? "rgba(255,255,255,0.42)"
                                : "rgba(255,255,255,0.85)",
                            flex: 1,
                          }}
                        >
                          {f.label}
                        </Typography>
                        {"note" in f && f.note && (
                          <Typography
                            sx={{
                              fontSize: "0.7rem",
                              color: "rgba(255,255,255,0.45)",
                              fontFamily: "Monaco, Menlo, monospace",
                              letterSpacing: "0.02em",
                            }}
                          >
                            {f.note}
                          </Typography>
                        )}
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              </Box>
            </RevealOnScroll>
          );
        })}
      </Box>
    </Box>
  );
}

function ChromeExtension() {
  return (
    <Box sx={{ py: { xs: 6, md: 10 } }}>
      <RevealOnScroll>
        <Box
          sx={{
            position: "relative",
            borderRadius: "2rem",
            background:
              "linear-gradient(135deg, rgba(59,130,246,0.06), rgba(20,22,28,0.6))",
            backdropFilter: "blur(16px) saturate(150%)",
            WebkitBackdropFilter: "blur(16px) saturate(150%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow:
              "0 16px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
            p: { xs: 4, md: 6 },
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 0.85fr" },
            gap: { xs: 4, md: 6 },
            alignItems: "center",
            overflow: "hidden",
          }}
        >
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              width: "55%",
              height: "150%",
              top: "-25%",
              left: "-20%",
              background:
                "radial-gradient(ellipse at center, rgba(59,130,246,0.12), transparent 60%)",
              pointerEvents: "none",
            }}
          />

          <Box sx={{ position: "relative", zIndex: 1 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" mb={2.5}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: "12px",
                  background: "rgba(59,130,246,0.18)",
                  border: "1px solid rgba(59,130,246,0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Globe size={22} color="#3B82F6" />
              </Box>
              <Typography
                variant="overline"
                sx={{
                  color: "#3B82F6",
                  letterSpacing: "0.16em",
                  fontWeight: 700,
                  fontSize: "0.72rem",
                }}
              >
                CHROME EXTENSION
              </Typography>
            </Stack>

            <Typography
              variant="h2"
              sx={{
                fontSize: { xs: "1.9rem", md: "2.6rem" },
                color: "rgba(255,255,255,0.96)",
                mb: 2,
                lineHeight: 1.1,
              }}
            >
              One-click coaching on{" "}
              <Box
                component="span"
                sx={{
                  background: "linear-gradient(135deg, #3B82F6, #A855F7)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                every Lichess & Chess.com game.
              </Box>
            </Typography>
            <Typography
              sx={{
                color: "rgba(255,255,255,0.62)",
                fontSize: "1.05rem",
                lineHeight: 1.55,
                mb: 4,
                maxWidth: "52ch",
              }}
            >
              A single orange Analyze button on the sites you already play.
              Click it after any game — your PGN comes here automatically with
              the coach already talking. No copy-paste, no extra account.
            </Typography>

            <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
              <Button
                component={Link}
                href="/extension"
                variant="contained"
                disableElevation
                startIcon={<Download size={18} />}
                sx={{
                  bgcolor: "#3B82F6",
                  color: "#0A0A0A",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  px: 3,
                  py: 1.4,
                  borderRadius: "999px",
                  boxShadow:
                    "0 0 0 1px rgba(59,130,246,0.5), 0 8px 32px rgba(59,130,246,0.25)",
                  transition: "all 220ms cubic-bezier(0.22, 0.61, 0.36, 1)",
                  "&:hover": {
                    bgcolor: "#60A5FA",
                    transform: "translateY(-1px)",
                    boxShadow:
                      "0 0 0 1px rgba(59,130,246,0.7), 0 12px 40px rgba(59,130,246,0.4)",
                  },
                }}
              >
                Get the extension
              </Button>
              <GhostCTA href="/extension">How it works</GhostCTA>
            </Stack>

            <Stack
              direction="row"
              spacing={3}
              sx={{
                mt: 4,
                color: "rgba(255,255,255,0.42)",
                fontSize: "0.78rem",
                letterSpacing: "0.04em",
                flexWrap: "wrap",
              }}
            >
              <Box>Lichess</Box>
              <Box>·</Box>
              <Box>Chess.com</Box>
              <Box>·</Box>
              <Box>Chromium-based browsers</Box>
            </Stack>
          </Box>

          <Box
            sx={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Box
              sx={{
                position: "relative",
                borderRadius: "1.25rem",
                background: "rgba(15,17,23,0.85)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow:
                  "0 24px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
                p: 3.5,
                width: "100%",
                maxWidth: 360,
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ mb: 2 }}
              >
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#ff5f57",
                  }}
                />
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#febc2e",
                  }}
                />
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#28c840",
                  }}
                />
                <Box sx={{ flex: 1 }} />
                <Typography
                  sx={{
                    fontSize: "0.7rem",
                    color: "rgba(255,255,255,0.4)",
                    fontFamily: "Monaco, Menlo, monospace",
                  }}
                >
                  lichess.org
                </Typography>
              </Stack>
              <Box
                sx={{
                  borderRadius: "10px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  p: 2,
                  mb: 2,
                  textAlign: "center",
                  color: "rgba(255,255,255,0.35)",
                  fontSize: "0.85rem",
                  fontFamily: "Monaco, Menlo, monospace",
                }}
              >
                ♔ Game over · 1-0
              </Box>
              <Box
                sx={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                  px: 2,
                  py: 1.5,
                  borderRadius: "10px",
                  background:
                    "linear-gradient(135deg, #F97316 0%, #FB923C 100%)",
                  color: "#0A0A0A",
                  fontWeight: 700,
                  fontSize: "0.92rem",
                  boxShadow:
                    "0 0 0 1px rgba(255,255,255,0.15), 0 8px 24px rgba(249,115,22,0.35)",
                }}
              >
                <Sparkles size={16} />
                Analyze with Chess Masti
                <Box
                  sx={{
                    position: "absolute",
                    top: -8,
                    right: 12,
                    bgcolor: "#0A0A0A",
                    color: "#F97316",
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    px: 0.75,
                    py: 0.25,
                    borderRadius: "4px",
                    border: "1px solid rgba(249,115,22,0.4)",
                  }}
                >
                  NEW
                </Box>
              </Box>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ mt: 2, color: "rgba(255,255,255,0.45)" }}
              >
                <MousePointerClick size={13} />
                <Typography sx={{ fontSize: "0.78rem" }}>
                  One click, then we take it from there.
                </Typography>
              </Stack>
            </Box>
          </Box>
        </Box>
      </RevealOnScroll>
    </Box>
  );
}

function StatsStrip() {
  const stats = [
    {
      value: 3500,
      prefix: "",
      suffix: "+",
      label: "Engine Elo behind every verdict",
    },
    { value: 100000, prefix: "", suffix: "+", label: "Puzzles indexed" },
    { value: 100, prefix: "", suffix: "%", label: "Claims fact-checked" },
  ];

  return (
    <RevealOnScroll>
      <Box
        sx={{
          my: { xs: 6, md: 10 },
          py: 5,
          px: { xs: 3, md: 5 },
          borderRadius: "1.5rem",
          background: "rgba(20,22,28,0.4)",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
            gap: { xs: 4, md: 2 },
          }}
        >
          {stats.map((s) => (
            <Box key={s.label}>
              <Typography
                sx={{
                  fontSize: { xs: "2.2rem", md: "2.8rem" },
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(255,255,255,0.6))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                <NumberTicker
                  value={s.value}
                  prefix={s.prefix}
                  suffix={s.suffix}
                />
              </Typography>
              <Typography
                sx={{
                  mt: 1.5,
                  fontSize: "0.84rem",
                  color: "rgba(255,255,255,0.5)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {s.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </RevealOnScroll>
  );
}

function FinalCTA() {
  return (
    <RevealOnScroll>
      <Box
        sx={{
          my: { xs: 8, md: 12 },
          position: "relative",
          borderRadius: "2rem",
          background:
            "linear-gradient(135deg, rgba(249,115,22,0.12), rgba(168,85,247,0.12))",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(16px) saturate(160%)",
          WebkitBackdropFilter: "blur(16px) saturate(160%)",
          overflow: "hidden",
          p: { xs: 5, md: 9 },
          textAlign: "center",
          boxShadow:
            "0 24px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <BorderBeam duration={14} />
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            width: "80%",
            height: "200%",
            top: "-50%",
            left: "10%",
            background:
              "radial-gradient(ellipse at center, rgba(249,115,22,0.18), transparent 60%)",
            pointerEvents: "none",
          }}
        />
        <Box sx={{ position: "relative" }}>
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: "2rem", md: "3rem" },
              color: "rgba(255,255,255,0.96)",
              mb: 2,
            }}
          >
            GM-quality chess coaching.{" "}
            <Box
              component="span"
              sx={{
                background:
                  "linear-gradient(135deg, #F97316, #FB923C, #A855F7)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Free coaching.
            </Box>
          </Typography>
          <Typography
            sx={{
              fontSize: "1.1rem",
              color: "rgba(255,255,255,0.66)",
              maxWidth: 540,
              mx: "auto",
              mb: 4.5,
              lineHeight: 1.55,
            }}
          >
            Get top-tier analysis with no sign-up. Chess calculations can run in
            your browser; AI coaching requests are sent securely to Anthropic or
            OpenAI. Chess Masti&apos;s coaching features are free.
          </Typography>
          <Stack
            direction="row"
            spacing={2}
            justifyContent="center"
            sx={{ flexWrap: "wrap" }}
          >
            <StartPlanCTA />
            <GhostCTA href="/analysis">Analyze a game</GhostCTA>
          </Stack>
        </Box>
      </Box>
    </RevealOnScroll>
  );
}

function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        py: 5,
        borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        gap: 2,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 22,
            height: 22,
            borderRadius: "6px",
            background: "linear-gradient(135deg, #F97316, #A855F7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Sparkles size={12} color="#0A0A0A" />
        </Box>
        <Typography
          sx={{
            fontSize: "0.85rem",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          Chess Masti · built by Aayan Hetamsaria
        </Typography>
      </Stack>
      <Stack
        direction="row"
        spacing={2.5}
        alignItems="center"
        sx={{ color: "rgba(255,255,255,0.42)", fontSize: "0.78rem" }}
      >
        <Box>Engine-grounded by</Box>
        <Box sx={{ color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
          Stockfish 17
        </Box>
        <Box
          component="a"
          href="/accessibility"
          sx={{
            color: "rgba(255,255,255,0.42)",
            textDecoration: "none",
            "&:hover": { color: "rgba(255,255,255,0.7)" },
            transition: "color 0.2s",
          }}
        >
          Accessibility
        </Box>
      </Stack>
    </Box>
  );
}

export default function LandingPage() {
  return (
    <ThemeProvider theme={launchTheme}>
      <Head>
        <title key="title">{HOME_TITLE}</title>
        <meta key="description" name="description" content={HOME_DESC} />
        <link key="canonical" rel="canonical" href="https://chessmasti.com/" />

        <meta key="og:type" property="og:type" content="website" />
        <meta
          key="og:site_name"
          property="og:site_name"
          content="Chess Masti AI"
        />
        <meta key="og:title" property="og:title" content={HOME_TITLE} />
        <meta
          key="og:description"
          property="og:description"
          content={HOME_DESC}
        />
        <meta
          key="og:url"
          property="og:url"
          content="https://chessmasti.com/"
        />
        <meta key="og:image" property="og:image" content={HOME_OG_IMAGE} />
        <meta key="og:image:width" property="og:image:width" content="1200" />
        <meta key="og:image:height" property="og:image:height" content="630" />

        <meta
          key="twitter:card"
          name="twitter:card"
          content="summary_large_image"
        />
        <meta key="twitter:site" name="twitter:site" content="@ChessMastiAI" />
        <meta
          key="twitter:creator"
          name="twitter:creator"
          content="@ChessMastiAI"
        />
        <meta key="twitter:title" name="twitter:title" content={HOME_TITLE} />
        <meta
          key="twitter:description"
          name="twitter:description"
          content={HOME_DESC}
        />
        <meta
          key="twitter:image"
          name="twitter:image"
          content={HOME_OG_IMAGE}
        />

        {homePageJsonLd.map((node) => (
          <script
            key={node["@id"]}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
          />
        ))}

        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#08090C" />
        <style>{`
          /* body-only on purpose: with <html> transparent, the body color
             propagates to the canvas and paints BEHIND the fixed zIndex:-1
             GradientBackdrop. Setting it on <html> too blocks that
             propagation, so body would paint OVER the backdrop and hide the
             gradient orbs (the white-landing bug of 2026-08-10). */
          html { color-scheme: dark; }
          body { background-color: #08090C; color-scheme: dark; margin: 0; }
          ::-webkit-scrollbar { width: 12px; height: 12px; }
          ::-webkit-scrollbar-track { background: #08090C; }
          ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 6px; }
          ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
          /* Chessground puzzle board — warm wood theme, white coords */
          .cg-wrap cg-board square.light { background-color: ${PUZZLE_LIGHT} !important; }
          .cg-wrap cg-board square.dark { background-color: ${PUZZLE_DARK} !important; }
          .cg-wrap cg-board square.last-move {
            background-color: rgba(249, 115, 22, 0.42) !important;
          }
          .cg-wrap cg-board square.move-dest {
            background: radial-gradient(circle, rgba(34,197,94,0.55) 22%, transparent 24%) !important;
          }
          .cg-wrap cg-board square.oc.move-dest {
            background: radial-gradient(circle, transparent 55%, rgba(34,197,94,0.55) 60%, rgba(34,197,94,0.4) 70%, transparent 71%) !important;
          }
          .cg-wrap cg-board square.selected {
            background-color: rgba(249, 115, 22, 0.5) !important;
          }
          .cg-wrap coords, .cg-wrap coords coord {
            color: #FFFFFF !important;
            font-weight: 700;
            text-shadow: 0 1px 3px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.6);
          }
        `}</style>
      </Head>
      <GradientBackdrop />
      <Box
        sx={{
          minHeight: "100vh",
          width: "100%",
          color: "rgba(255,255,255,0.94)",
          pt: 3,
          pb: 0,
          px: { xs: 2, md: 4 },
        }}
      >
        <NavPill active="launch" />
        <Box sx={{ maxWidth: 1200, mx: "auto" }}>
          {/* Renders only for logged-in CMIP interns; renders nothing for customers. */}
          <InternalHomeCard />
          <Hero />
          <MarqueeStrip />
          <HowItWorks />
          <BentoSection />
          <DailyPuzzleSection />
          <Comparison />
          <ChromeExtension />
          <StatsStrip />
          <FinalCTA />
          <Footer />
        </Box>
      </Box>
    </ThemeProvider>
  );
}
