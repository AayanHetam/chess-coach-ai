"use client";

import { Box, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { Masti, MASTI_NAME } from "@/components/masti";

/**
 * Masti on the landing page.
 *
 * Two placements, both purely presentational:
 *
 *   HeroMastiGreeting  the big one. Sits at the top of the hero's right
 *                      column on md+ (he leans on the coach chat card) and
 *                      between the trust captions and that card on phones.
 *   HeroMastiMini      phone-only: a 64px Masti at the end of the eyebrow
 *                      row so the very first screen has him without pushing
 *                      the primary CTA under the fold.
 *
 * The copy makes no sign-in ask on purpose, so nothing here needs
 * SIGN_IN_PROPS and the partner preview links show it unchanged.
 */

export const HERO_MASTI_LINE =
  "Bring me a game or a puzzle and I'll show you the idea behind every move.";

export function HeroMastiGreeting() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1], delay: 0.35 }}
      style={{ position: "relative", zIndex: 2 }}
    >
      <Box
        data-testid="hero-masti"
        sx={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: { xs: "flex-start", md: "flex-end" },
          gap: { xs: 1.5, md: 2 },
          // The feet overlap the top edge of the chat card so he reads as
          // leaning on it rather than floating above it.
          mb: { xs: -1.5, md: -3 },
          pr: { md: 1 },
        }}
      >
        <Box
          sx={{
            order: { xs: 1, md: 0 },
            maxWidth: { xs: 260, md: 300 },
            mb: { xs: 3, md: 6 },
            position: "relative",
            px: 2,
            py: 1.5,
            borderRadius: "16px",
            background: "rgba(20,22,28,0.72)",
            backdropFilter: "blur(12px) saturate(140%)",
            WebkitBackdropFilter: "blur(12px) saturate(140%)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.32)",
            "&::after": {
              content: '""',
              position: "absolute",
              width: 12,
              height: 12,
              bottom: 18,
              background: "rgba(20,22,28,0.72)",
              transform: "rotate(45deg)",
              // The tail points at Masti: he stands to the bubble's RIGHT on
              // md+ (order 1) and to its LEFT on phones (order 0).
              left: { xs: -7, md: "auto" },
              right: { xs: "auto", md: -7 },
              borderLeft: { xs: "1px solid rgba(255,255,255,0.1)", md: 0 },
              borderBottom: { xs: "1px solid rgba(255,255,255,0.1)", md: 0 },
              borderRight: { md: "1px solid rgba(255,255,255,0.1)" },
              borderTop: { md: "1px solid rgba(255,255,255,0.1)" },
            },
          }}
        >
          <Typography
            sx={{
              fontSize: "0.8rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#FB923C",
              lineHeight: 1.2,
              mb: 0.5,
            }}
          >
            Hi, I&apos;m {MASTI_NAME}
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: "0.9rem", md: "0.95rem" },
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.9)",
            }}
          >
            {HERO_MASTI_LINE}
          </Typography>
        </Box>
        <Box
          sx={{
            order: { xs: 0, md: 1 },
            width: { xs: 132, sm: 160, md: 220, lg: 250 },
            flexShrink: 0,
          }}
        >
          <Masti
            mood="wave"
            size={250}
            fluid
            priority
            loops={3}
            replayOnHover
            label="Masti the Monkey, the Chess Masti mascot, waving hello"
          />
        </Box>
      </Box>
    </motion.div>
  );
}

export function HeroMastiMini() {
  return (
    <Box
      data-testid="hero-masti-mini"
      sx={{ display: { xs: "block", md: "none" }, width: 64, flexShrink: 0 }}
    >
      <Masti mood="wave" size={64} fluid priority loops={3} decorative />
    </Box>
  );
}
