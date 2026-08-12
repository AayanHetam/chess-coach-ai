/**
 * Shared visual tokens for every illustration in the onboarding quiz.
 *
 * One file so the board crops (TacticDiagram) and the step icons (QuizIcon)
 * cannot drift into two slightly different greys — which is exactly what makes
 * a set of hand-made illustrations look hand-made.
 *
 * Values follow the Chess Masti design OS: ember is an accent and a glow, never
 * a fill; surfaces are white-alpha over the obsidian base rather than opaque
 * greys, so they sit correctly on the glass backdrop.
 */

export const LIGHT_SQ = "rgba(255,255,255,0.13)";
export const DARK_SQ = "rgba(255,255,255,0.045)";

/** Both sides use the FILLED glyph set — hollow glyphs vanish on a dark board. */
export const WHITE_PIECE = "#F4F4F1";
export const BLACK_PIECE = "#98A2B3";

export const EMBER = "#F97316";
export const DANGER = "#F87171";
export const QUIET = "rgba(255,255,255,0.35)";

/** Unicode filled-glyph set, shared by diagrams and icons. */
export const GLYPH = {
  king: "♚",
  queen: "♛",
  rook: "♜",
  bishop: "♝",
  knight: "♞",
  pawn: "♟",
} as const;

export type Glyph = keyof typeof GLYPH;
