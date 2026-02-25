import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  CircularProgress,
} from "@mui/material";
import { Chessboard } from "react-chessboard";
import { Chess, Square } from "chess.js";
import { useRouter } from "next/router";
import { useAtomValue, useSetAtom } from "jotai";
import { pieceSetAtom } from "@/components/board/states";
import { Piece, CustomPieces } from "react-chessboard/dist/chessboard/types";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import ExtensionIcon from "@mui/icons-material/Extension";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import {
  puzzleStatsAtom,
  updatePuzzleStats,
} from "@/lib/puzzleRating";

const PIECE_CODES: Piece[] = [
  "wP", "wB", "wN", "wR", "wQ", "wK",
  "bP", "bB", "bN", "bR", "bQ", "bK",
];

interface DailyPuzzleData {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  solution: string[];
}

function parseSolutionMoves(
  fen: string,
  moves: string[]
): { from: Square; to: Square; promotion?: string }[] {
  const parsed: { from: Square; to: Square; promotion?: string }[] = [];
  const g = new Chess(fen);
  for (const m of moves) {
    const from = m.slice(0, 2) as Square;
    const to = m.slice(2, 4) as Square;
    const promotion = m.length > 4 ? m[4] : undefined;
    try {
      const result = g.move({ from, to, promotion });
      if (result) parsed.push({ from, to, promotion });
      else break;
    } catch {
      break;
    }
  }
  return parsed;
}

export default function DailyPuzzle() {
  const router = useRouter();
  const pieceSet = useAtomValue(pieceSetAtom);
  const setGlobalStats = useSetAtom(puzzleStatsAtom);

  const [puzzle, setPuzzle] = useState<DailyPuzzleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Chess>(new Chess());
  const [moveIndex, setMoveIndex] = useState(0);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [status, setStatus] = useState<"loading" | "playing" | "wrong" | "solved">("loading");
  const [lastMoveSquares, setLastMoveSquares] = useState<{ from: Square; to: Square } | null>(null);
  const [wrongSquare, setWrongSquare] = useState<Square | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<Square[]>([]);
  const [dailyDate, setDailyDate] = useState<string>("");

  const puzzleIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Check localStorage to see if already solved today
  const [alreadySolvedToday, setAlreadySolvedToday] = useState(false);

  const solutionMoves = useMemo(() => {
    if (!puzzle) return [];
    return parseSolutionMoves(puzzle.fen, puzzle.solution || puzzle.moves);
  }, [puzzle]);

  // Fetch daily puzzle
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const solvedKey = `dailyPuzzleSolved_${today}`;
    if (typeof window !== "undefined" && localStorage.getItem(solvedKey) === "true") {
      setAlreadySolvedToday(true);
    }

    (async () => {
      try {
        const res = await fetch("/api/chess-puzzles-dataset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "daily" }),
        });
        const data = await res.json();
        if (data.success && data.puzzle) {
          const p: DailyPuzzleData = {
            id: data.puzzle.id || "daily",
            fen: data.puzzle.fen,
            moves: data.puzzle.moves || [],
            rating: data.puzzle.rating || 1500,
            themes: data.puzzle.themes || [],
            solution: data.puzzle.solution || data.puzzle.moves || [],
          };
          setPuzzle(p);
          setDailyDate(data.date || today);

          // Initialize board
          puzzleIdRef.current = p.id;
          const newGame = new Chess(p.fen);
          const opponentColor = newGame.turn();
          setBoardOrientation(opponentColor === "w" ? "black" : "white");
          setGame(newGame);
          setMoveIndex(0);
          setStatus("loading");
          startTimeRef.current = Date.now();

          // Auto-play opponent's first move
          setTimeout(() => {
            if (puzzleIdRef.current !== p.id) return;
            const moves = p.solution || p.moves;
            if (moves.length === 0) return;
            const fm = moves[0];
            const from = fm.slice(0, 2) as Square;
            const to = fm.slice(2, 4) as Square;
            const promo = fm.length > 4 ? fm[4] : undefined;
            try {
              const g = new Chess(newGame.fen());
              g.move({ from, to, promotion: promo });
              setGame(g);
              setMoveIndex(1);
              setLastMoveSquares({ from, to });
              setStatus("playing");
            } catch {
              setStatus("playing");
            }
          }, 600);
        }
      } catch (err) {
        console.error("Failed to fetch daily puzzle:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Play opponent move
  const playOpponentMove = useCallback(
    (currentGame: Chess, nextMoveIdx: number) => {
      if (nextMoveIdx >= solutionMoves.length) return;
      const pid = puzzleIdRef.current;
      setTimeout(() => {
        if (puzzleIdRef.current !== pid) return;
        const move = solutionMoves[nextMoveIdx];
        try {
          const g = new Chess(currentGame.fen());
          g.move({ from: move.from, to: move.to, promotion: move.promotion });
          setGame(g);
          setMoveIndex(nextMoveIdx + 1);
          setLastMoveSquares({ from: move.from, to: move.to });
          if (nextMoveIdx + 1 >= solutionMoves.length) {
            setStatus("solved");
            // Mark today as solved
            const today = new Date().toISOString().slice(0, 10);
            localStorage.setItem(`dailyPuzzleSolved_${today}`, "true");
            setAlreadySolvedToday(true);
            // Record to stats
            if (puzzle) {
              setGlobalStats((prev) =>
                updatePuzzleStats(prev, {
                  puzzleId: puzzle.id,
                  puzzleRating: puzzle.rating,
                  solved: true,
                  timeMs: Date.now() - startTimeRef.current,
                  theme: puzzle.themes?.[0] || "daily",
                  timestamp: Date.now(),
                })
              );
            }
          }
        } catch {}
      }, 400);
    },
    [solutionMoves, puzzle, setGlobalStats]
  );

  // Handle piece drop
  const onPieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string): boolean => {
      if (status !== "playing") return false;
      if (moveIndex >= solutionMoves.length) return false;
      const expected = solutionMoves[moveIndex];
      const from = sourceSquare as Square;
      const to = targetSquare as Square;

      if (from === expected.from && to === expected.to) {
        try {
          const g = new Chess(game.fen());
          g.move({ from, to, promotion: expected.promotion });
          setGame(g);
          setLastMoveSquares({ from, to });
          setWrongSquare(null);
          setSelectedSquare(null);
          setLegalMoveSquares([]);
          const nextIdx = moveIndex + 1;
          setMoveIndex(nextIdx);
          if (nextIdx >= solutionMoves.length) {
            setStatus("solved");
            const today = new Date().toISOString().slice(0, 10);
            localStorage.setItem(`dailyPuzzleSolved_${today}`, "true");
            setAlreadySolvedToday(true);
            if (puzzle) {
              setGlobalStats((prev) =>
                updatePuzzleStats(prev, {
                  puzzleId: puzzle.id,
                  puzzleRating: puzzle.rating,
                  solved: true,
                  timeMs: Date.now() - startTimeRef.current,
                  theme: puzzle.themes?.[0] || "daily",
                  timestamp: Date.now(),
                })
              );
            }
          } else {
            playOpponentMove(g, nextIdx);
          }
          return true;
        } catch {
          return false;
        }
      } else {
        setStatus("wrong");
        setWrongSquare(to);
        setTimeout(() => {
          setStatus("playing");
          setWrongSquare(null);
        }, 1200);
        return false;
      }
    },
    [game, status, moveIndex, solutionMoves, puzzle, setGlobalStats, playOpponentMove]
  );

  // Click-to-move
  const onSquareClick = useCallback(
    (square: Square) => {
      if (status !== "playing") return;
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
    [game, status, selectedSquare, onPieceDrop]
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

  const BOARD_SIZE = 360;

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: "#FF6B35" }} />
      </Box>
    );
  }

  if (!puzzle) return null;

  return (
    <Box
      id="daily-puzzle"
      sx={{
        py: { xs: 6, md: 10 },
        px: { xs: 2, md: 6 },
        background: "linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 100%)",
      }}
    >
      <Box sx={{ maxWidth: 1100, mx: "auto" }}>
        {/* Section header */}
        <Box sx={{ textAlign: "center", mb: 4 }}>
          <Chip
            icon={<ExtensionIcon sx={{ fontSize: 16 }} />}
            label="DAILY CHALLENGE"
            sx={{
              mb: 2,
              bgcolor: "rgba(255, 107, 53, 0.12)",
              color: "#FF6B35",
              fontWeight: 700,
              letterSpacing: 1,
              fontSize: "0.75rem",
            }}
          />
          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
              color: "#fff",
              mb: 1,
              fontSize: { xs: "1.8rem", md: "2.4rem" },
            }}
          >
            Daily Puzzle
          </Typography>
          <Typography variant="body1" sx={{ color: "rgba(255,255,255,0.6)", maxWidth: 500, mx: "auto" }}>
            Solve today&apos;s puzzle to keep your streak alive and sharpen your tactics.
          </Typography>
        </Box>

        {/* Puzzle card */}
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          {/* Board */}
          <Box>
            {/* Status bar */}
            <Box
              sx={{
                mb: 1,
                px: 1.5,
                py: 0.75,
                borderRadius: 1,
                bgcolor:
                  status === "solved"
                    ? "rgba(76,175,80,0.2)"
                    : status === "wrong"
                    ? "rgba(244,67,54,0.2)"
                    : "rgba(255,255,255,0.05)",
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
                    border: "2px solid rgba(255,255,255,0.3)",
                    flexShrink: 0,
                  }}
                />
              )}
              {status === "solved" && <EmojiEventsIcon sx={{ color: "#66bb6a", fontSize: 20 }} />}
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color:
                    status === "solved"
                      ? "#66bb6a"
                      : status === "wrong"
                      ? "#ef5350"
                      : "rgba(255,255,255,0.7)",
                }}
              >
                {status === "loading"
                  ? "Loading..."
                  : status === "solved"
                  ? "Puzzle Solved!"
                  : status === "wrong"
                  ? "Not quite — try again!"
                  : game.turn() === "w"
                  ? "White to move"
                  : "Black to move"}
              </Typography>
            </Box>

            <Box sx={{ borderRadius: "8px", overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
              <Chessboard
                id="DailyPuzzleBoard"
                position={game.fen()}
                onPieceDrop={onPieceDrop}
                onSquareClick={onSquareClick}
                boardOrientation={boardOrientation}
                boardWidth={BOARD_SIZE}
                customBoardStyle={{ borderRadius: "8px" }}
                customSquareStyles={customSquareStyles}
                customPieces={customPieces}
                isDraggablePiece={({ piece }) => {
                  if (status !== "playing") return false;
                  const color = piece[0] === "w" ? "w" : "b";
                  return color === game.turn();
                }}
                animationDuration={200}
              />
            </Box>
          </Box>

          {/* Info panel */}
          <Paper
            sx={{
              p: 3,
              maxWidth: 340,
              bgcolor: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 3,
            }}
          >
            <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.5)", mb: 1 }}>
              {dailyDate}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: "#fff", mb: 1 }}>
              Rating: {puzzle.rating}
            </Typography>

            {puzzle.themes.length > 0 && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 2 }}>
                {puzzle.themes.slice(0, 4).map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    size="small"
                    sx={{
                      bgcolor: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.6)",
                      fontSize: "0.72rem",
                    }}
                  />
                ))}
              </Box>
            )}

            {status === "solved" && (
              <Box
                sx={{
                  p: 2,
                  mb: 2,
                  borderRadius: 2,
                  bgcolor: "rgba(76,175,80,0.1)",
                  border: "1px solid rgba(76,175,80,0.3)",
                  textAlign: "center",
                }}
              >
                <EmojiEventsIcon sx={{ color: "#ffa726", fontSize: 32, mb: 0.5 }} />
                <Typography variant="body2" sx={{ color: "#66bb6a", fontWeight: 600 }}>
                  Congratulations! Come back tomorrow for a new challenge.
                </Typography>
              </Box>
            )}

            {alreadySolvedToday && status !== "solved" && (
              <Box sx={{ p: 1.5, mb: 2, borderRadius: 1, bgcolor: "rgba(76,175,80,0.08)" }}>
                <Typography variant="caption" sx={{ color: "#66bb6a" }}>
                  You already solved today&apos;s puzzle!
                </Typography>
              </Box>
            )}

            <Button
              variant="contained"
              fullWidth
              endIcon={<ArrowForwardIcon />}
              onClick={() => router.push("/practice")}
              sx={{
                mt: 1,
                py: 1.2,
                fontWeight: 700,
                textTransform: "none",
                borderRadius: 2,
                background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
                "&:hover": {
                  background: "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
                },
              }}
            >
              More Puzzles
            </Button>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
