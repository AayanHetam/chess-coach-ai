"use client";

import { Box, Button, Typography } from "@mui/material";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { startPlanHref } from "@/lib/onboarding/quizGate";
import { HeroMastiStage } from "./HeroMasti";
import {
  HOME_EMBER,
  HOME_EMBER_BRIGHT,
  HOME_MUTED,
  HOME_TEXT,
} from "./launchTheme";

/**
 * The first screen: Masti, one sentence, one button.
 *
 * Everything a first visitor needs in order to decide is here and nothing
 * else. The headline names the coach, the line under it names the three
 * things to do, and the button starts. The four tiles in HomeChoices, right
 * under this, are the direct doors for anyone who already knows what they
 * came for. The word budget is pinned in __tests__/home.test.tsx.
 */

export const HERO_HEADLINE = "I'm Masti, your chess coach.";
export const HERO_SUBLINE = "Play, practice, and learn. Free for everyone.";
export const START_LABEL = "Let's go";

/**
 * The start button, routed by onboarding state.
 *
 * Visitors and not-yet-personalized users go into the quiz; anyone who has
 * already answered it goes straight to /plan. SSR renders the /onboarding
 * href (auth is still `loading` on first paint), which is also the right
 * target for the crawlers that index this page.
 */
export function StartButton() {
  const { user, profile, loading } = useAuth();
  const href = startPlanHref({
    loading,
    hasUser: !!user,
    onboardingCompletedAt: profile?.onboardingCompletedAt,
  });
  return (
    <Button
      component={Link}
      href={href}
      prefetch={false}
      variant="contained"
      disableElevation
      endIcon={<ArrowRight size={24} strokeWidth={2.5} />}
      sx={{
        bgcolor: HOME_EMBER,
        color: "#0A0A0A",
        fontSize: { xs: "1.2rem", md: "1.35rem" },
        px: { xs: 4, md: 5 },
        py: { xs: 1.5, md: 1.75 },
        minHeight: 64,
        borderRadius: "999px",
        "&:hover": { bgcolor: HOME_EMBER_BRIGHT },
        "&:focus-visible": { outline: "3px solid #FFFFFF", outlineOffset: 3 },
      }}
    >
      {START_LABEL}
    </Button>
  );
}

export function Hero() {
  return (
    <Box
      component="section"
      aria-labelledby="hero-heading"
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          md: "minmax(0, 5fr) minmax(0, 6fr)",
        },
        alignItems: "center",
        columnGap: { md: 6, lg: 8 },
        rowGap: { xs: 3, sm: 4 },
        pt: { xs: 1, md: 2 },
        pb: { xs: 8, md: 12 },
      }}
    >
      {/* Masti first: the top of the screen on a phone, the left half on a
          desktop. Either way the button lands above the fold (masti.spec
          asserts it at 390x664 and at 1280x720). */}
      <HeroMastiStage />
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: { xs: "center", md: "flex-start" },
          textAlign: { xs: "center", md: "left" },
        }}
      >
        <Typography
          id="hero-heading"
          variant="h1"
          sx={{
            fontSize: { xs: "2.2rem", sm: "2.8rem", md: "3.4rem", lg: "4rem" },
            color: HOME_TEXT,
            maxWidth: 560,
          }}
        >
          {HERO_HEADLINE}
        </Typography>
        <Typography
          sx={{
            mt: { xs: 1.5, md: 2.5 },
            fontSize: { xs: "1.15rem", md: "1.45rem" },
            lineHeight: 1.45,
            color: HOME_MUTED,
            maxWidth: 460,
          }}
        >
          {HERO_SUBLINE}
        </Typography>
        <Box sx={{ mt: { xs: 3, md: 4.5 } }}>
          <StartButton />
        </Box>
      </Box>
    </Box>
  );
}
