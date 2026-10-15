"use client";

// The session rail: where you are, and what is left.
//
// Flush to the viewport edge with no radius, one step darker than the page, so
// it reads as chrome rather than as another card. Everything inside it is
// status; nothing inside it is content.
//
// Below the desktop breakpoint this becomes a horizontal strip above the board
// (see TrainerRailStrip), because a 220px column on a 375px screen is a column
// that eats the board.

import { Box, Typography } from "@mui/material";
import { ArrowLeft, Check, RotateCcw } from "lucide-react";
import type { ActStep } from "@/lib/learn/trainerSession";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  MOTION,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

/** A bare text button in the rail: 44px target, press feedback, focus ring. */
const RAIL_BUTTON_SX = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: TEXT.secondary,
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
  transition: `color ${MOTION.hover}, transform ${MOTION.press}`,
  "&:hover": { color: TEXT.primary },
  "&:active": { transform: MOTION.pressScale },
  "&:focus-visible": { outline: `2px solid ${TEXT.primary}`, outlineOffset: 2 },
} as const;

export interface TrainerRailProps {
  /** The line, already numbered: `1.e4 c5 2.c3`. */
  line: string;
  steps: ActStep[];
  /** Clean runs banked so far. */
  streak: number;
  /** True once the drill is running, so the pips only appear when they mean something. */
  drilling: boolean;
  /**
   * Clean runs this session is asking for. Three to repair, one to review.
   * Read from the session rather than fixed, so a one-run review does not draw
   * two empty pips it will never fill.
   */
  goal: number;
  onExit: () => void;
  /** Throw the saved session away and begin again. */
  onRestart: () => void;
  /** True when this session was picked up from a saved one. */
  resumed?: boolean;
}

export default function TrainerRail({
  line,
  steps,
  streak,
  drilling,
  goal,
  onExit,
  onRestart,
}: TrainerRailProps) {
  return (
    <Box
      component="nav"
      aria-label="Training session"
      sx={{
        width: 220,
        flexShrink: 0,
        minHeight: "100dvh",
        background: SURFACE.raised,
        borderRight: `1px solid ${LINE.hairline}`,
        px: 2.5,
        py: 3,
        display: { xs: "none", md: "flex" },
        flexDirection: "column",
        gap: 2.5,
      }}
    >
      <ExitLink onExit={onExit} />

      <Box>
        <Typography
          sx={{
            ...TYPE.bodySmall,
            fontFamily: FONT_MONO,
            fontWeight: 600,
            color: TEXT.primary,
          }}
        >
          {line}
        </Typography>
      </Box>

      <Box>
        <RailLabel>The session</RailLabel>
        <Box sx={{ height: "1px", background: LINE.hairline, mb: 1.5 }} />
        <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0 }}>
          {steps.map((s) => (
            <StepRow key={s.act} step={s} />
          ))}
        </Box>
      </Box>

      {drilling && goal > 1 && <Pips streak={streak} goal={goal} />}

      {/* Pushed to the floor, away from the acts: starting over throws progress
          away, and a destructive action does not belong next to the ones that
          advance. */}
      <Box sx={{ mt: "auto", pt: 2 }}>
        <Box
          component="button"
          onClick={onRestart}
          sx={{
            ...RAIL_BUTTON_SX,
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            minHeight: 44,
            px: 0.5,
            fontSize: TYPE.bodySmall.fontSize,
            borderRadius: `${RADIUS.small}px`,
          }}
        >
          <RotateCcw size={15} aria-hidden />
          Start over
        </Box>
      </Box>
    </Box>
  );
}

/** The same status, laid out horizontally, for narrow screens. */
export function TrainerRailStrip({
  line,
  steps,
  streak,
  drilling,
  goal,
  onExit,
  onRestart,
}: TrainerRailProps) {
  const current =
    steps.find((s) => s.status === "current") ?? steps[steps.length - 1];
  return (
    <Box
      // Same landmark and label as the rail. Only one of the two is ever in the
      // accessibility tree (the other is display:none), so this gives mobile
      // the session navigation it otherwise had no name for at all.
      component="nav"
      aria-label="Training session"
      sx={{
        display: { xs: "flex", md: "none" },
        alignItems: "center",
        gap: 1.5,
        px: 2,
        py: 1.5,
        borderBottom: `1px solid ${LINE.hairline}`,
        background: SURFACE.raised,
      }}
    >
      <ExitLink onExit={onExit} compact />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          noWrap
          sx={{
            ...TYPE.bodySmall,
            fontFamily: FONT_MONO,
            fontWeight: 600,
            color: TEXT.primary,
          }}
        >
          {line}
        </Typography>
        <Typography noWrap sx={{ ...TYPE.caption, color: TEXT.secondary }}>
          {current?.label}
        </Typography>
      </Box>
      {drilling && goal > 1 && <Pips streak={streak} goal={goal} compact />}
      {/* The rail is hidden at this width, so without this there is no way to
          start over on a phone at all. Icon-only for room, with a real name for
          anyone not reading it visually. */}
      <Box
        component="button"
        onClick={onRestart}
        aria-label="Start over"
        sx={{
          ...RAIL_BUTTON_SX,
          display: "grid",
          placeItems: "center",
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: `${RADIUS.small}px`,
        }}
      >
        <RotateCcw size={16} aria-hidden />
      </Box>
    </Box>
  );
}

function ExitLink({
  onExit,
  compact,
}: {
  onExit: () => void;
  compact?: boolean;
}) {
  return (
    <Box
      component="button"
      onClick={onExit}
      aria-label="Leave the session"
      sx={{
        ...RAIL_BUTTON_SX,
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        // 44px minimum touch target, met with padding rather than by growing
        // the visible text.
        minHeight: 44,
        px: 0.5,
        fontSize: TYPE.bodySmall.fontSize,
        alignSelf: "flex-start",
        borderRadius: `${RADIUS.small}px`,
      }}
    >
      <ArrowLeft size={15} aria-hidden />
      {compact ? "Plan" : "Your plan"}
    </Box>
  );
}

function StepRow({ step }: { step: ActStep }) {
  const current = step.status === "current";
  return (
    <Box
      component="li"
      aria-current={current ? "step" : undefined}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        py: 0.9,
      }}
    >
      <Glyph status={step.status} />
      <Typography
        sx={{
          ...TYPE.bodySmall,
          color: current ? TEXT.primary : TEXT.secondary,
          fontWeight: current ? 600 : 400,
          transition: `color ${MOTION.hover}`,
        }}
      >
        {step.label}
      </Typography>
    </Box>
  );
}

/**
 * Status is carried by SHAPE as well as colour: a ring, a filled disc, a check.
 * Colour alone would leave the three states indistinguishable to a reader who
 * cannot separate ember from green.
 */
function Glyph({ status }: { status: ActStep["status"] }) {
  if (status === "done") {
    return (
      <Box
        sx={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: STATUS.success,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Check size={12} color={TEXT.onAccent} strokeWidth={3} aria-hidden />
      </Box>
    );
  }
  if (status === "current") {
    return (
      <Box
        sx={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: ACCENT.main,
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <Box
      sx={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        border: `1.5px solid ${LINE.strong}`,
        flexShrink: 0,
      }}
    />
  );
}

/**
 * Three pips, filling left to right.
 *
 * Visible before the streak is at risk, so the cost of a miss is legible in
 * advance rather than only after it is paid.
 */
function Pips({
  streak,
  goal,
  compact,
}: {
  streak: number;
  goal: number;
  compact?: boolean;
}) {
  return (
    <Box
      role="img"
      aria-label={`${streak} of ${goal} clean runs`}
      sx={{ display: "flex", gap: 0.75, mt: compact ? 0 : 0.5, flexShrink: 0 }}
    >
      {Array.from({ length: goal }, (_, i) => (
        <Box
          key={i}
          sx={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: i < streak ? STATUS.success : LINE.strong,
            transform: i < streak ? "scale(1)" : "scale(0.8)",
            transition: `background-color ${MOTION.hover}, transform ${MOTION.hover}`,
          }}
        />
      ))}
    </Box>
  );
}

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ ...TYPE.label, color: TEXT.secondary, mb: 0.75 }}>
      {children}
    </Typography>
  );
}
