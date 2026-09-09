import type { CSSProperties } from "react";

/**
 * Visual tokens for the unified puzzle board (PuzzleBoardSurface).
 *
 * Single source of the "Puzzle Coach" board look that /preview/puzzles
 * established: warm light squares, walnut dark squares, ember last-move +
 * selection, warm-ink legal-target dots, red wrong-flash. Promoting the
 * previously-hardcoded board colors into one token object means every puzzle
 * surface renders identically and a restyle happens in one place.
 *
 * Why the dark square is #9A7654 and not the original #5C4630 (2026-09-08,
 * after GM Alex Colovic's review — "I strained myself to see where the pieces
 * are"): #5C4630 has a relative luminance of 0.069, which sits INSIDE the
 * maestro black-piece gradient (#737373→#303030, luminance 0.171→0.030), so a
 * black piece body on a dark square measured 1.13:1 and only its 1px stroke
 * separated it from the square. #9A7654 (luminance 0.205) clears the whole
 * gradient: cburnett black vs dark goes 2.37:1 → 5.09:1, maestro body 1.13:1 →
 * 1.90:1 (3.20:1 at the dark stop), white pieces on dark stay ≥3.4:1, and the
 * light/dark checker stays 3.0:1. Lichess brown (#b58863) reads 6.7:1 for black
 * pieces but drops white-on-dark to 2.6:1 and reads as another product; this is
 * the balanced point that still looks like an ember-lit object on the obsidian
 * page. The overlay alphas below were re-tuned for the lighter square (ember
 * now reads mostly by hue, so it needed more alpha; #EF4444 was replaced by
 * #DC2626 because at any alpha it landed at the walnut's exact luminance).
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
  /** The square a correct move just landed on (per-move reinforcement). */
  correct: string;
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
  dark: "#9A7654",
  lastMove: "rgba(255, 122, 26, 0.50)",
  wrong: "rgba(220, 38, 38, 0.62)",
  correct: "rgba(34, 197, 94, 0.60)",
  selected: "rgba(255, 122, 26, 0.38)",
  // Warm ink rather than white: a white dot measured 1.11:1 on the light
  // square (invisible) and would be 1.7:1 on the new dark one; ink reads
  // 1.9–2.4:1 (dot) and 2.3–3.4:1 (ring) on BOTH squares.
  legalDot: "radial-gradient(circle, rgba(20,12,6,0.38) 22%, transparent 26%)",
  legalCaptureShadow: "inset 0 0 0 3px rgba(20,12,6,0.50)",
  radius: "0.85rem",
};

export interface SquareStyleParts {
  /** Painted first (e.g. coach overlay); user cues layer on top. */
  underlay?: Record<string, CSSProperties> | null;
  lastMove?: { from: string; to: string } | null;
  wrongSquare?: string | null;
  /** Square a correct move just landed on — painted green over last-move. */
  correctSquare?: string | null;
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
  if (parts.correctSquare)
    set(parts.correctSquare, { background: theme.correct });
  for (const sq of parts.dotSquares ?? []) set(sq, { background: theme.legalDot });
  for (const sq of parts.captureSquares ?? [])
    set(sq, { boxShadow: theme.legalCaptureShadow });
  if (parts.selected) set(parts.selected, { background: theme.selected });
  return styles;
}
