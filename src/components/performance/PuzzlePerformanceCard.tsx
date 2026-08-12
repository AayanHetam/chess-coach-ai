"use client";

import { useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import { PanelCard } from "./PanelCard";
import { StatTile } from "./StatTile";
import { AccuracyBar } from "./AccuracyBar";
import { WindowSelect } from "./WindowSelect";
import { puzzleStatsAtom } from "@/lib/puzzleRating";
import {
  PUZZLE_WINDOWS,
  summarizePuzzleWindow,
  type PuzzleWindow,
} from "@/lib/performance/puzzleWindow";
import { prettyTheme } from "@/components/puzzle/prettyTheme";

/**
 * Puzzle performance over a "last N" window.
 *
 * The window is the whole point: an all-time accuracy number punishes you
 * forever for puzzles you failed when you were 400 points weaker, which is
 * exactly the metric that makes people stop opening a dashboard. "Last 20" is
 * the marginal view — how you are solving now — and "All" stays available as
 * the total.
 */

/** Themes shown before the list is collapsed. Enough to see a pattern. */
const THEME_LIMIT = 8;

export function PuzzlePerformanceCard() {
  const [puzzleWindow, setPuzzleWindow] = useState<PuzzleWindow>(50);
  const stats = useAtomValue(puzzleStatsAtom);

  const summary = useMemo(
    () => summarizePuzzleWindow(stats, puzzleWindow),
    [stats, puzzleWindow]
  );

  const themes = summary.themes.slice(0, THEME_LIMIT);
  // Weakest theme with a real sample behind it. One-off failures are noise, so
  // require a few attempts before naming something as a weakness.
  const weakest = useMemo(() => {
    const eligible = summary.themes.filter(
      (t) => t.attempts >= 3 && t.accuracy !== null
    );
    if (eligible.length === 0) return null;
    return eligible.reduce((worst, t) =>
      (t.accuracy ?? 100) < (worst.accuracy ?? 100) ? t : worst
    );
  }, [summary.themes]);

  const empty = summary.sampleSize === 0;

  return (
    <PanelCard
      title="Puzzle performance"
      subtitle={
        empty
          ? "No puzzles solved yet — your first session fills this in."
          : `Your last ${summary.sampleSize} puzzle${summary.sampleSize === 1 ? "" : "s"}${
              summary.truncated && puzzleWindow !== "all"
                ? " (all you've done so far)"
                : ""
            }`
      }
      action={
        <WindowSelect
          value={puzzleWindow}
          options={PUZZLE_WINDOWS}
          onChange={setPuzzleWindow}
          noun="puzzles"
          ariaLabel="Puzzle window"
        />
      }
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" },
          gap: 1.25,
          mb: 2.5,
        }}
      >
        <StatTile
          label="Rating"
          value={String(stats.rating)}
          hint="all-time"
          tone="ember"
        />
        <StatTile
          label="Accuracy"
          value={
            summary.overallAccuracy === null
              ? null
              : `${summary.overallAccuracy}%`
          }
          hint={
            empty
              ? "no attempts"
              : `${summary.solved}/${summary.sampleSize} solved`
          }
          tone={
            summary.overallAccuracy !== null && summary.overallAccuracy >= 80
              ? "positive"
              : "default"
          }
        />
        <StatTile
          label="Streak"
          value={stats.currentStreak > 0 ? String(stats.currentStreak) : null}
          hint={`best ${stats.bestStreak}`}
        />
        <StatTile
          label="Weakest"
          value={weakest ? `${weakest.accuracy}%` : null}
          hint={weakest ? prettyTheme([weakest.theme]) : "needs 3+ tries"}
          tone={weakest ? "negative" : "default"}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: { xs: 2.5, md: 3.5 },
        }}
      >
        <Box>
          <SectionLabel>By theme</SectionLabel>
          {themes.length === 0 ? (
            <EmptyNote>
              Solve a few puzzles to see your strongest and weakest motifs.
            </EmptyNote>
          ) : (
            themes.map((t) => (
              <AccuracyBar
                key={t.theme}
                label={prettyTheme([t.theme])}
                accuracy={t.accuracy}
                solved={t.solved}
                attempts={t.attempts}
              />
            ))
          )}
          {summary.themes.length > THEME_LIMIT && (
            <Typography
              sx={{
                fontSize: "0.7rem",
                color: "rgba(255,255,255,0.32)",
                mt: 1,
              }}
            >
              +{summary.themes.length - THEME_LIMIT} more themes in this window
            </Typography>
          )}
        </Box>

        <Box>
          <SectionLabel>By difficulty</SectionLabel>
          {empty ? (
            <EmptyNote>Difficulty bands fill in as you solve.</EmptyNote>
          ) : (
            // Every band renders, including untouched ones — a missing band
            // would make the list change length between windows and hide the
            // fact that you have never tried anything above 2000.
            summary.difficulty.map((d) => (
              <AccuracyBar
                key={d.label}
                label={d.label}
                accuracy={d.accuracy}
                solved={d.solved}
                attempts={d.attempts}
              />
            ))
          )}
        </Box>
      </Box>
    </PanelCard>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: "0.7rem",
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.38)",
        mb: 0.75,
      }}
    >
      {children}
    </Typography>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.35)", py: 1 }}
    >
      {children}
    </Typography>
  );
}
