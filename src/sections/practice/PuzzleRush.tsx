import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  Dialog,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { Chessboard } from "react-chessboard";
import { Chess, Square } from "chess.js";
import { useAtomValue, useSetAtom } from "jotai";
import { puzzleSolvedStatusAtom } from "./states";
import { useScreenSize } from "@/hooks/useScreenSize";
import { pieceSetAtom } from "@/components/board/states";
import { Piece, CustomPieces } from "react-chessboard/dist/chessboard/types";
import TimerIcon from "@mui/icons-material/Timer";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import BoltIcon from "@mui/icons-material/Bolt";
import FavoriteIcon from "@mui/icons-material/Favorite";
import type { DifficultyBand } from "@/types/puzzles";
import type { ChessPuzzle } from "@/lib/chessPuzzlesService";
import {
  puzzleStatsAtom,
  puzzleRushScoresAtom,
  updatePuzzleStats,
  type PuzzleRushScores,
} from "@/lib/puzzleRating";
import { parseSolutionMoves as parseSolution } from "@/lib/puzzleSolution";

const PIECE_CODES: Piece[] = [
  "wP", "wB", "wN", "wR", "wQ", "wK",
  "bP", "bB", "bN", "bR", "bQ", "bK",
];

type RushMode = "three" | "five" | "survival";

const RUSH_MODES: { value: RushMode; label: string; description: string; timeSeconds: number; lives: number }[] = [
  { value: "three", label: "3 Min Rush", description: "Solve as many as you can in 3 minutes", timeSeconds: 180, lives: Infinity },
  { value: "five", label: "5 Min Rush", description: "Solve as many as you can in 5 minutes", timeSeconds: 300, lives: Infinity },
  { value: "survival", label: "Survival", description: "3 lives — one wrong answer costs a life", timeSeconds: Infinity, lives: 3 },
];

// parseSolutionMoves is now imported from @/lib/puzzleSolution as
// parseSolution — shared with the other four puzzle surfaces. The
// inline copies all had the same silent-truncation bug on long puzzles
// (broke on the first move chess.js couldn't apply, no error to caller).

interface PuzzleRushProps {
  onBack: () => void;
}

export default function PuzzleRush({ onBack }: PuzzleRushProps) {
  const screenSize = useScreenSize();
  const pieceSet = useAtomValue(pieceSetAtom);
  const setGlobalStats = useSetAtom(puzzleStatsAtom);
  const globalStats = useAtomValue(puzzleStatsAtom);
  const rushScores = useAtomValue(puzzleRushScoresAtom);
  const setRushScores = useSetAtom(puzzleRushScoresAtom);

  // Setup state
  const [mode, setMode] = useState<RushMode>("three");
  const [difficulty, setDifficulty] = useState<DifficultyBand | "all">("all");
  const [phase, setPhase] = useState<"setup" | "playing" | "finished">("setup");

  // Game state
  const [puzzles, setPuzzles] = useState<ChessPuzzle[]>([]);
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [game, setGame] = useState<Chess>(new Chess());
  const [moveIndex, setMoveIndex] = useState(0);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [lastMoveSquares, setLastMoveSquares] = useState<{ from: Square; to: Square } | null>(null);
  const [wrongSquare, setWrongSquare] = useState<Square | null>(null);
  const [status, setStatus] = useState<"loading" | "playing" | "wrong" | "solved">("loading");
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<Square[]>([]);

  // Rush state
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(180);
  const [showFinishDialog, setShowFinishDialog] = useState(false);
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const puzzleStartTimeRef = useRef<number>(Date.now());

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const puzzleIdRef = useRef<string | null>(null);

  const modeConfig = RUSH_MODES.find((m) => m.value === mode)!;

  const currentPuzzle = puzzles[puzzleIndex] || null;

  const solutionParseResult = useMemo(() => {
    if (!currentPuzzle) return { parsed: [], error: null as string | null };
    const moves = currentPuzzle.solution || currentPuzzle.moves || [];
    return parseSolution(currentPuzzle.fen, moves);
    // Stable-id dep — see PR #109. Avoids recomputing on every parent
    // re-render which could blow away state mid-puzzle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPuzzle?.id]);
  const solutionMoves = solutionParseResult.parsed;
  // PuzzleRush already auto-advances on success/fail (it's a timed
  // mode) so a malformed puzzle just gets skipped. We log it for
  // diagnostics; no visible error UI is needed at the per-puzzle level.
  useEffect(() => {
    if (solutionParseResult.error) {
      console.warn(
        "[PuzzleRush] puzzle parse error, will auto-skip on first opponent miss:",
        solutionParseResult.error,
      );
    }
  }, [solutionParseResult.error]);

  const boardSize = useMemo(() => {
    const width = screenSize.width;
    const height = screenSize.height;
    if (!width || !height || width <= 0 || height <= 0) return 400;
    if (typeof window !== "undefined" && window.innerWidth < 1200) {
      return Math.max(Math.min(width - 32, height - 280), 280);
    }
    return Math.max(Math.min(width - 520, height * 0.72, 560), 320);
  }, [screenSize]);

  const solvedStatus = useAtomValue(puzzleSolvedStatusAtom);

  // Fetch puzzles for the rush
  const fetchPuzzles = useCallback(async () => {
    try {
      const solvedIds = Object.keys(solvedStatus).filter((id) => solvedStatus[id]);
      const body: Record<string, unknown> = {
        command: "random",
        limit: 100,
        excludeIds: solvedIds.length > 0 ? solvedIds : undefined,
      };
      if (difficulty !== "all") {
        body.difficulty = difficulty;
      }
      const response = await fetch("/api/chess-puzzles-dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) return [];
      const data = await response.json();
      if (data.success && data.puzzles?.length > 0) {
        return data.puzzles.map((p: Record<string, unknown>) => ({
          id: (p.id as string) || String(Math.random()),
          fen: p.fen as string,
          moves: (p.moves as string[]) || [],
          rating: (p.rating as number) || 1500,
          themes: (p.themes as string[]) || [],
          solution: (p.solution as string[]) || (p.moves as string[]) || [],
        })) as ChessPuzzle[];
      }
    } catch (err) {
      console.error("Error fetching rush puzzles:", err);
    }
    return [];
  }, [difficulty, solvedStatus]);

  // Load a specific puzzle onto the board
  const loadPuzzle = useCallback(
    (puzzle: ChessPuzzle) => {
      puzzleIdRef.current = puzzle.id;
      const newGame = new Chess(puzzle.fen);
      const opponentColor = newGame.turn();
      const userColor = opponentColor === "w" ? "black" : "white";
      setBoardOrientation(userColor);
      setGame(newGame);
      setMoveIndex(0);
      setStatus("loading");
      setLastMoveSquares(null);
      setWrongSquare(null);
      setSelectedSquare(null);
      setLegalMoveSquares([]);
      puzzleStartTimeRef.current = Date.now();

      // Auto-play opponent's first move
      setTimeout(() => {
        if (puzzleIdRef.current !== puzzle.id) return;
        const moves = puzzle.solution || puzzle.moves || [];
        if (moves.length === 0) return;
        const firstMove = moves[0];
        const from = firstMove.slice(0, 2) as Square;
        const to = firstMove.slice(2, 4) as Square;
        const promotion = firstMove.length > 4 ? firstMove[4] : undefined;
        try {
          const g = new Chess(newGame.fen());
          g.move({ from, to, promotion });
          setGame(g);
          setMoveIndex(1);
          setLastMoveSquares({ from, to });
          setStatus("playing");
        } catch {
          setStatus("playing");
          setMoveIndex(0);
        }
      }, 400);
    },
    []
  );

  // Start the rush
  const handleStart = useCallback(async () => {
    const fetched = await fetchPuzzles();
    if (fetched.length === 0) return;
    setPuzzles(fetched);
    setPuzzleIndex(0);
    setScore(0);
    setLives(modeConfig.lives === Infinity ? 3 : modeConfig.lives);
    setTimeLeft(modeConfig.timeSeconds === Infinity ? 0 : modeConfig.timeSeconds);
    setPhase("playing");
    setShowFinishDialog(false);
    setIsNewHighScore(false);
    loadPuzzle(fetched[0]);
  }, [fetchPuzzles, modeConfig, loadPuzzle]);

  // Timer
  useEffect(() => {
    if (phase !== "playing") return;
    if (modeConfig.timeSeconds === Infinity) return; // survival has no timer

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setPhase("finished");
          setShowFinishDialog(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, modeConfig.timeSeconds]);

  // Survival timer (count up)
  useEffect(() => {
    if (phase !== "playing") return;
    if (modeConfig.timeSeconds !== Infinity) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, modeConfig.timeSeconds]);

  // Check high score on finish
  useEffect(() => {
    if (phase !== "finished") return;
    let newHigh = false;
    const key: keyof PuzzleRushScores =
      mode === "three" ? "threeMin" : mode === "five" ? "fiveMin" : "survivalBest";
    if (score > rushScores[key]) {
      setRushScores((prev) => ({ ...prev, [key]: score }));
      newHigh = true;
    }
    setIsNewHighScore(newHigh);
    setShowFinishDialog(true);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Advance to next puzzle
  const advanceToNext = useCallback(() => {
    const nextIdx = puzzleIndex + 1;
    if (nextIdx < puzzles.length) {
      setPuzzleIndex(nextIdx);
      loadPuzzle(puzzles[nextIdx]);
    } else {
      // Ran out of puzzles, fetch more
      fetchPuzzles().then((fetched) => {
        if (fetched.length > 0) {
          setPuzzles(fetched);
          setPuzzleIndex(0);
          loadPuzzle(fetched[0]);
        } else {
          setPhase("finished");
        }
      });
    }
  }, [puzzleIndex, puzzles, loadPuzzle, fetchPuzzles]);

  // Record solve to global stats
  const recordSolve = useCallback(
    (solved: boolean) => {
      if (!currentPuzzle) return;
      const timeMs = Date.now() - puzzleStartTimeRef.current;
      const record = {
        puzzleId: currentPuzzle.id,
        puzzleRating: currentPuzzle.rating,
        solved,
        timeMs,
        theme: currentPuzzle.themes?.[0] || "unknown",
        timestamp: Date.now(),
      };
      setGlobalStats((prev) => updatePuzzleStats(prev, record));
    },
    [currentPuzzle, setGlobalStats]
  );

  // Play opponent's response after correct move
  const playOpponentMove = useCallback(
    (currentGame: Chess, nextMoveIdx: number) => {
      if (nextMoveIdx >= solutionMoves.length) return;
      const puzzleId = puzzleIdRef.current;
      setTimeout(() => {
        if (puzzleIdRef.current !== puzzleId) return;
        const move = solutionMoves[nextMoveIdx];
        if (!move) {
          // Parser truncated — long puzzle's data ran out mid-sequence.
          // In rush mode, just skip this puzzle and move on. Was
          // previously a crash (TypeError on undefined .from).
          console.warn(
            "[PuzzleRush] opponent move missing at index",
            nextMoveIdx,
            "of",
            solutionMoves.length,
          );
          advanceToNext();
          return;
        }
        try {
          const g = new Chess(currentGame.fen());
          g.move({ from: move.from, to: move.to, promotion: move.promotion });
          setGame(g);
          setMoveIndex(nextMoveIdx + 1);
          setLastMoveSquares({ from: move.from, to: move.to });
          if (nextMoveIdx + 1 >= solutionMoves.length) {
            // Puzzle solved!
            setStatus("solved");
            setScore((prev) => prev + 1);
            recordSolve(true);
            setTimeout(() => advanceToNext(), 500);
          }
        } catch (err) {
          // chess.js rejected the opponent move — log and skip.
          // Previously silent → user saw a frozen board mid-puzzle.
          console.warn(
            "[PuzzleRush] opponent move failed; skipping puzzle:",
            err,
          );
          advanceToNext();
        }
      }, 300);
    },
    [solutionMoves, recordSolve, advanceToNext]
  );

  // Handle piece drop
  const onPieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string): boolean => {
      if (status !== "playing" || phase !== "playing") return false;
      if (moveIndex >= solutionMoves.length) return false;

      const expectedMove = solutionMoves[moveIndex];
      const from = sourceSquare as Square;
      const to = targetSquare as Square;

      if (from === expectedMove.from && to === expectedMove.to) {
        try {
          const g = new Chess(game.fen());
          g.move({ from, to, promotion: expectedMove.promotion });
          setGame(g);
          setLastMoveSquares({ from, to });
          setWrongSquare(null);
          setSelectedSquare(null);
          setLegalMoveSquares([]);
          const nextIdx = moveIndex + 1;
          setMoveIndex(nextIdx);
          if (nextIdx >= solutionMoves.length) {
            setStatus("solved");
            setScore((prev) => prev + 1);
            recordSolve(true);
            setTimeout(() => advanceToNext(), 500);
          } else {
            playOpponentMove(g, nextIdx);
          }
          return true;
        } catch { return false; }
      } else {
        // Wrong move
        setStatus("wrong");
        setWrongSquare(to);
        recordSolve(false);

        if (mode === "survival") {
          setLives((prev) => {
            const newLives = prev - 1;
            if (newLives <= 0) {
              setTimeout(() => {
                setPhase("finished");
              }, 600);
            }
            return newLives;
          });
        }

        // Skip to next puzzle after wrong move in rush mode
        setTimeout(() => {
          if (phase === "playing") {
            setStatus("playing");
            setWrongSquare(null);
            advanceToNext();
          }
        }, 800);
        return false;
      }
    },
    [game, status, phase, moveIndex, solutionMoves, mode, recordSolve, advanceToNext, playOpponentMove]
  );

  // Click-to-move
  const onSquareClick = useCallback(
    (square: Square) => {
      if (status !== "playing" || phase !== "playing") return;
      if (!selectedSquare) {
        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
          setSelectedSquare(square);
          const moves = game.moves({ square, verbose: true });
          setLegalMoveSquares(moves.map((m) => m.to as Square));
        }
        return;
      }
      if (selectedSquare === square) {
        setSelectedSquare(null);
        setLegalMoveSquares([]);
        return;
      }
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
        const moves = game.moves({ square, verbose: true });
        setLegalMoveSquares(moves.map((m) => m.to as Square));
        return;
      }
      onPieceDrop(selectedSquare, square);
    },
    [game, status, phase, selectedSquare, onPieceDrop]
  );

  // Custom pieces
  const customPieces = useMemo(
    () =>
      PIECE_CODES.reduce<CustomPieces>((acc, piece) => {
        acc[piece] = ({ squareWidth }: { squareWidth: number }) => (
          <Box
            width={squareWidth}
            height={squareWidth}
            sx={{
              backgroundImage: `url(/piece/${pieceSet}/${piece}.svg)`,
              backgroundSize: "contain",
            }}
          />
        );
        return acc;
      }, {}),
    [pieceSet]
  );

  // Square styles
  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMoveSquares) {
      styles[lastMoveSquares.from] = { backgroundColor: "rgba(255, 170, 0, 0.4)" };
      styles[lastMoveSquares.to] = { backgroundColor: "rgba(255, 170, 0, 0.5)" };
    }
    if (selectedSquare) {
      styles[selectedSquare] = { backgroundColor: "rgba(20, 85, 180, 0.5)" };
    }
    for (const sq of legalMoveSquares) {
      const existing = styles[sq] || {};
      styles[sq] = {
        ...existing,
        background: `${existing.backgroundColor || ""} radial-gradient(circle, rgba(0,0,0,0.15) 25%, transparent 25%)`.trim(),
      };
    }
    if (wrongSquare) {
      styles[wrongSquare] = { backgroundColor: "rgba(220, 50, 50, 0.6)" };
    }
    return styles;
  }, [lastMoveSquares, selectedSquare, legalMoveSquares, wrongSquare]);

  // Format seconds to mm:ss
  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const highScoreKey: keyof PuzzleRushScores =
    mode === "three" ? "threeMin" : mode === "five" ? "fiveMin" : "survivalBest";

  // ---- SETUP SCREEN ----
  if (phase === "setup") {
    return (
      <Paper sx={{ p: 4, maxWidth: 600, mx: "auto" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
          <BoltIcon sx={{ color: "warning.main", fontSize: 32 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Puzzle Rush
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Solve as many puzzles as you can! Wrong answers skip to the next puzzle.
          In Survival mode, you only get 3 lives.
        </Typography>

        {/* Mode selection */}
        <Box sx={{ display: "flex", gap: 1.5, mb: 3, flexWrap: "wrap" }}>
          {RUSH_MODES.map((m) => (
            <Paper
              key={m.value}
              onClick={() => setMode(m.value)}
              sx={{
                p: 2,
                flex: 1,
                minWidth: 140,
                cursor: "pointer",
                border: "2px solid",
                borderColor: mode === m.value ? "primary.main" : "grey.700",
                bgcolor: mode === m.value ? "rgba(25,118,210,0.08)" : "grey.900",
                transition: "all 0.2s",
                "&:hover": { borderColor: "primary.light" },
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {m.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {m.description}
              </Typography>
              {rushScores[m.value === "three" ? "threeMin" : m.value === "five" ? "fiveMin" : "survivalBest"] > 0 && (
                <Chip
                  icon={<EmojiEventsIcon sx={{ fontSize: 14 }} />}
                  label={`Best: ${rushScores[m.value === "three" ? "threeMin" : m.value === "five" ? "fiveMin" : "survivalBest"]}`}
                  size="small"
                  sx={{ mt: 1, bgcolor: "rgba(255,193,7,0.15)", color: "warning.light" }}
                />
              )}
            </Paper>
          ))}
        </Box>

        {/* Difficulty */}
        <FormControl size="small" sx={{ mb: 3, minWidth: 200 }}>
          <InputLabel>Difficulty</InputLabel>
          <Select
            value={difficulty}
            label="Difficulty"
            onChange={(e) => setDifficulty(e.target.value as DifficultyBand | "all")}
          >
            <MenuItem value="all">All Levels</MenuItem>
            <MenuItem value="beginner">Beginner (0-1200)</MenuItem>
            <MenuItem value="intermediate">Intermediate (1201-1600)</MenuItem>
            <MenuItem value="advanced">Advanced (1601-2000)</MenuItem>
            <MenuItem value="expert">Expert (2001+)</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ display: "flex", gap: 2 }}>
          <Button variant="outlined" onClick={onBack} sx={{ textTransform: "none" }}>
            Back
          </Button>
          <Button
            variant="contained"
            size="large"
            onClick={handleStart}
            startIcon={<BoltIcon />}
            sx={{ px: 4, fontWeight: 700, textTransform: "none" }}
          >
            Start Rush
          </Button>
        </Box>
      </Paper>
    );
  }

  // ---- PLAYING SCREEN ----
  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      {/* Top bar */}
      <Paper
        sx={{
          px: 2,
          py: 1.5,
          mb: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
          bgcolor: "grey.900",
          color: "grey.100",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <BoltIcon sx={{ color: "warning.main" }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {modeConfig.label}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
          {/* Score */}
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="caption" sx={{ color: "grey.500" }}>Score</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: "success.light", lineHeight: 1 }}>
              {score}
            </Typography>
          </Box>

          {/* Timer */}
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="caption" sx={{ color: "grey.500" }}>
              {modeConfig.timeSeconds === Infinity ? "Time" : "Time Left"}
            </Typography>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                lineHeight: 1,
                fontFamily: "monospace",
                color: modeConfig.timeSeconds !== Infinity && timeLeft <= 30 ? "error.light" : "grey.100",
              }}
            >
              {formatTimer(timeLeft)}
            </Typography>
          </Box>

          {/* Lives (survival only) */}
          {mode === "survival" && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              {[...Array(3)].map((_, i) => (
                <FavoriteIcon
                  key={i}
                  sx={{
                    fontSize: 22,
                    color: i < lives ? "error.main" : "grey.700",
                    transition: "color 0.3s",
                  }}
                />
              ))}
            </Box>
          )}

          {/* Puzzle rating */}
          {currentPuzzle && (
            <Chip
              label={`Rating: ${currentPuzzle.rating}`}
              size="small"
              sx={{ bgcolor: "grey.800", color: "grey.300" }}
            />
          )}
        </Box>

        <Button
          variant="outlined"
          size="small"
          onClick={() => {
            if (timerRef.current) clearInterval(timerRef.current);
            setPhase("finished");
          }}
          sx={{
            color: "grey.300",
            borderColor: "grey.700",
            "&:hover": { borderColor: "grey.500", bgcolor: "grey.800" },
            textTransform: "none",
          }}
        >
          End Rush
        </Button>
      </Paper>

      {/* Timer progress bar */}
      {modeConfig.timeSeconds !== Infinity && (
        <LinearProgress
          variant="determinate"
          value={(timeLeft / modeConfig.timeSeconds) * 100}
          sx={{
            mb: 2,
            height: 6,
            borderRadius: 3,
            bgcolor: "grey.800",
            "& .MuiLinearProgress-bar": {
              bgcolor: timeLeft <= 30 ? "error.main" : timeLeft <= 60 ? "warning.main" : "success.main",
              transition: "transform 1s linear",
            },
          }}
        />
      )}

      {/* Board + status */}
      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <Box>
          {/* Status bar */}
          <Box
            sx={{
              mb: 1,
              px: 1.5,
              py: 0.75,
              borderRadius: 1,
              bgcolor: status === "solved" ? "success.dark" : status === "wrong" ? "error.dark" : "grey.800",
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            {status === "playing" && (
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  bgcolor: game.turn() === "w" ? "#fff" : "#333",
                  border: "2px solid",
                  borderColor: "grey.500",
                  flexShrink: 0,
                }}
              />
            )}
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                color: status === "solved" || status === "wrong" ? "#fff" : "grey.300",
              }}
            >
              {status === "loading" ? "Loading..." :
               status === "solved" ? "Correct! Next puzzle..." :
               status === "wrong" ? "Wrong! Skipping..." :
               game.turn() === "w" ? "White to move" : "Black to move"}
            </Typography>
          </Box>

          {/* Chessboard */}
          <Box sx={{ width: boardSize }}>
            <Chessboard
              id="PuzzleRushBoard"
              position={game.fen()}
              onPieceDrop={onPieceDrop}
              onSquareClick={onSquareClick}
              boardOrientation={boardOrientation}
              boardWidth={boardSize}
              customBoardStyle={{
                borderRadius: "4px",
                boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
              }}
              customSquareStyles={customSquareStyles}
              customPieces={customPieces}
              isDraggablePiece={({ piece }) => {
                if (status !== "playing" || phase !== "playing") return false;
                const color = piece[0] === "w" ? "w" : "b";
                return color === game.turn();
              }}
              animationDuration={150}
            />
          </Box>
        </Box>
      </Box>

      {/* Finish Dialog */}
      <Dialog
        open={showFinishDialog}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, bgcolor: "grey.900" } }}
      >
        <DialogContent sx={{ textAlign: "center", py: 4 }}>
          {isNewHighScore && (
            <EmojiEventsIcon sx={{ fontSize: 48, color: "warning.main", mb: 1 }} />
          )}
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            {isNewHighScore ? "New High Score!" : "Rush Complete!"}
          </Typography>
          <Typography variant="h2" sx={{ fontWeight: 800, color: "success.light", mb: 2 }}>
            {score}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            puzzles solved
          </Typography>
          {modeConfig.timeSeconds === Infinity && (
            <Typography variant="body2" color="text.secondary">
              Time: {formatTimer(timeLeft)}
            </Typography>
          )}
          <Typography variant="body2" sx={{ mt: 2, color: "grey.500" }}>
            Your puzzle rating: <strong style={{ color: "#e0e0e0" }}>{globalStats.rating}</strong>
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center", pb: 3, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => {
              setPhase("setup");
              setShowFinishDialog(false);
            }}
            sx={{ textTransform: "none" }}
          >
            Back to Setup
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setShowFinishDialog(false);
              handleStart();
            }}
            startIcon={<BoltIcon />}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            Play Again
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
