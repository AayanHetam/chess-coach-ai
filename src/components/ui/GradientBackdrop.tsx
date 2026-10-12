"use client";

import { Box } from "@mui/material";
import { SURFACE } from "@/theme/tokens";

/**
 * A solid page background behind everything.
 *
 * This used to paint blurred gradient orbs and a dot grid; since the 2026-10
 * redesign the page is one flat colour and the theme's baseline already sets
 * it on <body>. The component stays as a fixed solid layer so the pages that
 * still mount it keep rendering while they are migrated off it, after which
 * it goes.
 */
export function GradientBackdrop() {
  return (
    <Box
      aria-hidden
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        background: SURFACE.page,
      }}
    />
  );
}
