import { useEffect, useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { Box, Typography } from "@mui/material";
import { parseSolutionMoves } from "@/lib/puzzleSolution";
import { findThemeReference } from "@/lib/puzzle/themeReference";
import { usePuzzleBoardState } from "@/hooks/usePuzzleBoardState";
import { DEFAULT_PUZZLE_THEME } from "@/components/puzzle/boardTheme";
import { MastiAvatar, type MastiMood } from "@/components/masti";
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

const BOARD_MIN_WIDTH = 220;
const BOARD_MAX_WIDTH = 420;

/**
 * The square the board lives in, used by BOTH the prerendered
 * StaticBoardDiagram and the interactive board that replaces it after mount.
 *
 * They have to agree, because on /puzzles/[rating] each card swaps one for
 * the other and there are eight cards down the page. They did not agree: the
 * static diagram was fluid (100%, capped at 420) while the interactive board
 * was a fixed 320px guess that a ResizeObserver corrected a frame later. Both
 * the guess and the correction moved every card below — 0.18 of CLS on the
 * seventeen rating pages, which are landing pages, which means it was CrUX's
 * number too.
 *
 * Holding the aspect ratio here also covers the gap while the
 * PuzzleBoardSurface chunk is still in flight: next/dynamic renders nothing
 * until it lands, and nothing in a box with a reserved square is still a
 * square.
 */
export const BOARD_FRAME_SX = {
  width: "100%",
  maxWidth: BOARD_MAX_WIDTH,
  mx: "auto",
  aspectRatio: "1 / 1",
} as const;

/**
 * The caption under the board, likewise shared by both branches.
 *
 * The interactive caption carries a 22px MastiAvatar and the static one is
 * plain text, so the two line boxes differed by ~6px per card and the swap
 * paid that eight times over. A flex row with a floor makes them identical
 * whether or not there is a face in it.
 */
export const BOARD_CAPTION_SX = {
  mt: 1,
  minHeight: 26,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  fontSize: "0.82rem",
  fontWeight: 600,
} as const;

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
  orientation: "white" | "black"
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
          cells.push(
            `${ch === ch.toUpperCase() ? "w" : "b"}${ch.toUpperCase()}`
          );
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
        ...BOARD_FRAME_SX,
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
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
      (m) => m.PuzzleBoardSurface
    ),
  { ssr: false }
);

/**
 * Measure before the browser paints, never after.
 *
 * This component only ever renders on the client (the pages gate it behind
 * `mounted`), but the guard keeps the SSR warning away if that ever changes.
 */
const useMeasureBeforePaint =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function InteractivePuzzleBoard({ puzzle }: { puzzle: LandingPuzzle }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  // Undefined means "not measured yet", which PuzzleBoardSurface reads as
  // fluid — the frame's own width. A numeric guess here instead (it used to
  // be 320) is a wrong board painted for one frame and then corrected.
  const [boardWidth, setBoardWidth] = useState<number | undefined>(undefined);

  // Layout effect, not effect: this runs after the DOM is in place but
  // BEFORE the browser paints, so the measured width is the first width the
  // board is ever drawn at. With a plain useEffect the guess reaches the
  // screen and the correction is a visible resize — which is to say a
  // layout shift, in the middle of a column of eight cards.
  useMeasureBeforePaint(() => {
    const el = frameRef.current;
    if (!el) return;
    const compute = () => {
      const w = Math.max(
        BOARD_MIN_WIDTH,
        Math.min(BOARD_MAX_WIDTH, Math.floor(el.clientWidth))
      );
      setBoardWidth((prev) => (prev === w ? prev : w));
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
  // Client-only component (the pages gate it behind `mounted`), so a face
  // keyed on live board state is safe here.
  const statusMood: MastiMood = board.puzzleError
    ? "nervous"
    : board.status === "loading"
      ? "thinking"
      : board.status === "solved"
        ? "excited"
        : board.status === "wrong"
          ? "nervous"
          : "idea";

  return (
    <Box>
      {/* Same square as StaticBoardDiagram, so the swap from one to the
          other after mount costs nothing. It also holds the space while the
          PuzzleBoardSurface chunk is still downloading. */}
      <Box ref={frameRef} sx={BOARD_FRAME_SX}>
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
      <Typography sx={{ ...BOARD_CAPTION_SX, color: statusColor }}>
        <MastiAvatar
          mood={statusMood}
          size={22}
          ring={false}
          animated
          loops={1}
          replayKey={board.flashKey}
          style={{ verticalAlign: "middle", marginRight: 6 }}
        />
        {statusText}
      </Typography>
    </Box>
  );
}
