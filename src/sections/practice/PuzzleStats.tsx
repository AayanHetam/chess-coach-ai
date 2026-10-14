import { Box, Typography, Paper, Chip, Tooltip } from "@mui/material";
import { useAtomValue } from "jotai";
import { puzzleStatsAtom, getSolveRate, formatTime } from "@/lib/puzzleRating";
import { themeAccent } from "@/components/ui/accents";
import {
  ACCENT,
  LINE,
  RADIUS,
  SHADOW,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import TimerIcon from "@mui/icons-material/Timer";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from "recharts";

interface PuzzleStatsProps {
  compact?: boolean;
}

export default function PuzzleStats({ compact = false }: PuzzleStatsProps) {
  const stats = useAtomValue(puzzleStatsAtom);
  const solveRate = getSolveRate(stats);

  if (stats.totalAttempts === 0 && compact) {
    return null;
  }

  const statCards = [
    {
      label: "Puzzle rating",
      value: stats.rating,
      icon: <TrendingUpIcon sx={{ fontSize: 18 }} />,
    },
    {
      label: "Solve rate",
      value: `${solveRate}%`,
      icon: <CheckCircleIcon sx={{ fontSize: 18 }} />,
    },
    {
      label: "Average time",
      value: stats.totalAttempts > 0 ? formatTime(stats.averageTimeMs) : "-",
      icon: <TimerIcon sx={{ fontSize: 18 }} />,
    },
    {
      label: "Best streak",
      value: stats.bestStreak,
      icon: <WhatshotIcon sx={{ fontSize: 18 }} />,
    },
  ];

  // Prepare chart data
  const chartData = stats.ratingHistory.map((pt) => ({
    time: new Date(pt.timestamp).toLocaleDateString(),
    rating: pt.rating,
  }));

  if (compact) {
    return (
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        {statCards.map((card) => (
          <Tooltip key={card.label} title={card.label}>
            <Chip
              icon={card.icon}
              label={
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {`${card.value}`}
                </span>
              }
              size="small"
            />
          </Tooltip>
        ))}
      </Box>
    );
  }

  return (
    <Paper
      sx={{
        p: 2.5,
        borderRadius: `${RADIUS.card}px`,
        background: SURFACE.raised,
        border: `1px solid ${LINE.hairline}`,
        overflow: "hidden",
      }}
    >
      <Typography sx={{ ...TYPE.h5, mb: 2, color: TEXT.primary }}>
        Your puzzle stats
      </Typography>

      {/* Stat tiles */}
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        {statCards.map((card) => (
          <Paper
            key={card.label}
            sx={{
              flex: 1,
              minWidth: 100,
              p: 1.5,
              background: SURFACE.raisedSecondary,
              border: `1px solid ${LINE.hairline}`,
              textAlign: "center",
              borderRadius: `${RADIUS.control}px`,
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                mb: 0.5,
                color: TEXT.secondary,
              }}
            >
              {card.icon}
            </Box>
            <Typography
              variant="h6"
              sx={{
                color: TEXT.primary,
                lineHeight: 1.2,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {card.value}
            </Typography>
            <Typography variant="caption" sx={{ color: TEXT.secondary }}>
              {card.label}
            </Typography>
          </Paper>
        ))}
      </Box>

      {/* Summary */}
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <Typography variant="caption" sx={{ color: TEXT.secondary }}>
          Total:{" "}
          <strong style={{ color: TEXT.primary }}>{stats.totalAttempts}</strong>{" "}
          puzzles
        </Typography>
        <Typography variant="caption" sx={{ color: TEXT.secondary }}>
          Solved:{" "}
          <strong style={{ color: STATUS.success }}>{stats.totalSolved}</strong>
        </Typography>
        <Typography variant="caption" sx={{ color: TEXT.secondary }}>
          Failed:{" "}
          <strong style={{ color: STATUS.error }}>{stats.totalFailed}</strong>
        </Typography>
        <Typography variant="caption" sx={{ color: TEXT.secondary }}>
          Current streak:{" "}
          <strong style={{ color: STATUS.warning }}>
            {stats.currentStreak}
          </strong>
        </Typography>
      </Box>

      {/* Rating chart */}
      {stats.ratingHistory.length > 2 && (
        <Box sx={{ mt: 2 }}>
          <Typography
            variant="caption"
            sx={{ color: TEXT.secondary, mb: 1, display: "block" }}
          >
            Rating history
          </Typography>
          <Box sx={{ width: "100%", height: 120 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <XAxis dataKey="time" hide />
                <YAxis domain={["dataMin - 50", "dataMax + 50"]} hide />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: SURFACE.raisedTertiary,
                    border: `1px solid ${LINE.hairline}`,
                    borderRadius: RADIUS.small,
                    boxShadow: SHADOW.floating,
                    color: TEXT.primary,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: TEXT.secondary }}
                />
                <Line
                  type="monotone"
                  dataKey="rating"
                  stroke={ACCENT.main}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: ACCENT.main }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Box>
      )}

      {/* Theme breakdown */}
      {Object.keys(stats.themeStats).length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography
            variant="caption"
            sx={{ color: TEXT.secondary, mb: 1, display: "block" }}
          >
            Theme performance
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {Object.entries(stats.themeStats)
              .sort((a, b) => b[1].attempts - a[1].attempts)
              .slice(0, 10)
              .map(([theme, data]) => {
                const rate =
                  data.attempts > 0
                    ? Math.round((data.solved / data.attempts) * 100)
                    : 0;
                // Each theme keeps its one sitewide identity colour (fork is
                // always gold, pin always cyan) as a quiet tag tint; the rate
                // itself is printed in the label, so no signal rides on
                // colour alone.
                const a = themeAccent(theme);
                return (
                  <Tooltip
                    key={theme}
                    title={`${data.solved}/${data.attempts} solved (${rate}%) | Avg: ${formatTime(data.avgTimeMs)}`}
                  >
                    <Chip
                      label={`${theme} ${rate}%`}
                      size="small"
                      sx={{
                        bgcolor: a.soft,
                        color: a.bright,
                        fontSize: TYPE.caption.fontSize,
                      }}
                    />
                  </Tooltip>
                );
              })}
          </Box>
        </Box>
      )}
    </Paper>
  );
}
