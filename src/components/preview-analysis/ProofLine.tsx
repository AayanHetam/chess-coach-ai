"use client";

/**
 * A line, shown instead of described.
 *
 * The coach's proof is a sequence of moves. Prose about a sequence of moves
 * is the slowest way to read one and the easiest place for a model to be
 * wrong, so the coach panel draws it: one chip per ply with what that ply
 * DOES (a check, a capture, the fork it creates, what it leaves hanging —
 * computed by lineCaptions.ts from the same chess.js the engine lines came
 * through), the material the line ends on, the engine's evaluation, and a
 * Play control that steps the main board through it. Tapping any chip puts
 * that position on the board.
 *
 * Nothing here is written by the model: the moves are the engine's or the
 * game's, the captions are board arithmetic. It renders the same for a card
 * on turn 1 and a follow-up that cites a line.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Tooltip } from "@mui/material";
import { Pause, Play, RotateCcw } from "lucide-react";
import { captionLine } from "@/lib/coach/lineCaptions";
import type { CoachLine } from "./coachLines";

export interface ProofLineProps {
  line: CoachLine;
  /** Phrases the ledger in the second person when the line is the player's. */
  playerColor: "w" | "b" | null;
  /**
   * Put the position after the first `k` plies of the line on the board
   * (k = 0 is the position the line starts from). Absent, the line is
   * read-only.
   */
  onShowPly?: (line: CoachLine, k: number) => void;
  /** Header label; defaults by kind. */
  label?: string;
  /** Milliseconds per ply while playing. */
  stepMs?: number;
  "data-testid"?: string;
}

const ACCENT = {
  engine: {
    fg: "#86efac",
    bg: "rgba(52,211,153,0.08)",
    border: "rgba(52,211,153,0.28)",
    chip: "rgba(52,211,153,0.16)",
  },
  played: {
    fg: "#FB923C",
    bg: "rgba(251,146,60,0.08)",
    border: "rgba(251,146,60,0.28)",
    chip: "rgba(251,146,60,0.16)",
  },
} as const;

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export function ProofLine({
  line,
  playerColor,
  onShowPly,
  label,
  stepMs = 800,
  "data-testid": testId = "proof-line",
}: ProofLineProps) {
  const accent = ACCENT[line.kind];
  const heading =
    label ?? (line.kind === "engine" ? "Engine line" : "In the game");
  const captions = useMemo(
    () => captionLine(line.startFen, line.sans, playerColor),
    [line.startFen, line.sans, playerColor]
  );
  // The ply on the board, 1-based; 0 = the start position; null = untouched.
  const [shown, setShown] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onShowRef = useRef(onShowPly);
  onShowRef.current = onShowPly;
  const total = captions.plies.length;
  const interactive = !!onShowPly && total > 0;

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
  };

  const show = (k: number) => {
    setShown(k);
    onShowRef.current?.(line, k);
  };

  useEffect(() => {
    if (!playing) return;
    let k = shown === null || shown >= total ? 0 : shown;
    // First step at once, then one ply per tick; stop on the last ply.
    const tick = () => {
      k += 1;
      setShown(k);
      onShowRef.current?.(line, k);
      if (k >= total) stop();
    };
    tick();
    if (k < total) timer.current = setInterval(tick, stepMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => () => stop(), []);

  // A playing line owns the board only until the reader touches anything
  // else: a click on the move list, a key, typing a question. Otherwise the
  // next tick would drag the board back to the line mid-thought.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!playing) return;
    const onOutside = (e: Event) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && root.contains(e.target)) return;
      stop();
    };
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onOutside, true);
    return () => {
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onOutside, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const atEnd = shown !== null && shown >= total;

  return (
    <Box
      ref={rootRef}
      data-testid={testId}
      sx={{
        mt: 1,
        borderRadius: "0.7rem",
        background: accent.bg,
        border: `1px solid ${accent.border}`,
        px: 1.1,
        py: 0.85,
      }}
    >
      {/* Header: label · eval · depth · play */}
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 0.75, minHeight: 24 }}
      >
        <Box
          sx={{
            fontSize: "0.64rem",
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: accent.fg,
            whiteSpace: "nowrap",
          }}
        >
          {heading}
        </Box>
        {line.evalDisplay && (
          <Tooltip
            title={
              line.kind === "engine"
                ? "Engine evaluation of this line"
                : "Evaluation after these moves"
            }
          >
            <Box
              component="span"
              data-testid={`${testId}-eval`}
              sx={{
                fontFamily: MONO,
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "rgba(255,255,255,0.86)",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "999px",
                px: 0.8,
                py: 0.1,
              }}
            >
              {line.evalDisplay}
            </Box>
          </Tooltip>
        )}
        {typeof line.depth === "number" && (
          <Box
            component="span"
            sx={{
              fontFamily: MONO,
              fontSize: "0.62rem",
              color: "rgba(255,255,255,0.35)",
            }}
          >
            d{line.depth}
          </Box>
        )}
        <Box sx={{ flex: 1 }} />
        {interactive && (
          <Box sx={{ display: "flex", gap: 0.4 }}>
            {shown !== null && shown > 0 && !playing && (
              <Tooltip title="Back to the start of the line">
                <Box
                  component="button"
                  type="button"
                  aria-label="Back to the start of the line"
                  onClick={() => show(0)}
                  sx={controlSx(accent.fg)}
                >
                  <RotateCcw size={12} />
                </Box>
              </Tooltip>
            )}
            <Tooltip
              title={
                playing
                  ? "Pause"
                  : atEnd
                    ? "Play the line again"
                    : "Play the line on the board"
              }
            >
              <Box
                component="button"
                type="button"
                data-testid={`${testId}-play`}
                aria-label={
                  playing ? "Pause the line" : "Play the line on the board"
                }
                onClick={() => {
                  if (playing) stop();
                  else {
                    if (atEnd) show(0);
                    setPlaying(true);
                  }
                }}
                sx={{ ...controlSx(accent.fg), px: 0.9, gap: 0.45 }}
              >
                {playing ? <Pause size={12} /> : <Play size={12} />}
                <Box
                  component="span"
                  sx={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                  }}
                >
                  {playing ? "Pause" : "Play"}
                </Box>
              </Box>
            </Tooltip>
          </Box>
        )}
      </Box>

      {/* The plies: one chip each, with what the move does */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.75 }}>
        {captions.plies.map((p, i) => {
          const k = i + 1;
          const active = shown === k;
          const showNumber = p.mover === "w" || i === 0;
          return (
            <Tooltip
              key={`${p.san}-${i}`}
              title={p.full || "a quiet move"}
              enterDelay={500}
            >
              <Box
                component={interactive ? "button" : "span"}
                type={interactive ? "button" : undefined}
                data-testid={`${testId}-ply`}
                aria-pressed={interactive ? active : undefined}
                onClick={
                  interactive
                    ? () => {
                        stop();
                        show(k);
                      }
                    : undefined
                }
                sx={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 0.5,
                  maxWidth: "100%",
                  px: 0.75,
                  py: 0.35,
                  borderRadius: "0.5rem",
                  border: `1px solid ${active ? accent.fg : "rgba(255,255,255,0.08)"}`,
                  background: active ? accent.chip : "rgba(0,0,0,0.22)",
                  color: "rgba(255,255,255,0.9)",
                  cursor: interactive ? "pointer" : "default",
                  font: "inherit",
                  textAlign: "left",
                  transition: "background 140ms ease, border-color 140ms ease",
                  "&:hover": interactive ? { borderColor: accent.fg } : {},
                }}
              >
                <Box
                  component="span"
                  sx={{
                    fontFamily: MONO,
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    color: active ? accent.fg : "inherit",
                  }}
                >
                  {showNumber ? p.label : ""}
                  {p.san}
                </Box>
                {p.caption && (
                  <Box
                    component="span"
                    sx={{
                      fontSize: "0.72rem",
                      color: "rgba(255,255,255,0.6)",
                      lineHeight: 1.3,
                    }}
                  >
                    {p.caption}
                  </Box>
                )}
              </Box>
            </Tooltip>
          );
        })}
        {captions.ledger && (
          <Box
            component="span"
            data-testid={`${testId}-ledger`}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              px: 0.6,
              py: 0.35,
              fontSize: "0.74rem",
              color: accent.fg,
              fontWeight: 600,
            }}
          >
            → {captions.ledger}
            {captions.sacrifice ? ", the payoff lies beyond these moves" : ""}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function controlSx(color: string) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 26,
    height: 24,
    px: 0.5,
    borderRadius: "999px",
    border: `1px solid ${color}55`,
    background: "rgba(0,0,0,0.25)",
    color,
    cursor: "pointer",
    font: "inherit",
    transition: "background 140ms ease",
    "&:hover": { background: `${color}22` },
  } as const;
}

export default ProofLine;
