"use client";

import type { ReactNode } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { BookOpen, Clock, Eye, EyeOff, Ban, LineChart } from "lucide-react";
import { formatSolveClock } from "@/lib/puzzle/solveClock";

/**
 * The board card's toolbar strip.
 *
 * Modelled on the Acely reference (docs/PUZZLE_TRAINING_LAYOUT_SPEC.md §1.2):
 * a low-emphasis timer on the left, borderless icon-over-label tools on the
 * right, closed by a hairline divider. The tools are affordances you reach
 * for, so they must not compete with the board.
 *
 * Analyse is gated by `analysisGate.ts`. Stockfish's best move IS the puzzle's
 * answer, so the button stays disabled — and says why on hover — until the
 * puzzle is solved or the solution is shown. It is disabled rather than hidden
 * because a tool that only appears after you succeed is a tool nobody
 * discovers. The engine mounts lazily behind it, so the ~7 MB download only
 * happens for solvers who actually open it.
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
  eliminateOn: boolean;
  onToggleEliminate: () => void;
  analyseOn: boolean;
  /**
   * Set while the puzzle is unsolved. Present ⇒ the button is disabled and
   * explains why, rather than vanishing — a tool that appears only after you
   * succeed is a tool nobody discovers.
   */
  analyseDisabledReason?: string;
  onToggleAnalyse: () => void;
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
  eliminateOn,
  onToggleEliminate,
  analyseOn,
  analyseDisabledReason,
  onToggleAnalyse,
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
            timerHidden
              ? "Solve time hidden"
              : `Solve time ${formatSolveClock(elapsedMs)}`
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

      <ToolButton
        icon={<Ban size={18} />}
        label="Eliminate"
        active={eliminateOn}
        onClick={onToggleEliminate}
      />

      {/* Analyse sits last: it is the only tool that is unavailable most of
          the time, so putting it before the always-live ones would make the
          row read as half-broken. */}
      <ToolButton
        icon={<LineChart size={18} />}
        label="Analyse"
        active={analyseOn}
        disabled={Boolean(analyseDisabledReason)}
        disabledReason={analyseDisabledReason}
        onClick={onToggleAnalyse}
      />

      {trailing ? <Box sx={{ ml: 1 }}>{trailing}</Box> : null}
    </Box>
  );
}
