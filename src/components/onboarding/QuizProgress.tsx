"use client";

import { Box } from "@mui/material";
import { ACCENT } from "@/theme/tokens";

/** Thin progress bar. Bespoke (not LinearProgressBar, which hides at value 0
 *  and renders a percent label). `value` is 0..1. It renders the final width
 *  with no animation: a step is a state change, not something to watch. */
export default function QuizProgress({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <Box
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      sx={{
        height: 6,
        width: "100%",
        borderRadius: 3,
        background: "rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: 3,
          background: ACCENT.main,
        }}
      />
    </Box>
  );
}
