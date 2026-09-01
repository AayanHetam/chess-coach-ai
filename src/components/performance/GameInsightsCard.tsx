"use client";

import { useMemo } from "react";
import { Box, Chip, Tooltip, Typography } from "@mui/material";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RechartsTooltip, YAxis } from "recharts";
import { PanelCard } from "./PanelCard";
import { StatTile } from "./StatTile";
import { computeGameInsights } from "@/lib/performance/insights";
import { MoveClassification } from "@/types/enums";
import type { Game } from "@/types/game";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Phase accuracy + blunder-pattern breakdown across the user's saved,
 * analyzed games. The exact gap profile.tsx's own docstring calls out:
 * "Phase accuracy has no source at all and is gone until one exists." The
 * source is `computeGameInsights` — see src/lib/performance/insights.ts for
 * how it reads eval.positions/eval.accuracy that were already being computed
 * and discarded.
 */

const MIN_TREND_POINTS = 3;

// Only the categories worth a player's attention as "patterns" — Best/
// Excellent/Good/Okay/Forced/Opening are the majority of any game and would
// crowd out the signal in a small chip row.
const PATTERN_ORDER: MoveClassification[] = [
  MoveClassification.Blunder,
  MoveClassification.Mistake,
  MoveClassification.Miss,
  MoveClassification.Inaccuracy,
];

const PATTERN_COLOR: Record<string, string> = {
  [MoveClassification.Blunder]: "#ef4444",
  [MoveClassification.Mistake]: "#FB923C",
  [MoveClassification.Miss]: "#F87171",
  [MoveClassification.Inaccuracy]: "#FBBF24",
};

const PATTERN_LABEL: Record<string, string> = {
  [MoveClassification.Blunder]: "Blunders",
  [MoveClassification.Mistake]: "Mistakes",
  [MoveClassification.Miss]: "Missed wins",
  [MoveClassification.Inaccuracy]: "Inaccuracies",
};

function accuracyTone(value: number | null): "default" | "positive" | "negative" {
  if (value === null) return "default";
  if (value >= 80) return "positive";
  if (value < 60) return "negative";
  return "default";
}

export function GameInsightsCard({
  games,
  onLinkAccount,
}: {
  games: Game[];
  onLinkAccount: () => void;
}) {
  const { profile } = useAuth();
  const usernames = [profile?.chesscomUsername, profile?.lichessUsername];
  const hasUsername = usernames.some(Boolean);

  const insights = useMemo(
    () => computeGameInsights(games, usernames),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [games, profile?.chesscomUsername, profile?.lichessUsername],
  );

  const chartData = useMemo(
    () => insights.accuracyTrend.map((p, i) => ({ i, accuracy: Math.round(p.accuracy * 10) / 10 })),
    [insights.accuracyTrend],
  );

  if (!hasUsername) {
    return (
      <PanelCard title="Game insights">
        <Box
          sx={{
            p: 3,
            textAlign: "center",
            borderRadius: "0.9rem",
            border: "1px dashed rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <Typography sx={{ fontSize: "0.88rem", color: "rgba(255,255,255,0.75)", mb: 0.5 }}>
            Link your chess.com or Lichess username
          </Typography>
          <Typography sx={{ fontSize: "0.76rem", color: "rgba(255,255,255,0.45)" }}>
            That&rsquo;s how we know which side is you. Analyze and save a game
            afterward and phase accuracy + blunder patterns build up here.
          </Typography>
          <Chip
            label="Add your username"
            onClick={onLinkAccount}
            size="small"
            sx={{
              mt: 2,
              cursor: "pointer",
              color: "#FB923C",
              border: "1px solid rgba(249,115,22,0.4)",
              background: "transparent",
              "&:hover": { background: "rgba(249,115,22,0.1)" },
            }}
          />
        </Box>
      </PanelCard>
    );
  }

  if (insights.gamesAnalyzed === 0) {
    return (
      <PanelCard title="Game insights">
        <Typography sx={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.45)", textAlign: "center", py: 2 }}>
          Analyze one of your games above and save it — phase accuracy and
          blunder patterns show up here once Stockfish has finished.
        </Typography>
      </PanelCard>
    );
  }

  const patternEntries = PATTERN_ORDER
    .map((cls) => ({ cls, count: insights.classificationCounts[cls] ?? 0 }))
    .filter((e) => e.count > 0);

  return (
    <PanelCard
      title="Game insights"
      subtitle={`${insights.gamesAnalyzed} analyzed game${insights.gamesAnalyzed === 1 ? "" : "s"}`}
    >
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1.25, mb: 2 }}>
        <StatTile
          label="Avg accuracy"
          value={insights.avgAccuracy !== null ? insights.avgAccuracy.toFixed(1) : null}
          tone={accuracyTone(insights.avgAccuracy)}
        />
        <StatTile label="Games analyzed" value={String(insights.gamesAnalyzed)} />
      </Box>

      {chartData.length >= MIN_TREND_POINTS && (
        <Box sx={{ width: "100%", height: { xs: 130, md: 160 }, mx: -0.5, mb: 2 }}>
          <ResponsiveContainer>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="insightsAccuracyFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#42a5f5" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#42a5f5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={[0, 100]} />
              <RechartsTooltip
                cursor={{ stroke: "rgba(255,255,255,0.18)" }}
                contentStyle={{
                  background: "rgba(18,20,26,0.96)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.9)",
                }}
                labelFormatter={() => ""}
                formatter={(value: number) => [`${value}%`, "Accuracy"]}
              />
              <Area
                type="monotone"
                dataKey="accuracy"
                stroke="#42a5f5"
                strokeWidth={2}
                fill="url(#insightsAccuracyFill)"
                dot={false}
                activeDot={{ r: 3, fill: "#42a5f5", stroke: "none" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      )}

      <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)", mb: 0.75 }}>
        Phase accuracy
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.25, mb: patternEntries.length ? 2 : 0 }}>
        <StatTile
          label="Opening"
          value={insights.phaseAccuracy.opening !== null ? insights.phaseAccuracy.opening.toFixed(1) : null}
          tone={accuracyTone(insights.phaseAccuracy.opening)}
        />
        <StatTile
          label="Middlegame"
          value={insights.phaseAccuracy.middlegame !== null ? insights.phaseAccuracy.middlegame.toFixed(1) : null}
          tone={accuracyTone(insights.phaseAccuracy.middlegame)}
        />
        <StatTile
          label="Endgame"
          value={insights.phaseAccuracy.endgame !== null ? insights.phaseAccuracy.endgame.toFixed(1) : null}
          tone={accuracyTone(insights.phaseAccuracy.endgame)}
        />
      </Box>

      {patternEntries.length > 0 && (
        <>
          <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)", mb: 0.75 }}>
            Your patterns
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {patternEntries.map(({ cls, count }) => (
              <Tooltip key={cls} title={`${count} across your ${insights.gamesAnalyzed} analyzed game${insights.gamesAnalyzed === 1 ? "" : "s"}`}>
                <Chip
                  label={`${PATTERN_LABEL[cls]} · ${count}`}
                  size="small"
                  sx={{
                    bgcolor: `${PATTERN_COLOR[cls]}22`,
                    color: PATTERN_COLOR[cls],
                    border: `1px solid ${PATTERN_COLOR[cls]}55`,
                    fontSize: "0.72rem",
                    fontWeight: 600,
                  }}
                />
              </Tooltip>
            ))}
          </Box>
        </>
      )}
    </PanelCard>
  );
}
