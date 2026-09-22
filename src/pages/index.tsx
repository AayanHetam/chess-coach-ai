"use client";

import { Box, Button, Stack, Typography } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { motion } from "framer-motion";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  Globe,
  MousePointerClick,
  Quote,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { SIGN_IN_PROPS } from "@/components/ads/PartnerSlot";
import { Masti, MastiAvatar, mastiStillSrcSet } from "@/components/masti";
import { HeroMastiStage } from "@/components/landing/HeroMasti";
import { BorderBeam } from "@/components/ui/BorderBeam";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import { RevealOnScroll } from "@/components/ui/RevealOnScroll";
import { InternalHomeCard } from "@/components/intern/InternalHomeCard";
import { useAuth } from "@/contexts/AuthContext";
import { startPlanHref } from "@/lib/onboarding/quizGate";
import { homePageJsonLd } from "@/app/_seo/JsonLd";
import {
  EXPERT_TESTIMONIALS,
  testimonialInitials,
  type ExpertTestimonial,
} from "@/data/expertTestimonials";

const HOME_TITLE = "Chess Masti AI — engine-grounded chess coaching, free";
const HOME_DESC =
  "AI chess coach: Stockfish 17 evaluates first, Claude explains, a hallucination validator checks every claim. 100,000+ Lichess puzzles in a Neo4j graph. Free.";
const HOME_OG_IMAGE = "https://chessmasti.com/og/home";

export const launchTheme = createTheme({
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
      prefetch={false}
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
      prefetch={false}
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
        {/* The coach has a face now: Masti, mid-idea, because the bubble
            under him is the answer. Still image, a 32px loop would be noise. */}
        <MastiAvatar mood="idea" size={32} />
        <Box>
          <Typography
            sx={{
              fontSize: "0.88rem",
              fontWeight: 600,
              color: "rgba(255,255,255,0.94)",
              lineHeight: 1.1,
            }}
          >
            Masti
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

export function Hero() {
  return (
    <Box
      component="section"
      aria-labelledby="hero-heading"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1.08fr 0.92fr" },
        alignItems: "center",
        columnGap: { md: 5, lg: 7 },
        rowGap: { xs: 1.5 },
        pt: { xs: 1, md: 2 },
        pb: { xs: 5, md: 8 },
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: { xs: "center", md: "flex-start" },
          textAlign: { xs: "center", md: "left" },
        }}
      >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1], delay: 0.2 }}
      >
        <Box sx={{ mt: { xs: 1.5, md: 0 } }}>
          <EyebrowBadge>CHESS EDUCATION FOR EVERYONE</EyebrowBadge>
        </Box>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.7,
          ease: [0.22, 0.61, 0.36, 1],
          delay: 0.3,
        }}
      >
        <Typography
          id="hero-heading"
          variant="h1"
          sx={{
            mt: 2,
            fontSize: { xs: "2.15rem", sm: "3rem", md: "3.6rem", lg: "4rem" },
            color: "rgba(255,255,255,0.96)",
            maxWidth: 920,
            mx: { xs: "auto", md: 0 },
          }}
        >
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
            Meet Masti.
          </Box>{" "}
          Chess coaching for everyone.
        </Typography>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.7,
          ease: [0.22, 0.61, 0.36, 1],
          delay: 0.4,
        }}
      >
        <Typography
          sx={{
            mt: { xs: 2, md: 2.5 },
            fontSize: { xs: "0.98rem", md: "1.12rem", lg: "1.18rem" },
            lineHeight: 1.5,
            color: "rgba(255,255,255,0.66)",
            maxWidth: { xs: 720, md: 600 },
            mx: { xs: "auto", md: 0 },
          }}
        >
          World-class chess coaching has been out of reach for most players.
          Masti changes that: Stockfish 17 calculates, Masti explains in plain
          words, and a validator checks every claim.{" "}
          <Box
            component="span"
            sx={{ color: "rgba(255,255,255,0.92)", fontWeight: 600 }}
          >
            The same caliber, free for everyone.
          </Box>
        </Typography>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.7,
          ease: [0.22, 0.61, 0.36, 1],
          delay: 0.5,
        }}
      >
        <Stack
          direction="row"
          spacing={2}
          justifyContent={{ xs: "center", md: "flex-start" }}
          sx={{ mt: { xs: 3, md: 3.5 }, flexWrap: "wrap" }}
        >
          {/* Program-first (2026-08-10): the plan is the product, so it
              leads. "Analyze a game" stays as the secondary action: it is
              the conversion path for AEO traffic arriving on coach queries
              and must not be removed. */}
          <StartPlanCTA />
          <GhostCTA href="/analysis">Analyze a game</GhostCTA>
        </Stack>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.7,
          ease: [0.22, 0.61, 0.36, 1],
          delay: 0.6,
        }}
      >
        <GmBackedLine />
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.7 }}
      >
        <Stack
          direction="row"
          spacing={3}
          justifyContent={{ xs: "center", md: "flex-start" }}
          sx={{
            mt: 3.5,
            color: "rgba(255,255,255,0.42)",
            fontSize: "0.78rem",
            letterSpacing: "0.04em",
            flexWrap: "wrap",
          }}
        >
          <Box>Engine-grounded AI coaching</Box>
          {/* The account line and its separator drop out under the
              ChessUSA preview prefix. See SIGN_IN_ATTR. */}
          <Box {...SIGN_IN_PROPS}>·</Box>
          <Box {...SIGN_IN_PROPS}>Free account, no card</Box>
          <Box>·</Box>
          <Box>Lichess sync</Box>
        </Stack>
      </motion.div>
      </Box>

      {/* The headline leads and Masti follows: on a phone the stage sits
          under the copy, from md up he stands big to its right. Either way
          the primary CTA lands above the fold (masti.spec asserts it at
          390x664 and at 1280x720). */}
      <HeroMastiStage />
    </Box>
  );
}

/**
 * The coach chat, right under the hero: the product Masti was pointing at.
 * One card, centered, so the conversation is the second thing a visitor
 * reads and the first thing they can picture themselves doing.
 */
function AskMastiSection() {
  return (
    <Box
      component="section"
      aria-labelledby="ask-masti-heading"
      sx={{ pt: { xs: 2, md: 2 }, pb: { xs: 4, md: 6 } }}
    >
      <RevealOnScroll>
        <Box sx={{ maxWidth: 720, mx: "auto", textAlign: "center", mb: 4 }}>
          <EyebrowBadge>ASK MASTI ANYTHING</EyebrowBadge>
          <Typography
            id="ask-masti-heading"
            variant="h2"
            sx={{
              mt: 2.5,
              fontSize: { xs: "1.8rem", md: "2.4rem" },
              color: "rgba(255,255,255,0.96)",
            }}
          >
            Every answer starts with the engine{" "}
            <Box
              component="span"
              sx={{
                background: "linear-gradient(135deg, #F97316, #A855F7)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              and ends in plain words.
            </Box>
          </Typography>
        </Box>
      </RevealOnScroll>
      <RevealOnScroll delay={0.08}>
        <Box sx={{ maxWidth: 680, mx: "auto", perspective: "1200px" }}>
          <GlassChatPreview />
        </Box>
      </RevealOnScroll>
    </Box>
  );
}

export function MarqueeStrip() {
  const items = [
    "Masti, your coach",
    "Stockfish 17",
    "Engine-grounded AI coach",
    "Hallucination validator",
    "100,000 Lichess puzzles",
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
                prefetch={false}
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

/** "A and B", or "A, B and C" for longer lists. */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * One-line credibility signal for the hero: the titled players' faces and
 * names, linking to their words in the section below. Deliberately quiet.
 * The endorsement is a selling point, not the product's positioning, so it
 * sits under the CTAs rather than in the headline.
 */
function GmBackedLine() {
  return (
    <Box
      component="a"
      href="#gm-backed"
      sx={{
        mt: 3.5,
        display: "inline-flex",
        alignItems: "center",
        gap: 1.5,
        textDecoration: "none",
        color: "rgba(255,255,255,0.72)",
        fontSize: "0.92rem",
        lineHeight: 1.3,
        transition: "color 200ms",
        "&:hover": { color: "rgba(255,255,255,0.94)" },
        "&:hover .gm-backed-arrow": { transform: "translateX(3px)" },
      }}
    >
      <Box sx={{ display: "flex", flexShrink: 0 }}>
        {EXPERT_TESTIMONIALS.map((t, i) => (
          <Box
            key={t.id}
            aria-hidden
            sx={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              overflow: "hidden",
              ml: i === 0 ? 0 : -1,
              boxShadow: "0 0 0 2px #0F1014, 0 0 0 3px rgba(249,115,22,0.45)",
              background: "linear-gradient(135deg, #F97316, #A855F7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.62rem",
              fontWeight: 800,
              color: "#0A0A0A",
            }}
          >
            {t.photo ? (
              <Image
                src={t.photo.src}
                alt=""
                width={64}
                height={64}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            ) : (
              testimonialInitials(t.name)
            )}
          </Box>
        ))}
      </Box>
      <Box component="span">
        Backed by{" "}
        <Box
          component="span"
          sx={{ color: "rgba(255,255,255,0.94)", fontWeight: 600 }}
        >
          {joinNames(EXPERT_TESTIMONIALS.map((t) => t.name))}
        </Box>
      </Box>
      <ArrowRight
        className="gm-backed-arrow"
        size={15}
        style={{ flexShrink: 0, transition: "transform 200ms" }}
      />
    </Box>
  );
}

/**
 * Circular portrait filling the card's left third. Falls back to the
 * person's initials when no photograph is on file, so both cards keep the
 * same geometry whether or not a photo has been supplied.
 */
function TestimonialPortrait({
  testimonial: t,
}: {
  testimonial: ExpertTestimonial;
}) {
  const ring = {
    width: "100%",
    maxWidth: { xs: 128, sm: 160 },
    aspectRatio: "1 / 1",
    borderRadius: "50%",
    flexShrink: 0,
    overflow: "hidden",
    position: "relative",
    boxShadow:
      "0 0 0 3px rgba(8,9,12,0.9), 0 0 0 5px rgba(249,115,22,0.55), 0 12px 32px rgba(0,0,0,0.45)",
  } as const;

  if (t.photo) {
    return (
      <Box sx={ring}>
        <Image
          src={t.photo.src}
          alt={`Portrait of ${t.name}`}
          width={320}
          height={320}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </Box>
    );
  }

  return (
    <Box
      aria-hidden
      sx={{
        ...ring,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #F97316, #A855F7)",
        color: "#0A0A0A",
        fontWeight: 800,
        fontSize: { xs: "2.2rem", sm: "2.8rem" },
        letterSpacing: "-0.02em",
      }}
    >
      {testimonialInitials(t.name)}
    </Box>
  );
}

/**
 * Expert Testimonials: titled players on the project, quoted verbatim from
 * src/data/expertTestimonials.ts. Sits directly under the hero so the
 * endorsement is the first thing a visitor reads after the pitch. It is a
 * credibility signal, not the positioning: the headline above it stays about
 * free coaching for everyone, and this section says who vouches for it.
 *
 * Each card splits one third / two thirds: portrait, name, and credential on
 * the left, the quote on the right. Cards stack to a single column on phones.
 *
 * The grid is two columns wide. With an odd roster the last card would sit
 * alone in the left column with a hole beside it, so it spans the full row
 * instead and its portrait/quote split widens to one quarter / three
 * quarters, which suits the longer quote that currently lands there.
 */
function ExpertTestimonials() {
  const lastSpansRow =
    EXPERT_TESTIMONIALS.length % 2 === 1 ? EXPERT_TESTIMONIALS.length - 1 : -1;
  return (
    <Box
      component="section"
      id="gm-backed"
      aria-labelledby="expert-testimonials-heading"
      sx={{ py: { xs: 6, md: 10 }, scrollMarginTop: 96 }}
    >
      <RevealOnScroll>
        <Box sx={{ maxWidth: 720, mb: 6 }}>
          <EyebrowBadge>BACKED BY GRANDMASTERS</EyebrowBadge>
          <Typography
            id="expert-testimonials-heading"
            variant="h2"
            sx={{
              mt: 2.5,
              fontSize: { xs: "2rem", md: "2.8rem" },
              color: "rgba(255,255,255,0.96)",
            }}
          >
            What titled players say{" "}
            <Box
              component="span"
              sx={{
                background: "linear-gradient(135deg, #F97316, #A855F7)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              about Chess Masti.
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
            Two grandmasters and a FIDE Master who have seen the project, in
            their own words.
          </Typography>
        </Box>
      </RevealOnScroll>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
          gap: 2.5,
          alignItems: "stretch",
        }}
      >
        {EXPERT_TESTIMONIALS.map((t, i) => (
          <RevealOnScroll
            key={t.id}
            delay={i * 0.1}
            style={{
              display: "flex",
              gridColumn: i === lastSpansRow ? "1 / -1" : undefined,
            }}
          >
            <Box
              component="figure"
              sx={{
                m: 0,
                flex: 1,
                position: "relative",
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "minmax(0, 1fr) minmax(0, 2fr)",
                  md:
                    i === lastSpansRow
                      ? "minmax(0, 1fr) minmax(0, 3fr)"
                      : "minmax(0, 1fr) minmax(0, 2fr)",
                },
                gap: { xs: 3, sm: 3.5 },
                alignItems: "center",
                borderRadius: "1.5rem",
                background: "rgba(20,22,28,0.55)",
                backdropFilter: "blur(14px) saturate(140%)",
                WebkitBackdropFilter: "blur(14px) saturate(140%)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow:
                  "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
                p: 4,
                transition: "all 240ms cubic-bezier(0.22, 0.61, 0.36, 1)",
                "&:hover": {
                  transform: "translateY(-3px)",
                  boxShadow:
                    "0 16px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1)",
                },
              }}
            >
              <Box
                component="figcaption"
                sx={{
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                }}
              >
                <TestimonialPortrait testimonial={t} />
                <Typography
                  sx={{
                    mt: 2,
                    fontWeight: 700,
                    fontSize: "0.98rem",
                    lineHeight: 1.2,
                    color: "rgba(255,255,255,0.94)",
                  }}
                >
                  {t.name}
                </Typography>
                <Typography
                  sx={{
                    mt: 0.5,
                    fontSize: "0.74rem",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.5)",
                  }}
                >
                  {t.title}
                </Typography>
              </Box>

              <Box sx={{ minWidth: 0 }}>
                <Box
                  aria-hidden
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(249,115,22,0.12)",
                    border: "1px solid rgba(249,115,22,0.3)",
                    mb: 2.5,
                    mx: { xs: "auto", sm: 0 },
                  }}
                >
                  <Quote size={18} color="#F97316" />
                </Box>
                <Typography
                  component="blockquote"
                  sx={{
                    m: 0,
                    fontSize: { xs: "1.1rem", md: "1.22rem" },
                    fontWeight: 500,
                    lineHeight: 1.5,
                    letterSpacing: "-0.01em",
                    color: "rgba(255,255,255,0.9)",
                    textAlign: { xs: "center", sm: "left" },
                  }}
                >
                  {t.quote}
                </Typography>
              </Box>
            </Box>
          </RevealOnScroll>
        ))}
      </Box>
    </Box>
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
          <Box sx={{ display: "flex", justifyContent: "center", mb: 2.5 }}>
            <Masti mood="excited" size={150} loops={2} replayOnHover />
          </Box>
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: "2rem", md: "3rem" },
              color: "rgba(255,255,255,0.96)",
              mb: 2,
            }}
          >
            Meet Masti at the board.{" "}
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
              Free, for everyone.
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
            Engine analysis runs in your browser with no account at all. Masti
            needs a free account — no card — and his requests are sent
            securely to Anthropic or OpenAI. Every coaching feature is free.
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
      sx={{ py: 5, borderTop: "1px solid rgba(255,255,255,0.06)" }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: 2,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <MastiAvatar mood="wave" size={22} ring={false} />
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
          {[
            { href: "/privacy", label: "Privacy" },
            { href: "/terms", label: "Terms" },
            { href: "/accessibility", label: "Accessibility" },
          ].map((link) => (
            <Box
              key={link.href}
              component="a"
              href={link.href}
              sx={{
                color: "rgba(255,255,255,0.42)",
                textDecoration: "none",
                "&:hover": { color: "rgba(255,255,255,0.7)" },
                transition: "color 0.2s",
              }}
            >
              {link.label}
            </Box>
          ))}
        </Stack>
      </Box>
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
        {/* Masti is the first thing on the first screen on every viewport,
            so his still is fetched with the HTML rather than after the JS
            decides on the srcset. */}
        <link
          key="masti-hero-preload"
          rel="preload"
          as="image"
          type="image/webp"
          imageSrcSet={mastiStillSrcSet("wave")}
        />

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
          <AskMastiSection />
          <ExpertTestimonials />
          <MarqueeStrip />
          <ChromeExtension />
          <FinalCTA />
          <Footer />
        </Box>
      </Box>
    </ThemeProvider>
  );
}
