"use client";

import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { LINE, RADIUS, SURFACE } from "@/theme/tokens";

/**
 * The dashboard's card shell.
 *
 * A dense dashboard where every card is static content should sit still:
 * a solid raised surface with a hairline border, no motion.
 *
 * Also exists to kill the copy-pasted 12-line `sx` blob that was repeated on
 * every panel of the old page.
 */

interface PanelCardProps {
  title?: string;
  /** Small grey line under the title — the place to state sample size. */
  subtitle?: string;
  /** Right-aligned slot in the header, e.g. a window selector. */
  action?: ReactNode;
  children: ReactNode;
  padding?: number;
}

export const PANEL_SURFACE = {
  borderRadius: `${RADIUS.card}px`,
  background: SURFACE.raised,
  border: `1px solid ${LINE.hairline}`,
} as const;

export function PanelCard({
  title,
  subtitle,
  action,
  children,
  padding = 2.5,
}: PanelCardProps) {
  return (
    <Box
      sx={{ ...PANEL_SURFACE, p: padding, height: "100%", overflow: "hidden" }}
    >
      {(title || action) && (
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 1.5,
            mb: subtitle ? 0.25 : 2,
            flexWrap: "wrap",
          }}
        >
          {title && (
            <Typography
              sx={{
                fontSize: "0.95rem",
                fontWeight: 700,
                color: "rgba(255,255,255,0.92)",
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </Typography>
          )}
          {action}
        </Box>
      )}
      {subtitle && (
        <Typography
          sx={{
            fontSize: "0.75rem",
            color: "rgba(255,255,255,0.42)",
            mb: 2,
          }}
        >
          {subtitle}
        </Typography>
      )}
      {children}
    </Box>
  );
}
