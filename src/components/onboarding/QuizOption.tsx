"use client";

import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

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

/** A selectable glass option row used across every quiz step. */
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
        p: "13px 16px",
        minHeight: 56,
        borderRadius: "14px",
        background: selected
          ? "rgba(249,115,22,0.12)"
          : "rgba(255,255,255,0.03)",
        border: selected
          ? "1px solid rgba(249,115,22,0.55)"
          : "1px solid rgba(255,255,255,0.1)",
        transition: "background 160ms ease-out, border-color 160ms ease-out",
        "&:hover": {
          borderColor: selected
            ? "rgba(249,115,22,0.7)"
            : "rgba(255,255,255,0.25)",
          background: selected
            ? "rgba(249,115,22,0.16)"
            : "rgba(255,255,255,0.05)",
        },
        "&:focus-visible": {
          outline: "2px solid rgba(249,115,22,0.6)",
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
          borderColor: selected ? "#FB923C" : "rgba(255,255,255,0.3)",
          background: selected
            ? "linear-gradient(135deg, #F97316 0%, #EA580C 100%)"
            : "transparent",
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
              background: "#fff",
            }}
          />
        )}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{
            color: "rgba(255,255,255,0.94)",
            fontWeight: 600,
            fontSize: "0.95rem",
          }}
        >
          {label}
        </Typography>
        {helper && (
          <Typography
            sx={{
              color: "rgba(255,255,255,0.5)",
              fontSize: "0.8rem",
              mt: 0.25,
            }}
          >
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
            transform: selected ? "scale(1.04)" : "none",
            transition:
              "opacity 180ms ease-out, transform 180ms ease-out",
          }}
        >
          {visual}
        </Box>
      )}
    </Box>
  );
}
