"use client";

import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

/**
 * The dashboard's card shell.
 *
 * Deliberately not `BentoCard` — that one lifts and scales on hover, which
 * reads as "clickable marketing tile". A dense dashboard where every card is
 * static content should sit still. Same glass tokens, no motion.
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
  borderRadius: "1.25rem",
  background: "rgba(20,22,28,0.55)",
  backdropFilter: "blur(14px) saturate(140%)",
  WebkitBackdropFilter: "blur(14px) saturate(140%)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow:
    "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
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
