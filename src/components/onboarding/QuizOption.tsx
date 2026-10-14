"use client";

import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

interface QuizOptionProps {
  label: string;
  helper?: string;
  selected: boolean;
  onClick: () => void;
  /** Checkbox (square) vs radio (circle) indicator. */
  multi?: boolean;
  /**
   * Optional illustration shown at the trailing edge — e.g. a mini board
   * diagram of the tactic this option names. Trailing rather than leading so
   * the label column stays aligned across options with and without one.
   */
  visual?: ReactNode;
}

/** A selectable option row used across every quiz step. */
export default function QuizOption({
  label,
  helper,
  selected,
  onClick,
  multi = false,
  visual,
}: QuizOptionProps) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      sx={{
        appearance: "none",
        font: "inherit",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 2,
        py: 1.5,
        minHeight: 56,
        borderRadius: `${RADIUS.control}px`,
        color: TEXT.primary,
        background: selected ? ACCENT.tint : SURFACE.raisedSecondary,
        border: selected
          ? `1px solid ${ACCENT.border}`
          : `1px solid ${LINE.hairline}`,
        transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}`,
        "&:hover": selected
          ? undefined
          : {
              borderColor: LINE.strong,
              background: SURFACE.raisedTertiary,
            },
        "&:active": {
          background: selected ? ACCENT.tint : SURFACE.raisedTertiary,
        },
        "&:focus-visible": {
          outline: "2px solid #FFFFFF",
          outlineOffset: 2,
        },
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 20,
          height: 20,
          flexShrink: 0,
          borderRadius: multi ? "6px" : "50%",
          border: "2px solid",
          borderColor: selected ? ACCENT.main : TEXT.tertiary,
          background: selected ? ACCENT.main : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected && (
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: multi ? "2px" : "50%",
              background: "#FFFFFF",
            }}
          />
        )}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{ ...TYPE.bodySmall, fontWeight: 600, color: TEXT.primary }}
        >
          {label}
        </Typography>
        {helper && (
          <Typography sx={{ ...TYPE.caption, color: TEXT.secondary, mt: 0.25 }}>
            {helper}
          </Typography>
        )}
      </Box>
      {visual && (
        <Box
          aria-hidden
          sx={{
            flexShrink: 0,
            ml: 1,
            // Unselected diagrams sit back so the row still reads as a list of
            // labels; selecting one brings its picture forward.
            opacity: selected ? 1 : 0.8,
            transition: `opacity ${MOTION.hover}`,
          }}
        >
          {visual}
        </Box>
      )}
    </Box>
  );
}
