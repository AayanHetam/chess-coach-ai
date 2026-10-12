import { Box } from "@mui/material";
import { keyframes, styled } from "@mui/material/styles";
import { STATUS } from "@/theme/tokens";

/**
 * Shared flash overlay for puzzle boards: a ring that lands around the board
 * once and fades, green on solved and red on wrong. It is an outline rather
 * than a spread shadow because nothing on the page glows; a ring that
 * arrives and leaves is feedback at the moment it applies, not decoration.
 *
 * Positioned absolutely with pointer-events: none so it doesn't block
 * drag-and-drop on the underlying Chessboard. Critical: callers MUST
 * pass `key={flashKey}` (a counter that increments on every flash
 * trigger) so the overlay remounts and the CSS animation restarts
 * cleanly. CSS animations applied to the SAME element with the SAME
 * emotion class won't reliably retrigger — the previous BoardWrap
 * pattern faded after a few wrong attempts because of this.
 *
 * Previously inlined in InlinePuzzleSet.tsx and PracticeChessBoard.tsx;
 * factored out so the three remaining puzzle surfaces (DailyPuzzle,
 * PuzzleRush, PatternTraining) can share the same visual treatment.
 */

const flashGreen = keyframes`
  0%   { outline-color: transparent; }
  20%  { outline-color: ${STATUS.success}; }
  100% { outline-color: transparent; }
`;

const flashRed = keyframes`
  0%   { outline-color: transparent; }
  20%  { outline-color: ${STATUS.error}; }
  100% { outline-color: transparent; }
`;

export type FlashState = "idle" | "green" | "red";

export const FlashOverlay = styled(Box, {
  shouldForwardProp: (prop) => prop !== "flash",
})<{ flash: FlashState }>(({ flash }) => ({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  borderRadius: "8px",
  zIndex: 2,
  outline: "3px solid transparent",
  outlineOffset: 2,
  animation:
    flash === "green"
      ? `${flashGreen} 700ms ease-out`
      : flash === "red"
        ? `${flashRed} 700ms ease-out`
        : "none",
}));
