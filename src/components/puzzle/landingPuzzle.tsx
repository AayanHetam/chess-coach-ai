import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { Box, Typography } from "@mui/material";
import { parseSolutionMoves } from "@/lib/puzzleSolution";
import { findThemeReference } from "@/lib/puzzle/themeReference";
import { usePuzzleBoardState } from "@/hooks/usePuzzleBoardState";
import { DEFAULT_PUZZLE_THEME } from "@/components/puzzle/boardTheme";
import type { FeedPuzzle } from "@/lib/puzzle-feed/loadPuzzles";

/**
 * Shared building blocks for the public puzzle landing surfaces —
 * /puzzles/[rating] (band pages) and /puzzles/p/[id] (per-puzzle
 * permalinks). Extracted verbatim from /puzzles/[rating].tsx so both
 * routes render the identical board, in the identical piece set, from
 * the identical corpus shape.
 *
 * Piece images here are the "cburnett" set (GPLv2+, credited on both
 * pages). The app-default "maestro" is CC BY-NC-SA — non-commercial — so
 * it must not be widened onto these public landing pages.
 */

export const LANDING_PIECE_SET = "cburnett";

export interface LandingPuzzle {
  id: string;
  /** Lichess-convention FEN: the position BEFORE the opponent's setup move. */
  fen: string;
  /** UCI line; solution[0] is the opponent's setup move. */
  solution: string[];
  rating: number;
  themeLabel: string;
  /** Position AFTER the setup move — what the solver actually faces. */
  displayFen: string;
  /** Solver's colour, derived from displayFen's side to move. */
  sideToMove: "white" | "black";
}

/** Tags that describe length/outcome rather than the tactical motif, so
 *  they make poor headline labels when the glossary has no entry. */
const NON_MOTIF_TAGS = new Set([
  "oneMove",
  "short",
  "long",
  "veryLong",
  "advantage",
  "equality",
  "crushing",
]);

/** "backRankMate" → "Back Rank Mate", "mateIn2" → "Mate In 2". */
function humanizeTheme(theme: string): string {
  return theme
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

export function primaryThemeLabel(themes: string[]): string {
  const ref = findThemeReference(themes);
  if (ref) return ref.title;
  const pick = themes.find((t) => !NON_MOTIF_TAGS.has(t)) ?? themes[0];
  return pick ? humanizeTheme(pick) : "Tactic";
}

/**
 * Validate a corpus puzzle and shape it for the landing surfaces.
 * Returns null for malformed data (unparseable line, illegal setup
 * move) so a bad row is skipped at build time, never shipped as a
 * frozen board.
 */
export function toLandingPuzzle(p: FeedPuzzle): LandingPuzzle | null {
  const { parsed, error } = parseSolutionMoves(p.fen, p.solution);
  if (error || parsed.length < 2) return null;
  let displayFen: string;
  try {
    const game = new Chess(p.fen);
    if (!game.move(parsed[0])) return null;
    displayFen = game.fen();
  } catch {
    return null;
  }
  return {
    id: p.id,
    fen: p.fen,
    solution: p.solution,
    rating: p.rating,
    themeLabel: primaryThemeLabel(p.themes),
    displayFen,
    sideToMove: displayFen.split(" ")[1] === "b" ? "black" : "white",
  };
}

/* ------------------------------------------------------------------ */
/* Static board diagram — server-renderable                            */
/* ------------------------------------------------------------------ */

const PIECE_NAMES: Record<string, string> = {
  P: "pawn",
  N: "knight",
  B: "bishop",
  R: "rook",
  Q: "queen",
  K: "king",
};

function pieceAlt(code: string): string {
  const color = code[0] === "w" ? "white" : "black";
  return `${color} ${PIECE_NAMES[code[1]] ?? "piece"}`;
}

/** Expand a FEN placement field into an 8×8 grid of piece codes ("wK",
 *  "" for empty), ordered top-left → bottom-right from the given POV. */
function fenToGrid(
  displayFen: string,
  orientation: "white" | "black",
): string[] {
  const placement = displayFen.split(" ")[0] ?? "";
  const rows = placement
    .split("/")
    .slice(0, 8)
    .map((rank) => {
      const cells: string[] = [];
      for (const ch of rank) {
        const n = Number(ch);
        if (Number.isInteger(n) && n > 0) {
          for (let k = 0; k < n && cells.length < 8; k++) cells.push("");
        } else if (cells.length < 8) {
          cells.push(`${ch === ch.toUpperCase() ? "w" : "b"}${ch.toUpperCase()}`);
        }
      }
      while (cells.length < 8) cells.push("");
      return cells;
    });
  while (rows.length < 8) rows.push(Array<string>(8).fill(""));
  if (orientation === "black") rows.reverse().forEach((r) => r.reverse());
  return rows.flat();
}

/**
 * Pure-DOM board diagram: CSS grid + piece <img>s, no react-chessboard.
 * This is what lands in the prerendered HTML (PuzzleBoardSurface cannot
 * SSR — react-chessboard + a localStorage-backed piece-set atom), and it
 * doubles as the inert board under the sign-in gate's blur.
 */
export function StaticBoardDiagram({
  displayFen,
  orientation,
  label,
  eager,
}: {
  displayFen: string;
  orientation: "white" | "black";
  label: string;
  eager?: boolean;
}) {
  const cells = fenToGrid(displayFen, orientation);
  return (
    <Box
      role="img"
      aria-label={label}
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
        width: "100%",
        maxWidth: 420,
        mx: "auto",
        aspectRatio: "1 / 1",
        borderRadius: DEFAULT_PUZZLE_THEME.radius,
        overflow: "hidden",
      }}
    >
      {cells.map((code, i) => {
        const light = (Math.floor(i / 8) + (i % 8)) % 2 === 0;
        return (
          <Box
            key={i}
            sx={{
              position: "relative",
              backgroundColor: light
                ? DEFAULT_PUZZLE_THEME.light
                : DEFAULT_PUZZLE_THEME.dark,
            }}
          >
            {code && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/piece/${LANDING_PIECE_SET}/${code}.svg`}
                alt={pieceAlt(code)}
                loading={eager ? undefined : "lazy"}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive board — mounts client-side only                         */
/* ------------------------------------------------------------------ */

const PuzzleBoardSurface = dynamic(
  () =>
    import("@/components/puzzle/PuzzleBoardSurface").then(
      (m) => m.PuzzleBoardSurface,
    ),
  { ssr: false },
);

const BOARD_MIN_WIDTH = 220;
const BOARD_MAX_WIDTH = 420;

export function InteractivePuzzleBoard({ puzzle }: { puzzle: LandingPuzzle }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(320);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const w = Math.max(
        BOARD_MIN_WIDTH,
        Math.min(BOARD_MAX_WIDTH, Math.floor(el.clientWidth)),
      );
      setBoardWidth(w);
    };
    compute();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const board = usePuzzleBoardState({ puzzle });

  const turn = board.game.turn();
  const statusText = board.puzzleError
    ? "Puzzle data error — try another one."
    : board.status === "loading"
      ? "Loading…"
      : board.status === "solved"
        ? "Solved!"
        : board.status === "wrong"
          ? "Not quite — try again."
          : turn === "w"
            ? "White to move"
            : "Black to move";
  const statusColor =
    board.status === "solved"
      ? "success.main"
      : board.status === "wrong"
        ? "error.main"
        : "rgba(255,255,255,0.6)";

  return (
    <Box ref={containerRef}>
      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <PuzzleBoardSurface
          boardId={`PuzzleLanding-${puzzle.id}`}
          fen={board.game.fen()}
          orientation={board.boardOrientation}
          interactive={board.status === "playing" || board.status === "wrong"}
          onPieceDrop={board.onPieceDrop}
          lastMove={board.lastMoveSquares}
          wrongSquare={board.wrongSquare}
          flash={{ state: board.flash, flashKey: board.flashKey }}
          boardWidth={boardWidth}
          pieceSet={LANDING_PIECE_SET}
          animationMs={200}
        />
      </Box>
      <Typography
        sx={{
          mt: 1,
          textAlign: "center",
          fontSize: "0.82rem",
          fontWeight: 600,
          color: statusColor,
        }}
      >
        {statusText}
      </Typography>
    </Box>
  );
}
