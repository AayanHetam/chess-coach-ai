"use client";

import { useEffect, useState } from "react";
import { Box, Paper, Stack, Typography, Chip, LinearProgress, Skeleton } from "@mui/material";
import { describePacing, type PacingResult, type PacingStatus } from "@/lib/intern/pacing";
import { INTERN_THEME_COLOR, INTERN_THEME_COLOR_DARK } from "@/constants";

/**
 * Pacing-aware quota widget shown on /intern. Fetches /api/intern/quota,
 * renders the headline number + status pill + streak + linear progress.
 *
 * Visual hierarchy:
 *   1. Pacing copy as the main headline (intern reads at a glance)
 *   2. Status pill (color) gives ahead/on-track/behind at a glance
 *   3. Progress bar for spatial context against the target
 *   4. Streak as a small caption
 */

const STATUS_STYLES: Record<PacingStatus, { bg: string; fg: string; label: string }> = {
  "pre-program": { bg: "#E8EEF8", fg: INTERN_THEME_COLOR_DARK, label: "Pre-program" },
  "on-track": { bg: "#E8F5E9", fg: "#2E7D32", label: "On track" },
  behind: { bg: "#FFF3E0", fg: "#E65100", label: "Behind pace" },
  ahead: { bg: "#E3F2FD", fg: "#1565C0", label: "Ahead" },
};

export function QuotaWidget() {
  const [data, setData] = useState<PacingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/intern/quota", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Quota request failed (${res.status})`);
        }
        return res.json() as Promise<PacingResult>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="body2" color="error">
          Couldn&apos;t load this week&apos;s pacing: {error}
        </Typography>
      </Paper>
    );
  }

  if (!data) {
    return (
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <Stack spacing={1.5}>
          <Skeleton variant="text" width={220} height={32} />
          <Skeleton variant="rectangular" height={8} sx={{ borderRadius: 4 }} />
          <Skeleton variant="text" width={140} />
        </Stack>
      </Paper>
    );
  }

  const style = STATUS_STYLES[data.status];
  const progress =
    data.status === "pre-program"
      ? 0
      : Math.max(0, Math.min(100, (data.submittedThisWeek / data.target) * 100));

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        borderRadius: 2,
        borderColor: data.status === "behind" ? "#FFAB91" : "divider",
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
          <Typography
            variant="h5"
            sx={{ fontWeight: 700, color: INTERN_THEME_COLOR_DARK }}
          >
            {data.status === "pre-program"
              ? `${data.submittedThisWeek} flagged`
              : `${data.submittedThisWeek} of ${data.target}`}
          </Typography>
          <Chip
            label={style.label}
            size="small"
            sx={{
              backgroundColor: style.bg,
              color: style.fg,
              fontWeight: 600,
              letterSpacing: "0.04em",
            }}
          />
          {data.streakWeeks > 0 && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              · Streak: {data.streakWeeks} week{data.streakWeeks === 1 ? "" : "s"}
            </Typography>
          )}
        </Stack>

        <Box>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: "#E8EEF8",
              "& .MuiLinearProgress-bar": {
                backgroundColor: data.status === "behind" ? "#FB8C00" : INTERN_THEME_COLOR,
              },
            }}
          />
        </Box>

        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {describePacing(data)}
        </Typography>
      </Stack>
    </Paper>
  );
}
