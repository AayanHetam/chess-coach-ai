"use client";

import { Box } from "@mui/material";
import { motion } from "framer-motion";

const EASE = [0.22, 0.61, 0.36, 1] as const;

/** Thin orange-gradient progress bar. Bespoke (not LinearProgressBar, which
 *  hides at value 0 and renders a percent label). `value` is 0..1. */
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
        borderRadius: 999,
        background: "rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}
    >
      <motion.div
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: EASE }}
        style={{
          height: "100%",
          borderRadius: 999,
          background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
        }}
      />
    </Box>
  );
}
