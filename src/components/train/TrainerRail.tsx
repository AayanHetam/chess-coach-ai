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
import { DRILL_TARGET, type ActStep } from "@/lib/learn/trainerSession";

const EMBER = "#FB923C";
const DONE = "#86EFAC";
const MONO = '"SF Mono", ui-monospace, Menlo, monospace';

export interface TrainerRailProps {
  /** The line, already numbered: `1.e4 c5 2.c3`. */
  line: string;
  steps: ActStep[];
  /** Clean runs banked so far. */
  streak: number;
  /** True once the drill is running, so the pips only appear when they mean something. */
  drilling: boolean;
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
        background: "rgba(9,10,14,0.92)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
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
          sx={{ fontFamily: MONO, fontSize: "1rem", fontWeight: 700, color: "#fff", lineHeight: 1.4 }}
        >
          {line}
        </Typography>
      </Box>

      <Box>
        <RailLabel>The session</RailLabel>
        <Box sx={{ height: "1px", background: "rgba(255,255,255,0.08)", mb: 1.5 }} />
        <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0 }}>
          {steps.map((s) => (
            <StepRow key={s.act} step={s} />
          ))}
        </Box>
      </Box>

      {drilling && <Pips streak={streak} />}

      {/* Pushed to the floor, away from the acts: starting over throws progress
          away, and a destructive action does not belong next to the ones that
          advance. */}
      <Box sx={{ mt: "auto", pt: 2 }}>
        <Box
          component="button"
          onClick={onRestart}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.6,
            minHeight: 44,
            px: 0.5,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.35)",
            fontSize: "0.76rem",
            borderRadius: "8px",
            transition: "color 180ms ease",
            "&:hover": { color: "rgba(255,255,255,0.7)" },
            "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
          }}
        >
          <RotateCcw size={13} aria-hidden />
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
  onExit,
  onRestart,
}: TrainerRailProps) {
  const current = steps.find((s) => s.status === "current") ?? steps[steps.length - 1];
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
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(9,10,14,0.92)",
      }}
    >
      <ExitLink onExit={onExit} compact />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          noWrap
          sx={{ fontFamily: MONO, fontSize: "0.85rem", fontWeight: 700, color: "#fff" }}
        >
          {line}
        </Typography>
        <Typography noWrap sx={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.5)" }}>
          {current?.label}
        </Typography>
      </Box>
      {drilling && <Pips streak={streak} compact />}
      {/* The rail is hidden at this width, so without this there is no way to
          start over on a phone at all. Icon-only for room, with a real name for
          anyone not reading it visually. */}
      <Box
        component="button"
        onClick={onRestart}
        aria-label="Start over"
        sx={{
          display: "grid",
          placeItems: "center",
          width: 44,
          height: 44,
          flexShrink: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "rgba(255,255,255,0.4)",
          borderRadius: "8px",
          "&:hover": { color: "rgba(255,255,255,0.8)" },
          "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
        }}
      >
        <RotateCcw size={16} aria-hidden />
      </Box>
    </Box>
  );
}

function ExitLink({ onExit, compact }: { onExit: () => void; compact?: boolean }) {
  return (
    <Box
      component="button"
      onClick={onExit}
      aria-label="Leave the session"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        // 44px minimum touch target, met with padding rather than by growing
        // the visible text.
        minHeight: 44,
        px: 0.5,
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "rgba(255,255,255,0.55)",
        fontSize: "0.8rem",
        alignSelf: "flex-start",
        borderRadius: "8px",
        transition: "color 180ms ease",
        "&:hover": { color: "#fff" },
        "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
      }}
    >
      <ArrowLeft size={15} aria-hidden />
      {compact ? "Plan" : "Your plan"}
    </Box>
  );
}

function StepRow({ step }: { step: ActStep }) {
  const done = step.status === "done";
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
          fontSize: "0.84rem",
          color: done
            ? "rgba(255,255,255,0.45)"
            : current
              ? "#fff"
              : "rgba(255,255,255,0.4)",
          fontWeight: current ? 600 : 400,
          transition: "color 180ms ease",
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
          background: DONE,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Check size={12} color="#0B0C10" strokeWidth={3} aria-hidden />
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
          background: EMBER,
          boxShadow: `0 0 12px ${EMBER}66`,
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
        border: "1.5px solid rgba(255,255,255,0.25)",
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
function Pips({ streak, compact }: { streak: number; compact?: boolean }) {
  return (
    <Box
      role="img"
      aria-label={`${streak} of ${DRILL_TARGET} clean runs`}
      sx={{ display: "flex", gap: 0.75, mt: compact ? 0 : 0.5, flexShrink: 0 }}
    >
      {Array.from({ length: DRILL_TARGET }, (_, i) => (
        <Box
          key={i}
          sx={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: i < streak ? DONE : "rgba(255,255,255,0.14)",
            transform: i < streak ? "scale(1)" : "scale(0.8)",
            transition: "background 160ms ease, transform 160ms cubic-bezier(0.34,1.56,0.64,1)",
            "@media (prefers-reduced-motion: reduce)": { transition: "background 160ms ease" },
          }}
        />
      ))}
    </Box>
  );
}

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: "0.65rem",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.35)",
        mb: 0.75,
      }}
    >
      {children}
    </Typography>
  );
}
