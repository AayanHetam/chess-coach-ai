import { useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Chip,
  Divider,
  LinearProgress,
  Button,
} from "@mui/material";
import { useAtomValue } from "jotai";
import { PageTitle } from "@/components/pageTitle";
import { puzzleStatsAtom, getSolveRate, formatTime } from "@/lib/puzzleRating";
import { gameRecordsAtom, buildProfile, generateRecommendations } from "@/lib/playerProfile";
import { drillProgressAtom } from "@/lib/spacedRepetition";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import SchoolIcon from "@mui/icons-material/School";
import WarningIcon from "@mui/icons-material/Warning";
import ExtensionIcon from "@mui/icons-material/Extension";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import { useRouter } from "next/router";

export default function Profile() {
  const router = useRouter();
  const puzzleStats = useAtomValue(puzzleStatsAtom);
  const gameRecords = useAtomValue(gameRecordsAtom);
  const drillProgress = useAtomValue(drillProgressAtom);

  const profile = useMemo(() => buildProfile(gameRecords), [gameRecords]);
  const recommendations = useMemo(() => generateRecommendations(profile), [profile]);
  const solveRate = getSolveRate(puzzleStats);

  // Puzzle rating chart data
  const ratingChartData = puzzleStats.ratingHistory.map((pt) => ({
    time: new Date(pt.timestamp).toLocaleDateString(),
    rating: pt.rating,
  }));

  // Phase accuracy chart data
  const phaseData = [
    { phase: "Opening", accuracy: profile.avgOpeningAccuracy, fill: "#42a5f5" },
    { phase: "Middlegame", accuracy: profile.avgMiddlegameAccuracy, fill: "#ffa726" },
    { phase: "Endgame", accuracy: profile.avgEndgameAccuracy, fill: "#66bb6a" },
  ];

  // Win/Draw/Loss data
  const resultData = [
    { name: "Wins", value: profile.wins, fill: "#66bb6a" },
    { name: "Draws", value: profile.draws, fill: "#bdbdbd" },
    { name: "Losses", value: profile.losses, fill: "#ef5350" },
  ].filter((d) => d.value > 0);

  // Opening drill progress
  const drillEntries = Object.values(drillProgress);
  const totalDrilled = drillEntries.filter((d) => d.attempts > 0).length;
  const avgDrillAccuracy =
    drillEntries.length > 0
      ? Math.round(
          (drillEntries
            .filter((d) => d.attempts > 0)
            .reduce((acc, d) => acc + (d.correctFirstTry / d.attempts) * 100, 0) /
            Math.max(1, drillEntries.filter((d) => d.attempts > 0).length)) *
            10
        ) / 10
      : 0;

  return (
    <>
      <PageTitle title="Chess Masti AI - Player Profile" />
      <Box sx={{ width: "100%", maxWidth: "100vw", p: { xs: 1, md: 2 } }}>
        <Box sx={{ maxWidth: 1100, mx: "auto" }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
            Your Progress Dashboard
          </Typography>

          {/* Top Stats Row */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {/* Puzzle Rating */}
            <Grid size={{ xs: 6, sm: 3 }}>
              <Paper sx={{ p: 2, textAlign: "center", bgcolor: "grey.900", borderRadius: 2 }}>
                <ExtensionIcon sx={{ color: "primary.main", mb: 0.5 }} />
                <Typography variant="h4" sx={{ fontWeight: 800, color: "primary.light" }}>
                  {puzzleStats.rating}
                </Typography>
                <Typography variant="caption" sx={{ color: "grey.500" }}>
                  Puzzle Rating
                </Typography>
              </Paper>
            </Grid>

            {/* Games Played */}
            <Grid size={{ xs: 6, sm: 3 }}>
              <Paper sx={{ p: 2, textAlign: "center", bgcolor: "grey.900", borderRadius: 2 }}>
                <EmojiEventsIcon sx={{ color: "warning.main", mb: 0.5 }} />
                <Typography variant="h4" sx={{ fontWeight: 800, color: "grey.100" }}>
                  {profile.totalGames}
                </Typography>
                <Typography variant="caption" sx={{ color: "grey.500" }}>
                  Games Analyzed
                </Typography>
              </Paper>
            </Grid>

            {/* Puzzles Solved */}
            <Grid size={{ xs: 6, sm: 3 }}>
              <Paper sx={{ p: 2, textAlign: "center", bgcolor: "grey.900", borderRadius: 2 }}>
                <TrendingUpIcon sx={{ color: "success.main", mb: 0.5 }} />
                <Typography variant="h4" sx={{ fontWeight: 800, color: "success.light" }}>
                  {puzzleStats.totalSolved}
                </Typography>
                <Typography variant="caption" sx={{ color: "grey.500" }}>
                  Puzzles Solved ({solveRate}%)
                </Typography>
              </Paper>
            </Grid>

            {/* Opening Lines */}
            <Grid size={{ xs: 6, sm: 3 }}>
              <Paper sx={{ p: 2, textAlign: "center", bgcolor: "grey.900", borderRadius: 2 }}>
                <MenuBookIcon sx={{ color: "info.main", mb: 0.5 }} />
                <Typography variant="h4" sx={{ fontWeight: 800, color: "info.light" }}>
                  {totalDrilled}
                </Typography>
                <Typography variant="caption" sx={{ color: "grey.500" }}>
                  Opening Lines Learned
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          {/* Charts Row */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {/* Puzzle Rating History */}
            <Grid size={{ xs: 12, md: 8 }}>
              <Paper sx={{ p: 2.5, bgcolor: "grey.900", borderRadius: 2, height: "100%" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "grey.100", mb: 1 }}>
                  Puzzle Rating Over Time
                </Typography>
                {ratingChartData.length > 2 ? (
                  <Box sx={{ width: "100%", height: 200 }}>
                    <ResponsiveContainer>
                      <LineChart data={ratingChartData}>
                        <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#777" }} />
                        <YAxis domain={["dataMin - 50", "dataMax + 50"]} tick={{ fontSize: 10, fill: "#777" }} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: "#333", border: "none", borderRadius: 8, fontSize: 12 }}
                        />
                        <Line type="monotone" dataKey="rating" stroke="#42a5f5" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
                    <Typography variant="body2" sx={{ color: "grey.500" }}>
                      Solve more puzzles to see your rating chart
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Grid>

            {/* Win/Draw/Loss */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2.5, bgcolor: "grey.900", borderRadius: 2, height: "100%" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "grey.100", mb: 1 }}>
                  Game Results
                </Typography>
                {resultData.length > 0 ? (
                  <>
                    <Box sx={{ width: "100%", height: 160, display: "flex", justifyContent: "center" }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={resultData}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={65}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {resultData.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            contentStyle={{ backgroundColor: "#333", border: "none", borderRadius: 8, fontSize: 12 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "center", gap: 2 }}>
                      <Typography variant="caption" sx={{ color: "#66bb6a" }}>W: {profile.wins}</Typography>
                      <Typography variant="caption" sx={{ color: "#bdbdbd" }}>D: {profile.draws}</Typography>
                      <Typography variant="caption" sx={{ color: "#ef5350" }}>L: {profile.losses}</Typography>
                    </Box>
                  </>
                ) : (
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160 }}>
                    <Typography variant="body2" sx={{ color: "grey.500" }}>
                      Analyze games to see results
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Grid>
          </Grid>

          {/* Phase Accuracy + Recommendations */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {/* Phase Accuracy */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 2.5, bgcolor: "grey.900", borderRadius: 2, height: "100%" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "grey.100", mb: 2 }}>
                  Phase Accuracy
                </Typography>
                {profile.totalGames > 0 ? (
                  <Box sx={{ width: "100%", height: 180 }}>
                    <ResponsiveContainer>
                      <BarChart data={phaseData}>
                        <XAxis dataKey="phase" tick={{ fontSize: 12, fill: "#aaa" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#777" }} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: "#333", border: "none", borderRadius: 8, fontSize: 12 }}
                          formatter={(value: number) => [`${value}%`, "Accuracy"]}
                        />
                        <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                          {phaseData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: 180 }}>
                    <Typography variant="body2" sx={{ color: "grey.500" }}>
                      Analyze games to see phase accuracy
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Grid>

            {/* Recommendations */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 2.5, bgcolor: "grey.900", borderRadius: 2, height: "100%" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                  <LightbulbIcon sx={{ color: "warning.main" }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "grey.100" }}>
                    Training Recommendations
                  </Typography>
                </Box>
                {recommendations.map((rec, i) => (
                  <Box
                    key={i}
                    sx={{
                      p: 1.5,
                      mb: 1,
                      borderRadius: 1,
                      bgcolor: "rgba(255,167,38,0.06)",
                      border: "1px solid rgba(255,167,38,0.15)",
                    }}
                  >
                    <Typography variant="body2" sx={{ color: "grey.200" }}>
                      {rec}
                    </Typography>
                  </Box>
                ))}
              </Paper>
            </Grid>
          </Grid>

          {/* Puzzle Theme Performance */}
          {Object.keys(puzzleStats.themeStats).length > 0 && (
            <Paper sx={{ p: 2.5, bgcolor: "grey.900", borderRadius: 2, mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "grey.100", mb: 2 }}>
                Puzzle Theme Performance
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {Object.entries(puzzleStats.themeStats)
                  .sort((a, b) => b[1].attempts - a[1].attempts)
                  .slice(0, 20)
                  .map(([theme, data]) => {
                    const rate = data.attempts > 0 ? Math.round((data.solved / data.attempts) * 100) : 0;
                    return (
                      <Chip
                        key={theme}
                        label={`${theme}: ${rate}% (${data.solved}/${data.attempts})`}
                        size="small"
                        sx={{
                          bgcolor:
                            rate >= 70
                              ? "rgba(76,175,80,0.12)"
                              : rate >= 40
                              ? "rgba(255,193,7,0.12)"
                              : "rgba(244,67,54,0.12)",
                          color:
                            rate >= 70
                              ? "success.light"
                              : rate >= 40
                              ? "warning.light"
                              : "error.light",
                          fontSize: "0.75rem",
                        }}
                      />
                    );
                  })}
              </Box>
            </Paper>
          )}

          {/* Quick Actions */}
          <Paper sx={{ p: 2.5, bgcolor: "grey.900", borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "grey.100", mb: 2 }}>
              Quick Actions
            </Typography>
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
              <Button
                variant="outlined"
                startIcon={<ExtensionIcon />}
                onClick={() => router.push("/practice")}
                sx={{ textTransform: "none" }}
              >
                Practice Puzzles
              </Button>
              <Button
                variant="outlined"
                startIcon={<MenuBookIcon />}
                onClick={() => router.push("/openings")}
                sx={{ textTransform: "none" }}
              >
                Drill Openings
              </Button>
              <Button
                variant="outlined"
                startIcon={<SchoolIcon />}
                onClick={() => router.push("/analysis")}
                sx={{ textTransform: "none" }}
              >
                Analyze a Game
              </Button>
            </Box>
          </Paper>
        </Box>
      </Box>
    </>
  );
}
