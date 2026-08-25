"use client";

// Where you are in the sitting.
//
// The dots are the whole point: one fills per CORRECT answer, not per question,
// so a round that is going badly visibly lengthens. The rail and the strip are
// the same information at two widths — a 220px column above md, a 64px bar
// below it — because a session screen must not scroll to tell you where you are.

import { Box, Typography } from "@mui/material";
import { RotateCcw, X } from "lucide-react";
import type { Tally } from "@/lib/learn/chapterRound";

const EMBER = "#FB923C";

export interface CourseRoundRailProps {
  round: number;
  rounds: number;
  /** Correct answers so far this round. */
  progress: number;
  /** Correct answers this round needs. */
  size: number;
  tally: Tally;
  /** Position within the round, for the screen reader and the counter. */
  asked: number;
  /** Questions in the timeline. Grows when a miss is re-queued. */
  asks: number;
  onExit: () => void;
  onRestart: () => void;
}

export function CourseRoundRail(props: CourseRoundRailProps) {
  return (
    <Box
      component="nav"
      aria-label="Chapter round"
      sx={{
        display: { xs: "none", md: "flex" },
        flexDirection: "column",
        width: 220,
        flexShrink: 0,
        px: 2.5,
        py: 3,
        gap: 3,
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <ExitButton onExit={props.onExit} />

      <Box>
        <RailLabel>{`Round ${props.round} of ${props.rounds}`}</RailLabel>
        <Dots progress={props.progress} size={props.size} />
      </Box>

      <Box sx={{ display: "grid", gap: 1.25 }}>
        <RailLabel>Chapter</RailLabel>
        <Count label="to ask" value={props.tally.unseen} />
        <Count label="learning" value={props.tally.learning} />
        <Count label="known" value={props.tally.known} />
      </Box>

      <Box sx={{ mt: "auto" }}>
        <RestartButton onRestart={props.onRestart} />
      </Box>
    </Box>
  );
}

/** The same thing, as a bar. Below md the rail would eat the board. */
export function CourseRoundStrip(props: CourseRoundRailProps & { title: string }) {
  return (
    <Box
      component="nav"
      aria-label="Chapter round"
      sx={{
        display: { xs: "flex", md: "none" },
        alignItems: "center",
        gap: 1.5,
        px: 2,
        minHeight: 64,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <ExitButton onExit={props.onExit} compact />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          noWrap
          sx={{ fontFamily: "ui-monospace, monospace", fontSize: "0.85rem", color: "rgba(255,255,255,0.92)" }}
        >
          {props.title}
        </Typography>
        <Typography sx={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.5)" }}>
          {`Round ${props.round} of ${props.rounds} · position ${props.asked} of ${props.size}`}
        </Typography>
      </Box>
      <Dots progress={props.progress} size={props.size} compact />
      <RestartButton onRestart={props.onRestart} compact />
    </Box>
  );
}

function Dots({ progress, size, compact }: { progress: number; size: number; compact?: boolean }) {
  return (
    <Box
      role="img"
      aria-label={`${progress} of ${size} answered`}
      sx={{ display: "flex", gap: compact ? 0.75 : 1, mt: compact ? 0 : 1.25 }}
    >
      {Array.from({ length: size }, (_, i) => {
        const done = i < progress;
        return (
          <Box
            key={i}
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              // Size AS WELL AS fill, so the state survives a monochrome render
              // and does not depend on colour alone.
              transform: done ? "scale(1)" : "scale(0.8)",
              background: done ? EMBER : "rgba(255,255,255,0.18)",
              transition: "background 200ms ease-out, transform 200ms ease-out",
            }}
          />
        );
      })}
    </Box>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.78rem" }}>{label}</Typography>
      <Typography
        sx={{ color: "rgba(255,255,255,0.88)", fontSize: "0.95rem", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        color: "rgba(255,255,255,0.4)",
        fontSize: "0.68rem",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </Typography>
  );
}

function ExitButton({ onExit, compact }: { onExit: () => void; compact?: boolean }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onExit}
      aria-label="Leave the round"
      data-testid="round-exit"
      sx={{
        appearance: "none",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "rgba(255,255,255,0.55)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: compact ? "center" : "flex-start",
        gap: 0.75,
        minWidth: 44,
        minHeight: 44,
        p: 0,
        fontSize: "0.85rem",
        "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
      }}
    >
      <X size={16} aria-hidden />
      {!compact && "Leave"}
    </Box>
  );
}

function RestartButton({ onRestart, compact }: { onRestart: () => void; compact?: boolean }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onRestart}
      aria-label="Start the round over"
      data-testid="round-restart"
      sx={{
        appearance: "none",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "rgba(255,255,255,0.42)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: compact ? "center" : "flex-start",
        gap: 0.75,
        minWidth: 44,
        minHeight: 44,
        p: 0,
        fontSize: "0.8rem",
        "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
      }}
    >
      <RotateCcw size={15} aria-hidden />
      {!compact && "Start over"}
    </Box>
  );
}
