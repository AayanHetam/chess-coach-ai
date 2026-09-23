import { createTheme, type SxProps, type Theme } from "@mui/material/styles";

/**
 * The home page's palette, MUI theme and page frame. Flat and dark on
 * purpose: one background, one surface, one accent, big type. The product
 * pages keep their own theme in src/theme/chessMasti.ts; this one styles
 * only the home page and the partner preview's copy of it.
 */
export const HOME_BG = "#08090C";
export const HOME_SURFACE = "#1F232C";
export const HOME_TEXT = "rgba(255,255,255,0.94)";
export const HOME_MUTED = "rgba(255,255,255,0.62)";
export const HOME_EMBER = "#F97316";
export const HOME_EMBER_BRIGHT = "#FB923C";

export const launchTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: HOME_EMBER },
    background: { default: HOME_BG, paper: HOME_SURFACE },
    text: { primary: HOME_TEXT, secondary: HOME_MUTED },
  },
  typography: {
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    h1: { fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05 },
    h2: { fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 },
    button: { textTransform: "none", fontWeight: 800, letterSpacing: 0 },
  },
});

/**
 * The page root: exactly one screen tall, a column with the nav on top and
 * the footer at the bottom, so the home page never scrolls on the screens
 * it is sized for. `--home-vh` is the viewport height the hero sizes Masti
 * against: the dynamic viewport where the browser has it (a phone's
 * toolbars come off it), the plain one elsewhere. Below the sizes the hero
 * is tuned for the column grows and the page scrolls, never clips.
 */
export const homeRootSx: SxProps<Theme> = {
  "--home-vh": "100vh",
  "@supports (height: 100dvh)": { "--home-vh": "100dvh" },
  minHeight: "var(--home-vh)",
  display: "flex",
  flexDirection: "column",
  width: "100%",
  color: HOME_TEXT,
  pt: 3,
  px: { xs: 2, md: 4 },
};

/** The content column under the nav: takes the rest of the screen. */
export const homeColumnSx: SxProps<Theme> = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxWidth: 1120,
  mx: "auto",
};
