"use client";

/**
 * A line, shown instead of described.
 *
 * The coach's proof is a sequence of moves. Prose about a sequence of moves
 * is the slowest way to read one and the easiest place for a model to be
 * wrong, so the coach panel draws it: the moves on one quiet row, the
 * material the line ends on, and a Play control that steps the main board
 * through it. Under the row, one line of plain words says what the move on
 * the board does (a check, a capture, the fork it creates, what it leaves
 * hanging — computed by lineCaptions.ts from the same chess.js the engine
 * lines came through): the first move's fact at rest, the current move's
 * while the line plays or after a move is tapped.
 *
 * It used to be a boxed row of chips, every ply with its caption inline,
 * which put eight captions on screen for one line and was most of what made
 * a card feel crowded. Now a line reads like a line of moves; the facts are
 * there one at a time.
 *
 * Nothing here is written by the model: the moves are the engine's or the
 * game's, the captions are board arithmetic. It renders the same for a card
 * on turn 1, a follow-up that cites a line, and the strip under the board.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Tooltip } from "@mui/material";
import { Pause, Play } from "lucide-react";
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
  /** Leading label; defaults by kind. */
  label?: string;
  /** Milliseconds per ply while playing. */
  stepMs?: number;
  /** Keep the caption row's height when it is empty (fixed-height strips). */
  reserveCaption?: boolean;
  "data-testid"?: string;
}

const ACCENT = {
  engine: "#86efac",
  played: "#FB923C",
} as const;

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export function ProofLine({
  line,
  playerColor,
  onShowPly,
  label,
  stepMs = 800,
  reserveCaption = false,
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

  // One fact at a time: the move on the board while the line is being
  // walked, otherwise the line's first move, which is the one the coach's
  // sentence is about.
  const captionPly =
    shown !== null && shown > 0
      ? captions.plies[Math.min(shown, total) - 1]
      : captions.plies[0];
  const captionText = captionPly
    ? `${captionPly.mover === "w" || captionPly === captions.plies[0] ? captionPly.label : ""}${captionPly.san} ${captionPly.caption || "a quiet move"}`
    : "";

  return (
    <Box ref={rootRef} data-testid={testId} sx={{ mt: 0.75, minWidth: 0 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          minHeight: 24,
          minWidth: 0,
        }}
      >
        <Box
          component="span"
          sx={{
            fontSize: "0.62rem",
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: accent,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {heading}
        </Box>
        {/* The moves, one row, never wrapped: a long line scrolls sideways
            under the finger rather than stacking into a block. */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "baseline",
            gap: 0.75,
            overflowX: "auto",
            whiteSpace: "nowrap",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
            fontFamily: MONO,
            fontSize: "0.84rem",
            color: "rgba(255,255,255,0.88)",
          }}
        >
          {captions.plies.map((p, i) => {
            const k = i + 1;
            const active = shown === k;
            const showNumber = p.mover === "w" || i === 0;
            return (
              <Tooltip
                key={`${p.san}-${i}`}
                title={p.full || "a quiet move"}
                enterDelay={600}
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
                    font: "inherit",
                    fontWeight: 700,
                    color: active ? accent : "inherit",
                    background: "none",
                    border: 0,
                    p: 0,
                    m: 0,
                    cursor: interactive ? "pointer" : "default",
                    textDecoration: active ? "underline" : "none",
                    textUnderlineOffset: "3px",
                    borderRadius: "3px",
                    "&:hover": interactive ? { color: accent } : {},
                  }}
                >
                  {showNumber ? p.label : ""}
                  {p.san}
                </Box>
              </Tooltip>
            );
          })}
        </Box>
        {interactive && (
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
              sx={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 0.45,
                height: 24,
                px: 0.9,
                borderRadius: "999px",
                border: `1px solid ${accent}55`,
                background: "transparent",
                color: accent,
                cursor: "pointer",
                font: "inherit",
                fontSize: "0.68rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                transition: "background 140ms ease",
                "&:hover": { background: `${accent}1f` },
              }}
            >
              {playing ? <Pause size={11} /> : <Play size={11} />}
              {playing ? "Pause" : "Play"}
            </Box>
          </Tooltip>
        )}
      </Box>
      {/* One fact at a time on the left; where the line ends up, on the
          right. The ledger used to close the moves row, where a long line
          pushed it out of sight. */}
      {(captionText || captions.ledger || reserveCaption) && (
        <Box
          sx={{
            mt: 0.25,
            minHeight: reserveCaption ? "1.3em" : 0,
            display: "flex",
            alignItems: "baseline",
            gap: 1.5,
            fontSize: "0.76rem",
            lineHeight: 1.3,
          }}
        >
          <Box
            data-testid={`${testId}-caption`}
            sx={{
              flex: 1,
              minWidth: 0,
              color: "rgba(255,255,255,0.55)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {captionText}
          </Box>
          {captions.ledger && (
            <Box
              component="span"
              data-testid={`${testId}-ledger`}
              sx={{
                flexShrink: 0,
                fontWeight: 600,
                color: accent,
                opacity: 0.9,
                whiteSpace: "nowrap",
              }}
            >
              → {captions.ledger}
              {captions.sacrifice ? ", the payoff lies beyond these moves" : ""}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

export default ProofLine;
