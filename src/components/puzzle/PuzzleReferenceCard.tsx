"use client";

import { Box, Typography } from "@mui/material";
import { BookOpen } from "lucide-react";
import type { ThemeReference } from "@/lib/puzzle/themeReference";
import { SERIF_DISPLAY } from "@/theme/fonts";

/**
 * The Reference tool's panel: what this puzzle's motif actually is.
 *
 * Content is static (glossary or curriculum blurb) and never generated, so
 * what appears here is as reliable as the board itself. The `source` badge is
 * deliberate — a one-line unit pitch and a proper definition are different
 * things, and the reader should be able to tell which they got.
 */
export function PuzzleReferenceCard({
  reference,
}: {
  reference: ThemeReference;
}) {
  return (
    <Box
      sx={{
        mt: 2,
        p: 2,
        borderRadius: "0.85rem",
        background: "rgba(22,18,14,0.6)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <BookOpen size={15} color="#FFD1A8" aria-hidden />
        <Typography
          sx={{
            fontFamily: SERIF_DISPLAY,
            fontSize: "1.1rem",
            color: "rgba(255,240,224,0.95)",
          }}
        >
          {reference.title}
        </Typography>
      </Box>

      <Typography
        sx={{
          fontSize: "0.9rem",
          lineHeight: 1.55,
          color: "rgba(255,240,224,0.8)",
        }}
      >
        {reference.summary}
      </Typography>

      {reference.detail && (
        <Typography
          sx={{
            mt: 1,
            fontSize: "0.86rem",
            lineHeight: 1.55,
            color: "rgba(255,240,224,0.6)",
          }}
        >
          {reference.detail}
        </Typography>
      )}

      {reference.example && (
        <Typography
          sx={{
            mt: 1,
            fontSize: "0.82rem",
            fontStyle: "italic",
            color: "rgba(255,240,224,0.5)",
          }}
        >
          {reference.example}
        </Typography>
      )}
    </Box>
  );
}
