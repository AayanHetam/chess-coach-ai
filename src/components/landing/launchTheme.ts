import { createTheme } from "@mui/material/styles";

/**
 * The home page's palette and MUI theme. Flat and dark on purpose: one
 * background, one surface, one accent, big type. The product pages keep
 * their own theme in src/theme/chessMasti.ts; this one styles only the home
 * page and the partner preview's copy of it.
 */
export const HOME_BG = "#08090C";
export const HOME_SURFACE = "#14161C";
export const HOME_SURFACE_HOVER = "#1A1D25";
export const HOME_BORDER = "1px solid rgba(255,255,255,0.09)";
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
