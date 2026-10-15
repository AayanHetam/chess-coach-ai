"use client";

import { useCallback, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { Loader } from "@/components/ui/Loader";
import { useAtom, useSetAtom } from "jotai";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthDialog } from "@/contexts/AuthDialogContext";
import PlacementBoard from "./PlacementBoard";
import PlacementResult from "./PlacementResult";
import QuizProgress from "@/components/onboarding/QuizProgress";
import {
  placementSessionAtom,
  PlacementSession,
} from "@/lib/placement/placementSession";
import {
  PLACEMENT_LENGTH,
  PLACEMENT_MIN_TO_FINALIZE,
  seedEstimate,
  planThemeFor,
  placementWindow,
  applyPlacementElo,
  finalizePlacement,
  PlacementResult as PlacementResultData,
} from "@/lib/placement/placementTest";
import { puzzleStatsAtom } from "@/lib/puzzleRating";
import { dedupe } from "@/components/onboarding/quizConfig";
import { MAX_FOCUS_THEMES } from "@/components/onboarding/quizThemes";
import type { ChessPuzzle } from "@/lib/chessPuzzlesService";

import { LINE, RADIUS, SURFACE, TEXT, TYPE } from "@/theme/tokens";

type Phase = "intro" | "testing" | "result";

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

export default function PlacementTest() {
  const router = useRouter();
  const { user, profile, updateProfile } = useAuth();
  const { openAuthDialog } = useAuthDialog();
  const [session, setSession] = useAtom(placementSessionAtom);
  const setGlobalStats = useSetAtom(puzzleStatsAtom);

  const [phase, setPhase] = useState<Phase>("intro");
  const [currentPuzzle, setCurrentPuzzle] = useState<ChessPuzzle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlacementResultData | null>(null);

  const gradedRef = useRef(false);
  const loadingRef = useRef(false);

  const loadPuzzleForItem = useCallback(async (s: PlacementSession) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    const idx = s.itemIndex;
    const theme = planThemeFor(idx);
    const w = placementWindow(idx);
    const est = s.estimate;
    const exclude = s.seenPuzzleIds;

    const p =
      (await fetchOne({
        command: "by_rating",
        themes: [theme],
        minRating: Math.max(0, est - w),
        maxRating: est + w,
        excludeIds: exclude,
        limit: 1,
      })) ||
      (await fetchOne({
        command: "by_rating",
        themes: [theme],
        minRating: Math.max(0, est - 400),
        maxRating: est + 400,
        excludeIds: exclude,
        limit: 1,
      })) ||
      (await fetchOne({
        command: "by_rating",
        minRating: Math.max(0, est - w),
        maxRating: est + w,
        excludeIds: exclude,
        limit: 1,
      })) ||
      (await fetchOne({ command: "random", limit: 1, excludeIds: exclude }));

    loadingRef.current = false;
    setLoading(false);
    if (!p) {
      setError(
        "Couldn't load a puzzle. The puzzle database may be unavailable."
      );
      setCurrentPuzzle(null);
      return;
    }
    gradedRef.current = false;
    setCurrentPuzzle(p);
  }, []);

  const finalize = useCallback(
    async (s: PlacementSession) => {
      const res = finalizePlacement(s.history, s.seed);

      // Seed the live working rating (preserve all other puzzle stats).
      setGlobalStats((prev) => ({
        ...prev,
        rating: res.finalRating,
        ratingHistory: [
          ...prev.ratingHistory,
          { rating: res.finalRating, timestamp: Date.now() },
        ].slice(-100),
      }));

      // Durable snapshot. The measured weaknesses REPLACE the previous
      // measurement rather than unioning with it: a union could add a weakness
      // but never retract one, so a theme the player had since improved at
      // stayed a training target forever, and repeated placements drifted
      // everyone toward "weak at everything". The user's self-chosen
      // `focusThemes` is untouched — it is a stated preference, not an
      // observation, and readers combine the two at read time.
      if (user && res.itemsCompleted >= PLACEMENT_MIN_TO_FINALIZE) {
        const measured = dedupe(res.focusThemes).slice(0, MAX_FOCUS_THEMES);
        try {
          await updateProfile({
            measuredRating: res.finalRating,
            measuredRatingConfidence: res.confidence,
            measuredAt: Date.now(),
            liveRatingSnapshot: res.finalRating,
            liveRatingSnapshotAt: Date.now(),
            measuredWeaknesses: measured,
          });
        } catch (e) {
          console.error("Placement save failed:", e);
        }
      }

      setSession(null);
      setResult(res);
      setPhase("result");
    },
    [user, profile, updateProfile, setGlobalStats, setSession]
  );

  const grade = useCallback(
    (solved: boolean) => {
      if (gradedRef.current || !currentPuzzle || !session) return;
      gradedRef.current = true;
      const idx = session.itemIndex;
      const estimateAfter = applyPlacementElo(
        session.estimate,
        currentPuzzle.rating,
        solved,
        idx
      );
      const newSession: PlacementSession = {
        ...session,
        estimate: estimateAfter,
        itemIndex: idx + 1,
        history: [
          ...session.history,
          {
            theme: planThemeFor(idx),
            puzzleRating: currentPuzzle.rating,
            solved,
            estimateAfter,
          },
        ],
        seenPuzzleIds: [...session.seenPuzzleIds, currentPuzzle.id],
      };
      setSession(newSession);
      // Brief pause so the green/red flash registers before the board swaps.
      window.setTimeout(
        () => {
          setCurrentPuzzle(null);
          if (newSession.itemIndex >= PLACEMENT_LENGTH) {
            void finalize(newSession);
          } else {
            void loadPuzzleForItem(newSession);
          }
        },
        solved ? 450 : 800
      );
    },
    [currentPuzzle, session, setSession, finalize, loadPuzzleForItem]
  );

  const startFresh = useCallback(() => {
    const seed = seedEstimate(profile?.selfReportedRating);
    const s: PlacementSession = {
      seed,
      estimate: seed,
      itemIndex: 0,
      history: [],
      seenPuzzleIds: [],
      startedAt: Date.now(),
    };
    setSession(s);
    setResult(null);
    setPhase("testing");
    void loadPuzzleForItem(s);
  }, [profile, setSession, loadPuzzleForItem]);

  const resumeOrStart = useCallback(() => {
    if (
      session &&
      session.history.length > 0 &&
      session.history.length < PLACEMENT_LENGTH
    ) {
      setPhase("testing");
      void loadPuzzleForItem(session);
    } else {
      startFresh();
    }
  }, [session, loadPuzzleForItem, startFresh]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <Panel>
        <Typography sx={{ ...TYPE.h3, color: TEXT.primary, mb: 1 }}>
          Find your chess rating
        </Typography>
        <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary, mb: 3 }}>
          Sign in to take the 20-puzzle placement test and start your training
          plan.
        </Typography>
        <PrimaryButton onClick={() => openAuthDialog()}>
          Sign in to start
        </PrimaryButton>
      </Panel>
    );
  }

  if (phase === "result" && result) {
    return (
      <Panel>
        <PlacementResult
          result={result}
          onContinue={() => router.push("/plan")}
          onRetake={startFresh}
        />
      </Panel>
    );
  }

  if (phase === "intro") {
    const hasPartial =
      !!session &&
      session.history.length > 0 &&
      session.history.length < PLACEMENT_LENGTH;
    return (
      <Panel>
        <Typography sx={{ ...TYPE.h2, color: TEXT.primary, mb: 1 }}>
          Let&apos;s find your rating.
        </Typography>
        <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary, mb: 3 }}>
          20 puzzles, adjusting to your level as you go. Get one right and the
          next is harder; miss one and it eases off. At the end you&apos;ll have
          a starting rating and a plan built on it. There&apos;s no penalty, so
          just play your best move.
        </Typography>
        <PrimaryButton onClick={resumeOrStart}>
          {hasPartial
            ? `Resume (${session!.history.length}/${PLACEMENT_LENGTH})`
            : "Start the test"}
        </PrimaryButton>
      </Panel>
    );
  }

  // testing
  const completed = session?.history.length ?? 0;
  const canFinishEarly =
    completed >= PLACEMENT_MIN_TO_FINALIZE && completed < PLACEMENT_LENGTH;
  return (
    <Panel wide>
      <Box sx={{ mb: 2 }}>
        {/* minHeight is the small button's 32px, so the row does not grow
            and nudge the board down when "Finish now" appears mid-test. */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            minHeight: 32,
            mb: 1,
          }}
        >
          <Typography
            sx={{
              ...TYPE.bodySmall,
              fontWeight: 600,
              color: TEXT.primary,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            Puzzle {Math.min(completed + 1, PLACEMENT_LENGTH)} of{" "}
            {PLACEMENT_LENGTH}
          </Typography>
          {canFinishEarly && (
            <Button
              onClick={() => session && finalize(session)}
              size="small"
              sx={{
                color: TEXT.secondary,
                fontSize: TYPE.caption.fontSize,
                minWidth: 0,
                "&:hover": { color: TEXT.primary },
              }}
            >
              Finish now
            </Button>
          )}
        </Box>
        <QuizProgress value={completed / PLACEMENT_LENGTH} />
      </Box>

      {error ? (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Typography
            role="alert"
            sx={{ ...TYPE.bodySmall, color: TEXT.primary, mb: 2 }}
          >
            {error}
          </Typography>
          <PrimaryButton onClick={() => session && loadPuzzleForItem(session)}>
            Try again
          </PrimaryButton>
        </Box>
      ) : loading || !currentPuzzle ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <Loader size={48} showLabel={false} />
        </Box>
      ) : (
        <>
          <Typography
            sx={{
              ...TYPE.bodySmall,
              fontWeight: 600,
              color: TEXT.primary,
              textAlign: "center",
              mb: 1.5,
            }}
          >
            Find the best move.
          </Typography>
          <PlacementBoard
            puzzle={{
              id: currentPuzzle.id,
              fen: currentPuzzle.fen,
              solution: currentPuzzle.solution,
              moves: currentPuzzle.moves,
            }}
            onSolved={() => grade(true)}
            onWrong={() => grade(false)}
          />
          <Box sx={{ textAlign: "center", mt: 2 }}>
            <Button
              onClick={() => grade(false)}
              sx={{
                color: TEXT.secondary,
                fontSize: TYPE.bodySmall.fontSize,
                "&:hover": { color: TEXT.primary },
              }}
            >
              Skip / I don&apos;t know
            </Button>
          </Box>
        </>
      )}
    </Panel>
  );
}

// ── Small presentational helpers (panel + primary button) ───────────────────
function Panel({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        px: 2,
        py: { xs: 3, md: 6 },
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: wide ? 600 : 480,
          p: { xs: 2.5, md: 3.5 },
          borderRadius: `${RADIUS.card}px`,
          background: SURFACE.raised,
          border: `1px solid ${LINE.hairline}`,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

function PrimaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      fullWidth
      variant="contained"
      onClick={onClick}
      sx={{ py: 1.4, fontSize: TYPE.body.fontSize }}
    >
      {children}
    </Button>
  );
}
