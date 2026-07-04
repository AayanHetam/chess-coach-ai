"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { Loader } from "@/components/ui/Loader";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PeopleIcon from "@mui/icons-material/People";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { PageTitle } from "@/components/pageTitle";
import {
  getSiteStats,
  getDailyVisitStats,
  getPageBreakdown,
  type SiteStats,
  type DailyStats,
} from "@/lib/visitorTracker";

const PAGE_COLORS = [
  "#ff9800", "#42a5f5", "#66bb6a", "#ef5350", "#ab47bc",
  "#26c6da", "#ffca28", "#8d6e63", "#78909c", "#ec407a",
];

export default function SiteStatsPage() {
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [pageBreakdown, setPageBreakdown] = useState<{ path: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [daysBack, setDaysBack] = useState<number>(30);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d, p] = await Promise.all([
        getSiteStats(),
        getDailyVisitStats(daysBack),
        getPageBreakdown(daysBack),
      ]);
      setStats(s);
      setDailyStats(d);
      setPageBreakdown(p);
    } catch (err) {
      console.error("Failed to load site stats:", err);
    } finally {
      setLoading(false);
    }
  }, [daysBack]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalRecentVisits = dailyStats.reduce((acc, d) => acc + d.visits, 0);
  const totalRecentUnique = dailyStats.reduce((acc, d) => acc + d.uniqueVisitors, 0);
  const avgDailyVisits = dailyStats.length > 0 ? Math.round(totalRecentVisits / dailyStats.length) : 0;

  // Format daily stats for chart
  const chartData = dailyStats.map((d) => ({
    date: d.date.slice(5), // MM-DD
    visits: d.visits,
    unique: d.uniqueVisitors,
  }));

  return (
    <>
      <PageTitle title="Chess Masti AI - Site Analytics" />
      <Box sx={{ width: "100%", maxWidth: "100vw", p: { xs: 1, md: 2 } }}>
        <Box sx={{ maxWidth: 1100, mx: "auto" }}>
          {/* Header */}
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3, flexWrap: "wrap", gap: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Site Analytics
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <ToggleButtonGroup
                value={daysBack}
                exclusive
                onChange={(_, val) => val && setDaysBack(val)}
                size="small"
              >
                <ToggleButton value={7} sx={{ textTransform: "none", fontSize: "0.75rem" }}>7d</ToggleButton>
                <ToggleButton value={30} sx={{ textTransform: "none", fontSize: "0.75rem" }}>30d</ToggleButton>
                <ToggleButton value={90} sx={{ textTransform: "none", fontSize: "0.75rem" }}>90d</ToggleButton>
              </ToggleButtonGroup>
              <Button
                size="small"
                startIcon={<RefreshIcon />}
                onClick={loadData}
                sx={{ textTransform: "none" }}
              >
                Refresh
              </Button>
            </Box>
          </Box>

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <Loader size={48} showLabel={false} />
            </Box>
          ) : (
            <>
              {/* Top Stats Cards */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Paper sx={{ p: 2, textAlign: "center", bgcolor: "grey.900", borderRadius: 2 }}>
                    <VisibilityIcon sx={{ color: "primary.main", mb: 0.5 }} />
                    <Typography variant="h4" sx={{ fontWeight: 800, color: "primary.light" }}>
                      {stats?.totalVisits?.toLocaleString() ?? 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "grey.500" }}>
                      Total Page Views
                    </Typography>
                  </Paper>
                </Grid>

                <Grid size={{ xs: 6, sm: 3 }}>
                  <Paper sx={{ p: 2, textAlign: "center", bgcolor: "grey.900", borderRadius: 2 }}>
                    <PeopleIcon sx={{ color: "success.main", mb: 0.5 }} />
                    <Typography variant="h4" sx={{ fontWeight: 800, color: "success.light" }}>
                      {stats?.totalUniqueVisitors?.toLocaleString() ?? 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "grey.500" }}>
                      Unique Visitors
                    </Typography>
                  </Paper>
                </Grid>

                <Grid size={{ xs: 6, sm: 3 }}>
                  <Paper sx={{ p: 2, textAlign: "center", bgcolor: "grey.900", borderRadius: 2 }}>
                    <TrendingUpIcon sx={{ color: "warning.main", mb: 0.5 }} />
                    <Typography variant="h4" sx={{ fontWeight: 800, color: "warning.light" }}>
                      {totalRecentVisits.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "grey.500" }}>
                      Views ({daysBack}d)
                    </Typography>
                  </Paper>
                </Grid>

                <Grid size={{ xs: 6, sm: 3 }}>
                  <Paper sx={{ p: 2, textAlign: "center", bgcolor: "grey.900", borderRadius: 2 }}>
                    <TrendingUpIcon sx={{ color: "info.main", mb: 0.5 }} />
                    <Typography variant="h4" sx={{ fontWeight: 800, color: "info.light" }}>
                      {avgDailyVisits}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "grey.500" }}>
                      Avg Daily Views
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              {/* Traffic Over Time Chart */}
              <Paper sx={{ p: 2.5, bgcolor: "grey.900", borderRadius: 2, mb: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "grey.100", mb: 1 }}>
                  Traffic Over Time
                </Typography>
                {chartData.length > 0 ? (
                  <Box sx={{ width: "100%", height: 280 }}>
                    <ResponsiveContainer>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ff9800" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#ff9800" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorUnique" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#42a5f5" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#42a5f5" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#777" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#777" }} allowDecimals={false} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: "#333", border: "none", borderRadius: 8, fontSize: 12 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="visits"
                          name="Page Views"
                          stroke="#ff9800"
                          fillOpacity={1}
                          fill="url(#colorVisits)"
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="unique"
                          name="Unique Visitors"
                          stroke="#42a5f5"
                          fillOpacity={1}
                          fill="url(#colorUnique)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
                    <Typography variant="body2" sx={{ color: "grey.500" }}>
                      No traffic data yet — visits will appear here as users browse the site
                    </Typography>
                  </Box>
                )}
              </Paper>

              {/* Page Breakdown */}
              <Grid container spacing={2}>
                {/* Bar Chart */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2.5, bgcolor: "grey.900", borderRadius: 2, height: "100%" }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "grey.100", mb: 1 }}>
                      Most Visited Pages
                    </Typography>
                    {pageBreakdown.length > 0 ? (
                      <Box sx={{ width: "100%", height: 280 }}>
                        <ResponsiveContainer>
                          <BarChart
                            data={pageBreakdown.slice(0, 8)}
                            layout="vertical"
                            margin={{ left: 60 }}
                          >
                            <XAxis type="number" tick={{ fontSize: 10, fill: "#777" }} allowDecimals={false} />
                            <YAxis
                              type="category"
                              dataKey="path"
                              tick={{ fontSize: 11, fill: "#aaa" }}
                              width={80}
                            />
                            <RechartsTooltip
                              contentStyle={{ backgroundColor: "#333", border: "none", borderRadius: 8, fontSize: 12 }}
                            />
                            <Bar dataKey="count" name="Views" radius={[0, 4, 4, 0]}>
                              {pageBreakdown.slice(0, 8).map((_, i) => (
                                <Cell key={i} fill={PAGE_COLORS[i % PAGE_COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </Box>
                    ) : (
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
                        <Typography variant="body2" sx={{ color: "grey.500" }}>
                          No page data yet
                        </Typography>
                      </Box>
                    )}
                  </Paper>
                </Grid>

                {/* Table */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2.5, bgcolor: "grey.900", borderRadius: 2, height: "100%" }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "grey.100", mb: 1 }}>
                      Page Details
                    </Typography>
                    {pageBreakdown.length > 0 ? (
                      <TableContainer sx={{ maxHeight: 280 }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ bgcolor: "grey.900", color: "grey.400", fontWeight: 700, fontSize: "0.75rem" }}>
                                Page
                              </TableCell>
                              <TableCell align="right" sx={{ bgcolor: "grey.900", color: "grey.400", fontWeight: 700, fontSize: "0.75rem" }}>
                                Views
                              </TableCell>
                              <TableCell align="right" sx={{ bgcolor: "grey.900", color: "grey.400", fontWeight: 700, fontSize: "0.75rem" }}>
                                % Total
                              </TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {pageBreakdown.map((page) => (
                              <TableRow key={page.path}>
                                <TableCell sx={{ color: "grey.200", fontSize: "0.8rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                  <Chip
                                    label={page.path || "/"}
                                    size="small"
                                    sx={{ fontSize: "0.72rem", bgcolor: "rgba(255,152,0,0.1)", color: "primary.light" }}
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ color: "grey.100", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                  {page.count.toLocaleString()}
                                </TableCell>
                                <TableCell align="right" sx={{ color: "grey.400", fontSize: "0.8rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                  {totalRecentVisits > 0
                                    ? `${((page.count / totalRecentVisits) * 100).toFixed(1)}%`
                                    : "0%"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
                        <Typography variant="body2" sx={{ color: "grey.500" }}>
                          No page data yet
                        </Typography>
                      </Box>
                    )}
                  </Paper>
                </Grid>
              </Grid>
            </>
          )}
        </Box>
      </Box>
    </>
  );
}
