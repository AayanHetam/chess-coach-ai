import type { CSSProperties } from "react";

/**
 * Visual tokens for the unified puzzle board (PuzzleBoardSurface).
 *
 * Single source of the "Puzzle Coach" board look that /preview/puzzles
 * established (ember-on-obsidian: warm light squares, deep brown dark
 * squares, orange last-move + selection, white legal-target dots, red
 * wrong-flash). Promoting the ~6 previously-hardcoded board colors into one
 * token object means every puzzle surface renders identically and a restyle
 * happens in one place.
 *
 * A surface that genuinely needs a different palette passes its own BoardTheme;
 * everything else gets DEFAULT_PUZZLE_THEME.
 */
export interface BoardTheme {
  /** Light square fill. */
  light: string;
  /** Dark square fill. */
  dark: string;
  /** Both squares of the most recent move. */
  lastMove: string;
  /** The square a wrong move was dropped on. */
  wrong: string;
  /** The currently-selected source square (click-to-move). */
  selected: string;
  /** Quiet legal-target indicator (a centered dot). */
  legalDot: string;
  /** Legal-capture indicator (a ring around the target). */
  legalCaptureShadow: string;
  /** Board corner radius. */
  radius: string;
}

export const DEFAULT_PUZZLE_THEME: BoardTheme = {
  light: "#F0D9B5",
  dark: "#5C4630",
  lastMove: "rgba(255, 122, 26, 0.42)",
  wrong: "rgba(239, 68, 68, 0.55)",
  selected: "rgba(255, 122, 26, 0.30)",
  legalDot:
    "radial-gradient(circle, rgba(255,255,255,0.32) 22%, transparent 26%)",
  legalCaptureShadow: "inset 0 0 0 3px rgba(255,255,255,0.45)",
  radius: "0.85rem",
};

export interface SquareStyleParts {
  /** Painted first (e.g. coach overlay); user cues layer on top. */
  underlay?: Record<string, CSSProperties> | null;
  lastMove?: { from: string; to: string } | null;
  wrongSquare?: string | null;
  dotSquares?: string[];
  captureSquares?: string[];
  selected?: string | null;
}

/**
 * Pure composition of a puzzle board's square styles, in paint order:
 * underlay → last-move → wrong → legal dots/captures → selection. Later layers
 * override earlier ones on a collision. Kept here (pure, no JSX/react-chessboard)
 * so the unified board's visual contract is unit-testable without rendering.
 */
export function composePuzzleSquareStyles(
  theme: BoardTheme,
  parts: SquareStyleParts,
): Record<string, CSSProperties> {
  const styles: Record<string, CSSProperties> = {};
  const set = (sq: string, patch: CSSProperties) => {
    styles[sq] = { ...(styles[sq] ?? {}), ...patch };
  };
  if (parts.underlay) {
    for (const [sq, patch] of Object.entries(parts.underlay)) set(sq, patch);
  }
  if (parts.lastMove) {
    set(parts.lastMove.from, { background: theme.lastMove });
    set(parts.lastMove.to, { background: theme.lastMove });
  }
  if (parts.wrongSquare) set(parts.wrongSquare, { background: theme.wrong });
  for (const sq of parts.dotSquares ?? []) set(sq, { background: theme.legalDot });
  for (const sq of parts.captureSquares ?? [])
    set(sq, { boxShadow: theme.legalCaptureShadow });
  if (parts.selected) set(parts.selected, { background: theme.selected });
  return styles;
}
