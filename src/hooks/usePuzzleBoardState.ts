import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, Square } from "chess.js";
import { parseSolutionMoves } from "@/lib/puzzleSolution";
import type { FlashState } from "@/components/puzzle/FlashOverlay";

/**
 * Shared puzzle board state + behavior. Consolidates the duplicated
 * orchestration that lived in InlinePuzzleSet, PracticeChessBoard,
 * DailyPuzzle, and PuzzleRush. Each surface used to inline its own
 * variant — every bug (silent-truncation parser, silent opponent-move
 * catch, missing `if (!move)` guards, inconsistent flash animation,
 * non-persistent wrong state) had to be fixed in each copy. This hook
 * makes them one.
 *
 * Owns:
 *   • parsing the puzzle solution (via the shared robust parser)
 *   • loading state, opponent setup move, status transitions
 *   • the user's onPieceDrop flow (correct → opponent reply, wrong →
 *     persistent flash + tracked SAN)
 *   • flash animation re-trigger via flashKey
 *   • puzzleError surface for malformed data or opponent-move failures
 *   • customSquareStyles for last-move + wrong-square highlights
 *   • isDraggablePiece that allows attempts during both playing and
 *     persistent wrong states
 *
 * Does NOT own:
 *   • the surrounding UI chrome (status chip / banner / skip button)
 *   • board sizing (each surface has its own responsive logic)
 *   • custom piece rendering (each surface has its own piece set wiring)
 *   • stats/scoring/persistence (callbacks: onSolved, onWrong)
 *   • inter-puzzle advancement (each surface decides when to call
 *     setActivePuzzle with the next one)
 *
 * PatternTraining is deliberately NOT migrated — it has a different
 * state model (study → solve → result phases, single-move puzzles,
 * blind-mode). Its parser + silent-catch fixes shipped in PR #113.
 */

export interface PuzzleInput {
  id: string;
  fen: string;
  solution?: string[];
  moves?: string[];
}

export interface UsePuzzleBoardStateOptions {
  /** Active puzzle. Null while loading or after a set finishes. */
  puzzle: PuzzleInput | null;
  /** Fired after the puzzle's last move (user's OR opponent's) lands. */
  onSolved?: (puzzleId: string) => void;
  /** Fired after every wrong attempt. attemptedSan may be null if
   *  chess.js couldn't probe the move. */
  onWrong?: (puzzleId: string, attemptedSan: string | null) => void;
  /** Delay (ms) before the opponent's setup move plays after puzzle load. */
  opponentSetupDelayMs?: number;
  /** Delay (ms) between the user's correct move and the opponent's reply. */
  opponentResponseDelayMs?: number;
}

export type PuzzleStatus = "loading" | "playing" | "wrong" | "solved";

export interface UsePuzzleBoardStateReturn {
  /** Current chess.js game state — drives the Chessboard's position. */
  game: Chess;
  status: PuzzleStatus;
  /** "white" or "black" — the user's POV. Computed from the puzzle FEN:
   *  the FEN's side-to-move is the OPPONENT (puzzle convention), the
   *  user plays the other color. */
  boardOrientation: "white" | "black";
  lastMoveSquares: { from: Square; to: Square } | null;
  wrongSquare: Square | null;
  flash: FlashState;
  /** Monotonic counter — pass as React `key` on the FlashOverlay so
   *  it remounts on each flash trigger and the CSS animation restarts. */
  flashKey: number;
  /** Set when the puzzle data is malformed (parser truncated the
   *  solution) or when an opponent's reply fails to apply. Surface in
   *  the UI so the user can skip instead of seeing a frozen board. */
  puzzleError: string | null;
  /** SAN of the user's most recent wrong attempt. Useful for coach
   *  prompts ("you played Bxh7+ — here's why it doesn't work"). */
  lastWrongMoveSan: string | null;
  /** Count of wrong attempts this puzzle. Lets callers decide when
   *  to surface "Show solution" / "Skip" CTAs. */
  wrongAttempts: number;
  /** Solution-derived ply count. 0 while loading; >0 once parsed.
   *  Lets callers gate "how many moves remain" UI. */
  totalMoves: number;
  /** Pass to <Chessboard onPieceDrop={...}>. */
  onPieceDrop: (sourceSquare: string, targetSquare: string, piece: string) => boolean;
  /** Pass to <Chessboard isDraggablePiece={...}>. Allows drags in both
   *  "playing" and "wrong" states so retries are immediate. */
  isDraggablePiece: ({ piece }: { piece: string }) => boolean;
  /** Pass to <Chessboard customSquareStyles={...}>. */
  customSquareStyles: Record<string, React.CSSProperties>;
}

const DEFAULT_SETUP_DELAY_MS = 600;
const DEFAULT_RESPONSE_DELAY_MS = 400;

const LAST_MOVE_FROM_BG = "rgba(255, 170, 0, 0.4)";
const LAST_MOVE_TO_BG = "rgba(255, 170, 0, 0.5)";
const WRONG_SQUARE_BG = "rgba(220, 50, 50, 0.6)";

export function usePuzzleBoardState(
  opts: UsePuzzleBoardStateOptions,
): UsePuzzleBoardStateReturn {
  const {
    puzzle,
    onSolved,
    onWrong,
    opponentSetupDelayMs = DEFAULT_SETUP_DELAY_MS,
    opponentResponseDelayMs = DEFAULT_RESPONSE_DELAY_MS,
  } = opts;

  const [game, setGame] = useState<Chess>(() => new Chess());
  const [status, setStatus] = useState<PuzzleStatus>("loading");
  const [moveIndex, setMoveIndex] = useState(0);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">(
    "white",
  );
  const [lastMoveSquares, setLastMoveSquares] =
    useState<{ from: Square; to: Square } | null>(null);
  const [wrongSquare, setWrongSquare] = useState<Square | null>(null);
  const [flash, setFlash] = useState<FlashState>("idle");
  const [flashKey, setFlashKey] = useState(0);
  const [puzzleError, setPuzzleError] = useState<string | null>(null);
  const [lastWrongMoveSan, setLastWrongMoveSan] = useState<string | null>(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);

  // Stable id ref so setTimeout callbacks can skip themselves when a
  // newer puzzle has been loaded in the meantime.
  const puzzleIdRef = useRef<string | null>(null);

  // Latest callback refs so the opponent setTimeout closure doesn't
  // capture stale onSolved/onWrong references when the parent re-renders
  // with new handlers.
  const onSolvedRef = useRef(onSolved);
  const onWrongRef = useRef(onWrong);
  useEffect(() => {
    onSolvedRef.current = onSolved;
  }, [onSolved]);
  useEffect(() => {
    onWrongRef.current = onWrong;
  }, [onWrong]);

  // Parse the solution. Stable-id dep so parent re-renders that pass a
  // fresh puzzle object reference don't recompute and reset state mid-
  // attempt. (Mirror of PR #109's fix for InlinePuzzleSet.)
  const solutionParseResult = useMemo(() => {
    if (!puzzle) return { parsed: [], error: null as string | null };
    const raw = puzzle.solution || puzzle.moves || [];
    return parseSolutionMoves(puzzle.fen, raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id]);
  const solutionMoves = solutionParseResult.parsed;

  // Initialize on puzzle change. Resets all state, plays opponent's
  // setup move after a short delay.
  useEffect(() => {
    if (!puzzle) {
      setStatus("loading");
      return;
    }
    const puzzleId = puzzle.id;
    puzzleIdRef.current = puzzleId;

    let newGame: Chess;
    try {
      newGame = new Chess(puzzle.fen);
    } catch (err) {
      console.warn("[usePuzzleBoardState] invalid FEN:", err);
      setPuzzleError("Puzzle has an invalid starting position.");
      setStatus("playing");
      return;
    }
    const opponentColor = newGame.turn();
    const userColor = opponentColor === "w" ? "black" : "white";

    setBoardOrientation(userColor);
    setGame(newGame);
    setMoveIndex(0);
    setStatus("loading");
    setLastMoveSquares(null);
    setWrongSquare(null);
    setFlash("idle");
    setFlashKey(0);
    setLastWrongMoveSan(null);
    setWrongAttempts(0);
    // Hydrate up-front parse error so callers can surface it immediately
    // (e.g. orange "Puzzle data error" chip instead of a frozen board).
    setPuzzleError(solutionParseResult.error);

    const timer = setTimeout(() => {
      if (puzzleIdRef.current !== puzzleId) return;
      const firstMove = solutionParseResult.parsed[0];
      if (!firstMove) {
        if (solutionParseResult.error) {
          setStatus("playing"); // expose the error rather than spin in "loading"
        } else {
          // No solution moves at all — treat as already-playing.
          setStatus("playing");
        }
        return;
      }
      try {
        const g = new Chess(newGame.fen());
        g.move({
          from: firstMove.from,
          to: firstMove.to,
          promotion: firstMove.promotion,
        });
        setGame(g);
        setMoveIndex(1);
        setLastMoveSquares({ from: firstMove.from, to: firstMove.to });
        setStatus("playing");
      } catch (err) {
        console.warn("[usePuzzleBoardState] opponent setup move failed:", err);
        setPuzzleError("Opponent setup move couldn't be applied.");
        setStatus("playing");
      }
    }, opponentSetupDelayMs);

    return () => clearTimeout(timer);
    // Stable-id dep — see PR #109. parsed/error are deps via
    // solutionParseResult which itself depends on puzzle.id, so the
    // effect re-runs exactly once per puzzle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id]);

  const playOpponentReply = useCallback(
    (g: Chess, nextIdx: number, puzzleId: string) => {
      setTimeout(() => {
        if (puzzleIdRef.current !== puzzleId) return;
        const m = solutionMoves[nextIdx];
        if (!m) {
          // Parser truncated — surface visibly instead of silent freeze.
          const msg = `Puzzle data ends at move ${nextIdx} — cannot continue.`;
          console.warn("[usePuzzleBoardState] opponent move missing:", msg);
          setPuzzleError(msg);
          return;
        }
        try {
          const g2 = new Chess(g.fen());
          g2.move({ from: m.from, to: m.to, promotion: m.promotion });
          setGame(g2);
          setMoveIndex(nextIdx + 1);
          setLastMoveSquares({ from: m.from, to: m.to });
          if (nextIdx + 1 >= solutionMoves.length) {
            setStatus("solved");
            setFlash("green");
            setFlashKey((k) => k + 1);
            onSolvedRef.current?.(puzzleId);
          }
        } catch (err) {
          const msg = `Opponent move ${nextIdx + 1} (${m.from}-${m.to}) failed to apply.`;
          console.warn("[usePuzzleBoardState]", msg, err);
          setPuzzleError(msg);
        }
      }, opponentResponseDelayMs);
    },
    [solutionMoves, opponentResponseDelayMs],
  );

  const onPieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece: string): boolean => {
      // Allow drags in both "playing" and persistent "wrong" states so
      // the user can retry immediately without waiting for a timer.
      if (status !== "playing" && status !== "wrong") return false;
      if (!puzzle) return false;
      if (moveIndex >= solutionMoves.length) return false;

      const expected = solutionMoves[moveIndex];
      const from = sourceSquare as Square;
      const to = targetSquare as Square;
      const isMatch = from === expected.from && to === expected.to;

      if (!isMatch) {
        // Probe the user's attempted move to capture SAN. Wrapped in
        // try/catch because the attempted move may be illegal — in
        // which case we just don't pass a SAN to the wrong callback.
        let attemptedSan: string | null = null;
        try {
          const probe = new Chess(game.fen());
          const r = probe.move({
            from,
            to,
            promotion:
              piece?.[1]?.toLowerCase() === "p" ? "q" : undefined,
          });
          if (r) attemptedSan = r.san;
        } catch {
          /* illegal attempt — attemptedSan stays null */
        }
        if (attemptedSan) setLastWrongMoveSan(attemptedSan);
        // Persistent wrong state. status, wrongSquare and flash stay set
        // until the next attempt; flashKey bump remounts FlashOverlay so
        // the box-shadow keyframes restart on every repeat wrong.
        setStatus("wrong");
        setWrongSquare(to);
        setWrongAttempts((n) => n + 1);
        setFlash("red");
        setFlashKey((k) => k + 1);
        onWrongRef.current?.(puzzle.id, attemptedSan);
        return false;
      }

      try {
        const g = new Chess(game.fen());
        g.move({ from, to, promotion: expected.promotion });
        setGame(g);
        setLastMoveSquares({ from, to });
        // Correct move clears persistent wrong-state memory.
        setWrongSquare(null);
        setStatus("playing");

        const nextIdx = moveIndex + 1;
        setMoveIndex(nextIdx);

        if (nextIdx >= solutionMoves.length) {
          setStatus("solved");
          setFlash("green");
          setFlashKey((k) => k + 1);
          onSolvedRef.current?.(puzzle.id);
        } else {
          playOpponentReply(g, nextIdx, puzzle.id);
        }
        return true;
      } catch {
        return false;
      }
    },
    [
      status,
      moveIndex,
      solutionMoves,
      game,
      puzzle,
      playOpponentReply,
    ],
  );

  const isDraggablePiece = useCallback(
    ({ piece }: { piece: string }) => {
      if (status !== "playing" && status !== "wrong") return false;
      const color = piece[0] === "w" ? "w" : "b";
      return color === game.turn();
    },
    [status, game],
  );

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMoveSquares) {
      styles[lastMoveSquares.from] = { backgroundColor: LAST_MOVE_FROM_BG };
      styles[lastMoveSquares.to] = { backgroundColor: LAST_MOVE_TO_BG };
    }
    if (wrongSquare) {
      // Overrides lastMoveSquares when the wrong target collides.
      styles[wrongSquare] = { backgroundColor: WRONG_SQUARE_BG };
    }
    return styles;
  }, [lastMoveSquares, wrongSquare]);

  return {
    game,
    status,
    boardOrientation,
    lastMoveSquares,
    wrongSquare,
    flash,
    flashKey,
    puzzleError,
    lastWrongMoveSan,
    wrongAttempts,
    totalMoves: solutionMoves.length,
    onPieceDrop,
    isDraggablePiece,
    customSquareStyles,
  };
}
