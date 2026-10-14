"use client";

import type { ReactNode } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { BookOpen, Clock, Eye, EyeOff, Ban, LineChart } from "lucide-react";
import { formatSolveClock } from "@/lib/puzzle/solveClock";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  MOTION,
  RADIUS,
  TEXT,
  TYPE,
} from "@/theme/tokens";

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
 *
 * The tools are neutral chrome: an active tool is a selected row (10% white),
 * and only the attention state (a tool that just unlocked) wears the accent.
 */

const SELECTED = "rgba(255,255,255,0.10)";
const HOVER = "rgba(255,255,255,0.06)";
/** The tinted chip's hover, one step past ACCENT.tint. Derived from the token
 *  so no accent alpha is retyped here. */
const ACCENT_TINT_HOVER = alpha(ACCENT.main, 0.22);

function ToolButton({
  icon,
  label,
  disabled,
  active,
  attention,
  hint,
  disabledReason,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  active?: boolean;
  /**
   * "This just became available and you should look at it."
   *
   * Needed because locked and unlocked were the SAME colour at 0.25 vs 0.5
   * alpha — a difference nobody can see, sitting between two tools that look
   * identical. Analyse unlocking is the payoff moment of the whole screen
   * ("Solve. Then understand why."), and it was arriving silently.
   */
  attention?: boolean;
  /** Hover text for the ENABLED state, so the tool can explain what it does. */
  hint?: string;
  /** Shown on hover when disabled. A dead button with no explanation is worse
   *  than no button — the user assumes it's broken. */
  disabledReason?: string;
  onClick: () => void;
}) {
  const highlighted = attention && !disabled && !active;

  const button = (
    <Box
      component="button"
      type="button"
      aria-pressed={active}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        // Tighter at lg: the toolbar sits above the board inside the
        // one-screen card, so its height is paid for in board pixels. The
        // 13px label is ~2px taller and ~10px wider than the 0.68rem one it
        // replaced, so lg trims 1px off each vertical pad and 5px off each
        // side: the button keeps its old box and the row still fits one line
        // at 1280 wide.
        gap: { xs: 0.4, lg: 0.25 },
        px: { xs: 1.25, lg: "3px" },
        py: { xs: 0.75, lg: "3px" },
        // Accent tint + hairline, not just a colour shift. Against two flat
        // borderless neighbours, a tinted chip is what the eye actually
        // lands on — alpha alone reads as "same button, slightly brighter".
        // "Press this now" is an action signal, and the accent is the action
        // colour sitewide.
        border: highlighted
          ? `1px solid ${ACCENT.border}`
          : "1px solid transparent",
        background: highlighted
          ? ACCENT.tint
          : active
            ? SELECTED
            : "transparent",
        borderRadius: `${RADIUS.small}px`,
        cursor: disabled ? "not-allowed" : "pointer",
        color: disabled
          ? // Pushed further down so locked reads as genuinely inert rather
            // than as a dimmer version of available.
            TEXT.tertiary
          : highlighted
            ? ACCENT.hover
            : active
              ? TEXT.primary
              : TEXT.secondary,
        transition: `color ${MOTION.hover}, background-color ${MOTION.hover}, border-color ${MOTION.hover}, transform ${MOTION.press}`,
        "&:hover": disabled
          ? undefined
          : {
              color: highlighted ? ACCENT.hover : TEXT.primary,
              background: highlighted
                ? ACCENT_TINT_HOVER
                : active
                  ? SELECTED
                  : HOVER,
            },
        "&:active": disabled ? undefined : { transform: MOTION.pressScale },
        // Keyboard focus stays one colour across every tool — a focus ring
        // that changes hue per button reads as state, not as focus.
        "&:focus-visible": {
          outline: `2px solid ${TEXT.primary}`,
          outlineOffset: 2,
        },
      }}
    >
      {icon}
      <Typography
        component="span"
        sx={{ fontSize: TYPE.label.fontSize, fontWeight: 600, lineHeight: 1 }}
      >
        {label}
      </Typography>
      {highlighted && (
        // A dot, because the fill alone still loses to a board full of
        // pieces in peripheral vision.
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            top: 3,
            right: 3,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: ACCENT.main,
          }}
        />
      )}
    </Box>
  );

  const tooltip = disabled ? disabledReason : highlighted ? hint : undefined;
  if (tooltip) {
    // span wrapper: MUI tooltips need a non-disabled child to receive events.
    return (
      <Tooltip title={tooltip} arrow>
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
        gap: { xs: 1, lg: 0.75 },
        flexWrap: "wrap",
        pb: { xs: 1.25, lg: 0.75 },
        mb: { xs: 1.75, lg: 1.25 },
        borderBottom: `1px solid ${LINE.hairline}`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <Clock
          size={15}
          strokeWidth={1.75}
          color={TEXT.secondary}
          aria-hidden
        />
        <Typography
          // Tabular figures stop the strip jittering as digits change width.
          sx={{
            fontFamily: FONT_MONO,
            fontVariantNumeric: "tabular-nums",
            fontSize: "0.95rem",
            fontWeight: 700,
            color: timerHidden ? "transparent" : TEXT.primary,
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
            color: TEXT.secondary,
            borderRadius: `${RADIUS.small}px`,
            transition: `color ${MOTION.hover}, transform ${MOTION.press}`,
            "&:hover": { color: TEXT.primary },
            "&:active": { transform: MOTION.pressScale },
            "&:focus-visible": {
              outline: `2px solid ${TEXT.primary}`,
              outlineOffset: 2,
            },
          }}
        >
          {timerHidden ? (
            <Eye size={14} strokeWidth={1.75} />
          ) : (
            <EyeOff size={14} strokeWidth={1.75} />
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, minWidth: 8 }} />

      <ToolButton
        icon={<BookOpen size={18} strokeWidth={1.75} />}
        label="Reference"
        active={referenceOpen}
        disabled={Boolean(referenceDisabledReason)}
        disabledReason={referenceDisabledReason}
        onClick={onToggleReference}
      />

      <ToolButton
        icon={<Ban size={18} strokeWidth={1.75} />}
        label="Eliminate"
        active={eliminateOn}
        onClick={onToggleEliminate}
      />

      {/* Analyse sits last: it is the only tool that is unavailable most of
          the time, so putting it before the always-live ones would make the
          row read as half-broken. */}
      <ToolButton
        icon={<LineChart size={18} strokeWidth={1.75} />}
        label="Analyse"
        active={analyseOn}
        disabled={Boolean(analyseDisabledReason)}
        disabledReason={analyseDisabledReason}
        // Highlighted from the moment it unlocks until it is first opened for
        // this puzzle. Once opened it drops to the normal active treatment —
        // a permanent flag would just become part of the furniture.
        attention={!analyseDisabledReason && !analyseOn}
        hint="See the engine's evaluation and best line for this position"
        onClick={onToggleAnalyse}
      />

      {trailing ? <Box sx={{ ml: { xs: 1, lg: 0.5 } }}>{trailing}</Box> : null}
    </Box>
  );
}
