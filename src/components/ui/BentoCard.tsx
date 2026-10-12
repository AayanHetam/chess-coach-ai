"use client";

import { Box } from "@mui/material";
import type { CSSProperties, ReactNode } from "react";
import { LINE, RADIUS, SURFACE } from "@/theme/tokens";

interface BentoCardProps {
  children: ReactNode;
  // Responsive sx values: pass "span 7" or { xs: "span 12", md: "span 7" }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gridColumn?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gridRow?: any;
  /** Kept for callers; the card no longer draws a beam. */
  beam?: boolean;
  beamDelay?: number;
  padding?: number | string;
  /** Kept for callers; the card no longer reveals on scroll. */
  revealDelay?: number;
  style?: CSSProperties;
}

/**
 * A grid card: a solid raised surface with a hairline border. It does not
 * move, lift, glow or reveal; it is a surface, not an object.
 */
export function BentoCard({
  children,
  gridColumn,
  gridRow,
  padding = 3.5,
  style,
}: BentoCardProps) {
  return (
    <Box sx={{ gridColumn, gridRow, display: "flex", minWidth: 0 }}>
      <Box
        sx={{
          position: "relative",
          flex: 1,
          borderRadius: `${RADIUS.card}px`,
          background: SURFACE.raised,
          border: `1px solid ${LINE.hairline}`,
          overflow: "hidden",
        }}
        style={style}
      >
        <Box sx={{ position: "relative", p: padding, height: "100%" }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
