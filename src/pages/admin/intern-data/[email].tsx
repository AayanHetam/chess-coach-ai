import { useEffect, useState } from "react";
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
  Divider,
} from "@mui/material";
import { useViewer } from "@/hooks/useViewer";
import { INTERN_THEME_COLOR, INTERN_THEME_COLOR_DARK } from "@/constants";
import type { AdminInternDetail } from "@/app/api/admin/intern-data/detail/[email]/route";
import type { PacingStatus } from "@/lib/intern/pacing";

const STATUS_STYLES: Record<PacingStatus, { bg: string; fg: string; label: string }> = {
  behind: { bg: "#FFF3E0", fg: "#E65100", label: "Behind" },
  "on-track": { bg: "#E8F5E9", fg: "#2E7D32", label: "On track" },
  ahead: { bg: "#E3F2FD", fg: "#1565C0", label: "Ahead" },
  "pre-program": { bg: "#E8EEF8", fg: INTERN_THEME_COLOR_DARK, label: "Pre-program" },
};

const CATEGORY_COLOR: Record<"bad" | "inaccurate" | "incomplete", { bg: string; fg: string }> = {
  bad: { bg: "#FBE9E7", fg: "#C62828" },
  inaccurate: { bg: "#FFF8E1", fg: "#9A6300" },
  incomplete: { bg: "#E8EAF6", fg: "#3949AB" },
};

export default function AdminInternDetailPage() {
  const router = useRouter();
  const { email: emailParam } = router.query;
  const { user, isAdmin, loading: viewerLoading } = useViewer();

  const [detail, setDetail] = useState<AdminInternDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (viewerLoading) return;
    if (!user || !isAdmin) {
      router.replace("/");
    }
  }, [viewerLoading, user, isAdmin, router]);

  useEffect(() => {
    if (viewerLoading || !isAdmin || typeof emailParam !== "string") return;
    let cancelled = false;
    fetch(`/api/admin/intern-data/detail/${encodeURIComponent(emailParam)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (res.status === 404) throw new Error("Intern not found.");
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Failed (${res.status})`);
        }
        return res.json() as Promise<AdminInternDetail>;
      })
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [viewerLoading, isAdmin, emailParam]);

  if (viewerLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!user || !isAdmin) return null;

  const maxBucketCount = detail
    ? Math.max(1, ...detail.weekBuckets.map((b) => b.count))
    : 1;

  return (
    <>
      <Head>
        <title>Admin · Intern detail</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <Button
          component={Link}
          href="/admin/intern-data"
          size="small"
          sx={{ textTransform: "none", mb: 2 }}
        >
          ← All interns
        </Button>

        {error && (
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="body1" color="error">
              {error}
            </Typography>
          </Paper>
        )}

        {!detail && !error && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {detail && (
          <Stack spacing={3}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: INTERN_THEME_COLOR_DARK }}>
                {detail.email}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {detail.cohort}
              </Typography>
            </Box>

            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {detail.pacing.status === "pre-program"
                      ? `${detail.pacing.submittedThisWeek} flagged this week`
                      : `${detail.pacing.submittedThisWeek} of ${detail.pacing.target} this week`}
                  </Typography>
                  <Chip
                    label={STATUS_STYLES[detail.pacing.status].label}
                    size="small"
                    sx={{
                      backgroundColor: STATUS_STYLES[detail.pacing.status].bg,
                      color: STATUS_STYLES[detail.pacing.status].fg,
                      fontWeight: 600,
                    }}
                  />
                  {detail.pacing.streakWeeks > 0 && (
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Streak: {detail.pacing.streakWeeks} week
                      {detail.pacing.streakWeeks === 1 ? "" : "s"}
                    </Typography>
                  )}
                </Stack>
              </Stack>
            </Paper>

            <Box>
              <Typography variant="overline" sx={{ color: "text.secondary" }}>
                Last 8 weeks
              </Typography>
              <Paper variant="outlined" sx={{ p: 2.5, mt: 1, borderRadius: 2 }}>
                <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ height: 120 }}>
                  {detail.weekBuckets.map((bucket) => {
                    const heightPct = (bucket.count / maxBucketCount) * 100;
                    const label = new Date(bucket.weekStartMs).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    });
                    return (
                      <Box
                        key={bucket.weekStartMs}
                        sx={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 0.5,
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {bucket.count}
                        </Typography>
                        <Box
                          sx={{
                            width: "100%",
                            height: `${Math.max(heightPct, 2)}%`,
                            backgroundColor:
                              bucket.count >= 10
                                ? "#2E7D32"
                                : bucket.count > 0
                                  ? INTERN_THEME_COLOR
                                  : "#E0E0E0",
                            borderRadius: "4px 4px 0 0",
                            minHeight: 2,
                          }}
                        />
                        <Typography
                          variant="caption"
                          sx={{ fontSize: "0.7rem", color: "text.secondary" }}
                        >
                          {label}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
                <Typography variant="caption" sx={{ display: "block", mt: 1.5, color: "text.secondary" }}>
                  Green bars = hit the 10/week target. Lighter blue = some activity. Gray = none.
                </Typography>
              </Paper>
            </Box>

            <Divider />

            <Box>
              <Typography variant="overline" sx={{ color: "text.secondary" }}>
                Recent submissions
              </Typography>
              {detail.recentSubmissions.length === 0 && (
                <Paper
                  variant="outlined"
                  sx={{ p: 4, mt: 1.5, borderRadius: 2, borderStyle: "dashed" }}
                >
                  <Typography variant="body1" sx={{ textAlign: "center", color: "text.secondary" }}>
                    No submissions yet.
                  </Typography>
                </Paper>
              )}
              <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                {detail.recentSubmissions.map((s) => {
                  const cat = CATEGORY_COLOR[s.category];
                  return (
                    <Paper
                      key={s.id}
                      variant="outlined"
                      sx={{ p: 2, borderRadius: 2 }}
                    >
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                        <Chip
                          label={s.category}
                          size="small"
                          sx={{
                            backgroundColor: cat.bg,
                            color: cat.fg,
                            fontWeight: 600,
                            fontSize: "0.7rem",
                            textTransform: "capitalize",
                          }}
                        />
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          {new Date(s.flaggedAt).toLocaleString()}
                        </Typography>
                      </Stack>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "0.82rem",
                          opacity: 0.75,
                          whiteSpace: "pre-wrap",
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          mb: 0.75,
                        }}
                      >
                        <strong>Bad:</strong> {s.badResponsePreview}
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 0.75 }}>
                        <strong>Why:</strong> {s.whyWrongPreview}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Ideal:</strong> {s.idealResponsePreview}
                      </Typography>
                    </Paper>
                  );
                })}
              </Stack>
            </Box>
          </Stack>
        )}
      </Container>
    </>
  );
}
