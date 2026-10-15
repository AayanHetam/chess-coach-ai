"use client";

import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { Chess } from "chess.js";
import dynamic from "next/dynamic";
import type { DrawShape } from "@/components/ui/ChessgroundBoard";
import { ChessgroundBoardPlaceholder } from "@/components/ui/ChessgroundBoardPlaceholder";
import {
  FONT_MONO,
  LINE,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

const ChessgroundBoard = dynamic(
  () =>
    import("@/components/ui/ChessgroundBoard").then((m) => m.ChessgroundBoard),
  {
    ssr: false,
    // A board always occupies its square, even before its chunk lands —
    // see ChessgroundBoardPlaceholder.
    loading: () => <ChessgroundBoardPlaceholder />,
  }
);

/**
 * Inline mini-board for puzzle-coach messages.
 *
 * Renders a small (~220px) non-interactive board showing the position
 * AFTER a sequence of SAN moves applied to a starting FEN. The coach
 * emits these via `[POSITION_AFTER:san1 san2 ...]` tags in its response;
 * the renderer in PuzzleCoachBubble parses the tags and mounts one of
 * these per tag.
 *
 * If the move sequence is illegal (bad SAN, doesn't apply to the FEN),
 * the component renders a small placeholder rather than crashing — the
 * coach has hallucinated a move, the user should see something graceful.
 *
 * Design: a solid tertiary surface inside the coach bubble with a hairline;
 * the error state swaps the hairline for a status-coloured one.
 */

const ERROR_BORDER = "rgba(255,69,58,0.45)";

interface PuzzleCoachMiniboardProps {
  /** Starting FEN to apply the moves from. Typically the puzzle's
   *  anchor FEN (after the opponent's setup move was played). */
  startFen: string;
  /** SAN moves applied in order. Last move is the one the coach is
   *  asking the user to visualise. */
  moves: string[];
  /** Optional caption shown above the board. */
  caption?: string;
}

export function PuzzleCoachMiniboard({
  startFen,
  moves,
  caption,
}: PuzzleCoachMiniboardProps) {
  const result = useMemo(() => {
    try {
      const game = new Chess(startFen);
      const applied: { from: string; to: string }[] = [];
      for (const san of moves) {
        const m = game.move(san);
        if (!m) {
          return {
            ok: false as const,
            error: `couldn't apply ${san}`,
            fen: startFen,
            lastMove: null,
          };
        }
        applied.push({ from: m.from, to: m.to });
      }
      const last = applied[applied.length - 1];
      return {
        ok: true as const,
        fen: game.fen(),
        lastMove: last ? ([last.from, last.to] as [string, string]) : null,
        moveCount: applied.length,
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "invalid",
        fen: startFen,
        lastMove: null,
      };
    }
  }, [startFen, moves]);

  const shapes: DrawShape[] =
    result.ok && result.lastMove
      ? [
          {
            orig: result.lastMove[0],
            dest: result.lastMove[1],
            brush: "gold",
          },
        ]
      : [];

  return (
    <Box
      sx={{
        my: 1.25,
        maxWidth: 240,
        borderRadius: `${RADIUS.control}px`,
        background: SURFACE.raisedTertiary,
        border: `1px solid ${result.ok ? LINE.hairline : ERROR_BORDER}`,
        p: 1,
      }}
    >
      {caption && (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            ...TYPE.label,
            color: TEXT.secondary,
            mb: 0.75,
            px: 0.5,
          }}
        >
          {caption}
        </Typography>
      )}

      {result.ok ? (
        <>
          <Box
            sx={{
              borderRadius: `${RADIUS.small}px`,
              overflow: "hidden",
            }}
          >
            <ChessgroundBoard
              fen={result.fen}
              shapes={shapes}
              lastMove={result.lastMove ?? undefined}
              viewOnly
            />
          </Box>
          {moves.length > 0 && (
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mt: 0.75,
                px: 0.5,
                color: TEXT.secondary,
                fontSize: TYPE.caption.fontSize,
                fontFamily: FONT_MONO,
              }}
            >
              After {moves.join(" ")}
            </Typography>
          )}
        </>
      ) : (
        <Box sx={{ px: 1, py: 1.25 }}>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              color: STATUS.error,
              fontSize: TYPE.caption.fontSize,
              fontWeight: 600,
              mb: 0.5,
            }}
          >
            Couldn't show that position
          </Typography>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              color: TEXT.secondary,
              fontSize: TYPE.caption.fontSize,
            }}
          >
            {result.error}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
