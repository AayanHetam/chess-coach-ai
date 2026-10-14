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
import {
  RushLeaderboard,
  type LeaderboardSeed,
  type LeaderboardStanding,
} from "./RushLeaderboard";
import { useAuth } from "@/contexts/AuthContext";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
} from "@/theme/tokens";

type RushMode = "three" | "five" | "survival";

const RUSH_MODES: {
  value: RushMode;
  label: string;
  description: string;
  timeSeconds: number;
  lives: number;
}[] = [
  {
    value: "three",
    label: "3 min rush",
    description: "Solve as many as you can in 3 minutes",
    timeSeconds: 180,
    lives: Infinity,
  },
  {
    value: "five",
    label: "5 min rush",
    description: "Solve as many as you can in 5 minutes",
    timeSeconds: 300,
    lives: Infinity,
  },
  {
    value: "survival",
    label: "Survival",
    description: "3 lives: one wrong answer costs a life",
    timeSeconds: Infinity,
    lives: 3,
  },
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

  const [mode, setMode] = useState<RushMode>("three");
  const [boardSeed, setBoardSeed] = useState<LeaderboardSeed | null>(null);
  // Kept across mode switches on purpose — see LeaderboardStanding.
  const [standing, setStanding] = useState<LeaderboardStanding | null>(null);
  // Read inside the sync effect without being one of its dependencies:
  // switching modes should re-READ the board, which RushLeaderboard does for
  // itself, not re-WRITE the player's scores.
  const modeRef = useRef<RushMode>(mode);
  modeRef.current = mode;

  // A seed is a snapshot taken at the moment of a write. Dropping it when the
  // player changes mode keeps it from being re-shown later as if it were
  // current — every mode switch then reads the board live.
  useEffect(() => {
    setBoardSeed(null);
    // A failure to load one mode's puzzles says nothing about the next.
    setStartError(null);
  }, [mode]);

  // Opportunistic leaderboard sync: PUT /api/progress's own upsert only
  // fires when useProgressSync actually pushes, which happens at most once
  // per app-session (ProgressSyncGate, _app.tsx-level mount) — a user
  // signed in since before the leaderboard shipped, whose score hasn't
  // changed THIS session, may never push again and so never appear. Firing
  // here too, on every Rush view, converges regardless of that timing.
  // Best-effort: a failure here must never surface to someone browsing
  // rush modes.
  useEffect(() => {
    if (!user) return;
    if (
      rushScores.threeMin === 0 &&
      rushScores.fiveMin === 0 &&
      rushScores.survivalBest === 0
    ) {
      return;
    }
    const field =
      modeRef.current === "three"
        ? "threeMin"
        : modeRef.current === "five"
          ? "fiveMin"
          : "survivalBest";
    let cancelled = false;
    void fetch("/api/leaderboards/puzzle-rush/sync", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rush: rushScores, mode: field }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: LeaderboardSeed & LeaderboardStanding) => {
        if (cancelled) return;
        // The board as it stands AFTER this write — the only read
        // guaranteed to show a just-set personal best, since the public GET
        // is served from a per-instance cache that may predate it.
        if (Array.isArray(data?.entries)) {
          setBoardSeed({ mode: data.mode, entries: data.entries });
        }
        setStanding({
          ranks: data?.ranks ?? null,
          scores: data?.scores ?? null,
          handle: data?.handle ?? null,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, rushScores]);

  // Setup state
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
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
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
      const solvedIds = Object.keys(solvedStatus).filter(
        (id) => solvedStatus[id]
      );
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
        })
      );
    },
    [currentPuzzle, setGlobalStats]
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
    [recordSolve, advanceToNext]
  );

  const handleWrong = useCallback(
    (puzzleId: string, _attemptedSan: string | null) => {
      void _attemptedSan;
      recordSolve(puzzleId, false);
      if (mode === "survival") {
        setLives((prev) => {
          const newLives = prev - 1;
          if (newLives <= 0) {
            setTimeout(
              () => setPhase("finished"),
              FINISH_DELAY_AFTER_LIVES_OUT_MS
            );
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
    [mode, recordSolve, advanceToNext, phase]
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
    setStartError(null);
    setStarting(true);
    const fetched = await fetchPuzzles();
    setStarting(false);
    if (fetched.length === 0) {
      // Returning silently here left two dead ends: on setup the Start button
      // looked broken, and from the finish dialog's Play Again the dialog had
      // already closed, stranding the player on an empty board in the
      // "finished" phase with nothing to click. Say so, and stay somewhere
      // they can act.
      setStartError(
        "Couldn't load puzzles just now. Check your connection and try again."
      );
      setPhase("setup");
      return;
    }
    setPuzzles(fetched);
    setPuzzleIndex(0);
    setScore(0);
    setLives(modeConfig.lives === Infinity ? 3 : modeConfig.lives);
    setTimeLeft(
      modeConfig.timeSeconds === Infinity ? 0 : modeConfig.timeSeconds
    );
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
      mode === "three"
        ? "threeMin"
        : mode === "five"
          ? "fiveMin"
          : "survivalBest";
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
            borderRadius: `${RADIUS.card}px`,
            background: SURFACE.raised,
            border: `1px solid ${LINE.hairline}`,
            overflow: "hidden",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
            <BoltIcon sx={{ color: ACCENT.main, fontSize: 28 }} />
            <Typography variant="h5" sx={{ color: TEXT.primary }}>
              Puzzle rush
            </Typography>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Solve as many puzzles as you can. Wrong answers skip to the next
            puzzle. In Survival mode you get 3 lives.
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
                  borderRadius: `${RADIUS.control}px`,
                  border: `1px solid ${mode === m.value ? ACCENT.border : LINE.hairline}`,
                  background:
                    mode === m.value ? ACCENT.tint : SURFACE.raisedSecondary,
                  transition: `border-color ${MOTION.hover}, background-color ${MOTION.hover}`,
                  "&:hover": {
                    borderColor: mode === m.value ? ACCENT.border : LINE.strong,
                  },
                  "&:active": { background: SURFACE.raisedTertiary },
                }}
              >
                <Typography variant="subtitle2" sx={{ color: TEXT.primary }}>
                  {m.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {m.description}
                </Typography>
                {rushScores[
                  m.value === "three"
                    ? "threeMin"
                    : m.value === "five"
                      ? "fiveMin"
                      : "survivalBest"
                ] > 0 && (
                  <Chip
                    icon={<EmojiEventsIcon sx={{ fontSize: 14 }} />}
                    label={`Best: ${rushScores[m.value === "three" ? "threeMin" : m.value === "five" ? "fiveMin" : "survivalBest"]}`}
                    size="small"
                    sx={{ mt: 1 }}
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
              onChange={(e) =>
                setDifficulty(e.target.value as DifficultyBand | "all")
              }
            >
              <MenuItem value="all">All levels</MenuItem>
              <MenuItem value="beginner">Beginner (0-1200)</MenuItem>
              <MenuItem value="intermediate">Intermediate (1201-1600)</MenuItem>
              <MenuItem value="advanced">Advanced (1601-2000)</MenuItem>
              <MenuItem value="expert">Expert (2001+)</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ display: "flex", gap: 2 }}>
            <Button variant="outlined" onClick={onBack}>
              Back
            </Button>
            <Button
              variant="contained"
              size="large"
              onClick={handleStart}
              disabled={starting}
              startIcon={<BoltIcon />}
            >
              {starting ? "Loading\u2026" : "Start rush"}
            </Button>
          </Box>
          {startError && (
            <Typography
              role="alert"
              variant="body2"
              sx={{ mt: 2, color: STATUS.error, textAlign: "center" }}
            >
              {startError}
            </Typography>
          )}
        </Paper>
        <RushLeaderboard mode={mode} seed={boardSeed} standing={standing} />
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
          borderRadius: `${RADIUS.card}px`,
          background: SURFACE.raised,
          border: `1px solid ${LINE.hairline}`,
          overflow: "hidden",
          color: TEXT.primary,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <BoltIcon sx={{ color: ACCENT.main }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {modeConfig.label}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
          {/* Score */}
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="caption" sx={{ color: TEXT.secondary }}>
              Score
            </Typography>
            <Typography
              variant="h5"
              sx={{
                color: STATUS.success,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {score}
            </Typography>
          </Box>

          {/* Timer */}
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="caption" sx={{ color: TEXT.secondary }}>
              {modeConfig.timeSeconds === Infinity ? "Time" : "Time left"}
            </Typography>
            <Typography
              variant="h5"
              sx={{
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                color:
                  modeConfig.timeSeconds !== Infinity && timeLeft <= 30
                    ? STATUS.error
                    : TEXT.primary,
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
                    color: i < lives ? STATUS.error : LINE.strong,
                    transition: "color 0.3s",
                  }}
                />
              ))}
            </Box>
          )}

          {/* Puzzle rating */}
          {currentPuzzle && (
            <Chip label={`Rating: ${currentPuzzle.rating}`} size="small" />
          )}
        </Box>

        <Button
          variant="outlined"
          size="small"
          onClick={() => {
            if (timerRef.current) clearInterval(timerRef.current);
            setPhase("finished");
          }}
        >
          End rush
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
            "& .MuiLinearProgress-bar": {
              bgcolor:
                timeLeft <= 30
                  ? STATUS.error
                  : timeLeft <= 60
                    ? STATUS.warning
                    : STATUS.success,
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
              borderRadius: `${RADIUS.control}px`,
              border: `1px solid ${LINE.hairline}`,
              background: board.puzzleError
                ? STATUS.warningTint
                : board.status === "solved"
                  ? STATUS.successTint
                  : board.status === "wrong"
                    ? STATUS.errorTint
                    : SURFACE.raisedSecondary,
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
                  borderColor: LINE.strong,
                  flexShrink: 0,
                }}
              />
            )}
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: TEXT.primary }}
            >
              {board.puzzleError
                ? "Bad puzzle data, skipping…"
                : board.status === "loading"
                  ? "Loading…"
                  : board.status === "solved"
                    ? "Correct. Next puzzle…"
                    : board.status === "wrong"
                      ? "Wrong. Skipping…"
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
      <Dialog open={showFinishDialog} maxWidth="xs" fullWidth>
        <DialogContent sx={{ textAlign: "center", py: 4 }}>
          {isNewHighScore && (
            <EmojiEventsIcon
              sx={{ fontSize: 48, color: "warning.main", mb: 1 }}
            />
          )}
          <Typography variant="h4" sx={{ mb: 1, color: TEXT.primary }}>
            {isNewHighScore ? "New high score" : "Rush complete"}
          </Typography>
          <Typography
            variant="h2"
            sx={{
              color: STATUS.success,
              mb: 2,
              fontVariantNumeric: "tabular-nums",
            }}
          >
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
          <Typography variant="body2" sx={{ mt: 2, color: TEXT.secondary }}>
            Your puzzle rating:{" "}
            <strong style={{ color: TEXT.primary }}>
              {globalStats.rating}
            </strong>
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center", pb: 3, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => {
              setPhase("setup");
              setShowFinishDialog(false);
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
            startIcon={<BoltIcon />}
          >
            Play again
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
