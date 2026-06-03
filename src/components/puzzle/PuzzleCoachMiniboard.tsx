"use client";

import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { Chess } from "chess.js";
import dynamic from "next/dynamic";
import type { DrawShape } from "@/components/ui/ChessgroundBoard";

const ChessgroundBoard = dynamic(
  () =>
    import("@/components/ui/ChessgroundBoard").then((m) => m.ChessgroundBoard),
  { ssr: false },
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
 * Design: glass surface, ember accent ring, follows /preview/move-reveal
 * tokens (12px blur, rgba(22,18,14,0.55) fill, #FF7A1A accent).
 */

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

  const shapes: DrawShape[] = result.ok && result.lastMove
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
        borderRadius: "0.85rem",
        background: "rgba(22,18,14,0.55)",
        border: result.ok
          ? "1px solid rgba(255,122,26,0.22)"
          : "1px solid rgba(239,68,68,0.32)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        p: 1,
        boxShadow: result.ok
          ? "0 8px 24px -10px rgba(255,122,26,0.18), inset 0 1px 0 rgba(255,255,255,0.04)"
          : "0 8px 24px -10px rgba(239,68,68,0.18)",
      }}
    >
      {caption && (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            color: "rgba(255,240,224,0.7)",
            fontSize: "0.7rem",
            fontWeight: 600,
            letterSpacing: "0.04em",
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
              borderRadius: "0.5rem",
              overflow: "hidden",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.06)",
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
                color: "rgba(255,240,224,0.55)",
                fontSize: "0.7rem",
                fontFamily: "Monaco, Menlo, monospace",
              }}
            >
              after: {moves.join(" ")}
            </Typography>
          )}
        </>
      ) : (
        <Box sx={{ px: 1, py: 1.25 }}>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              color: "#fca5a5",
              fontSize: "0.72rem",
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
              color: "rgba(255,255,255,0.45)",
              fontSize: "0.7rem",
              fontFamily: "Monaco, Menlo, monospace",
            }}
          >
            {result.error}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
