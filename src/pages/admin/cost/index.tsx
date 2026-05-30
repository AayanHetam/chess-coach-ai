import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import {
  Box,
  Container,
  Paper,
  Stack,
  Typography,
  Chip,
  Button,
  CircularProgress,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  LinearProgress,
  Tooltip,
  Switch,
  FormControlLabel,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useViewer } from "@/hooks/useViewer";
import { INTERN_THEME_COLOR_DARK } from "@/constants";
import type { LLMStatsSnapshot, LLMModelTotals } from "@/lib/llmStatsAggregator";
import {
  estimateBaselineCostUSD,
  estimateCostUSD,
  getPricing,
} from "@/lib/llmPricing";

const AUTO_REFRESH_INTERVAL_MS = 10_000;

interface StatsResponse {
  snapshot: LLMStatsSnapshot;
  notes: { scope: string; generatedAt: string };
}

interface ModelRow {
  model: string;
  displayName: string;
  provider: string;
  totals: LLMModelTotals;
  costUSD: number | null;
  baselineCostUSD: number | null;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return formatNumber(n);
}

function formatUSD(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)}m`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function relativeTime(ts: number | undefined): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export default function AdminCost() {
  const router = useRouter();
  const { user, isAdmin, loading: viewerLoading } = useViewer();
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Auto-refresh poll. Only runs when the toggle is on. Battery- and
  // bandwidth-friendly by default — admins opt in when they're actively
  // watching the dashboard (e.g. during a load test or a demo).
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setRefreshTick((t) => t + 1);
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    if (viewerLoading) return;
    if (!user || !isAdmin) {
      router.replace("/");
    }
  }, [viewerLoading, user, isAdmin, router]);

  useEffect(() => {
    if (viewerLoading || !isAdmin) return;
    let cancelled = false;
    fetch("/api/admin/llm-stats", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Stats request failed (${res.status})`);
        }
        return res.json() as Promise<StatsResponse>;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [viewerLoading, isAdmin, refreshTick]);

  const modelRows: ModelRow[] = useMemo(() => {
    if (!data) return [];
    const rows: ModelRow[] = Object.entries(data.snapshot.byModel).map(
      ([model, totals]) => {
        const pricing = getPricing(model);
        return {
          model,
          displayName: pricing?.displayName ?? model,
          provider: totals.provider,
          totals,
          costUSD: estimateCostUSD({
            model,
            inputTokens: totals.inputTokens,
            outputTokens: totals.outputTokens,
            cacheCreationTokens: totals.cacheCreationTokens,
            cacheReadTokens: totals.cacheReadTokens,
          }),
          baselineCostUSD: estimateBaselineCostUSD({
            model,
            inputTokens: totals.inputTokens,
            outputTokens: totals.outputTokens,
            cacheCreationTokens: totals.cacheCreationTokens,
            cacheReadTokens: totals.cacheReadTokens,
          }),
        };
      },
    );
    return rows.sort((a, b) => (b.costUSD ?? 0) - (a.costUSD ?? 0));
  }, [data]);

  const totalCostUSD = useMemo(() => {
    return modelRows.reduce((sum, r) => sum + (r.costUSD ?? 0), 0);
  }, [modelRows]);

  // Counterfactual: what the same workload would have cost if the
  // Anthropic prompt-cache split (PRs #70 + #77) wasn't in place —
  // all cache-read + cache-write tokens billed at the full input rate.
  // Surfaces the cost-discipline story directly on the dashboard.
  const totalBaselineCostUSD = useMemo(() => {
    return modelRows.reduce((sum, r) => sum + (r.baselineCostUSD ?? 0), 0);
  }, [modelRows]);

  const cacheSavingsUSD = Math.max(0, totalBaselineCostUSD - totalCostUSD);
  const cacheSavingsPct =
    totalBaselineCostUSD > 0 ? cacheSavingsUSD / totalBaselineCostUSD : 0;

  const hasUnpricedModel = useMemo(
    () => modelRows.some((r) => r.costUSD === null),
    [modelRows],
  );

  if (viewerLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!user || !isAdmin) return null;

  const snapshot = data?.snapshot;
  const cacheHitPct = snapshot?.cacheHitRate;
  const uptimeMs = snapshot ? Date.now() - snapshot.startedAt : 0;

  // Hourly burn rate — extrapolate from the elapsed wall-clock and
  // total cost. Honest about what's measured (one process instance,
  // current load), not a "monthly projection" that pretends to know
  // sustained traffic.
  const burnPerHourUSD =
    uptimeMs >= 60_000 && totalCostUSD > 0
      ? (totalCostUSD / uptimeMs) * 3_600_000
      : 0;

  return (
    <>
      <Head>
        <title>Admin · LLM cost & cache</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <Stack spacing={3}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Chip
              label="ADMIN"
              size="small"
              sx={{
                backgroundColor: INTERN_THEME_COLOR_DARK,
                color: "#FFFFFF",
                fontWeight: 700,
                letterSpacing: "0.06em",
                fontSize: "0.7rem",
              }}
            />
            <Typography variant="caption" sx={{ letterSpacing: "0.04em", color: "text.secondary" }}>
              CHESS MASTI · INTERNAL
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Button
              component={Link}
              href="/admin/intern-data"
              size="small"
              sx={{ textTransform: "none" }}
            >
              ← Intern data
            </Button>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
              }
              label={
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Auto-refresh ({AUTO_REFRESH_INTERVAL_MS / 1000}s)
                </Typography>
              }
              sx={{ ml: 0, mr: 0 }}
            />
            <Button
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => setRefreshTick((t) => t + 1)}
              sx={{ textTransform: "none" }}
            >
              Refresh
            </Button>
          </Stack>

          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: INTERN_THEME_COLOR_DARK }}>
              LLM cost &amp; cache
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, color: "text.secondary", maxWidth: 760 }}>
              Live readout of <code>/api/admin/llm-stats</code> — the in-memory
              aggregator that records every <code>callLLM()</code> result. Costs
              are estimated from each model&apos;s public list price.{" "}
              <strong>Process-scoped: resets on every Vercel cold start.</strong>{" "}
              Use as a directional signal, not a ledger.
            </Typography>
          </Box>

          {error && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="body2" color="error">
                Couldn&apos;t load stats: {error}
              </Typography>
            </Paper>
          )}

          {!data && !error && (
            <Stack spacing={1.5}>
              <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
              <Skeleton variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
              <Skeleton variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
            </Stack>
          )}

          {snapshot && (
            <>
              {/* Top stats row — 4 tiles */}
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{ "& > *": { flex: 1 } }}
              >
                <StatTile
                  label="Cache hit rate"
                  value={
                    cacheHitPct === null || cacheHitPct === undefined
                      ? "—"
                      : `${(cacheHitPct * 100).toFixed(1)}%`
                  }
                  caption="Anthropic only · reads ÷ (reads + writes)"
                  accent={
                    cacheHitPct === null || cacheHitPct === undefined
                      ? undefined
                      : cacheHitPct >= 0.5
                        ? "#2E7D32"
                        : cacheHitPct >= 0.2
                          ? "#E65100"
                          : "#C62828"
                  }
                  progress={cacheHitPct ?? undefined}
                />
                <StatTile
                  label="Total cost (est.)"
                  value={formatUSD(totalCostUSD)}
                  caption={
                    hasUnpricedModel
                      ? "Some models are unpriced — excluded"
                      : "Across all providers since process start"
                  }
                />
                <StatTile
                  label="Total calls"
                  value={formatNumber(snapshot.totals.callCount)}
                  caption={`Across ${Object.keys(snapshot.byProvider).length || 0} provider${
                    Object.keys(snapshot.byProvider).length === 1 ? "" : "s"
                  }`}
                />
                <StatTile
                  label="Uptime"
                  value={snapshot.totals.callCount > 0 ? formatDuration(uptimeMs) : "—"}
                  caption={`Last call ${relativeTime(snapshot.lastCallAt)}`}
                />
              </Stack>

              {/* Second row — cost-discipline story */}
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{ "& > *": { flex: 1 } }}
              >
                <StatTile
                  label="Cache savings (est.)"
                  value={
                    totalBaselineCostUSD > 0
                      ? `${formatUSD(cacheSavingsUSD)} (${(cacheSavingsPct * 100).toFixed(0)}%)`
                      : "—"
                  }
                  caption={
                    totalBaselineCostUSD > 0
                      ? `Counterfactual without cache: ${formatUSD(totalBaselineCostUSD)}`
                      : "No cache-eligible calls yet"
                  }
                  accent={cacheSavingsUSD > 0 ? "#2E7D32" : undefined}
                  progress={cacheSavingsPct > 0 ? cacheSavingsPct : undefined}
                />
                <StatTile
                  label="Hourly burn @ this rate"
                  value={burnPerHourUSD > 0 ? `${formatUSD(burnPerHourUSD)}/hr` : "—"}
                  caption={
                    burnPerHourUSD > 0
                      ? `~${formatUSD(burnPerHourUSD * 24)}/day if traffic holds`
                      : "Need ≥1m of uptime and ≥1 priced call"
                  }
                />
              </Stack>

              {/* Per-model breakdown */}
              <Box>
                <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: "0.06em" }}>
                  Per-model breakdown
                </Typography>
                <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden", mt: 1.5 }}>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ backgroundColor: "action.hover" }}>
                          <TableCell sx={{ fontWeight: 700 }}>Model</TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="right">
                            Calls
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="right">
                            Input
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="right">
                            Output
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="right">
                            <Tooltip title="Cache reads / writes — Anthropic only">
                              <span>Cache R / W</span>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="right">
                            Avg latency
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="right">
                            Cost (est.)
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {modelRows.map((row) => {
                          const avgMs =
                            row.totals.callCount > 0
                              ? row.totals.elapsedMsSum / row.totals.callCount
                              : 0;
                          return (
                            <TableRow key={row.model} hover>
                              <TableCell>
                                <Stack spacing={0.25}>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    {row.displayName}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    sx={{ fontFamily: "monospace", color: "text.secondary" }}
                                  >
                                    {row.model} · {row.provider}
                                  </Typography>
                                </Stack>
                              </TableCell>
                              <TableCell align="right">{formatNumber(row.totals.callCount)}</TableCell>
                              <TableCell align="right">{formatTokens(row.totals.inputTokens)}</TableCell>
                              <TableCell align="right">{formatTokens(row.totals.outputTokens)}</TableCell>
                              <TableCell align="right">
                                {row.totals.cacheReadTokens + row.totals.cacheCreationTokens > 0
                                  ? `${formatTokens(row.totals.cacheReadTokens)} / ${formatTokens(row.totals.cacheCreationTokens)}`
                                  : "—"}
                              </TableCell>
                              <TableCell align="right">
                                {row.totals.callCount > 0 ? formatDuration(avgMs) : "—"}
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>
                                {row.costUSD === null ? (
                                  <Tooltip title="No pricing entry for this model — see src/lib/llmPricing.ts">
                                    <span>—</span>
                                  </Tooltip>
                                ) : (
                                  formatUSD(row.costUSD)
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {modelRows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7}>
                              <Typography
                                variant="body2"
                                sx={{ textAlign: "center", color: "text.secondary", py: 3 }}
                              >
                                No LLM calls recorded on this instance yet. Hit{" "}
                                <code>/analysis</code> to see numbers populate.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Divider />
                  <Box sx={{ p: 1.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {modelRows.length} model{modelRows.length === 1 ? "" : "s"} · since{" "}
                      {new Date(snapshot.startedAt).toLocaleString()}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Generated {new Date(data!.notes.generatedAt).toLocaleTimeString()}
                    </Typography>
                  </Box>
                </Paper>
              </Box>

              {/* Caveats */}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, backgroundColor: "action.hover" }}>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                  <strong>Caveats.</strong> The aggregator is in-memory and{" "}
                  <code>{data!.notes.scope}</code>. At present low traffic this is fine; at
                  scale we&apos;d back it with Upstash. Cost is computed from public list
                  prices in <code>src/lib/llmPricing.ts</code> — update that file when a
                  vendor changes their published rates.
                </Typography>
              </Paper>
            </>
          )}
        </Stack>
      </Container>
    </>
  );
}

function StatTile({
  label,
  value,
  caption,
  accent,
  progress,
}: {
  label: string;
  value: string;
  caption: string;
  accent?: string;
  progress?: number;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Typography
        variant="overline"
        sx={{ color: "text.secondary", letterSpacing: "0.06em", fontSize: "0.65rem" }}
      >
        {label}
      </Typography>
      <Typography
        variant="h4"
        sx={{
          fontWeight: 700,
          color: accent ?? "text.primary",
          mt: 0.5,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Typography>
      {progress !== undefined && (
        <LinearProgress
          variant="determinate"
          value={Math.max(0, Math.min(100, progress * 100))}
          sx={{
            mt: 1,
            height: 6,
            borderRadius: 3,
            backgroundColor: "action.hover",
            "& .MuiLinearProgress-bar": {
              backgroundColor: accent ?? INTERN_THEME_COLOR_DARK,
            },
          }}
        />
      )}
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1 }}>
        {caption}
      </Typography>
    </Paper>
  );
}
