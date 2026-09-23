"use client";

import { Box } from "@mui/material";
import { Masti } from "@/components/masti";

/**
 * Masti on the home page: the stage at the top of the hero.
 *
 * He is the biggest thing on the screen on every viewport, a plain still
 * with one word in a bubble. The headline and the button beside him carry
 * the pitch, so the stage itself only says hello. Purely presentational: no
 * chess state and no sign-in ask, so nothing here needs SIGN_IN_PROPS and
 * the partner preview links show it unchanged.
 *
 * Sizing is explicit through the figure's size prop and a fluid box, never
 * emotion alone: the Pages Router has no Emotion SSR cache, and the first
 * paint must already hold his shape. The still is preloaded from the page
 * head on every viewport, so the figure itself can stay lazy.
 */

export const HERO_MASTI_GREETING = "Hi!";

/** Intrinsic width for the image attributes; the box decides the drawn size. */
const HERO_MASTI_INTRINSIC_PX = 440;

/**
 * As wide as the screen allows and never so wide that the page scrolls: the
 * cap for the breakpoint, or the height left after the rest of the screen
 * (nav, headline, button, footer) turned into a width through the 4:5 art,
 * whichever is smaller, with a floor so a phone held sideways still shows
 * him. `--home-vh` comes from homeRootSx.
 */
function stageWidth(capPx: number, reservePx: number, floorPx: number): string {
  return `max(${floorPx}px, min(${capPx}px, calc((var(--home-vh, 100vh) - ${reservePx}px) * 0.8)))`;
}

export const HERO_MASTI_WIDTH = {
  // Stacked under the nav, over the headline and the button.
  xs: stageWidth(200, 430, 120),
  sm: stageWidth(300, 470, 140),
  // Beside the headline: only the nav and the footer are above and below.
  // The lg cap is his column's width at the 1120px content width.
  md: stageWidth(380, 250, 200),
  lg: stageWidth(480, 250, 200),
};

export function HeroMastiStage() {
  return (
    <Box
      data-testid="hero-masti"
      sx={{
        position: "relative",
        width: HERO_MASTI_WIDTH,
        mx: "auto",
        flexShrink: 0,
      }}
    >
      <Masti
        mood="wave"
        size={HERO_MASTI_INTRINSIC_PX}
        fluid
        loops={3}
        replayOnHover
        label="Masti the Monkey, the Chess Masti coach, saying hello"
      />
      {/* The bubble sits above his raised finger, top right of the art, with
          its tail pointing down at him. Plain white, so the one word in it
          is the sharpest thing on the screen. */}
      <Box
        sx={{
          position: "absolute",
          top: { xs: "1%", md: "2%" },
          right: { xs: "-6%", md: "-4%" },
          px: { xs: 1.75, md: 2.5 },
          py: { xs: 0.5, md: 0.75 },
          borderRadius: "999px",
          background: "#FFFFFF",
          color: "#0A0A0A",
          fontWeight: 800,
          fontSize: { xs: "1.25rem", md: "1.75rem" },
          lineHeight: 1.3,
          "&::after": {
            content: '""',
            position: "absolute",
            left: 14,
            bottom: -6,
            width: 14,
            height: 14,
            background: "#FFFFFF",
            borderRadius: "2px",
            transform: "rotate(45deg)",
          },
        }}
      >
        {HERO_MASTI_GREETING}
      </Box>
    </Box>
  );
}
