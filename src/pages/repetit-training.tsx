/**
 * Repetit Training Page
 *
 * View all AI-suggested puzzle sets saved from the coach chat.
 * - Shows list of training sets (e.g., "Repetit Training: King Safety")
 * - Progress for each set (10/20 completed, 85% accuracy)
 * - Click to continue practicing
 * - XP and streak stats
 */

import React, { useEffect, useState } from "react";
import {
  getAllTrainingSets,
  getUserStats,
  deleteTrainingSet,
  RepetitTrainingSet,
  UserPuzzleStats,
} from "@/lib/repetitTraining";
import { useRouter } from "next/router";
import { useSetAtom } from "jotai";
import { PageTitle } from "@/components/pageTitle";
import { Box, Stack, Typography, Button, IconButton } from "@mui/material";
import { ThemeProvider, alpha } from "@mui/material/styles";
import Head from "next/head";
import { Target, Check, Trash2 } from "lucide-react";
import {
  Masti,
  MastiAvatar,
  MastiSays,
  scoreMood,
  type MastiMood,
} from "@/components/masti";
import { chessMastiDarkTheme } from "@/theme/chessMasti";
import { NavPill } from "@/components/ui/NavPill";
import {
  practicePuzzlesAtom,
  currentPuzzleIndexAtom,
  practiceThemeAtom,
} from "@/sections/practice/states";
import {
  ACCENT,
  LINE,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

const CARD_SX = {
  borderRadius: `${RADIUS.card}px`,
  background: SURFACE.raised,
  border: `1px solid ${LINE.hairline}`,
} as const;

/**
 * Until the localStorage read in the mount effect lands, every stat is
 * unknown. An em-dash is what "unknown" looks like; the point is that it
 * occupies a line box of exactly the same height as a number, so the card
 * is its final size from the server HTML onward.
 */
const PENDING = "\u2014";
const pct = (v: number | undefined) => (v === undefined ? PENDING : `${v}%`);
// Wording preserved exactly, including the "1 days" this says at a streak of
// one. That is a real nit and not this change's business: a copy edit inside
// a layout-stability diff is a thing a reviewer has to stop and think about.
const days = (v: number | undefined) =>
  v === undefined ? PENDING : `${v} days`;

export default function RepetitTrainingPage() {
  const router = useRouter();
  const [trainingSets, setTrainingSets] = useState<RepetitTrainingSet[]>([]);
  const [userStats, setUserStats] = useState<UserPuzzleStats | null>(null);
  const setPracticePuzzles = useSetAtom(practicePuzzlesAtom);
  const setCurrentPuzzleIndex = useSetAtom(currentPuzzleIndexAtom);
  const setPracticeTheme = useSetAtom(practiceThemeAtom);

  useEffect(() => {
    // Load training sets and stats
    const sets = getAllTrainingSets();
    setTrainingSets(sets);

    const stats = getUserStats("current-user"); // TODO: Replace with actual user ID
    setUserStats(stats);
  }, []);

  // Masti reads the stats the page already loads: no attempts is a wave, a
  // strong accuracy a celebration, a weak one a worried face. While the list
  // is empty the animated figure is the empty state's, not the header's.
  const heroMood: MastiMood = userStats
    ? scoreMood(userStats.totalSolved, userStats.totalAttempts)
    : "wave";
  const heroLine = heroLineFor(heroMood, userStats);

  const handleContinueTraining = (set: RepetitTrainingSet) => {
    // Load puzzles into practice mode
    setPracticePuzzles(set.puzzles);

    // Start from first unsolved puzzle
    const firstUnsolvedIndex = set.puzzles.findIndex(
      (p) => !set.completedPuzzleIds.includes(p.id)
    );
    setCurrentPuzzleIndex(firstUnsolvedIndex >= 0 ? firstUnsolvedIndex : 0);
    setPracticeTheme(set.theme);

    router.push({
      pathname: "/practice",
      query: {
        theme: set.theme,
        setId: set.id,
      },
    });
  };

  const handleDeleteSet = (setId: string) => {
    if (confirm("Delete this training set? Your progress will be lost.")) {
      deleteTrainingSet(setId);
      setTrainingSets(getAllTrainingSets());
    }
  };

  return (
    <ThemeProvider theme={chessMastiDarkTheme}>
      <PageTitle title="Repetit training · Chess Masti AI" />
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content={SURFACE.page} />
      </Head>

      <Box
        sx={{
          minHeight: "100vh",
          color: TEXT.primary,
          pt: 2,
          pb: 4,
          px: { xs: 2, md: 3 },
        }}
      >
        <NavPill />

        <Box sx={{ maxWidth: 1200, mx: "auto" }}>
          {/* Header */}
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 2,
              mb: 4,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Stack
                direction="row"
                alignItems="center"
                spacing={1.5}
                sx={{ mb: 0.75 }}
              >
                <Target
                  size={24}
                  strokeWidth={1.75}
                  color={TEXT.secondary}
                  aria-hidden
                />
                <Typography
                  component="h1"
                  sx={{
                    ...TYPE.h1,
                    fontSize: { xs: "1.75rem", md: TYPE.h1.fontSize },
                    color: TEXT.primary,
                  }}
                >
                  Repetit training
                </Typography>
              </Stack>
              <Typography sx={{ ...TYPE.body, color: TEXT.secondary }}>
                Spaced repetition: puzzle sets Masti suggests to strengthen your
                tactical vision
              </Typography>
            </Box>
            {/* A still while the list is empty: the empty state below carries
                the animated figure, so one burst plays per view. */}
            <MastiSays
              mood={heroMood}
              size={96}
              side="right"
              maxWidth={340}
              animated={trainingSets.length > 0}
              priority
              data-testid="repetit-masti"
            >
              {heroLine}
            </MastiSays>
          </Box>

          {/* User Stats Card, one flat surface.
              Rendered unconditionally, and that is the point: getUserStats()
              never returns null (no stored stats gives you a zeroed record),
              so this card appears on every single load. Gating it on
              `userStats` meant it was absent from the server HTML and the
              first paint, then inserted ~250px of card above the training
              sets the moment the effect ran — 0.26 of CLS, every visit,
              measured on production. Placeholder dashes hold the exact final
              height until the numbers arrive, so nothing below ever moves. */}
          <Box
            sx={{
              ...CARD_SX,
              overflow: "hidden",
              p: 3,
              mb: 4,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 3,
            }}
          >
            <StatCard label="Total solved" value={userStats?.totalSolved} />
            <StatCard label="Accuracy" value={pct(userStats?.accuracy)} />
            <StatCard label="XP" value={userStats?.xp} />
            <StatCard
              label="Current streak"
              value={days(userStats?.currentStreak)}
            />
            <StatCard
              label="Longest streak"
              value={days(userStats?.longestStreak)}
            />
          </Box>

          {/* Training Sets Grid */}
          {trainingSets.length === 0 ? (
            <Box
              sx={{
                ...CARD_SX,
                textAlign: "center",
                py: 8,
                px: 4,
                overflow: "hidden",
              }}
            >
              {/* The copy under him says it, so the figure is decorative. */}
              <Masti
                mood="idea"
                size={110}
                loops={2}
                decorative
                style={{ marginBottom: 12 }}
              />
              <Typography sx={{ ...TYPE.h4, color: TEXT.primary, mb: 2 }}>
                No training sets yet
              </Typography>
              <Typography sx={{ color: TEXT.secondary }}>
                Ask Masti to suggest practice puzzles and they&apos;ll appear
                here.
              </Typography>
              <Button
                variant="contained"
                onClick={() => router.push("/")}
                sx={{ mt: 3 }}
              >
                Talk to Masti
              </Button>
            </Box>
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: 3,
              }}
            >
              {trainingSets
                .sort((a, b) => b.createdAt - a.createdAt) // Newest first
                .map((set) => (
                  <TrainingSetCard
                    key={set.id}
                    set={set}
                    onContinue={() => handleContinueTraining(set)}
                    onDelete={() => handleDeleteSet(set.id)}
                  />
                ))}
            </Box>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

/** Masti's one-liner for the header, from the same stats the hero card prints. */
function heroLineFor(mood: MastiMood, stats: UserPuzzleStats | null): string {
  if (!stats || mood === "wave") {
    return "Ask me for puzzles in the coach chat and I'll build you a set to drill here.";
  }
  switch (mood) {
    case "excited":
      return `${stats.accuracy}% accuracy across ${stats.totalSolved} solved. That's the kind of repetition that sticks.`;
    case "idea":
      return `${stats.accuracy}% so far. Repetition is the point: the ones you miss today come back tomorrow.`;
    case "nervous":
      return `${stats.accuracy}% accuracy. Look for the checks and captures first, and the sets get easier.`;
    default:
      return "Nothing solved yet. Every set starts at zero, and I'll be there for every miss.";
  }
}

function StatCard({
  label,
  value,
}: {
  label: string;
  /** undefined while the stats are still being read — renders as an em-dash. */
  value: string | number | undefined;
}) {
  return (
    <Box sx={{ textAlign: "center" }}>
      {/* The size and leading are the placeholder's too, so the card holds
          its final height before the numbers land. */}
      <Typography
        sx={{
          ...TYPE.h2,
          fontSize: "2rem",
          fontWeight: 700,
          lineHeight: 1.1,
          color: TEXT.primary,
          fontVariantNumeric: "tabular-nums",
          mb: 0.25,
        }}
      >
        {value ?? PENDING}
      </Typography>
      <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
        {label}
      </Typography>
    </Box>
  );
}

function TrainingSetCard({
  set,
  onContinue,
  onDelete,
}: {
  set: RepetitTrainingSet;
  onContinue: () => void;
  onDelete: () => void;
}) {
  const completedCount = set.completedPuzzleIds.length;
  const totalCount = set.puzzles.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const isCompleted = completedCount === totalCount && totalCount > 0;
  // The set's recap face: solved out of attempted, from the progress the card
  // already prints. An untouched set is a wave. A set saved before
  // attemptedPuzzleIds existed counts its solves as its attempts.
  const attemptedCount = Math.max(
    set.attemptedPuzzleIds?.length ?? 0,
    completedCount
  );
  const cardMood = scoreMood(completedCount, attemptedCount);

  return (
    <Box
      sx={{
        ...CARD_SX,
        position: "relative",
        p: 3,
        overflow: "hidden",
      }}
    >
      {/* Completed: a status tag, with the icon and the word. */}
      {isCompleted && (
        <Box
          sx={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            bgcolor: STATUS.successTint,
            color: STATUS.success,
            px: 1,
            py: 0.25,
            borderRadius: `${RADIUS.small}px`,
            fontSize: TYPE.caption.fontSize,
            fontWeight: 600,
          }}
        >
          <Check size={12} aria-hidden />
          Completed
        </Box>
      )}

      {/* Title. Repeated cards get a still avatar, never an animated figure. */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ mb: 0.5, pr: 11 }}
      >
        <MastiAvatar mood={cardMood} size={28} />
        <Typography
          component="h2"
          sx={{ ...TYPE.h5, color: TEXT.primary, minWidth: 0 }}
        >
          {set.displayName}
        </Typography>
      </Stack>

      {/* Meta info */}
      <Typography sx={{ ...TYPE.caption, color: TEXT.secondary, mb: 2 }}>
        {new Date(set.createdAt).toLocaleDateString()} · {totalCount} puzzles
        {set.difficulty && ` · ${set.difficulty}`}
      </Typography>

      {/* Progress Bar */}
      <Box
        sx={{
          background: LINE.hairline,
          borderRadius: 4,
          height: 8,
          mb: 1.5,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            height: "100%",
            width: `${progress}%`,
            borderRadius: 4,
            background: ACCENT.main,
          }}
        />
      </Box>

      {/* Stats */}
      <Box
        sx={{
          display: "flex",
          gap: 2,
          mb: 2,
          fontSize: TYPE.bodySmall.fontSize,
        }}
      >
        <Box>
          <Box component="span" sx={{ color: TEXT.secondary }}>
            Progress:{" "}
          </Box>
          <Box
            component="span"
            sx={{
              color: TEXT.primary,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {completedCount}/{totalCount}
          </Box>
        </Box>
        {set.accuracy > 0 && (
          <Box>
            <Box component="span" sx={{ color: TEXT.secondary }}>
              Accuracy:{" "}
            </Box>
            {/* A pass/warning threshold, said in the status colours. */}
            <Box
              component="span"
              sx={{
                color: set.accuracy >= 80 ? STATUS.success : STATUS.warning,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {set.accuracy}%
            </Box>
          </Box>
        )}
      </Box>

      {/* Actions */}
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button
          onClick={onContinue}
          fullWidth
          sx={{
            // The quiet tinted action: one per card, so not the solid ember.
            flex: 1,
            background: ACCENT.tint,
            color: ACCENT.hover,
            "&:hover": { background: alpha(ACCENT.main, 0.22) },
          }}
        >
          {isCompleted ? "Review" : "Continue"}
        </Button>
        <IconButton
          onClick={onDelete}
          aria-label="Delete training set"
          sx={{
            px: 1.25,
            color: TEXT.secondary,
            border: `1px solid ${LINE.hairline}`,
            "&:hover": { color: STATUS.error },
          }}
        >
          <Trash2 size={16} strokeWidth={1.75} aria-hidden />
        </IconButton>
      </Box>
    </Box>
  );
}
