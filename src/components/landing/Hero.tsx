"use client";

import { Box, Button, Typography } from "@mui/material";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { startPlanHref } from "@/lib/onboarding/quizGate";
import { HeroMastiStage } from "./HeroMasti";
import { HomeMasters } from "./HomeMasters";
import {
  HOME_EMBER,
  HOME_EMBER_BRIGHT,
  HOME_MUTED,
  HOME_TEXT,
} from "./launchTheme";

/**
 * The one screen: Masti, one sentence, one button, the masters.
 *
 * Everything a first visitor needs in order to decide is here and nothing
 * else. The headline names the coach, the line under it names the three
 * things to do, the button starts, and the faces under it say who vouches
 * for him. The section takes whatever height the nav and the footer leave
 * and centres in it, so the page never scrolls on the screens it is sized
 * for. The word budget is pinned in __tests__/home.test.tsx.
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
        flex: 1,
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          md: "minmax(0, 5fr) minmax(0, 6fr)",
        },
        alignItems: "center",
        alignContent: "center",
        columnGap: { md: 6, lg: 8 },
        rowGap: { xs: 2.5, sm: 3 },
        py: { xs: 1, md: 2 },
      }}
    >
      {/* Masti first: the top of the screen on a phone, the left half on a
          desktop. Either way the button lands above the fold (masti.spec
          asserts it at 390x664 and at 1280x720, and landing.spec asserts
          the page does not scroll at all). */}
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
            fontSize: { xs: "2.1rem", sm: "2.8rem", md: "3.4rem", lg: "4rem" },
            color: HOME_TEXT,
            maxWidth: 560,
          }}
        >
          {HERO_HEADLINE}
        </Typography>
        <Typography
          sx={{
            mt: { xs: 1.25, md: 2.5 },
            fontSize: { xs: "1.1rem", md: "1.45rem" },
            lineHeight: 1.45,
            color: HOME_MUTED,
            maxWidth: 460,
          }}
        >
          {HERO_SUBLINE}
        </Typography>
        <Box sx={{ mt: { xs: 2.5, md: 4.5 } }}>
          <StartButton />
        </Box>
        {/* The faces need a row of their own, which a phone's screen has no
            room for next to a Masti this size; from a tablet up they sit
            under the button. */}
        <HomeMasters
          sx={{ display: { xs: "none", sm: "flex" }, mt: { sm: 3, md: 4 } }}
        />
      </Box>
    </Box>
  );
}
