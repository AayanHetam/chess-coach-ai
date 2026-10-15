"use client";

import { Box, Typography } from "@mui/material";
import { BookOpen } from "lucide-react";
import type { ThemeReference } from "@/lib/puzzle/themeReference";
import { SERIF_DISPLAY } from "@/theme/fonts";
import { LINE, RADIUS, SURFACE, TEXT } from "@/theme/tokens";

/**
 * The Reference tool's panel: what this puzzle's motif actually is.
 *
 * Content is static (glossary or curriculum blurb) and never generated, so
 * what appears here is as reliable as the board itself. The `source` badge is
 * deliberate — a one-line unit pitch and a proper definition are different
 * things, and the reader should be able to tell which they got.
 *
 * A quiet inset panel on the board card: a secondary surface with a
 * hairline, no category tint.
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
        borderRadius: `${RADIUS.control}px`,
        background: SURFACE.raisedSecondary,
        border: `1px solid ${LINE.hairline}`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <BookOpen
          size={18}
          strokeWidth={1.75}
          color={TEXT.secondary}
          aria-hidden
        />
        <Typography
          sx={{
            fontFamily: SERIF_DISPLAY,
            fontSize: "1.1rem",
            color: TEXT.primary,
          }}
        >
          {reference.title}
        </Typography>
      </Box>

      <Typography
        sx={{
          fontSize: "0.9rem",
          lineHeight: 1.55,
          color: TEXT.primary,
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
            color: TEXT.secondary,
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
            color: TEXT.secondary,
          }}
        >
          {reference.example}
        </Typography>
      )}
    </Box>
  );
}
