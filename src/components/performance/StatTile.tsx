"use client";

import { Box, Typography } from "@mui/material";
import { PANEL_SURFACE } from "./PanelCard";

/**
 * One KPI. Value large, label small, optional hint smaller still.
 *
 * `value` is deliberately `string | null` rather than a number: null renders an
 * em dash, which is how every empty figure on this page has to read. Showing
 * "0%" for an untouched metric tells the user they failed at something they
 * never attempted.
 */

interface StatTileProps {
  label: string;
  value: string | null;
  /** Sub-line: the denominator, the sample size, the trend. */
  hint?: string;
  /** Accent the value colour. Used sparingly — the page is mostly white text. */
  tone?: "default" | "ember" | "positive" | "negative";
}

const TONE_COLORS: Record<NonNullable<StatTileProps["tone"]>, string> = {
  default: "rgba(255,255,255,0.94)",
  ember: "#FB923C",
  positive: "#4ADE80",
  negative: "#FCA5A5",
};

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: StatTileProps) {
  const empty = value === null;
  return (
    <Box
      sx={{
        ...PANEL_SURFACE,
        p: 2,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 0.25,
        minWidth: 0,
      }}
    >
      <Typography
        sx={{
          fontSize: "0.7rem",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.42)",
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: "1.75rem",
          fontWeight: 750,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          color: empty ? "rgba(255,255,255,0.3)" : TONE_COLORS[tone],
        }}
      >
        {value ?? "—"}
      </Typography>
      {hint && (
        <Typography
          sx={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }}
        >
          {hint}
        </Typography>
      )}
    </Box>
  );
}
