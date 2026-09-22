"use client";

import { Box, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { Masti, MASTI_NAME } from "@/components/masti";

/**
 * Masti on the landing page: the stage at the top of the hero.
 *
 * He is the face of the brand and shares the first screen with the headline
 * on every viewport. The copy leads: on a phone he stands under it with his
 * greeting in a bubble beside him; on a tablet or a desktop he stands big to
 * its right with the greeting above his head, so the primary call to action
 * stays above a 720px fold. Purely
 * presentational: no chess state, and no sign-in ask, so nothing here needs
 * SIGN_IN_PROPS and the partner preview links show it unchanged.
 *
 * Sizing is explicit through the figure's size prop and a fluid box, never
 * emotion alone: the Pages Router has no Emotion SSR cache, and the first
 * paint must already hold his shape. The still is preloaded from the page
 * head on every viewport, so the figure itself can stay lazy.
 */

export const HERO_MASTI_LINE =
  "Bring me a game or a puzzle and I'll show you the idea behind every move.";

const BUBBLE_BG = "rgba(20,22,28,0.72)";
const BUBBLE_BORDER = "1px solid rgba(255,255,255,0.1)";

export function HeroMastiStage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1], delay: 0.05 }}
      style={{ position: "relative", zIndex: 2, width: "100%" }}
    >
      <Box
        data-testid="hero-masti"
        sx={{
          position: "relative",
          display: "flex",
          flexDirection: { xs: "row", md: "column" },
          alignItems: "center",
          justifyContent: "center",
          gap: { xs: 1.5, sm: 2.5, md: 2 },
          mx: "auto",
          maxWidth: 760,
          px: 1,
          // The stage light behind him: the ember halo the brand mark wears,
          // soft enough that the headline under it stays the loudest thing.
          "&::before": {
            content: '""',
            position: "absolute",
            left: "50%",
            top: "50%",
            width: { xs: 240, md: 520 },
            height: { xs: 240, md: 520 },
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(249,115,22,0.22) 0%, rgba(249,115,22,0.08) 45%, transparent 70%)",
            filter: "blur(12px)",
            pointerEvents: "none",
          },
        }}
      >
        <Box
          sx={{
            position: "relative",
            order: { xs: 0, md: 1 },
            width: { xs: 118, sm: 170, md: 300, lg: 340 },
            flexShrink: 0,
          }}
        >
          <Masti
            mood="wave"
            size={340}
            fluid
            loops={3}
            replayOnHover
            label="Masti the Monkey, the Chess Masti coach, waving hello"
          />
        </Box>
        <Box
          sx={{
            position: "relative",
            order: { xs: 1, md: 0 },
            maxWidth: { xs: 226, sm: 270, md: 340 },
            px: { xs: 1.5, md: 2.25 },
            py: { xs: 1.1, md: 1.5 },
            borderRadius: "18px",
            background: BUBBLE_BG,
            backdropFilter: "blur(12px) saturate(140%)",
            WebkitBackdropFilter: "blur(12px) saturate(140%)",
            border: BUBBLE_BORDER,
            boxShadow: "0 8px 28px rgba(0,0,0,0.32)",
            textAlign: "left",
            // The tail points at Masti: he stands to the bubble's left on a
            // phone and under it from md up, so the tail sits on the left
            // edge or the bottom edge accordingly.
            "&::after": {
              content: '""',
              position: "absolute",
              width: 12,
              height: 12,
              left: { xs: -7, md: "50%" },
              top: { xs: "50%", md: "auto" },
              bottom: { xs: "auto", md: -7 },
              marginTop: { xs: "-6px", md: 0 },
              marginLeft: { xs: 0, md: "-6px" },
              background: BUBBLE_BG,
              transform: "rotate(45deg)",
              borderLeft: { xs: BUBBLE_BORDER, md: 0 },
              borderRight: { xs: 0, md: BUBBLE_BORDER },
              borderBottom: BUBBLE_BORDER,
            },
          }}
        >
          <Typography
            sx={{
              fontSize: { xs: "0.74rem", md: "0.8rem" },
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
              fontSize: { xs: "0.82rem", md: "1rem" },
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.9)",
            }}
          >
            {HERO_MASTI_LINE}
          </Typography>
        </Box>
      </Box>
    </motion.div>
  );
}
