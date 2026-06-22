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
import { useScreenSize } from "@/hooks/useScreenSize";
import { pieceSetAtom } from "@/components/board/states";
import { Piece, CustomPieces } from "react-chessboard/dist/chessboard/types";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PsychologyIcon from "@mui/icons-material/Psychology";
import type { DifficultyBand } from "@/types/puzzles";
import type { ChessPuzzle } from "@/lib/chessPuzzlesService";
import { puzzleSolvedStatusAtom } from "./states";
import { parseSolutionMoves as parseSolution } from "@/lib/puzzleSolution";

const PIECE_CODES: Piece[] = [
  "wP", "wB", "wN", "wR", "wQ", "wK",
  "bP", "bB", "bN", "bR", "bQ", "bK",
];

type FlashDuration = 3 | 5 | 8;

interface PatternTrainingProps {
  onBack: () => void;
}

// parseSolutionMoves moved to @/lib/puzzleSolution (imported as
// parseSolution above). The five puzzle surfaces previously each had
// their own copy with the same silent-truncation bug on long puzzles.

export default function PatternTraining({ onBack }: PatternTrainingProps) {
  const screenSize = useScreenSize();
  const pieceSet = useAtomValue(pieceSetAtom);

  const [phase, setPhase] = useState<"setup" | "flash" | "solve" | "result">("setup");
  const [flashDuration, setFlashDuration] = useState<FlashDuration>(5);
  const [difficulty, setDifficulty] = useState<DifficultyBand | "all">("all");

  const [puzzles, setPuzzles] = useState<ChessPuzzle[]>([]);
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [game, setGame] = useState<Chess>(new Chess());
  const [moveIndex, setMoveIndex] = useState(0);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [showPieces, setShowPieces] = useState(true);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [flashTimeLeft, setFlashTimeLeft] = useState(0);
  const [lastMoveSquares, setLastMoveSquares] = useState<{ from: Square; to: Square } | null>(null);
  const [wrongSquare, setWrongSquare] = useState<Square | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<Square[]>([]);
  const [showFinishDialog, setShowFinishDialog] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const puzzleIdRef = useRef<string | null>(null);

  const currentPuzzle = puzzles[puzzleIndex] || null;

  const solutionParseResult = useMemo(() => {
    if (!currentPuzzle) return { parsed: [], error: null as string | null };
    return parseSolution(currentPuzzle.fen, currentPuzzle.solution || currentPuzzle.moves || []);
    // Stable-id dep — see PR #109.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPuzzle?.id]);
  const solutionMoves = solutionParseResult.parsed;
  // PatternTraining is auto-advance like PuzzleRush — a malformed
  // puzzle just gets skipped. Log for diagnostics, no visible UI.
  useEffect(() => {
    if (solutionParseResult.error) {
      console.warn(
        "[PatternTraining] puzzle parse error, will auto-skip:",
        solutionParseResult.error,
      );
    }
  }, [solutionParseResult.error]);

  const boardSize = useMemo(() => {
    const w = screenSize.width;
    const h = screenSize.height;
    if (!w || !h || w <= 0 || h <= 0) return 400;
    if (typeof window !== "undefined" && window.innerWidth < 1200) {
      return Math.max(Math.min(w - 32, h - 280), 280);
    }
    return Math.max(Math.min(w - 520, h * 0.72, 560), 320);
  }, [screenSize]);

  const solvedStatus = useAtomValue(puzzleSolvedStatusAtom);

  const fetchPuzzles = useCallback(async () => {
    try {
      const solvedIds = Object.keys(solvedStatus).filter((id) => solvedStatus[id]);
      const body: Record<string, unknown> = {
        command: "random",
        limit: 30,
        excludeIds: solvedIds.length > 0 ? solvedIds : undefined,
      };
      if (difficulty !== "all") body.difficulty = difficulty;
      const res = await fetch("/api/chess-puzzles-dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
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
      console.error("Error fetching pattern puzzles:", err);
    }
    return [];
  }, [difficulty, solvedStatus]);

  const loadPuzzle = useCallback(
    (puzzle: ChessPuzzle) => {
      puzzleIdRef.current = puzzle.id;
      const newGame = new Chess(puzzle.fen);
      const opponentColor = newGame.turn();
      setBoardOrientation(opponentColor === "w" ? "black" : "white");

      // Play opponent's first move using the robust shared parser so
      // the init move benefits from the trim / SAN fallback /
      // uppercase-promotion fixes. The raw-slice version below was
      // diverged from the React-state path (parseSolution above) and
      // would silently fail on edge-case formats.
      const initParse = parseSolution(
        puzzle.fen,
        puzzle.solution || puzzle.moves || [],
      );
      const firstMove = initParse.parsed[0];
      if (firstMove) {
        try {
          newGame.move({
            from: firstMove.from,
            to: firstMove.to,
            promotion: firstMove.promotion,
          });
        } catch (err) {
          console.warn("[PatternTraining] init move failed:", err);
        }
      } else if (initParse.error) {
        console.warn("[PatternTraining] init parse error:", initParse.error);
      }

      setGame(newGame);
      setMoveIndex(1);
      setLastMoveSquares(null);
      setWrongSquare(null);
      setSelectedSquare(null);
      setLegalMoveSquares([]);

      // Flash phase: show the position briefly
      setShowPieces(true);
      setPhase("flash");
      setFlashTimeLeft(flashDuration);

      // Start countdown
      if (timerRef.current) clearInterval(timerRef.current);
      let remaining = flashDuration;
      timerRef.current = setInterval(() => {
        remaining--;
        setFlashTimeLeft(remaining);
        if (remaining <= 0) {
          clearInterval(timerRef.current!);
          setShowPieces(false);
          setPhase("solve");
        }
      }, 1000);
    },
    [flashDuration]
  );

  const handleStart = useCallback(async () => {
    const fetched = await fetchPuzzles();
    if (fetched.length === 0) return;
    setPuzzles(fetched);
    setPuzzleIndex(0);
    setScore(0);
    setTotal(0);
    setShowFinishDialog(false);
    loadPuzzle(fetched[0]);
  }, [fetchPuzzles, loadPuzzle]);

  const advanceToNext = useCallback(() => {
    const nextIdx = puzzleIndex + 1;
    if (nextIdx < puzzles.length) {
      setPuzzleIndex(nextIdx);
      loadPuzzle(puzzles[nextIdx]);
    } else {
      setPhase("setup");
      setShowFinishDialog(true);
    }
  }, [puzzleIndex, puzzles, loadPuzzle]);

  // Handle piece drop during solve phase
  const onPieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string): boolean => {
      if (phase !== "solve") return false;
      if (moveIndex >= solutionMoves.length) return false;

      const expected = solutionMoves[moveIndex];
      const from = sourceSquare as Square;
      const to = targetSquare as Square;

      setTotal((p) => p + 1);

      if (from === expected.from && to === expected.to) {
        setScore((p) => p + 1);
        setShowPieces(true);
        setPhase("result");

        // Show the correct move briefly, then advance.
        try {
          const g = new Chess(game.fen());
          g.move({ from, to, promotion: expected.promotion });
          setGame(g);
          setLastMoveSquares({ from, to });
        } catch (err) {
          console.warn("[PatternTraining] correct-move apply failed:", err);
        }

        setTimeout(() => advanceToNext(), 1200);
        return true;
      } else {
        // Wrong
        setWrongSquare(to);
        setShowPieces(true);
        setPhase("result");

        setTimeout(() => {
          setWrongSquare(null);
          advanceToNext();
        }, 1500);
        return false;
      }
    },
    [phase, moveIndex, solutionMoves, game, advanceToNext]
  );

  // Click-to-move
  const onSquareClick = useCallback(
    (square: Square) => {
      if (phase !== "solve") return;
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
    [game, phase, selectedSquare, onPieceDrop]
  );

  // Custom pieces (hidden during solve phase)
  const customPieces = useMemo(
    () =>
      PIECE_CODES.reduce<CustomPieces>((acc, piece) => {
        acc[piece] = ({ squareWidth }: { squareWidth: number }) => (
          <Box
            width={squareWidth}
            height={squareWidth}
            sx={
              showPieces
                ? {
                    backgroundImage: `url(/piece/${pieceSet}/${piece}.svg)`,
                    backgroundSize: "contain",
                  }
                : { opacity: 0 }
            }
          />
        );
        return acc;
      }, {}),
    [pieceSet, showPieces]
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
        background: `${existing.backgroundColor || ""} radial-gradient(circle, rgba(255,255,255,0.14) 25%, transparent 25%)`.trim(),
      };
    }
    if (wrongSquare) {
      styles[wrongSquare] = { backgroundColor: "rgba(220, 50, 50, 0.6)" };
    }
    return styles;
  }, [lastMoveSquares, selectedSquare, legalMoveSquares, wrongSquare]);

  // ---- SETUP SCREEN ----
  if (phase === "setup" && !showFinishDialog) {
    return (
      <Paper
        sx={{
          p: 4,
          maxWidth: 500,
          mx: "auto",
          borderRadius: "1.5rem",
          background: "rgba(20,22,28,0.55)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <PsychologyIcon sx={{ color: "#FB923C", fontSize: 28 }} />
          <Typography variant="h5" sx={{ fontWeight: 700, color: "rgba(255,255,255,0.94)" }}>Pattern Training</Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          A position will flash on screen for a few seconds, then disappear.
          Find the best move from memory! Trains your pattern recognition and board visualization.
        </Typography>

        <FormControl
          size="small"
          sx={{
            mb: 2,
            minWidth: 200,
            "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.55)" },
            "& .MuiInputLabel-root.Mui-focused": { color: "#FB923C" },
            "& .MuiOutlinedInput-root": {
              backgroundColor: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.7)",
              "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.1)" },
              "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.2)" },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#F97316" },
            },
            "& .MuiSelect-icon": { color: "rgba(255,255,255,0.5)" },
          }}
        >
          <InputLabel>Flash Duration</InputLabel>
          <Select
            value={flashDuration}
            label="Flash Duration"
            onChange={(e) => setFlashDuration(e.target.value as unknown as FlashDuration)}
            MenuProps={{
              PaperProps: {
                sx: {
                  borderRadius: "12px",
                  background: "rgba(20,22,28,0.92)",
                  backdropFilter: "blur(16px) saturate(160%)",
                  WebkitBackdropFilter: "blur(16px) saturate(160%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.85)",
                },
              },
            }}
          >
            <MenuItem value={3}>3 seconds (Hard)</MenuItem>
            <MenuItem value={5}>5 seconds (Normal)</MenuItem>
            <MenuItem value={8}>8 seconds (Easy)</MenuItem>
          </Select>
        </FormControl>

        <FormControl
          size="small"
          sx={{
            mb: 3,
            minWidth: 200,
            ml: { sm: 2 },
            "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.55)" },
            "& .MuiInputLabel-root.Mui-focused": { color: "#FB923C" },
            "& .MuiOutlinedInput-root": {
              backgroundColor: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.7)",
              "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.1)" },
              "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.2)" },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#F97316" },
            },
            "& .MuiSelect-icon": { color: "rgba(255,255,255,0.5)" },
          }}
        >
          <InputLabel>Difficulty</InputLabel>
          <Select
            value={difficulty}
            label="Difficulty"
            onChange={(e) => setDifficulty(e.target.value as DifficultyBand | "all")}
            MenuProps={{
              PaperProps: {
                sx: {
                  borderRadius: "12px",
                  background: "rgba(20,22,28,0.92)",
                  backdropFilter: "blur(16px) saturate(160%)",
                  WebkitBackdropFilter: "blur(16px) saturate(160%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.85)",
                },
              },
            }}
          >
            <MenuItem value="all">All Levels</MenuItem>
            <MenuItem value="beginner">Beginner</MenuItem>
            <MenuItem value="intermediate">Intermediate</MenuItem>
            <MenuItem value="advanced">Advanced</MenuItem>
            <MenuItem value="expert">Expert</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ display: "flex", gap: 2 }}>
          <Button
            variant="outlined"
            onClick={onBack}
            sx={{
              textTransform: "none",
              borderRadius: "999px",
              color: "rgba(255,255,255,0.85)",
              borderColor: "rgba(255,255,255,0.18)",
              backgroundColor: "rgba(255,255,255,0.03)",
              "&:hover": {
                borderColor: "rgba(255,255,255,0.3)",
                backgroundColor: "rgba(255,255,255,0.06)",
              },
            }}
          >
            Back
          </Button>
          <Button
            variant="contained"
            onClick={handleStart}
            startIcon={<PsychologyIcon />}
            sx={{
              px: 4,
              fontWeight: 700,
              textTransform: "none",
              borderRadius: "999px",
              bgcolor: "#F97316",
              color: "#0A0A0A",
              boxShadow: "0 6px 18px rgba(249,115,22,0.32)",
              "&:hover": { bgcolor: "#FB923C" },
            }}
          >
            Start Training
          </Button>
        </Box>
      </Paper>
    );
  }

  // ---- PLAYING SCREEN ----
  return (
    <Box sx={{ maxWidth: 800, mx: "auto" }}>
      {/* Top bar */}
      <Paper
        sx={{
          px: 2, py: 1.5, mb: 2,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 1,
          borderRadius: "1.5rem",
          background: "rgba(20,22,28,0.55)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
          overflow: "hidden",
          color: "rgba(255,255,255,0.94)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <PsychologyIcon sx={{ color: "#FB923C" }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Pattern Training</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.62)" }}>
            Score: <strong style={{ color: "#66bb6a" }}>{score}</strong>/{total}
          </Typography>
          {currentPuzzle && (
            <Chip
              label={`Rating: ${currentPuzzle.rating}`}
              size="small"
              sx={{
                bgcolor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.85)",
              }}
            />
          )}
        </Box>
      </Paper>

      {/* Flash timer */}
      {phase === "flash" && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <VisibilityIcon sx={{ color: "warning.main", fontSize: 18 }} />
            <Typography variant="body2" sx={{ color: "warning.main", fontWeight: 600 }}>
              Memorize! {flashTimeLeft}s remaining
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={(flashTimeLeft / flashDuration) * 100}
            sx={{
              height: 6, borderRadius: 3, bgcolor: "rgba(255,255,255,0.08)",
              "& .MuiLinearProgress-bar": { bgcolor: "warning.main" },
            }}
          />
        </Box>
      )}

      {/* Status */}
      {phase === "solve" && (
        <Box sx={{ mb: 1, px: 1.5, py: 0.75, borderRadius: "12px", bgcolor: "info.dark" }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: "#fff" }}>
            Pieces hidden — find the best move from memory!
          </Typography>
        </Box>
      )}

      {phase === "result" && (
        <Box sx={{
          mb: 1, px: 1.5, py: 0.75, borderRadius: "12px",
          bgcolor: wrongSquare ? "error.dark" : "success.dark",
        }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: "#fff" }}>
            {wrongSquare ? "Wrong! The position is shown again." : "Correct! Great pattern recognition!"}
          </Typography>
        </Box>
      )}

      {/* Board */}
      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <Box sx={{ width: boardSize }}>
          <Chessboard
            id="PatternTrainingBoard"
            position={game.fen()}
            onPieceDrop={onPieceDrop}
            onSquareClick={onSquareClick}
            boardOrientation={boardOrientation}
            boardWidth={boardSize}
            customBoardStyle={{ borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.35)" }}
            customSquareStyles={customSquareStyles}
            customPieces={customPieces}
            isDraggablePiece={({ piece }) => {
              if (phase !== "solve") return false;
              const color = piece[0] === "w" ? "w" : "b";
              return color === game.turn();
            }}
            animationDuration={150}
          />
        </Box>
      </Box>

      {/* Finish Dialog */}
      <Dialog
        open={showFinishDialog}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "1.5rem",
            background: "rgba(20,22,28,0.92)",
            backdropFilter: "blur(16px) saturate(160%)",
            WebkitBackdropFilter: "blur(16px) saturate(160%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow:
              "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
            backgroundImage: "none",
          },
        }}
        slotProps={{
          backdrop: {
            sx: {
              backgroundColor: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(2px)",
              WebkitBackdropFilter: "blur(2px)",
            },
          },
        }}
      >
        <DialogContent sx={{ textAlign: "center", py: 4 }}>
          <PsychologyIcon sx={{ fontSize: 48, color: "#FB923C", mb: 1 }} />
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: "rgba(255,255,255,0.94)" }}>Session Complete!</Typography>
          <Typography variant="h2" sx={{ fontWeight: 800, color: "success.light", mb: 0.5 }}>
            {total > 0 ? Math.round((score / total) * 100) : 0}%
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {score}/{total} correct
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center", pb: 3, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => { setShowFinishDialog(false); setPhase("setup"); }}
            sx={{
              textTransform: "none",
              borderRadius: "999px",
              color: "rgba(255,255,255,0.85)",
              borderColor: "rgba(255,255,255,0.18)",
              backgroundColor: "rgba(255,255,255,0.03)",
              "&:hover": {
                borderColor: "rgba(255,255,255,0.3)",
                backgroundColor: "rgba(255,255,255,0.06)",
              },
            }}
          >
            Back to Setup
          </Button>
          <Button
            variant="contained"
            onClick={() => { setShowFinishDialog(false); handleStart(); }}
            startIcon={<PsychologyIcon />}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderRadius: "999px",
              bgcolor: "#F97316",
              color: "#0A0A0A",
              boxShadow: "0 6px 18px rgba(249,115,22,0.32)",
              "&:hover": { bgcolor: "#FB923C" },
            }}
          >
            Play Again
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
