"use client";

import { Box, Typography } from "@mui/material";
import { PANEL_SURFACE } from "./PanelCard";
import { ACCENT, STATUS, TEXT, TYPE } from "@/theme/tokens";

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
  default: TEXT.primary,
  ember: ACCENT.hover,
  positive: STATUS.success,
  negative: STATUS.error,
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
      <Typography sx={{ ...TYPE.label, color: TEXT.secondary }}>
        {label}
      </Typography>
      <Typography
        sx={{
          ...TYPE.h2,
          fontVariantNumeric: "tabular-nums",
          color: empty ? TEXT.tertiary : TONE_COLORS[tone],
        }}
      >
        {value ?? "—"}
      </Typography>
      {hint && (
        <Typography sx={{ ...TYPE.caption, color: TEXT.secondary }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}
