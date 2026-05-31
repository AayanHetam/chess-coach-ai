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
import { Square } from "chess.js";
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
import { usePuzzleBoardState } from "@/hooks/usePuzzleBoardState";
import { FlashOverlay } from "@/components/puzzle/FlashOverlay";

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

// Delay before auto-advancing after solved/wrong, so the user gets a
// brief moment of feedback (green pulse on solved, red on wrong) before
// the next puzzle loads.
const ADVANCE_DELAY_AFTER_SOLVED_MS = 500;
const ADVANCE_DELAY_AFTER_WRONG_MS = 800;
// Delay before showing the finish dialog after life-loss in survival.
const FINISH_DELAY_AFTER_LIVES_OUT_MS = 600;

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

  // Game state (the puzzle queue + index; per-puzzle board state comes
  // from usePuzzleBoardState).
  const [puzzles, setPuzzles] = useState<ChessPuzzle[]>([]);
  const [puzzleIndex, setPuzzleIndex] = useState(0);

  // Click-to-move local state
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
  // Dedup ref so multiple rapid wrong/solved fires don't queue multiple
  // advance timeouts for the same puzzle. Cleared on puzzleIndex change.
  const advanceScheduledRef = useRef(false);

  const modeConfig = RUSH_MODES.find((m) => m.value === mode)!;
  const currentPuzzle = puzzles[puzzleIndex] || null;
  const solvedStatus = useAtomValue(puzzleSolvedStatusAtom);

  const boardSize = useMemo(() => {
    const width = screenSize.width;
    const height = screenSize.height;
    if (!width || !height || width <= 0 || height <= 0) return 400;
    if (typeof window !== "undefined" && window.innerWidth < 1200) {
      return Math.max(Math.min(width - 32, height - 280), 280);
    }
    return Math.max(Math.min(width - 520, height * 0.72, 560), 320);
  }, [screenSize]);

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

  // Advance to next puzzle (or fetch more if we've exhausted the queue).
  const advanceToNext = useCallback(() => {
    advanceScheduledRef.current = false;
    setSelectedSquare(null);
    setLegalMoveSquares([]);
    const nextIdx = puzzleIndex + 1;
    if (nextIdx < puzzles.length) {
      setPuzzleIndex(nextIdx);
      puzzleStartTimeRef.current = Date.now();
    } else {
      fetchPuzzles().then((fetched) => {
        if (fetched.length > 0) {
          setPuzzles(fetched);
          setPuzzleIndex(0);
          puzzleStartTimeRef.current = Date.now();
        } else {
          setPhase("finished");
        }
      });
    }
  }, [puzzleIndex, puzzles, fetchPuzzles]);

  // Reset puzzle start-time + advance dedup on puzzle change.
  useEffect(() => {
    puzzleStartTimeRef.current = Date.now();
    advanceScheduledRef.current = false;
  }, [currentPuzzle?.id]);

  const recordSolve = useCallback(
    (puzzleId: string, solved: boolean) => {
      if (!currentPuzzle || currentPuzzle.id !== puzzleId) return;
      const timeMs = Date.now() - puzzleStartTimeRef.current;
      setGlobalStats((prev) =>
        updatePuzzleStats(prev, {
          puzzleId: currentPuzzle.id,
          puzzleRating: currentPuzzle.rating,
          solved,
          timeMs,
          theme: currentPuzzle.themes?.[0] || "unknown",
          timestamp: Date.now(),
        }),
      );
    },
    [currentPuzzle, setGlobalStats],
  );

  const handleSolved = useCallback(
    (puzzleId: string) => {
      setScore((prev) => prev + 1);
      recordSolve(puzzleId, true);
      if (!advanceScheduledRef.current) {
        advanceScheduledRef.current = true;
        setTimeout(advanceToNext, ADVANCE_DELAY_AFTER_SOLVED_MS);
      }
    },
    [recordSolve, advanceToNext],
  );

  const handleWrong = useCallback(
    (puzzleId: string, _attemptedSan: string | null) => {
      void _attemptedSan;
      recordSolve(puzzleId, false);
      if (mode === "survival") {
        setLives((prev) => {
          const newLives = prev - 1;
          if (newLives <= 0) {
            setTimeout(() => setPhase("finished"), FINISH_DELAY_AFTER_LIVES_OUT_MS);
          }
          return newLives;
        });
      }
      if (!advanceScheduledRef.current) {
        advanceScheduledRef.current = true;
        setTimeout(() => {
          if (phase === "playing") advanceToNext();
        }, ADVANCE_DELAY_AFTER_WRONG_MS);
      }
    },
    [mode, recordSolve, advanceToNext, phase],
  );

  // Pass the puzzle to the hook only while we're in the playing phase.
  // Setting `puzzle: null` during finish/setup tears down board state
  // cleanly without firing extra effects.
  const board = usePuzzleBoardState({
    puzzle:
      phase === "playing" && currentPuzzle
        ? {
            id: currentPuzzle.id,
            fen: currentPuzzle.fen,
            solution: currentPuzzle.solution,
            moves: currentPuzzle.moves,
          }
        : null,
    onSolved: handleSolved,
    onWrong: handleWrong,
  });

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
    puzzleStartTimeRef.current = Date.now();
  }, [fetchPuzzles, modeConfig]);

  // Countdown timer (timed modes)
  useEffect(() => {
    if (phase !== "playing") return;
    if (modeConfig.timeSeconds === Infinity) return; // survival has no timer
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
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

  // Count-up timer (survival)
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

  // High-score check on finish
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

  // Click-to-move handler — routes through the hook's onPieceDrop. Gate
  // on phase too so clicks during the finish dialog do nothing.
  const onSquareClick = useCallback(
    (square: Square) => {
      if (phase !== "playing") return;
      if (board.status !== "playing" && board.status !== "wrong") return;
      if (!selectedSquare) {
        const piece = board.game.get(square);
        if (piece && piece.color === board.game.turn()) {
          setSelectedSquare(square);
          const moves = board.game.moves({ square, verbose: true });
          setLegalMoveSquares(moves.map((m) => m.to as Square));
        }
        return;
      }
      if (selectedSquare === square) {
        setSelectedSquare(null);
        setLegalMoveSquares([]);
        return;
      }
      const piece = board.game.get(square);
      if (piece && piece.color === board.game.turn()) {
        setSelectedSquare(square);
        const moves = board.game.moves({ square, verbose: true });
        setLegalMoveSquares(moves.map((m) => m.to as Square));
        return;
      }
      board.onPieceDrop(selectedSquare, square, "");
      setSelectedSquare(null);
      setLegalMoveSquares([]);
    },
    [phase, board, selectedSquare],
  );

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
    [pieceSet],
  );

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {
      ...board.customSquareStyles,
    };
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
    return styles;
  }, [board.customSquareStyles, selectedSquare, legalMoveSquares]);

  // Format seconds to mm:ss
  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

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
              bgcolor: board.puzzleError
                ? "warning.dark"
                : board.status === "solved"
                  ? "success.dark"
                  : board.status === "wrong"
                    ? "error.dark"
                    : "grey.800",
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            {board.status === "playing" && !board.puzzleError && (
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  bgcolor: board.game.turn() === "w" ? "#fff" : "#333",
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
                color:
                  board.status === "solved" ||
                  board.status === "wrong" ||
                  board.puzzleError
                    ? "#fff"
                    : "grey.300",
              }}
            >
              {board.puzzleError
                ? "Bad puzzle data — skipping…"
                : board.status === "loading"
                  ? "Loading..."
                  : board.status === "solved"
                    ? "Correct! Next puzzle..."
                    : board.status === "wrong"
                      ? "Wrong! Skipping..."
                      : board.game.turn() === "w"
                        ? "White to move"
                        : "Black to move"}
            </Typography>
          </Box>

          {/* Chessboard */}
          <Box sx={{ position: "relative", width: boardSize }}>
            <FlashOverlay
              key={`flash-${board.flashKey}`}
              flash={board.flash}
            />
            <Chessboard
              id="PuzzleRushBoard"
              position={board.game.fen()}
              onPieceDrop={board.onPieceDrop}
              onSquareClick={onSquareClick}
              boardOrientation={board.boardOrientation}
              boardWidth={boardSize}
              customBoardStyle={{
                borderRadius: "4px",
                boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
              }}
              customSquareStyles={customSquareStyles}
              customPieces={customPieces}
              isDraggablePiece={({ piece }) => {
                // Phase gate added on top of the hook's playing/wrong
                // allowance so drags during the finish dialog do nothing.
                if (phase !== "playing") return false;
                return board.isDraggablePiece({ piece });
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
