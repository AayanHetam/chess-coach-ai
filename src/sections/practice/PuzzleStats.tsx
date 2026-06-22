import { Box, Typography, Paper, Chip, Tooltip } from "@mui/material";
import { useAtomValue } from "jotai";
import { puzzleStatsAtom, getSolveRate, formatTime } from "@/lib/puzzleRating";
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
      label: "Puzzle Rating",
      value: stats.rating,
      icon: <TrendingUpIcon sx={{ fontSize: 18 }} />,
      color: "primary.light",
    },
    {
      label: "Solve Rate",
      value: `${solveRate}%`,
      icon: <CheckCircleIcon sx={{ fontSize: 18 }} />,
      color: "success.light",
    },
    {
      label: "Avg Time",
      value: stats.totalAttempts > 0 ? formatTime(stats.averageTimeMs) : "-",
      icon: <TimerIcon sx={{ fontSize: 18 }} />,
      color: "info.light",
    },
    {
      label: "Best Streak",
      value: stats.bestStreak,
      icon: <WhatshotIcon sx={{ fontSize: 18 }} />,
      color: "warning.light",
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
                <span style={{ fontFamily: "Monaco, monospace" }}>{`${card.value}`}</span>
              }
              size="small"
              sx={{
                bgcolor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.85)",
                borderRadius: "999px",
                "& .MuiChip-icon": { color: card.color },
              }}
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
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: "rgba(255,255,255,0.94)" }}>
        Your Puzzle Stats
      </Typography>

      {/* Stat cards */}
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        {statCards.map((card) => (
          <Paper
            key={card.label}
            sx={{
              flex: 1,
              minWidth: 100,
              p: 1.5,
              bgcolor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              textAlign: "center",
              borderRadius: "1rem",
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "center", mb: 0.5, color: card.color }}>
              {card.icon}
            </Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: "rgba(255,255,255,0.94)",
                lineHeight: 1.2,
                fontFamily: "Monaco, monospace",
              }}
            >
              {card.value}
            </Typography>
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.55)" }}>
              {card.label}
            </Typography>
          </Paper>
        ))}
      </Box>

      {/* Summary */}
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.55)" }}>
          Total: <strong style={{ color: "rgba(255,255,255,0.85)" }}>{stats.totalAttempts}</strong> puzzles
        </Typography>
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.55)" }}>
          Solved: <strong style={{ color: "#66bb6a" }}>{stats.totalSolved}</strong>
        </Typography>
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.55)" }}>
          Failed: <strong style={{ color: "#ef5350" }}>{stats.totalFailed}</strong>
        </Typography>
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.55)" }}>
          Current Streak: <strong style={{ color: "#ffa726" }}>{stats.currentStreak}</strong>
        </Typography>
      </Box>

      {/* Rating chart */}
      {stats.ratingHistory.length > 2 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.55)", mb: 1, display: "block" }}>
            Rating History
          </Typography>
          <Box sx={{ width: "100%", height: 120 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <XAxis dataKey="time" hide />
                <YAxis
                  domain={["dataMin - 50", "dataMax + 50"]}
                  hide
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "rgba(20,22,28,0.92)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                />
                <Line
                  type="monotone"
                  dataKey="rating"
                  stroke="#42a5f5"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#42a5f5" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Box>
      )}

      {/* Theme breakdown */}
      {Object.keys(stats.themeStats).length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.55)", mb: 1, display: "block" }}>
            Theme Performance
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {Object.entries(stats.themeStats)
              .sort((a, b) => b[1].attempts - a[1].attempts)
              .slice(0, 10)
              .map(([theme, data]) => {
                const rate = data.attempts > 0 ? Math.round((data.solved / data.attempts) * 100) : 0;
                return (
                  <Tooltip
                    key={theme}
                    title={`${data.solved}/${data.attempts} solved (${rate}%) | Avg: ${formatTime(data.avgTimeMs)}`}
                  >
                    <Chip
                      label={`${theme} ${rate}%`}
                      size="small"
                      sx={{
                        bgcolor: rate >= 70 ? "rgba(76,175,80,0.15)" : rate >= 40 ? "rgba(255,193,7,0.15)" : "rgba(244,67,54,0.15)",
                        color: rate >= 70 ? "success.light" : rate >= 40 ? "warning.light" : "error.light",
                        border: "1px solid rgba(255,255,255,0.06)",
                        fontSize: "0.7rem",
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
