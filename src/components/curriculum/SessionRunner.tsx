"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { useAtom } from "jotai";
import { useAuth } from "@/contexts/AuthContext";
import PlacementBoard from "@/components/placement/PlacementBoard";
import QuizProgress from "@/components/onboarding/QuizProgress";
import { puzzleStatsAtom, updatePuzzleStats } from "@/lib/puzzleRating";
import {
  puzzleThemeSrsAtom,
  createCard,
  reviewCard,
  dueThemes,
  qualityFromOutcome,
} from "@/lib/curriculum/puzzleThemeSrs";
import { streakAtom, bumpStreak, dayKey } from "@/lib/curriculum/streak";
import {
  buildDailySession,
  type TimeCommitment,
} from "@/lib/curriculum/dailyPlan";
import type { ChessPuzzle } from "@/lib/chessPuzzlesService";

const ORANGE = "linear-gradient(135deg, #F97316 0%, #EA580C 100%)";
const ORANGE_HOVER = "linear-gradient(135deg, #FB923C 0%, #F97316 100%)";

async function fetchOne(
  body: Record<string, unknown>
): Promise<ChessPuzzle | null> {
  try {
    const res = await fetch("/api/chess-puzzles-dataset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const list: ChessPuzzle[] = Array.isArray(data.puzzles) ? data.puzzles : [];
    return list[0] ?? null;
  } catch {
    return null;
  }
}

export default function SessionRunner({ onExit }: { onExit: () => void }) {
  const { profile, updateProfile } = useAuth();
  const [stats, setStats] = useAtom(puzzleStatsAtom);
  const [srs, setSrs] = useAtom(puzzleThemeSrsAtom);
  const [streak, setStreak] = useAtom(streakAtom);

  // Snapshot the plan + queue ONCE so solving (which changes the live rating)
  // doesn't reshuffle the session mid-way.
  const startRatingRef = useRef(stats.rating);
  const plan = useMemo(
    () =>
      buildDailySession({
        dailyTimeCommitment: profile?.dailyTimeCommitment as
          | TimeCommitment
          | undefined,
        focusThemes: profile?.focusThemes,
        liveRating: startRatingRef.current,
        stats,
        dueReviewThemes: dueThemes(srs, Date.now()),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const queue = useMemo(
    () => [...plan.newThemes, ...plan.reviewThemes],
    [plan]
  );

  const [idx, setIdx] = useState(0);
  const [puzzle, setPuzzle] = useState<ChessPuzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [solvedCount, setSolvedCount] = useState(0);

  const seenRef = useRef<string[]>([]);
  const startTimeRef = useRef<number>(Date.now());
  const firstTryWrongRef = useRef(false);
  const gradedRef = useRef(false);
  const streakBumpedRef = useRef(false);

  const loadSlot = useCallback(
    async (i: number) => {
      setLoading(true);
      const theme = queue[i];
      const { min, max } = plan.ratingWindow;
      const exclude = seenRef.current;
      const p =
        (await fetchOne({
          command: "by_rating",
          themes: [theme],
          minRating: min,
          maxRating: max,
          excludeIds: exclude,
          limit: 1,
        })) ||
        (await fetchOne({
          command: "by_rating",
          themes: [theme],
          minRating: Math.max(0, min - 300),
          maxRating: max + 300,
          excludeIds: exclude,
          limit: 1,
        })) ||
        (await fetchOne({
          command: "by_theme",
          themes: [theme],
          limit: 1,
          excludeIds: exclude,
        })) ||
        (await fetchOne({ command: "random", limit: 1, excludeIds: exclude }));
      firstTryWrongRef.current = false;
      gradedRef.current = false;
      startTimeRef.current = Date.now();
      setPuzzle(p);
      setLoading(false);
    },
    [queue, plan.ratingWindow]
  );

  useEffect(() => {
    if (queue.length === 0) {
      setDone(true);
      setLoading(false);
      return;
    }
    void loadSlot(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advance = useCallback(() => {
    const next = idx + 1;
    setPuzzle(null);
    if (next >= queue.length) {
      setDone(true);
    } else {
      setIdx(next);
      void loadSlot(next);
    }
  }, [idx, queue.length, loadSlot]);

  const grade = useCallback(
    (solved: boolean) => {
      if (gradedRef.current || !puzzle) return;
      gradedRef.current = true;
      const theme = queue[idx];
      const firstTry = solved && !firstTryWrongRef.current;

      // Live rating + per-theme stats (first wrong attempt counts as a miss).
      setStats((prev) =>
        updatePuzzleStats(prev, {
          puzzleId: puzzle.id,
          puzzleRating: puzzle.rating,
          solved: firstTry,
          timeMs: Date.now() - startTimeRef.current,
          theme,
          timestamp: Date.now(),
        })
      );

      // Per-theme SRS card.
      const quality = qualityFromOutcome(solved, firstTry);
      setSrs((prev) => ({
        ...prev,
        [theme]: reviewCard(
          prev[theme] ?? createCard(theme),
          quality,
          Date.now()
        ),
      }));

      // Streak: first completed item of the day. Also mirror streak +
      // last-active to the profile so the reminder cron can read it server-side.
      if (!streakBumpedRef.current) {
        streakBumpedRef.current = true;
        const newStreak = bumpStreak(streak, dayKey(new Date()));
        setStreak(newStreak);
        const at = Date.now();
        void updateProfile({
          lastActiveAt: at,
          currentStreak: newStreak.current,
          streakUpdatedAt: at,
        }).catch(() => {});
      }

      if (firstTry) setSolvedCount((c) => c + 1);
      seenRef.current = [...seenRef.current, puzzle.id];

      window.setTimeout(advance, solved ? 450 : 700);
    },
    [
      puzzle,
      queue,
      idx,
      setStats,
      setSrs,
      setStreak,
      streak,
      updateProfile,
      advance,
    ]
  );

  if (done) {
    const delta = stats.rating - startRatingRef.current;
    return (
      <Box sx={{ textAlign: "center", py: 4 }}>
        <Typography
          sx={{ color: "#fff", fontWeight: 800, fontSize: "1.6rem", mb: 1 }}
        >
          Session complete 🎉
        </Typography>
        <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 0.5 }}>
          {solvedCount} of {queue.length} solved first try.
        </Typography>
        <Typography
          sx={{
            color: delta >= 0 ? "#4ade80" : "#f87171",
            fontWeight: 700,
            mb: 3,
          }}
        >
          Rating {delta >= 0 ? "+" : ""}
          {delta} → {stats.rating}
        </Typography>
        <Button
          onClick={onExit}
          sx={{
            py: 1.2,
            px: 4,
            borderRadius: "12px",
            textTransform: "none",
            fontWeight: 700,
            color: "#fff",
            background: ORANGE,
            "&:hover": { background: ORANGE_HOVER },
          }}
        >
          Back to dashboard
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography
          sx={{
            color: "rgba(255,255,255,0.7)",
            fontWeight: 600,
            fontSize: "0.85rem",
            mb: 1,
          }}
        >
          {idx < plan.newThemes.length ? "New concept" : "Review"} · {idx + 1}{" "}
          of {queue.length}
        </Typography>
        <QuizProgress value={queue.length > 0 ? idx / queue.length : 0} />
      </Box>

      {loading || !puzzle ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "#FB923C" }} />
        </Box>
      ) : (
        <>
          <Typography
            sx={{
              color: "rgba(255,255,255,0.8)",
              textAlign: "center",
              mb: 1.5,
              fontWeight: 600,
            }}
          >
            Find the best move.
          </Typography>
          <PlacementBoard
            puzzle={{
              id: puzzle.id,
              fen: puzzle.fen,
              solution: puzzle.solution,
              moves: puzzle.moves,
            }}
            onSolved={() => grade(true)}
            onWrong={() => {
              firstTryWrongRef.current = true;
            }}
          />
          <Box sx={{ textAlign: "center", mt: 2 }}>
            <Button
              onClick={() => grade(false)}
              sx={{
                textTransform: "none",
                color: "rgba(255,255,255,0.5)",
                fontSize: "0.82rem",
              }}
            >
              Skip
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}
