"use client";

import { Box, Typography } from "@mui/material";
import { BookOpen, Crown, Puzzle, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { surfaceAccent } from "@/components/ui/accents";
import {
  HOME_BORDER,
  HOME_MUTED,
  HOME_SURFACE,
  HOME_SURFACE_HOVER,
  HOME_TEXT,
} from "./launchTheme";

/**
 * The four doors: one word each, in the nav's own words and colours, so the
 * tile a visitor taps here is the link they find lit up in the nav on the
 * other side. Analyze stays whatever else changes: it is the landing for
 * coach queries and must not be removed from the home page.
 */
export interface HomeChoice {
  /** The nav id, which also picks the surface colour. */
  id: "play" | "practice" | "analysis" | "learn";
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
}

export const HOME_CHOICES: readonly HomeChoice[] = [
  {
    id: "play",
    label: "Play",
    hint: "Play a game",
    href: "/play",
    icon: Crown,
  },
  {
    id: "practice",
    label: "Practice",
    hint: "Solve puzzles",
    href: "/practice",
    icon: Puzzle,
  },
  {
    id: "analysis",
    label: "Analyze",
    hint: "Check your game",
    href: "/analysis",
    icon: Zap,
  },
  {
    id: "learn",
    label: "Learn",
    hint: "Openings, step by step",
    href: "/learn",
    icon: BookOpen,
  },
];

export const CHOICES_HEADING = "What do you want to do?";

export function HomeChoices() {
  return (
    <Box
      component="section"
      aria-labelledby="choices-heading"
      sx={{ py: { xs: 4, md: 6 } }}
    >
      <Typography
        id="choices-heading"
        variant="h2"
        sx={{
          textAlign: "center",
          fontSize: { xs: "1.8rem", md: "2.6rem" },
          color: HOME_TEXT,
        }}
      >
        {CHOICES_HEADING}
      </Typography>
      <Box
        sx={{
          mt: { xs: 4, md: 6 },
          display: "grid",
          gridTemplateColumns: {
            xs: "repeat(2, minmax(0, 1fr))",
            md: "repeat(4, minmax(0, 1fr))",
          },
          gap: { xs: 2, md: 3 },
        }}
      >
        {HOME_CHOICES.map((choice) => {
          const accent = surfaceAccent(choice.id);
          const Icon = choice.icon;
          return (
            <Box
              key={choice.id}
              component={Link}
              href={choice.href}
              prefetch={false}
              data-testid={`home-choice-${choice.id}`}
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                minHeight: { xs: 176, md: 236 },
                p: { xs: 2.5, md: 3 },
                borderRadius: "28px",
                background: HOME_SURFACE,
                border: HOME_BORDER,
                textDecoration: "none",
                transition:
                  "transform 160ms ease, border-color 160ms ease, background-color 160ms ease",
                "&:hover": {
                  transform: "translateY(-3px)",
                  borderColor: accent.border,
                  background: HOME_SURFACE_HOVER,
                },
                "&:focus-visible": {
                  outline: `3px solid ${accent.bright}`,
                  outlineOffset: 3,
                },
              }}
            >
              <Box
                aria-hidden
                sx={{
                  width: { xs: 64, md: 80 },
                  height: { xs: 64, md: 80 },
                  borderRadius: "50%",
                  background: accent.soft,
                  color: accent.bright,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon size={36} strokeWidth={2.25} />
              </Box>
              <Typography
                component="span"
                sx={{
                  mt: 2,
                  fontSize: { xs: "1.35rem", md: "1.6rem" },
                  fontWeight: 800,
                  lineHeight: 1.1,
                  color: HOME_TEXT,
                }}
              >
                {choice.label}
              </Typography>
              <Typography
                component="span"
                sx={{
                  mt: 0.75,
                  fontSize: { xs: "0.95rem", md: "1.05rem" },
                  color: HOME_MUTED,
                }}
              >
                {choice.hint}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
