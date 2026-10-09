/**
 * The brushes every chessground board in the app draws with.
 *
 * The first eleven are the board's own (the arrow toggles, the Masters
 * fan-out and its gold preview, the pale variants). The last four are
 * Masti's marks (boardAnnotations.ts, ANNOTATION_STYLE names them and their
 * colours, and boardShapes.test.ts holds the two in step). Chessground
 * writes a brush's arrowhead marker only once a shape uses it, so a brush
 * no shape uses adds nothing to the page.
 *
 * No import: the board's chunk does not pull in the annotation builder.
 */
export interface ChessgroundBrush {
  key: string;
  color: string;
  opacity: number;
  lineWidth: number;
}

export const CHESSGROUND_BRUSHES = {
  green: { key: "g", color: "#22c55e", opacity: 0.9, lineWidth: 10 },
  red: { key: "r", color: "#ef4444", opacity: 0.9, lineWidth: 10 },
  blue: { key: "b", color: "#3b82f6", opacity: 0.9, lineWidth: 10 },
  yellow: { key: "y", color: "#F97316", opacity: 0.9, lineWidth: 10 },
  purple: { key: "p", color: "#A855F7", opacity: 0.9, lineWidth: 10 },
  gold: { key: "go", color: "#FBBF24", opacity: 0.95, lineWidth: 11 },
  paleBlue: { key: "pb", color: "#3b82f6", opacity: 0.4, lineWidth: 15 },
  paleGreen: { key: "pg", color: "#22c55e", opacity: 0.4, lineWidth: 15 },
  paleRed: { key: "pr", color: "#ef4444", opacity: 0.4, lineWidth: 15 },
  palePurple: { key: "pp", color: "#A855F7", opacity: 0.45, lineWidth: 15 },
  paleGrey: {
    key: "pgr",
    color: "rgba(255,255,255,0.3)",
    opacity: 0.4,
    lineWidth: 15,
  },
  // Masti's marks (ANNOTATION_STYLE).
  cmPlayed: { key: "cpl", color: "#FB923C", opacity: 0.9, lineWidth: 10 },
  cmEngine: { key: "cen", color: "#86EFAC", opacity: 0.9, lineWidth: 10 },
  cmThreat: { key: "cth", color: "#F87171", opacity: 0.85, lineWidth: 9 },
  cmTarget: { key: "cta", color: "#38BDF8", opacity: 0.85, lineWidth: 9 },
} satisfies Record<string, ChessgroundBrush>;
