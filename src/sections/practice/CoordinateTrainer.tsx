import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  LinearProgress,
} from "@mui/material";
import { useAtomValue, useSetAtom } from "jotai";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import GridOnIcon from "@mui/icons-material/GridOn";
import { useScreenSize } from "@/hooks/useScreenSize";
import { coordinateTrainerBestAtom } from "@/lib/coordinateTrainer";
import { DEFAULT_PUZZLE_THEME } from "@/components/puzzle/boardTheme";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
} from "@/theme/tokens";

/**
 * Coordinate Trainer — board-fluency drill. A target square name is shown;
 * click it on a blank, unlabeled board as fast as you can. 60-second round,
 * score is squares correctly identified.
 *
 * Deliberately minimal next to PuzzleRush: one duration, one orientation
 * (White POV) — the smallest version of the drill every competitor ships,
 * not a mode picker. Reuses DEFAULT_PUZZLE_THEME so the blank board still
 * reads as "this app's board" rather than a one-off palette.
 */

const ROUND_SECONDS = 60;
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
// Feedback flash duration before advancing to the next target.
const CORRECT_ADVANCE_MS = 220;
const WRONG_ADVANCE_MS = 550;

interface CoordinateTrainerProps {
  onBack: () => void;
}

function randomSquare(exclude?: string): string {
  let sq: string;
  do {
    const file = FILES[Math.floor(Math.random() * 8)];
    const rank = RANKS[Math.floor(Math.random() * 8)];
    sq = `${file}${rank}`;
  } while (sq === exclude);
  return sq;
}

export default function CoordinateTrainer({ onBack }: CoordinateTrainerProps) {
  const screenSize = useScreenSize();
  const best = useAtomValue(coordinateTrainerBestAtom);
  const setBest = useSetAtom(coordinateTrainerBestAtom);

  const [phase, setPhase] = useState<"setup" | "playing" | "finished">("setup");
  const [target, setTarget] = useState<string>("e4");
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [feedback, setFeedback] = useState<{
    square: string;
    correct: boolean;
  } | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const advanceRef = useRef<NodeJS.Timeout | null>(null);

  const boardSize = useMemo(() => {
    const width = screenSize.width;
    const height = screenSize.height;
    if (!width || !height || width <= 0 || height <= 0) return 360;
    if (typeof window !== "undefined" && window.innerWidth < 900) {
      return Math.max(Math.min(width - 32, height - 320), 260);
    }
    return Math.max(Math.min(width - 560, height * 0.6, 480), 300);
  }, [screenSize]);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (advanceRef.current) clearTimeout(advanceRef.current);
  }, []);

  const handleStart = useCallback(() => {
    setScore(0);
    setMisses(0);
    setTimeLeft(ROUND_SECONDS);
    setTarget(randomSquare());
    setFeedback(null);
    setIsNewBest(false);
    setPhase("playing");
  }, []);

  // Countdown
  useEffect(() => {
    if (phase !== "playing") return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setPhase("finished");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // Best-score check on finish
  useEffect(() => {
    if (phase !== "finished") return;
    if (score > best.best) {
      setBest({ best: score });
      setIsNewBest(true);
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => clearTimers, [clearTimers]);

  const handleSquareClick = useCallback(
    (square: string) => {
      if (phase !== "playing" || feedback) return;
      const correct = square === target;
      setFeedback({ square, correct });
      if (correct) setScore((s) => s + 1);
      else setMisses((m) => m + 1);
      advanceRef.current = setTimeout(
        () => {
          setFeedback(null);
          setTarget((prev) => randomSquare(prev));
        },
        correct ? CORRECT_ADVANCE_MS : WRONG_ADVANCE_MS
      );
    },
    [phase, feedback, target]
  );

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ---- SETUP SCREEN ----
  if (phase === "setup") {
    return (
      <Paper
        sx={{
          p: 4,
          maxWidth: 600,
          mx: "auto",
          borderRadius: `${RADIUS.card}px`,
          background: SURFACE.raised,
          border: `1px solid ${LINE.hairline}`,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
          <GridOnIcon sx={{ color: ACCENT.main, fontSize: 28 }} />
          <Typography variant="h5" sx={{ color: TEXT.primary }}>
            Coordinate trainer
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          You&rsquo;ll be shown a square name. Click it on the blank board as
          fast as you can. {ROUND_SECONDS} seconds, no labels. Board fluency is
          the thing every strong player has and never talks about.
        </Typography>

        {best.best > 0 && (
          <Chip
            icon={<EmojiEventsIcon sx={{ fontSize: 14 }} />}
            label={`Best: ${best.best}`}
            size="small"
            sx={{ mb: 3 }}
          />
        )}

        <Box sx={{ display: "flex", gap: 2 }}>
          <Button variant="outlined" onClick={onBack}>
            Back
          </Button>
          <Button
            variant="contained"
            size="large"
            onClick={handleStart}
            startIcon={<GridOnIcon />}
          >
            Start drill
          </Button>
        </Box>
      </Paper>
    );
  }

  // ---- FINISHED SCREEN ----
  if (phase === "finished") {
    const attempts = score + misses;
    const accuracy = attempts > 0 ? Math.round((score / attempts) * 100) : 0;
    return (
      <Paper
        sx={{
          p: 4,
          maxWidth: 480,
          mx: "auto",
          textAlign: "center",
          borderRadius: `${RADIUS.card}px`,
          background: SURFACE.raised,
          border: `1px solid ${LINE.hairline}`,
        }}
      >
        {isNewBest && (
          <EmojiEventsIcon
            sx={{ fontSize: 48, color: "warning.main", mb: 1 }}
          />
        )}
        <Typography variant="h4" sx={{ mb: 1, color: TEXT.primary }}>
          {isNewBest ? "New best" : "Round complete"}
        </Typography>
        <Typography
          variant="h2"
          sx={{
            color: STATUS.success,
            mb: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {score}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          squares found · {accuracy}% accuracy
        </Typography>
        <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
          <Button variant="outlined" onClick={onBack}>
            Back to setup
          </Button>
          <Button
            variant="contained"
            onClick={handleStart}
            startIcon={<GridOnIcon />}
          >
            Play again
          </Button>
        </Box>
      </Paper>
    );
  }

  // ---- PLAYING SCREEN ----
  return (
    <Box sx={{ maxWidth: 700, mx: "auto" }}>
      <Paper
        sx={{
          px: 2,
          py: 1.5,
          mb: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: `${RADIUS.card}px`,
          background: SURFACE.raised,
          border: `1px solid ${LINE.hairline}`,
          color: TEXT.primary,
        }}
      >
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
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="caption" sx={{ color: TEXT.secondary }}>
            Find
          </Typography>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              lineHeight: 1,
              color: ACCENT.hover,
              fontFamily: FONT_MONO,
            }}
          >
            {target}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="caption" sx={{ color: TEXT.secondary }}>
            Time left
          </Typography>
          <Typography
            variant="h5"
            sx={{
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              color: timeLeft <= 10 ? STATUS.error : TEXT.primary,
            }}
          >
            {formatTimer(timeLeft)}
          </Typography>
        </Box>
      </Paper>

      <LinearProgress
        variant="determinate"
        value={(timeLeft / ROUND_SECONDS) * 100}
        sx={{
          mb: 2,
          height: 6,
          borderRadius: 3,
          "& .MuiLinearProgress-bar": {
            bgcolor: timeLeft <= 10 ? STATUS.error : ACCENT.main,
            transition: "transform 1s linear",
          },
        }}
      />

      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(8, 1fr)",
            gridTemplateRows: "repeat(8, 1fr)",
            width: boardSize,
            height: boardSize,
            borderRadius: DEFAULT_PUZZLE_THEME.radius,
            overflow: "hidden",
          }}
        >
          {RANKS.map((rank, rankIdx) =>
            FILES.map((file, fileIdx) => {
              const square = `${file}${rank}`;
              const isLight = (fileIdx + rankIdx) % 2 !== 0;
              const isFeedbackSquare = feedback?.square === square;
              const isTargetReveal =
                feedback && !feedback.correct && square === target;
              let background = isLight
                ? DEFAULT_PUZZLE_THEME.light
                : DEFAULT_PUZZLE_THEME.dark;
              if (isFeedbackSquare) {
                background = feedback.correct ? "#22c55e" : "#ef4444";
              } else if (isTargetReveal) {
                background = "#22c55e";
              }
              return (
                <Box
                  key={square}
                  onClick={() => handleSquareClick(square)}
                  sx={{
                    background,
                    cursor: "pointer",
                    transition: "background 120ms ease",
                  }}
                />
              );
            })
          )}
        </Box>
      </Box>
    </Box>
  );
}
