import { useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Chip,
  Divider,
  LinearProgress,
  Button,
  IconButton,
  Tooltip,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import Head from "next/head";
import { useAtomValue } from "jotai";
import { PageTitle } from "@/components/pageTitle";
import { chessMastiDarkTheme } from "@/theme/chessMasti";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import { puzzleStatsAtom, getSolveRate } from "@/lib/puzzleRating";
import { gameRecordsAtom, buildProfile, generateRecommendations } from "@/lib/playerProfile";
import { drillProgressAtom } from "@/lib/spacedRepetition";
import { useGameDatabase } from "@/hooks/useGameDatabase";
import { useAuth } from "@/contexts/AuthContext";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
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
import HistoryIcon from "@mui/icons-material/History";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import { useRouter } from "next/router";

export default function Profile() {
  const router = useRouter();
  const puzzleStats = useAtomValue(puzzleStatsAtom);
  const gameRecords = useAtomValue(gameRecordsAtom);
  const drillProgress = useAtomValue(drillProgressAtom);
  // Saved games + their (optional) coach transcripts. Pass true so the
  // hook actually triggers the cloud sync + atom population — without it
  // `games` stays empty and the tile section renders empty for signed-in
  // users who have games waiting in Firestore.
  const { games: savedGames, deleteGame } = useGameDatabase(true);
  const { user, loading: authLoading } = useAuth();

  const handleOpenSavedGame = useCallback(
    (gameId: number) => {
      router.push(`/analysis?gameId=${gameId}`);
    },
    [router],
  );
  const handleDeleteSavedGame = useCallback(
    async (gameId: number) => {
      // Hard-delete with a confirm — saved games include the coach
      // transcript, which the user might not realise dies with them.
      if (
        typeof window !== "undefined" &&
        !window.confirm(
          "Delete this saved game and its coach conversation? This can't be undone.",
        )
      ) {
        return;
      }
      try {
        await deleteGame(gameId);
      } catch (err) {
        console.warn("[profile] delete saved game failed:", err);
      }
    },
    [deleteGame],
  );
  const sortedSavedGames = useMemo(
    () =>
      [...(savedGames ?? [])].sort((a, b) => {
        // Most recently-played first. Some imports leave date undefined;
        // fall back to id (autoincrement = chronological in IndexedDB).
        const da = (a.date ?? "").replace(/\./g, "-");
        const db = (b.date ?? "").replace(/\./g, "-");
        if (da && db && da !== db) return db.localeCompare(da);
        return (b.id ?? 0) - (a.id ?? 0);
      }),
    [savedGames],
  );

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
    <ThemeProvider theme={chessMastiDarkTheme}>
      <PageTitle title="Chess Masti AI - Player Profile" />
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
        <NavPill active="profile" />
        <Box sx={{ maxWidth: 1100, mx: "auto" }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 800,
              letterSpacing: "-0.025em",
              mb: 3,
              background: "linear-gradient(135deg, #F97316, #FB923C, #FBBF24)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Your Progress Dashboard
          </Typography>

          {/* Top Stats Row */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {/* Puzzle Rating */}
            <Grid size={{ xs: 6, sm: 3 }}>
              <Paper
                sx={{
                  p: 2.5,
                  textAlign: "center",
                  borderRadius: "1rem",
                  background: "rgba(20,22,28,0.5)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
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
              <Paper
                sx={{
                  p: 2.5,
                  textAlign: "center",
                  borderRadius: "1rem",
                  background: "rgba(20,22,28,0.5)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
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
              <Paper
                sx={{
                  p: 2.5,
                  textAlign: "center",
                  borderRadius: "1rem",
                  background: "rgba(20,22,28,0.5)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
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
              <Paper
                sx={{
                  p: 2.5,
                  textAlign: "center",
                  borderRadius: "1rem",
                  background: "rgba(20,22,28,0.5)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
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
              <Paper
                sx={{
                  p: 2.5,
                  height: "100%",
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
                          contentStyle={{ backgroundColor: "rgba(20,22,28,0.92)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.94)" }}
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
              <Paper
                sx={{
                  p: 2.5,
                  height: "100%",
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
                            contentStyle={{ backgroundColor: "rgba(20,22,28,0.92)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.94)" }}
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
              <Paper
                sx={{
                  p: 2.5,
                  height: "100%",
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
                          contentStyle={{ backgroundColor: "rgba(20,22,28,0.92)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.94)" }}
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
              <Paper
                sx={{
                  p: 2.5,
                  height: "100%",
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
                      borderRadius: "10px",
                      background: "rgba(249,115,22,0.08)",
                      border: "1px solid rgba(249,115,22,0.32)",
                    }}
                  >
                    <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.9)" }}>
                      {rec}
                    </Typography>
                  </Box>
                ))}
              </Paper>
            </Grid>
          </Grid>

          {/* Puzzle Theme Performance */}
          {Object.keys(puzzleStats.themeStats).length > 0 && (
            <Paper
              sx={{
                p: 2.5,
                mb: 3,
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
                              ? "rgba(34,197,94,0.14)"
                              : rate >= 40
                              ? "rgba(251,191,36,0.14)"
                              : "rgba(239,68,68,0.14)",
                          border:
                            rate >= 70
                              ? "1px solid rgba(34,197,94,0.3)"
                              : rate >= 40
                              ? "1px solid rgba(251,191,36,0.3)"
                              : "1px solid rgba(239,68,68,0.3)",
                          color:
                            rate >= 70
                              ? "#86efac"
                              : rate >= 40
                              ? "#FBBF24"
                              : "#fca5a5",
                          fontSize: "0.75rem",
                        }}
                      />
                    );
                  })}
              </Box>
            </Paper>
          )}

          {/* Saved Games — click-to-reopen with coach transcript hydration
              per feat/coach-transcript-persistence (#76). Hidden for guests
              since the underlying useGameDatabase + cloud sync require
              auth. */}
          {user && (
            <Paper
              sx={{
                position: "relative",
                p: 2.5,
                mb: 3,
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
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "grey.100" }}>
                  Saved Games
                  {sortedSavedGames.length > 0 && (
                    <Typography
                      component="span"
                      variant="caption"
                      sx={{ ml: 1, color: "grey.500", fontWeight: 500 }}
                    >
                      ({sortedSavedGames.length})
                    </Typography>
                  )}
                </Typography>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => router.push("/analysis")}
                  sx={{
                    textTransform: "none",
                    color: "#FB923C",
                    "&:hover": { color: "#FDBA74", bgcolor: "rgba(249,115,22,0.08)" },
                  }}
                >
                  Analyse a new game →
                </Button>
              </Box>
              {sortedSavedGames.length === 0 ? (
                <Box
                  sx={{
                    p: 3,
                    textAlign: "center",
                    borderRadius: "12px",
                    border: "1px dashed rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.02)",
                    color: "rgba(255,255,255,0.5)",
                  }}
                >
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    No games saved yet.
                  </Typography>
                  <Typography variant="caption" sx={{ color: "grey.600" }}>
                    Save a game on /analysis and it'll show up here with the coach conversation intact.
                  </Typography>
                </Box>
              ) : (
                <Grid container spacing={1.5}>
                  {sortedSavedGames.map((g) => {
                    const whiteName = g.white?.name || "White";
                    const blackName = g.black?.name || "Black";
                    const whiteElo = g.white?.rating;
                    const blackElo = g.black?.rating;
                    const transcript = (g as typeof g & {
                      coachTranscript?: Array<{ role: string; content: string }>;
                    }).coachTranscript;
                    const transcriptCount = transcript?.length ?? 0;
                    return (
                      <Grid size={{ xs: 12, sm: 6 }} key={g.id}>
                        <Box
                          sx={{
                            p: 1.75,
                            borderRadius: "12px",
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(20,22,28,0.5)",
                            backdropFilter: "blur(14px) saturate(140%)",
                            WebkitBackdropFilter: "blur(14px) saturate(140%)",
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                            transition: "all 200ms cubic-bezier(0.22,0.61,0.36,1)",
                            "&:hover": {
                              borderColor: "rgba(249,115,22,0.4)",
                              background:
                                "linear-gradient(180deg, rgba(249,115,22,0.06), rgba(20,22,28,0.6))",
                              boxShadow:
                                "0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(249,115,22,0.18)",
                            },
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600, color: "grey.100", lineHeight: 1.35 }}
                            >
                              {whiteName}
                              {whiteElo ? (
                                <Typography component="span" variant="caption" sx={{ color: "grey.500", ml: 0.5 }}>
                                  ({whiteElo})
                                </Typography>
                              ) : null}
                              <Typography component="span" sx={{ color: "grey.600", mx: 0.5 }}>
                                vs
                              </Typography>
                              {blackName}
                              {blackElo ? (
                                <Typography component="span" variant="caption" sx={{ color: "grey.500", ml: 0.5 }}>
                                  ({blackElo})
                                </Typography>
                              ) : null}
                            </Typography>
                            {g.result && g.result !== "*" && (
                              <Chip
                                label={g.result}
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: "0.65rem",
                                  background: "rgba(255,255,255,0.06)",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  color: "rgba(255,255,255,0.7)",
                                  fontFamily: "Monaco, Menlo, monospace",
                                }}
                              />
                            )}
                          </Box>
                          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, alignItems: "center" }}>
                            {g.event && (
                              <Typography variant="caption" sx={{ color: "grey.500" }}>
                                {g.event}
                              </Typography>
                            )}
                            {g.date && (
                              <Typography variant="caption" sx={{ color: "grey.600" }}>
                                · {g.date.replace(/\./g, "-")}
                              </Typography>
                            )}
                            {transcriptCount > 0 && (
                              <Tooltip title={`${transcriptCount} coach message${transcriptCount === 1 ? "" : "s"} saved`}>
                                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, ml: "auto" }}>
                                  <ForumOutlinedIcon sx={{ fontSize: 14, color: "#FB923C" }} />
                                  <Typography variant="caption" sx={{ color: "#FB923C", fontWeight: 600 }}>
                                    {transcriptCount}
                                  </Typography>
                                </Box>
                              </Tooltip>
                            )}
                          </Box>
                          <Box sx={{ display: "flex", gap: 0.75, mt: 0.5 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<PlayArrowIcon sx={{ fontSize: 16 }} />}
                              onClick={() => handleOpenSavedGame(g.id)}
                              sx={{
                                textTransform: "none",
                                fontSize: "0.78rem",
                                py: 0.4,
                                borderRadius: "10px",
                                color: "#FB923C",
                                borderColor: "rgba(249,115,22,0.4)",
                                transition: "all 180ms ease",
                                "&:hover": {
                                  borderColor: "rgba(249,115,22,0.6)",
                                  bgcolor: "rgba(249,115,22,0.08)",
                                },
                              }}
                            >
                              Open
                            </Button>
                            <IconButton
                              size="small"
                              aria-label="Delete saved game"
                              onClick={() => handleDeleteSavedGame(g.id)}
                              sx={{
                                color: "rgba(255,255,255,0.5)",
                                transition: "all 180ms ease",
                                "&:hover": { color: "#fca5a5", bgcolor: "rgba(239,68,68,0.12)" },
                              }}
                            >
                              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Box>
                        </Box>
                      </Grid>
                    );
                  })}
                </Grid>
              )}
            </Paper>
          )}
          {!user && !authLoading && (
            <Paper
              sx={{
                p: 2.5,
                mb: 3,
                textAlign: "center",
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
              <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.9)", mb: 1 }}>
                Sign in to save analyzed games and their coach conversations.
              </Typography>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.55)" }}>
                Each save persists the PGN, Stockfish eval, and the full chat — so you can pick up where you left off on any device.
              </Typography>
            </Paper>
          )}

          {/* Quick Actions */}
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
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "grey.100", mb: 2 }}>
              Quick Actions
            </Typography>
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
              <Button
                variant="outlined"
                startIcon={<ExtensionIcon />}
                onClick={() => router.push("/practice")}
                sx={{
                  textTransform: "none",
                  borderRadius: "12px",
                  color: "#FB923C",
                  borderColor: "rgba(249,115,22,0.4)",
                  transition: "all 180ms ease",
                  "&:hover": {
                    borderColor: "rgba(249,115,22,0.6)",
                    bgcolor: "rgba(249,115,22,0.08)",
                  },
                }}
              >
                Practice Puzzles
              </Button>
              <Button
                variant="outlined"
                startIcon={<HistoryIcon />}
                onClick={() => router.push("/puzzles/sessions")}
                sx={{
                  textTransform: "none",
                  borderRadius: "12px",
                  color: "#FB923C",
                  borderColor: "rgba(249,115,22,0.4)",
                  transition: "all 180ms ease",
                  "&:hover": {
                    borderColor: "rgba(249,115,22,0.6)",
                    bgcolor: "rgba(249,115,22,0.08)",
                  },
                }}
              >
                Puzzle Sessions
              </Button>
              <Button
                variant="outlined"
                startIcon={<MenuBookIcon />}
                onClick={() => router.push("/openings")}
                sx={{
                  textTransform: "none",
                  borderRadius: "12px",
                  color: "#FB923C",
                  borderColor: "rgba(249,115,22,0.4)",
                  transition: "all 180ms ease",
                  "&:hover": {
                    borderColor: "rgba(249,115,22,0.6)",
                    bgcolor: "rgba(249,115,22,0.08)",
                  },
                }}
              >
                Drill Openings
              </Button>
              <Button
                variant="outlined"
                startIcon={<SchoolIcon />}
                onClick={() => router.push("/analysis")}
                sx={{
                  textTransform: "none",
                  borderRadius: "12px",
                  color: "#FB923C",
                  borderColor: "rgba(249,115,22,0.4)",
                  transition: "all 180ms ease",
                  "&:hover": {
                    borderColor: "rgba(249,115,22,0.6)",
                    bgcolor: "rgba(249,115,22,0.08)",
                  },
                }}
              >
                Analyze a Game
              </Button>
            </Box>
          </Paper>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
