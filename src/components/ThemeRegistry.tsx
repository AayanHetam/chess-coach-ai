"use client";

import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { buildChessMastiTheme } from "@/theme/chessMasti";
import { MotionConfig } from "framer-motion";

// The App Router tree is the content pages (SEO landings, legal, internship).
// They read best on white, so this is the site theme in its light mode: the
// same type scale, buttons and controls as the product, on a light surface.
const theme = buildChessMastiTheme({ mode: "light" });

export default function ThemeRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </ThemeProvider>
  );
}
