"use client";

import type { ReactNode } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { BookOpen, Clock, Eye, EyeOff } from "lucide-react";
import { formatSolveClock } from "@/lib/puzzle/solveClock";

/**
 * The board card's toolbar strip.
 *
 * Modelled on the Acely reference (docs/PUZZLE_TRAINING_LAYOUT_SPEC.md §1.2):
 * a low-emphasis timer on the left, borderless icon-over-label tools on the
 * right, closed by a hairline divider. The tools are affordances you reach
 * for, so they must not compete with the board.
 *
 * Analyse lands in a follow-up. It needs an engine mount (WASM load, a
 * Lichess cloud-eval call baked into that code path, caching) and it has to
 * be gated until the puzzle is resolved — Stockfish's best move IS the
 * answer, so an always-available Analyse button is a cheat button.
 */

const DIM = "rgba(255,240,224,0.5)";
const BRIGHT = "rgba(255,240,224,0.9)";

function ToolButton({
  icon,
  label,
  disabled,
  active,
  disabledReason,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  active?: boolean;
  /** Shown on hover when disabled. A dead button with no explanation is worse
   *  than no button — the user assumes it's broken. */
  disabledReason?: string;
  onClick: () => void;
}) {
  const button = (
    <Box
      component="button"
      type="button"
      aria-pressed={active}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.4,
        px: 1.25,
        py: 0.75,
        border: "none",
        background: "transparent",
        borderRadius: "0.5rem",
        cursor: disabled ? "not-allowed" : "pointer",
        color: disabled ? "rgba(255,240,224,0.25)" : active ? "#FFD1A8" : DIM,
        transition: "color 180ms ease-out, background 180ms ease-out",
        "&:hover": disabled ? undefined : { color: BRIGHT },
        "&:focus-visible": {
          outline: "2px solid rgba(255,122,26,0.8)",
          outlineOffset: 2,
        },
      }}
    >
      {icon}
      <Typography
        component="span"
        sx={{ fontSize: "0.68rem", fontWeight: 600, lineHeight: 1 }}
      >
        {label}
      </Typography>
    </Box>
  );

  if (disabled && disabledReason) {
    // span wrapper: MUI tooltips need a non-disabled child to receive events.
    return (
      <Tooltip title={disabledReason} arrow>
        <span style={{ display: "inline-flex" }}>{button}</span>
      </Tooltip>
    );
  }
  return button;
}

interface PuzzleToolbarProps {
  elapsedMs: number;
  timerHidden: boolean;
  onToggleTimer: () => void;
  referenceOpen: boolean;
  referenceDisabledReason?: string;
  onToggleReference: () => void;
  /** Session counters + Finish, kept at the far right. */
  trailing?: ReactNode;
}

export function PuzzleToolbar({
  elapsedMs,
  timerHidden,
  onToggleTimer,
  referenceOpen,
  referenceDisabledReason,
  onToggleReference,
  trailing,
}: PuzzleToolbarProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        flexWrap: "wrap",
        pb: 1.25,
        mb: 1.75,
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <Clock size={15} color={DIM} aria-hidden />
        <Typography
          // Tabular figures stop the strip jittering as digits change width.
          sx={{
            fontFamily: "Monaco, Menlo, monospace",
            fontVariantNumeric: "tabular-nums",
            fontSize: "0.95rem",
            fontWeight: 700,
            color: timerHidden ? "transparent" : BRIGHT,
            // Keep the space reserved when hidden so nothing reflows.
            userSelect: timerHidden ? "none" : "auto",
          }}
          aria-live="off"
          aria-label={
            timerHidden ? "Solve time hidden" : `Solve time ${formatSolveClock(elapsedMs)}`
          }
        >
          {formatSolveClock(elapsedMs)}
        </Typography>
        <Box
          component="button"
          type="button"
          onClick={onToggleTimer}
          aria-label={timerHidden ? "Show solve time" : "Hide solve time"}
          sx={{
            display: "inline-flex",
            border: "none",
            background: "transparent",
            p: 0.5,
            cursor: "pointer",
            color: DIM,
            borderRadius: "0.4rem",
            "&:hover": { color: BRIGHT },
            "&:focus-visible": {
              outline: "2px solid rgba(255,122,26,0.8)",
              outlineOffset: 2,
            },
          }}
        >
          {timerHidden ? <Eye size={14} /> : <EyeOff size={14} />}
        </Box>
      </Box>

      <Box sx={{ flex: 1, minWidth: 8 }} />

      <ToolButton
        icon={<BookOpen size={18} />}
        label="Reference"
        active={referenceOpen}
        disabled={Boolean(referenceDisabledReason)}
        disabledReason={referenceDisabledReason}
        onClick={onToggleReference}
      />

      {trailing ? <Box sx={{ ml: 1 }}>{trailing}</Box> : null}
    </Box>
  );
}
