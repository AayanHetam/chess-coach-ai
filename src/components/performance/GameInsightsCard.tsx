"use client";

import { useMemo } from "react";
import { Box, Chip, Tooltip, Typography } from "@mui/material";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  YAxis,
} from "recharts";
import { PanelCard } from "./PanelCard";
import { StatTile } from "./StatTile";
import { computeGameInsights } from "@/lib/performance/insights";
import { MoveClassification } from "@/types/enums";
import type { Game } from "@/types/game";
import { useAuth } from "@/contexts/AuthContext";
import { LINE, RADIUS, SURFACE, TEXT, TYPE } from "@/theme/tokens";

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

function accuracyTone(
  value: number | null
): "default" | "positive" | "negative" {
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
    [games, profile?.chesscomUsername, profile?.lichessUsername]
  );

  const chartData = useMemo(
    () =>
      insights.accuracyTrend.map((p, i) => ({
        i,
        accuracy: Math.round(p.accuracy * 10) / 10,
      })),
    [insights.accuracyTrend]
  );

  if (!hasUsername) {
    return (
      <PanelCard title="Mistakes in your games">
        <Box
          sx={{
            p: 3,
            textAlign: "center",
            borderRadius: `${RADIUS.control}px`,
            border: `1px dashed ${LINE.strong}`,
            background: SURFACE.raisedSecondary,
          }}
        >
          <Typography sx={{ ...TYPE.bodySmall, color: TEXT.primary, mb: 0.5 }}>
            Link your chess.com or Lichess username
          </Typography>
          <Typography sx={{ ...TYPE.caption, color: TEXT.secondary }}>
            That&rsquo;s how we know which side is you. Analyze and save a game
            afterward and phase accuracy and blunder patterns build up here.
          </Typography>
          <Chip
            label="Add your username"
            onClick={onLinkAccount}
            size="small"
            variant="outlined"
            sx={{
              mt: 2,
              cursor: "pointer",
              color: TEXT.primary,
              borderColor: LINE.strong,
              "&:hover": { background: "rgba(255,255,255,0.06)" },
            }}
          />
        </Box>
      </PanelCard>
    );
  }

  if (insights.gamesAnalyzed === 0) {
    return (
      <PanelCard title="Mistakes in your games">
        <Typography
          sx={{
            ...TYPE.caption,
            color: TEXT.secondary,
            textAlign: "center",
            py: 2,
          }}
        >
          Analyze one of your games above and save it. Phase accuracy and
          blunder patterns show up here once Stockfish has finished.
        </Typography>
      </PanelCard>
    );
  }

  const patternEntries = PATTERN_ORDER.map((cls) => ({
    cls,
    count: insights.classificationCounts[cls] ?? 0,
  })).filter((e) => e.count > 0);

  return (
    <PanelCard
      title="Mistakes in your games"
      subtitle={`${insights.gamesAnalyzed} analyzed game${insights.gamesAnalyzed === 1 ? "" : "s"}`}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 1.25,
          mb: 2,
        }}
      >
        <StatTile
          label="Avg accuracy"
          value={
            insights.avgAccuracy !== null
              ? insights.avgAccuracy.toFixed(1)
              : null
          }
          tone={accuracyTone(insights.avgAccuracy)}
        />
        <StatTile
          label="Games analyzed"
          value={String(insights.gamesAnalyzed)}
        />
      </Box>

      {chartData.length >= MIN_TREND_POINTS && (
        <Box
          sx={{ width: "100%", height: { xs: 130, md: 160 }, mx: -0.5, mb: 2 }}
        >
          <ResponsiveContainer>
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <YAxis hide domain={[0, 100]} />
              <RechartsTooltip
                cursor={{ stroke: LINE.strong }}
                contentStyle={{
                  background: SURFACE.raisedTertiary,
                  border: `1px solid ${LINE.hairline}`,
                  borderRadius: RADIUS.small,
                  fontSize: 12,
                  color: TEXT.primary,
                }}
                labelFormatter={() => ""}
                formatter={(value: number) => [`${value}%`, "Accuracy"]}
              />
              {/* The series keeps its colour; the fill under it is one flat 12%. */}
              <Area
                type="monotone"
                dataKey="accuracy"
                stroke="#42a5f5"
                strokeWidth={2}
                fill="#42a5f5"
                fillOpacity={0.12}
                dot={false}
                activeDot={{ r: 3, fill: "#42a5f5", stroke: "none" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      )}

      <Typography sx={{ ...TYPE.label, color: TEXT.secondary, mb: 0.75 }}>
        Phase accuracy
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1.25,
          mb: patternEntries.length ? 2 : 0,
        }}
      >
        <StatTile
          label="Opening"
          value={
            insights.phaseAccuracy.opening !== null
              ? insights.phaseAccuracy.opening.toFixed(1)
              : null
          }
          tone={accuracyTone(insights.phaseAccuracy.opening)}
        />
        <StatTile
          label="Middlegame"
          value={
            insights.phaseAccuracy.middlegame !== null
              ? insights.phaseAccuracy.middlegame.toFixed(1)
              : null
          }
          tone={accuracyTone(insights.phaseAccuracy.middlegame)}
        />
        <StatTile
          label="Endgame"
          value={
            insights.phaseAccuracy.endgame !== null
              ? insights.phaseAccuracy.endgame.toFixed(1)
              : null
          }
          tone={accuracyTone(insights.phaseAccuracy.endgame)}
        />
      </Box>

      {patternEntries.length > 0 && (
        <>
          <Typography sx={{ ...TYPE.label, color: TEXT.secondary, mb: 0.75 }}>
            Your patterns
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {patternEntries.map(({ cls, count }) => (
              <Tooltip
                key={cls}
                title={`${count} across your ${insights.gamesAnalyzed} analyzed game${insights.gamesAnalyzed === 1 ? "" : "s"}`}
              >
                {/* A classification chip: the glyph colour on a 14% tint of it. */}
                <Chip
                  label={`${PATTERN_LABEL[cls]} · ${count}`}
                  size="small"
                  sx={{
                    bgcolor: `${PATTERN_COLOR[cls]}24`,
                    color: PATTERN_COLOR[cls],
                    fontSize: TYPE.caption.fontSize,
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
