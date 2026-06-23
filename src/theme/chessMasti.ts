import { createTheme } from "@mui/material/styles";

/**
 * Chess Masti "Obsidian Glass, Ember Core" dark theme.
 *
 * Lifted verbatim from the /preview/* design mocks (preview/play.tsx,
 * preview/profile.tsx) so the canonical /play and /profile surfaces share
 * one source of truth with the prototypes that designed them. Pages that
 * adopt this wrap their content in <ThemeProvider theme={chessMastiDarkTheme}>
 * plus <GradientBackdrop/> + <NavPill/> and live in the full-bleed branch of
 * src/sections/layout/index.tsx (no legacy NavBar).
 *
 * Ember (#F97316 / #FB923C) is the accent/glow — never a surface fill.
 */
export const chessMastiDarkTheme = createTheme({
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
