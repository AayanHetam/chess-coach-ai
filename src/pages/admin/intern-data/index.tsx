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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControlLabel,
  Switch,
  Divider,
} from "@mui/material";
import { Loader } from "@/components/ui/Loader";
import { useViewer } from "@/hooks/useViewer";
import { INTERN_THEME_COLOR_DARK } from "@/constants";
import type { RosterEntry, RosterResponse } from "@/app/api/admin/intern-data/roster/route";
import type { PacingStatus } from "@/lib/intern/pacing";

const STATUS_STYLES: Record<PacingStatus, { bg: string; fg: string; label: string; sort: number }> = {
  behind: { bg: "#FFF3E0", fg: "#E65100", label: "Behind", sort: 0 },
  "on-track": { bg: "#E8F5E9", fg: "#2E7D32", label: "On track", sort: 1 },
  ahead: { bg: "#E3F2FD", fg: "#1565C0", label: "Ahead", sort: 2 },
  "pre-program": { bg: "#E8EEF8", fg: INTERN_THEME_COLOR_DARK, label: "Pre-program", sort: 3 },
};

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(ms).toLocaleDateString();
}

export default function AdminInternData() {
  const router = useRouter();
  const { user, isAdmin, loading: viewerLoading } = useViewer();
  const [data, setData] = useState<RosterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeAttribution, setIncludeAttribution] = useState(false);

  useEffect(() => {
    if (viewerLoading) return;
    if (!user || !isAdmin) {
      router.replace("/");
    }
  }, [viewerLoading, user, isAdmin, router]);

  useEffect(() => {
    if (viewerLoading || !isAdmin) return;
    let cancelled = false;
    fetch("/api/admin/intern-data/roster", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Roster request failed (${res.status})`);
        }
        return res.json() as Promise<RosterResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [viewerLoading, isAdmin]);

  const sortedEntries: RosterEntry[] = useMemo(() => {
    if (!data) return [];
    return [...data.entries].sort((a, b) => {
      const ra = STATUS_STYLES[a.pacing.status].sort;
      const rb = STATUS_STYLES[b.pacing.status].sort;
      if (ra !== rb) return ra - rb;
      return (a.email || "").localeCompare(b.email || "");
    });
  }, [data]);

  if (viewerLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <Loader size={48} showLabel={false} />
      </Box>
    );
  }
  if (!user || !isAdmin) return null;

  const exportHref =
    "/api/admin/intern-data/export" + (includeAttribution ? "?include_attribution=1" : "");

  return (
    <>
      <Head>
        <title>Admin · CMIP intern data</title>
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
              href="/admin/cost"
              size="small"
              sx={{ textTransform: "none" }}
            >
              LLM cost &amp; cache →
            </Button>
          </Stack>

          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: INTERN_THEME_COLOR_DARK }}>
              CMIP intern data
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, color: "text.secondary", maxWidth: 720 }}>
              Real-time roster of every intern in <code>intern_allowlist</code>, auto-discovered.
              Add an intern via <code>node scripts/intern/add-to-allowlist.mjs &lt;email&gt;</code> and
              they appear here on next refresh — no code changes needed.
            </Typography>
          </Box>

          {error && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="body2" color="error">
                Couldn&apos;t load roster: {error}
              </Typography>
            </Paper>
          )}

          {!data && !error && (
            <Stack spacing={1.5}>
              <Skeleton variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
              <Skeleton variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
              <Skeleton variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
            </Stack>
          )}

          {data && (
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "action.hover" }}>
                      <TableCell sx={{ fontWeight: 700 }}>Intern</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Cohort</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        This week
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        Streak
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        All time
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Last activity</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedEntries.map((entry) => {
                      const style = STATUS_STYLES[entry.pacing.status];
                      return (
                        <TableRow
                          key={entry.email}
                          hover
                          component={Link}
                          href={`/admin/intern-data/${encodeURIComponent(entry.email)}`}
                          sx={{
                            textDecoration: "none",
                            cursor: "pointer",
                            "& td": { color: "inherit" },
                          }}
                        >
                          <TableCell sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                            {entry.email}
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                              {entry.cohort}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {entry.pacing.status === "pre-program"
                              ? `${entry.pacing.submittedThisWeek}`
                              : `${entry.pacing.submittedThisWeek} / ${entry.pacing.target}`}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={style.label}
                              size="small"
                              sx={{
                                backgroundColor: style.bg,
                                color: style.fg,
                                fontWeight: 600,
                                fontSize: "0.7rem",
                                height: 22,
                              }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            {entry.pacing.streakWeeks > 0
                              ? `${entry.pacing.streakWeeks} wk${entry.pacing.streakWeeks === 1 ? "" : "s"}`
                              : "—"}
                          </TableCell>
                          <TableCell align="right">{entry.allTimeFlags}</TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ color: "text.secondary" }}>
                              {relativeTime(entry.lastActivityAt)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {sortedEntries.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7}>
                          <Typography
                            variant="body2"
                            sx={{ textAlign: "center", color: "text.secondary", py: 3 }}
                          >
                            No interns in the allowlist yet.
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
                  {data.entries.length} intern{data.entries.length === 1 ? "" : "s"} · generated{" "}
                  {new Date(data.generatedAt).toLocaleString()}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Program starts {new Date(data.programStartMs).toLocaleDateString()}
                </Typography>
              </Box>
            </Paper>
          )}

          <Divider />

          <Box>
            <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: "0.06em" }}>
              Export submissions
            </Typography>
            <Paper variant="outlined" sx={{ p: 2.5, mt: 1.5, borderRadius: 2 }}>
              <Stack spacing={2}>
                <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 720 }}>
                  Downloads all submitted rows as JSONL (newline-delimited JSON), schema v1.0.0.
                  Each line is one (bad response, ideal response) pair plus context. Drop into
                  the Mastermind eval pipeline or a few-shot loader.
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={includeAttribution}
                      onChange={(e) => setIncludeAttribution(e.target.checked)}
                    />
                  }
                  label={
                    <Typography variant="body2">
                      Include <code>intern_email</code> attribution (default off — eval consumers
                      should work on the pair without it)
                    </Typography>
                  }
                />
                <Box>
                  <Button
                    href={exportHref}
                    component="a"
                    variant="contained"
                    size="medium"
                    sx={{ textTransform: "none", fontWeight: 600 }}
                  >
                    Download JSONL →
                  </Button>
                </Box>
              </Stack>
            </Paper>
          </Box>
        </Stack>
      </Container>
    </>
  );
}
