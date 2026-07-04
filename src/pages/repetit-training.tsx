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
import { ThemeProvider } from "@mui/material/styles";
import Head from "next/head";
import { Target, Check, Trash2, Inbox } from "lucide-react";
import { chessMastiDarkTheme } from "@/theme/chessMasti";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import {
  practicePuzzlesAtom,
  currentPuzzleIndexAtom,
  practiceThemeAtom,
} from "@/sections/practice/states";

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
      <PageTitle title="Chess Masti AI - Repetit Training" />
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#08090C" />
        <style>{`html,body{background-color:#08090C;color-scheme:dark;margin:0;}::-webkit-scrollbar{width:10px;height:10px;}::-webkit-scrollbar-track{background:#08090C;}::-webkit-scrollbar-thumb{background:rgba(249,115,22,0.18);border-radius:5px;}`}</style>
      </Head>

      <GradientBackdrop />

      <Box
        sx={{
          minHeight: "100vh",
          color: "rgba(255,255,255,0.94)",
          pt: 2,
          pb: 4,
          px: { xs: 2, md: 3 },
        }}
      >
        <NavPill />

        <Box sx={{ maxWidth: 1200, mx: "auto" }}>
          {/* Header */}
          <Box sx={{ mb: 4 }}>
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: "0.72rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.5)",
                mb: 1,
              }}
            >
              Spaced Repetition
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.75 }}>
              <Target size={28} color="#FB923C" />
              <Typography
                variant="h3"
                sx={{ fontWeight: 700, color: "rgba(255,255,255,0.94)" }}
              >
                Repetit Training
              </Typography>
            </Stack>
            <Typography sx={{ color: "rgba(255,255,255,0.62)", fontSize: "1.1rem" }}>
              AI-suggested puzzle sets to strengthen your tactical vision
            </Typography>
          </Box>

          {/* User Stats Card — single ember-tinted hero surface */}
          {userStats && (
            <Box
              sx={{
                borderRadius: "2rem",
                background:
                  "linear-gradient(135deg, rgba(249,115,22,0.08), rgba(20,22,28,0.6))",
                backdropFilter: "blur(14px) saturate(140%)",
                WebkitBackdropFilter: "blur(14px) saturate(140%)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow:
                  "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
                overflow: "hidden",
                p: 3,
                mb: 4,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 3,
              }}
            >
              <StatCard label="Total Solved" value={userStats.totalSolved} />
              <StatCard label="Accuracy" value={`${userStats.accuracy}%`} />
              <StatCard label="XP" value={userStats.xp} />
              <StatCard label="Current Streak" value={`${userStats.currentStreak} days`} />
              <StatCard label="Longest Streak" value={`${userStats.longestStreak} days`} />
            </Box>
          )}

          {/* Training Sets Grid */}
          {trainingSets.length === 0 ? (
            <Box
              sx={{
                textAlign: "center",
                py: 8,
                px: 4,
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
              <Box sx={{ mb: 2, display: "flex", justifyContent: "center" }}>
                <Inbox size={40} color="rgba(255,255,255,0.4)" />
              </Box>
              <Typography sx={{ fontSize: "1.2rem", color: "rgba(255,255,255,0.62)", mb: 2 }}>
                No training sets yet
              </Typography>
              <Typography sx={{ color: "rgba(255,255,255,0.5)" }}>
                Ask the AI coach to suggest practice puzzles, and they'll appear here!
              </Typography>
              <Button
                onClick={() => router.push("/")}
                sx={{
                  mt: 3,
                  bgcolor: "#F97316",
                  color: "#0A0A0A",
                  fontWeight: 700,
                  borderRadius: "999px",
                  px: 3,
                  py: 1.25,
                  textTransform: "none",
                  boxShadow: "0 6px 18px rgba(249,115,22,0.32)",
                  transition: "all 180ms ease",
                  "&:hover": { bgcolor: "#FB923C" },
                }}
              >
                Go to AI Coach
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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Box sx={{ textAlign: "center" }}>
      <Typography
        sx={{
          fontSize: "2rem",
          fontWeight: 700,
          color: "#FB923C",
          fontFamily: "Monaco, monospace",
          lineHeight: 1.1,
          mb: 0.25,
        }}
      >
        {value}
      </Typography>
      <Typography sx={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.62)" }}>
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

  return (
    <Box
      sx={{
        position: "relative",
        borderRadius: "1.5rem",
        p: 3,
        background: "rgba(20,22,28,0.55)",
        backdropFilter: "blur(14px) saturate(140%)",
        WebkitBackdropFilter: "blur(14px) saturate(140%)",
        boxShadow: isCompleted
          ? "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(249,115,22,0.18)"
          : "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
        border: isCompleted
          ? "1px solid rgba(249,115,22,0.35)"
          : "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
        transition: "all 180ms ease",
      }}
    >
      {/* Completed Badge — ember active chip */}
      {isCompleted && (
        <Box
          sx={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            bgcolor: "rgba(249,115,22,0.18)",
            border: "1px solid rgba(249,115,22,0.4)",
            color: "#FB923C",
            px: 1,
            py: 0.4,
            borderRadius: "999px",
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.06em",
          }}
        >
          <Check size={12} />
          COMPLETED
        </Box>
      )}

      {/* Title */}
      <Typography
        component="h3"
        sx={{
          fontSize: "1.25rem",
          fontWeight: 600,
          mb: 0.5,
          color: "rgba(255,255,255,0.94)",
          pr: 11,
        }}
      >
        {set.displayName}
      </Typography>

      {/* Meta info */}
      <Typography sx={{ color: "rgba(255,255,255,0.62)", fontSize: "0.85rem", mb: 2 }}>
        {new Date(set.createdAt).toLocaleDateString()} • {totalCount} puzzles
        {set.difficulty && ` • ${set.difficulty}`}
      </Typography>

      {/* Progress Bar */}
      <Box
        sx={{
          background: "rgba(255,255,255,0.08)",
          borderRadius: "999px",
          height: 8,
          mb: 1.5,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            height: "100%",
            width: `${progress}%`,
            borderRadius: "999px",
            background: "linear-gradient(90deg, #F97316, #FB923C)",
            transition: "width 0.3s ease",
          }}
        />
      </Box>

      {/* Stats */}
      <Box sx={{ display: "flex", gap: 2, mb: 2, fontSize: "0.9rem" }}>
        <Box>
          <Box component="span" sx={{ color: "rgba(255,255,255,0.62)" }}>
            Progress:{" "}
          </Box>
          <Box
            component="span"
            sx={{
              color: "rgba(255,255,255,0.94)",
              fontWeight: 600,
              fontFamily: "Monaco, monospace",
            }}
          >
            {completedCount}/{totalCount}
          </Box>
        </Box>
        {set.accuracy > 0 && (
          <Box>
            <Box component="span" sx={{ color: "rgba(255,255,255,0.62)" }}>
              Accuracy:{" "}
            </Box>
            {/* SEMANTIC data color (pass/warning threshold) — intentionally kept green/amber, NOT ember-ified */}
            <Box
              component="span"
              sx={{
                color: set.accuracy >= 80 ? "#4CAF50" : "#FFC107",
                fontWeight: 600,
                fontFamily: "Monaco, monospace",
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
            flex: 1,
            borderRadius: "12px",
            py: 1,
            textTransform: "none",
            fontWeight: 700,
            fontSize: "0.95rem",
            color: "#FB923C",
            background: "rgba(249,115,22,0.18)",
            border: "1px solid rgba(249,115,22,0.4)",
            transition: "all 180ms ease",
            "&:hover": { background: "rgba(249,115,22,0.28)" },
          }}
        >
          {isCompleted ? "Review" : "Continue"}
        </Button>
        <IconButton
          onClick={onDelete}
          aria-label="Delete training set"
          sx={{
            borderRadius: "12px",
            px: 1.25,
            color: "rgba(239,68,68,0.85)",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            transition: "all 180ms ease",
            "&:hover": {
              background: "rgba(239,68,68,0.12)",
              borderColor: "rgba(239,68,68,0.4)",
              color: "#EF4444",
            },
          }}
        >
          <Trash2 size={16} />
        </IconButton>
      </Box>
    </Box>
  );
}
