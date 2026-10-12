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
import { useLostDragRecovery } from "@/hooks/useLostDragRecovery";
import { pieceSetAtom } from "@/components/board/states";
import { Piece, CustomPieces } from "react-chessboard/dist/chessboard/types";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PsychologyIcon from "@mui/icons-material/Psychology";
import type { DifficultyBand } from "@/types/puzzles";
import type { ChessPuzzle } from "@/lib/chessPuzzlesService";
import { puzzleSolvedStatusAtom } from "./states";
import { parseSolutionMoves as parseSolution } from "@/lib/puzzleSolution";
import { ACCENT, LINE, RADIUS, STATUS, SURFACE, TEXT } from "@/theme/tokens";

const PIECE_CODES: Piece[] = [
  "wP",
  "wB",
  "wN",
  "wR",
  "wQ",
  "wK",
  "bP",
  "bB",
  "bN",
  "bR",
  "bQ",
  "bK",
];

type FlashDuration = 3 | 5 | 8;

interface PatternTrainingProps {
  onBack: () => void;
}

// parseSolutionMoves moved to @/lib/puzzleSolution (imported as
// parseSolution above). The five puzzle surfaces previously each had
// their own copy with the same silent-truncation bug on long puzzles.

export default function PatternTraining({ onBack }: PatternTrainingProps) {
  // A drag the browser never finishes leaves the lifted square empty and a
  // phantom piece frozen over the board, until this puts it back.
  useLostDragRecovery();
  const screenSize = useScreenSize();
  const pieceSet = useAtomValue(pieceSetAtom);

  const [phase, setPhase] = useState<"setup" | "flash" | "solve" | "result">(
    "setup"
  );
  const [flashDuration, setFlashDuration] = useState<FlashDuration>(5);
  const [difficulty, setDifficulty] = useState<DifficultyBand | "all">("all");

  const [puzzles, setPuzzles] = useState<ChessPuzzle[]>([]);
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [game, setGame] = useState<Chess>(new Chess());
  const [moveIndex, setMoveIndex] = useState(0);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">(
    "white"
  );
  const [showPieces, setShowPieces] = useState(true);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [flashTimeLeft, setFlashTimeLeft] = useState(0);
  const [lastMoveSquares, setLastMoveSquares] = useState<{
    from: Square;
    to: Square;
  } | null>(null);
  const [wrongSquare, setWrongSquare] = useState<Square | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<Square[]>([]);
  const [showFinishDialog, setShowFinishDialog] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const puzzleIdRef = useRef<string | null>(null);

  const currentPuzzle = puzzles[puzzleIndex] || null;

  const solutionParseResult = useMemo(() => {
    if (!currentPuzzle) return { parsed: [], error: null as string | null };
    return parseSolution(
      currentPuzzle.fen,
      currentPuzzle.solution || currentPuzzle.moves || []
    );
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
        solutionParseResult.error
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
      const solvedIds = Object.keys(solvedStatus).filter(
        (id) => solvedStatus[id]
      );
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
        puzzle.solution || puzzle.moves || []
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
      styles[lastMoveSquares.from] = {
        backgroundColor: "rgba(255, 170, 0, 0.4)",
      };
      styles[lastMoveSquares.to] = {
        backgroundColor: "rgba(255, 170, 0, 0.5)",
      };
    }
    if (selectedSquare) {
      styles[selectedSquare] = { backgroundColor: "rgba(20, 85, 180, 0.5)" };
    }
    for (const sq of legalMoveSquares) {
      const existing = styles[sq] || {};
      styles[sq] = {
        ...existing,
        background:
          `${existing.backgroundColor || ""} radial-gradient(circle, rgba(255,255,255,0.14) 25%, transparent 25%)`.trim(),
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
          borderRadius: `${RADIUS.card}px`,
          background: SURFACE.raised,
          border: `1px solid ${LINE.hairline}`,
          overflow: "hidden",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <PsychologyIcon sx={{ color: ACCENT.main, fontSize: 28 }} />
          <Typography variant="h5" sx={{ color: TEXT.primary }}>
            Pattern training
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          A position will flash on screen for a few seconds, then disappear.
          Find the best move from memory. It trains your pattern recognition and
          board visualization.
        </Typography>

        <FormControl size="small" sx={{ mb: 2, minWidth: 200 }}>
          <InputLabel>Flash duration</InputLabel>
          <Select
            value={flashDuration}
            label="Flash duration"
            onChange={(e) =>
              setFlashDuration(e.target.value as unknown as FlashDuration)
            }
          >
            <MenuItem value={3}>3 seconds (hard)</MenuItem>
            <MenuItem value={5}>5 seconds (normal)</MenuItem>
            <MenuItem value={8}>8 seconds (easy)</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ mb: 3, minWidth: 200, ml: { sm: 2 } }}>
          <InputLabel>Difficulty</InputLabel>
          <Select
            value={difficulty}
            label="Difficulty"
            onChange={(e) =>
              setDifficulty(e.target.value as DifficultyBand | "all")
            }
          >
            <MenuItem value="all">All levels</MenuItem>
            <MenuItem value="beginner">Beginner</MenuItem>
            <MenuItem value="intermediate">Intermediate</MenuItem>
            <MenuItem value="advanced">Advanced</MenuItem>
            <MenuItem value="expert">Expert</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ display: "flex", gap: 2 }}>
          <Button variant="outlined" onClick={onBack}>
            Back
          </Button>
          <Button
            variant="contained"
            onClick={handleStart}
            startIcon={<PsychologyIcon />}
          >
            Start training
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
          px: 2,
          py: 1.5,
          mb: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
          borderRadius: `${RADIUS.card}px`,
          background: SURFACE.raised,
          border: `1px solid ${LINE.hairline}`,
          overflow: "hidden",
          color: TEXT.primary,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <PsychologyIcon sx={{ color: ACCENT.main }} />
          <Typography variant="subtitle1">Pattern training</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography
            variant="body2"
            sx={{ color: TEXT.secondary, fontVariantNumeric: "tabular-nums" }}
          >
            Score: <strong style={{ color: STATUS.success }}>{score}</strong>/
            {total}
          </Typography>
          {currentPuzzle && (
            <Chip label={`Rating: ${currentPuzzle.rating}`} size="small" />
          )}
        </Box>
      </Paper>

      {/* Flash timer */}
      {phase === "flash" && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <VisibilityIcon sx={{ color: STATUS.warning, fontSize: 18 }} />
            <Typography
              variant="body2"
              sx={{
                color: TEXT.primary,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              Memorize the position: {flashTimeLeft}s left
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={(flashTimeLeft / flashDuration) * 100}
            sx={{
              height: 6,
              borderRadius: 3,
              "& .MuiLinearProgress-bar": { bgcolor: STATUS.warning },
            }}
          />
        </Box>
      )}

      {/* Status */}
      {phase === "solve" && (
        <Box
          sx={{
            mb: 1,
            px: 1.5,
            py: 0.75,
            borderRadius: `${RADIUS.control}px`,
            border: `1px solid ${LINE.hairline}`,
            background: STATUS.infoTint,
          }}
        >
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, color: TEXT.primary }}
          >
            Pieces hidden. Find the best move from memory.
          </Typography>
        </Box>
      )}

      {phase === "result" && (
        <Box
          sx={{
            mb: 1,
            px: 1.5,
            py: 0.75,
            borderRadius: `${RADIUS.control}px`,
            border: `1px solid ${LINE.hairline}`,
            background: wrongSquare ? STATUS.errorTint : STATUS.successTint,
          }}
        >
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, color: TEXT.primary }}
          >
            {wrongSquare
              ? "Wrong. The position is shown again."
              : "Correct. Good pattern recognition."}
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
            customBoardStyle={{ borderRadius: "12px" }}
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
      <Dialog open={showFinishDialog} maxWidth="xs" fullWidth>
        <DialogContent sx={{ textAlign: "center", py: 4 }}>
          <PsychologyIcon sx={{ fontSize: 40, color: ACCENT.main, mb: 1 }} />
          <Typography variant="h4" sx={{ mb: 1, color: TEXT.primary }}>
            Session complete
          </Typography>
          <Typography
            variant="h2"
            sx={{
              color: STATUS.success,
              mb: 0.5,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {total > 0 ? Math.round((score / total) * 100) : 0}%
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {score}/{total} correct
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center", pb: 3, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => {
              setShowFinishDialog(false);
              setPhase("setup");
            }}
          >
            Back to setup
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setShowFinishDialog(false);
              handleStart();
            }}
            startIcon={<PsychologyIcon />}
          >
            Play again
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
