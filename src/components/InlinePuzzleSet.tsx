"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Paper,
  Stack,
  Typography,
  Chip,
  Link,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { Chessboard } from "react-chessboard";
import type { ChessPuzzle } from "@/lib/chessPuzzlesService";
import { usePuzzleBoardState } from "@/hooks/usePuzzleBoardState";
import { FlashOverlay } from "@/components/puzzle/FlashOverlay";
import InlinePuzzleCoach from "./InlinePuzzleCoach";

/**
 * InlinePuzzleSet — 3 puzzles solved inside the chat bubble (no /practice nav).
 *
 * State + behavior delegated to the shared usePuzzleBoardState hook
 * (parsing, opponent setup, opponent reply, flash, persistent wrong,
 * error surfacing). This file owns the chat-bubble chrome only:
 * StyledPaper, puzzle-pack progression, coach card integration, and
 * the Next/Skip CTAs.
 *
 * Mod 1 (skip): after WRONG_ATTEMPTS_BEFORE_SKIP wrong attempts on the
 * same puzzle OR any puzzle-data error, show "Skip" link.
 */

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  marginTop: theme.spacing(1.5),
  maxWidth: 480,
  background:
    "linear-gradient(145deg, rgba(76, 175, 80, 0.10) 0%, rgba(46, 125, 50, 0.14) 100%)",
  border: "1px solid rgba(76, 175, 80, 0.35)",
  borderRadius: "12px",
  boxShadow: "0 4px 12px rgba(76, 175, 80, 0.18)",
}));

const BOARD_MAX_WIDTH = 360;
const BOARD_MIN_WIDTH = 240;
const PAPER_HORIZONTAL_PADDING = 32; // 2 * theme.spacing(2)
const WRONG_ATTEMPTS_BEFORE_SKIP = 2;

interface InlinePuzzleSetProps {
  puzzles: ChessPuzzle[];
  displayTheme?: string;
}

export const InlinePuzzleSet: React.FC<InlinePuzzleSetProps> = ({
  puzzles,
  displayTheme,
}) => {
  const trimmed = useMemo(() => puzzles.slice(0, 3), [puzzles]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState<number>(BOARD_MAX_WIDTH);

  const currentPuzzle = trimmed[currentIndex];
  const done = currentIndex >= trimmed.length;

  const advanceToNext = useCallback(() => {
    setCurrentIndex((i) => i + 1);
  }, []);

  // Shared puzzle orchestration. Status, flash, wrong tracking, error
  // surfacing, opponent reply — all owned by the hook.
  const board = usePuzzleBoardState({
    puzzle: currentPuzzle ?? null,
  });

  // Responsive board sizing — clamp to container so the board never
  // overflows a narrow chat bubble or gets squished by an ultra-wide one.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const inner = el.clientWidth - PAPER_HORIZONTAL_PADDING;
      const w = Math.max(BOARD_MIN_WIDTH, Math.min(BOARD_MAX_WIDTH, inner));
      setBoardWidth(w);
    };
    compute();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (trimmed.length === 0) return null;

  if (done) {
    return (
      <StyledPaper ref={containerRef} elevation={2}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          ✅ Nice work — 3 puzzles done
        </Typography>
        {displayTheme && (
          <Typography variant="caption" color="text.secondary">
            Theme: {displayTheme}
          </Typography>
        )}
      </StyledPaper>
    );
  }

  const turn = board.game.turn();
  const statusText =
    board.puzzleError
      ? "Puzzle data error"
      : board.status === "loading"
        ? "Loading…"
        : board.status === "wrong"
          ? "Not quite — try again."
          : board.status === "solved"
            ? "Correct!"
            : turn === "w"
              ? "White to move"
              : "Black to move";

  const showSkip =
    (board.wrongAttempts >= WRONG_ATTEMPTS_BEFORE_SKIP || !!board.puzzleError) &&
    board.status !== "solved" &&
    !done;
  const showCoach =
    !!currentPuzzle && (board.status === "solved" || board.wrongAttempts > 0);
  const coachOutcome: "solved" | "wrong" =
    board.status === "solved" ? "solved" : "wrong";

  return (
    <StyledPaper ref={containerRef} elevation={2}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          🧩 Puzzle {currentIndex + 1} of {trimmed.length}
          {currentPuzzle?.rating ? ` · ${currentPuzzle.rating}` : ""}
        </Typography>
        <Chip
          size="small"
          label={statusText}
          color={
            board.puzzleError
              ? "warning"
              : board.status === "solved"
                ? "success"
                : board.status === "wrong"
                  ? "error"
                  : "default"
          }
          variant="outlined"
          // Force high-contrast text on the light-green StyledPaper background.
          // The orange MessageBubble parent globally cascades color: #fff into
          // its children, which made the default Chip label invisible against
          // the light green. Slate-800 (#1f2937) matches the neutral text used
          // in AICoachInsights for the same kind of dark-on-light context.
          sx={{ "& .MuiChip-label": { color: "#1f2937" } }}
        />
      </Box>

      {board.puzzleError && (
        <Box
          sx={{
            mb: 1,
            p: 1,
            borderRadius: 1,
            backgroundColor: "rgba(237, 108, 2, 0.10)",
            border: "1px solid rgba(237, 108, 2, 0.35)",
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: "#7a3a00", display: "block" }}
          >
            {board.puzzleError} Use Skip to move on.
          </Typography>
        </Box>
      )}

      <Box
        sx={{
          position: "relative",
          display: "inline-block",
          margin: "0 auto",
          borderRadius: "8px",
        }}
      >
        <FlashOverlay key={`flash-${board.flashKey}`} flash={board.flash} />
        <Chessboard
          id={`InlinePuzzle-${currentPuzzle?.id ?? currentIndex}`}
          position={board.game.fen()}
          onPieceDrop={board.onPieceDrop}
          boardOrientation={board.boardOrientation}
          boardWidth={boardWidth}
          customBoardStyle={{
            borderRadius: "4px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
          }}
          customSquareStyles={board.customSquareStyles}
          isDraggablePiece={board.isDraggablePiece}
          animationDuration={200}
        />
      </Box>

      {showCoach && currentPuzzle && (
        <InlinePuzzleCoach
          key={`${currentPuzzle.id}-${coachOutcome}`}
          puzzle={currentPuzzle}
          outcome={coachOutcome}
          userAttemptedMoveSan={board.lastWrongMoveSan}
        />
      )}

      <Stack
        direction="row"
        spacing={1}
        sx={{ mt: 1.5, alignItems: "center", justifyContent: "space-between" }}
      >
        {board.status === "solved" ? (
          <Button
            variant="contained"
            size="small"
            onClick={advanceToNext}
            sx={{
              bgcolor: "#4CAF50",
              textTransform: "none",
              fontWeight: 700,
              "&:hover": { bgcolor: "#43A047" },
            }}
          >
            {currentIndex + 1 < trimmed.length
              ? "Next puzzle →"
              : "Finish set →"}
          </Button>
        ) : (
          <Box />
        )}
        {showSkip && (
          <Link
            component="button"
            type="button"
            variant="caption"
            onClick={advanceToNext}
            sx={{ color: "text.secondary", textDecoration: "underline" }}
          >
            Skip this one →
          </Link>
        )}
      </Stack>
    </StyledPaper>
  );
};

export default InlinePuzzleSet;
