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
import { useAtomValue, useSetAtom } from "jotai";
import { puzzleSolvedStatusAtom } from "./states";
import { useScreenSize } from "@/hooks/useScreenSize";
import { pieceSetAtom } from "@/components/board/states";
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
import { PuzzleBoardSurface } from "@/components/puzzle/PuzzleBoardSurface";
import { RushLeaderboard } from "./RushLeaderboard";
import { useAuth } from "@/contexts/AuthContext";

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
  const { user } = useAuth();

  // Opportunistic leaderboard sync: PUT /api/progress's own upsert only
  // fires when useProgressSync actually pushes, which happens at most once
  // per app-session (hydratedFor guard, _app.tsx-level mount) — a user
  // signed in since before the leaderboard shipped, whose score hasn't
  // changed THIS session, may never push again and so never appear. Firing
  // here too, on every Rush view, converges regardless of that timing.
  // Best-effort: a failure here must never surface to someone browsing
  // rush modes.
  useEffect(() => {
    if (!user) return;
    if (rushScores.threeMin === 0 && rushScores.fiveMin === 0 && rushScores.survivalBest === 0) {
      return;
    }
    void fetch("/api/leaderboards/puzzle-rush/sync", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rush: rushScores }),
    }).catch(() => {});
  }, [user, rushScores]);

  // Setup state
  const [mode, setMode] = useState<RushMode>("three");
  const [difficulty, setDifficulty] = useState<DifficultyBand | "all">("all");
  const [phase, setPhase] = useState<"setup" | "playing" | "finished">("setup");

  // Game state (the puzzle queue + index; per-puzzle board state comes
  // from usePuzzleBoardState).
  const [puzzles, setPuzzles] = useState<ChessPuzzle[]>([]);
  const [puzzleIndex, setPuzzleIndex] = useState(0);

  // Click-to-move local state

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

  // Format seconds to mm:ss
  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ---- SETUP SCREEN ----
  if (phase === "setup") {
    return (
      <>
      <Paper
        sx={{
          p: 4,
          maxWidth: 600,
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
          <BoltIcon sx={{ color: "#FB923C", fontSize: 32 }} />
          <Typography variant="h5" sx={{ fontWeight: 700, color: "rgba(255,255,255,0.94)" }}>
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
                borderRadius: "1rem",
                border:
                  mode === m.value
                    ? "1px solid rgba(249,115,22,0.4)"
                    : "1px solid rgba(255,255,255,0.08)",
                background:
                  mode === m.value
                    ? "rgba(249,115,22,0.18)"
                    : "rgba(255,255,255,0.04)",
                boxShadow:
                  mode === m.value
                    ? "0 0 0 1px rgba(249,115,22,0.18)"
                    : "none",
                transition: "all 180ms ease",
                "&:hover": { borderColor: "rgba(249,115,22,0.4)" },
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "rgba(255,255,255,0.94)" }}>
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
          <InputLabel
            sx={{
              color: "rgba(255,255,255,0.55)",
              "&.Mui-focused": { color: "#FB923C" },
            }}
          >
            Difficulty
          </InputLabel>
          <Select
            value={difficulty}
            label="Difficulty"
            onChange={(e) => setDifficulty(e.target.value as DifficultyBand | "all")}
            sx={{
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.7)",
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: "rgba(255,255,255,0.1)",
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: "rgba(255,255,255,0.2)",
              },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: "#F97316",
              },
              "& .MuiSvgIcon-root": { color: "rgba(255,255,255,0.55)" },
            }}
            MenuProps={{
              slotProps: {
                paper: {
                  sx: {
                    background: "rgba(20,22,28,0.92)",
                    backdropFilter: "blur(14px) saturate(140%)",
                    WebkitBackdropFilter: "blur(14px) saturate(140%)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "12px",
                    color: "rgba(255,255,255,0.85)",
                  },
                },
              },
            }}
          >
            <MenuItem value="all">All Levels</MenuItem>
            <MenuItem value="beginner">Beginner (0-1200)</MenuItem>
            <MenuItem value="intermediate">Intermediate (1201-1600)</MenuItem>
            <MenuItem value="advanced">Advanced (1601-2000)</MenuItem>
            <MenuItem value="expert">Expert (2001+)</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ display: "flex", gap: 2 }}>
          <Button
            variant="outlined"
            onClick={onBack}
            sx={{
              textTransform: "none",
              color: "rgba(255,255,255,0.85)",
              borderColor: "rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.04)",
              "&:hover": {
                borderColor: "rgba(249,115,22,0.4)",
                color: "#FB923C",
                background: "rgba(249,115,22,0.12)",
              },
            }}
          >
            Back
          </Button>
          <Button
            variant="contained"
            size="large"
            onClick={handleStart}
            startIcon={<BoltIcon />}
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
            Start Rush
          </Button>
        </Box>
      </Paper>
      <RushLeaderboard mode={mode} />
      </>
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
          borderRadius: "1rem",
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
          <BoltIcon sx={{ color: "#FB923C" }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {modeConfig.label}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
          {/* Score */}
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.55)" }}>Score</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: "success.light", lineHeight: 1, fontFamily: "Monaco, monospace" }}>
              {score}
            </Typography>
          </Box>

          {/* Timer */}
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.55)" }}>
              {modeConfig.timeSeconds === Infinity ? "Time" : "Time Left"}
            </Typography>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                lineHeight: 1,
                fontFamily: "monospace",
                color: modeConfig.timeSeconds !== Infinity && timeLeft <= 30 ? "error.light" : "rgba(255,255,255,0.94)",
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
                    color: i < lives ? "error.main" : "rgba(255,255,255,0.14)",
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
              sx={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.85)",
              }}
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
            color: "rgba(255,255,255,0.85)",
            borderColor: "rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.04)",
            "&:hover": {
              borderColor: "rgba(249,115,22,0.4)",
              color: "#FB923C",
              background: "rgba(249,115,22,0.12)",
            },
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
            bgcolor: "rgba(255,255,255,0.08)",
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
              borderRadius: "12px",
              bgcolor: board.puzzleError
                ? "warning.dark"
                : board.status === "solved"
                  ? "success.dark"
                  : board.status === "wrong"
                    ? "error.dark"
                    : "rgba(255,255,255,0.06)",
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
                  bgcolor: board.game.turn() === "w" ? "#fff" : "#1a1a1a",
                  border: "2px solid",
                  borderColor: "rgba(255,255,255,0.3)",
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
                    : "rgba(255,255,255,0.85)",
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

          {/* Chessboard — shared Puzzle Coach board (speed-tuned animation,
              no coach). Phase gate folds into `interactive` so drags/clicks do
              nothing during the finish dialog. */}
          <PuzzleBoardSurface
            boardId="PuzzleRushBoard"
            fen={board.game.fen()}
            orientation={board.boardOrientation}
            interactive={
              phase === "playing" &&
              (board.status === "playing" || board.status === "wrong")
            }
            onPieceDrop={board.onPieceDrop}
            lastMove={board.lastMoveSquares}
            wrongSquare={board.wrongSquare}
            flash={{ state: board.flash, flashKey: board.flashKey }}
            boardWidth={boardSize}
            pieceSet={pieceSet}
            animationMs={150}
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
          },
        }}
        slotProps={{
          backdrop: {
            sx: {
              backgroundColor: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(2px)",
            },
          },
        }}
      >
        <DialogContent sx={{ textAlign: "center", py: 4 }}>
          {isNewHighScore && (
            <EmojiEventsIcon sx={{ fontSize: 48, color: "warning.main", mb: 1 }} />
          )}
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: "rgba(255,255,255,0.94)" }}>
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
          <Typography variant="body2" sx={{ mt: 2, color: "rgba(255,255,255,0.55)" }}>
            Your puzzle rating: <strong style={{ color: "rgba(255,255,255,0.9)" }}>{globalStats.rating}</strong>
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center", pb: 3, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => {
              setPhase("setup");
              setShowFinishDialog(false);
            }}
            sx={{
              textTransform: "none",
              color: "rgba(255,255,255,0.85)",
              borderColor: "rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.04)",
              "&:hover": {
                borderColor: "rgba(249,115,22,0.4)",
                color: "#FB923C",
                background: "rgba(249,115,22,0.12)",
              },
            }}
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
