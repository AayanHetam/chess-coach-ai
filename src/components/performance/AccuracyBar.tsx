"use client";

import { Box, Typography } from "@mui/material";
import { accuracyBand } from "@/lib/performance/puzzleWindow";

/**
 * One horizontal accuracy row: label, track, figure.
 *
 * Bars rather than a pie or a radar. A reader compares lengths on a shared
 * baseline far more accurately than angles, and the whole question this page
 * answers — "which theme is my worst?" — is a comparison.
 *
 * A row with no attempts still renders, greyed, with an empty track. Hiding it
 * would make the list silently change length as you switch windows, and
 * "you have not tried this yet" is real information.
 */

/**
 * Red through green, one step per band. Exhaustive over `accuracyBand`'s
 * return type, so adding a band there is a type error here rather than an
 * `undefined` colour at runtime.
 */
const BAND_COLORS: Record<ReturnType<typeof accuracyBand>, string> = {
  none: "rgba(255,255,255,0.14)",
  low: "#F87171",
  fair: "#FB923C",
  ok: "#FBBF24",
  good: "#A3E635",
  great: "#4ADE80",
};

interface AccuracyBarProps {
  label: string;
  /** 0-100, or null when there were no attempts. */
  accuracy: number | null;
  solved: number;
  attempts: number;
}

export function AccuracyBar({
  label,
  accuracy,
  solved,
  attempts,
}: AccuracyBarProps) {
  const band = accuracyBand(accuracy);
  const color = BAND_COLORS[band];
  const empty = accuracy === null;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 84px",
        alignItems: "center",
        gap: 1.5,
        py: 0.85,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: "0.82rem",
            color: empty ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.86)",
            mb: 0.6,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </Typography>
        <Box
          sx={{
            height: 6,
            borderRadius: 3,
            background: "rgba(255,255,255,0.06)",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              height: "100%",
              // A 0% bar is a legitimate result (attempted, solved none) and
              // must still be visibly distinct from an untouched row, so it
              // keeps a sliver of colour.
              width: empty ? "0%" : `${Math.max(accuracy, 2)}%`,
              borderRadius: 3,
              background: color,
              transition: "width 220ms cubic-bezier(0.22,0.61,0.36,1)",
            }}
          />
        </Box>
      </Box>
      <Box sx={{ textAlign: "right" }}>
        <Typography
          sx={{
            fontSize: "0.85rem",
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: empty ? "rgba(255,255,255,0.3)" : color,
            lineHeight: 1.2,
          }}
        >
          {empty ? "—" : `${accuracy}%`}
        </Typography>
        <Typography
          sx={{
            fontSize: "0.68rem",
            color: "rgba(255,255,255,0.36)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {attempts === 0 ? "not tried" : `${solved}/${attempts}`}
        </Typography>
      </Box>
    </Box>
  );
}
