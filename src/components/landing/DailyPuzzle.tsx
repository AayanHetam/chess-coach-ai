import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  CircularProgress,
} from "@mui/material";
import { useRouter } from "next/router";
import { useAtomValue, useSetAtom } from "jotai";
import { pieceSetAtom } from "@/components/board/states";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import ExtensionIcon from "@mui/icons-material/Extension";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import {
  puzzleStatsAtom,
  updatePuzzleStats,
} from "@/lib/puzzleRating";
import { usePuzzleBoardState } from "@/hooks/usePuzzleBoardState";
import { PuzzleBoardSurface } from "@/components/puzzle/PuzzleBoardSurface";

interface DailyPuzzleData {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  solution: string[];
}

const BOARD_SIZE = 360;

/**
 * Daily puzzle widget on the landing page (mounted at `/`).
 * State + behavior delegated to the shared usePuzzleBoardState hook;
 * this file owns the surrounding card chrome, "already solved today"
 * banner, localStorage persistence, and the "More puzzles →" CTA.
 */
export default function DailyPuzzle() {
  const router = useRouter();
  const pieceSet = useAtomValue(pieceSetAtom);
  const setGlobalStats = useSetAtom(puzzleStatsAtom);

  const [puzzle, setPuzzle] = useState<DailyPuzzleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailyDate, setDailyDate] = useState<string>("");
  const [alreadySolvedToday, setAlreadySolvedToday] = useState(false);

  // Fetch the daily puzzle.
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
        }
      } catch (err) {
        console.error("Failed to fetch daily puzzle:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // onSolved: persist solved-today flag + record stats.
  const startedAtRef = useState(() => ({ at: Date.now() }))[0];
  const handleSolved = useCallback(
    (puzzleId: string) => {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem(`dailyPuzzleSolved_${today}`, "true");
      setAlreadySolvedToday(true);
      if (puzzle && puzzle.id === puzzleId) {
        setGlobalStats((prev) =>
          updatePuzzleStats(prev, {
            puzzleId: puzzle.id,
            puzzleRating: puzzle.rating,
            solved: true,
            timeMs: Date.now() - startedAtRef.at,
            theme: puzzle.themes?.[0] || "daily",
            timestamp: Date.now(),
          }),
        );
      }
    },
    [puzzle, setGlobalStats, startedAtRef],
  );

  const board = usePuzzleBoardState({
    puzzle: puzzle
      ? {
          id: puzzle.id,
          fen: puzzle.fen,
          solution: puzzle.solution,
          moves: puzzle.moves,
        }
      : null,
    onSolved: handleSolved,
  });

  // Click-to-move handler — routes through hook's onPieceDrop, with the
  // same playing-or-wrong allowance the hook itself uses for drags.
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
                bgcolor: board.puzzleError
                  ? "rgba(237,108,2,0.22)"
                  : board.status === "solved"
                    ? "rgba(76,175,80,0.2)"
                    : board.status === "wrong"
                      ? "rgba(244,67,54,0.2)"
                      : "rgba(255,255,255,0.05)",
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
                    border: "2px solid rgba(255,255,255,0.3)",
                    flexShrink: 0,
                  }}
                />
              )}
              {board.status === "solved" && !board.puzzleError && (
                <EmojiEventsIcon sx={{ color: "#66bb6a", fontSize: 20 }} />
              )}
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: board.puzzleError
                    ? "#ffb84d"
                    : board.status === "solved"
                      ? "#66bb6a"
                      : board.status === "wrong"
                        ? "#ef5350"
                        : "rgba(255,255,255,0.7)",
                }}
              >
                {board.puzzleError
                  ? `Puzzle data error — ${board.puzzleError}`
                  : board.status === "loading"
                    ? "Loading..."
                    : board.status === "solved"
                      ? "Puzzle Solved!"
                      : board.status === "wrong"
                        ? "Not quite — try again!"
                        : board.game.turn() === "w"
                          ? "White to move"
                          : "Black to move"}
              </Typography>
            </Box>

            <Box
              sx={{
                borderRadius: "8px",
                overflow: "hidden",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              }}
            >
              {/* Shared Puzzle Coach board — landing surface, coach off. */}
              <PuzzleBoardSurface
                boardId="DailyPuzzleBoard"
                fen={board.game.fen()}
                orientation={board.boardOrientation}
                interactive={
                  board.status === "playing" || board.status === "wrong"
                }
                onPieceDrop={board.onPieceDrop}
                lastMove={board.lastMoveSquares}
                wrongSquare={board.wrongSquare}
                flash={{ state: board.flash, flashKey: board.flashKey }}
                boardWidth={BOARD_SIZE}
                pieceSet={pieceSet}
                animationMs={200}
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

            {board.status === "solved" && (
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

            {alreadySolvedToday && board.status !== "solved" && (
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
