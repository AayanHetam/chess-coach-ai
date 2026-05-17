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
  Skeleton,
  Divider,
} from "@mui/material";
import { useViewer } from "@/hooks/useViewer";
import { QuotaWidget } from "@/components/intern/QuotaWidget";
import { INTERN_THEME_COLOR, INTERN_THEME_COLOR_DARK } from "@/constants";
import type { SubmissionListItem } from "@/app/api/intern/submissions/list/route";

const CATEGORY_LABEL: Record<SubmissionListItem["category"], string> = {
  bad: "Bad",
  inaccurate: "Inaccurate",
  incomplete: "Incomplete",
};

const CATEGORY_COLOR: Record<SubmissionListItem["category"], { bg: string; fg: string }> = {
  bad: { bg: "#FBE9E7", fg: "#C62828" },
  inaccurate: { bg: "#FFF8E1", fg: "#9A6300" },
  incomplete: { bg: "#E8EAF6", fg: "#3949AB" },
};

function formatRelative(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString();
}

export default function InternHome() {
  const router = useRouter();
  const { user, isIntern, loading } = useViewer();
  const [items, setItems] = useState<SubmissionListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user || !isIntern) {
      router.replace("/");
    }
  }, [loading, user, isIntern, router]);

  useEffect(() => {
    if (loading || !isIntern) return;
    let cancelled = false;
    fetch("/api/intern/submissions/list", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Failed (${res.status})`);
        }
        return res.json() as Promise<{ items: SubmissionListItem[] }>;
      })
      .then((d) => {
        if (!cancelled) setItems(d.items);
      })
      .catch((e: Error) => {
        if (!cancelled) setListError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, isIntern]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user || !isIntern) return null;

  const firstName = user.displayName?.split(" ")[0] ?? "team";

  return (
    <>
      <Head>
        <title>Intern dashboard · Chess Masti</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
        <Stack spacing={3}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Chip
              label="EMPLOYEE"
              size="small"
              sx={{
                backgroundColor: INTERN_THEME_COLOR,
                color: "#FFFFFF",
                fontWeight: 700,
                letterSpacing: "0.06em",
                fontSize: "0.7rem",
              }}
            />
            <Typography variant="caption" sx={{ letterSpacing: "0.04em", color: "text.secondary" }}>
              CHESS MASTI · INTERNAL
            </Typography>
          </Stack>

          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: INTERN_THEME_COLOR_DARK }}>
              Welcome, {firstName}.
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, color: "text.secondary", maxWidth: 620 }}>
              Your flagged coach responses live here. Each row is a (bad response, ideal response)
              pair that feeds the eval set we use to make the coach measurably smarter.
            </Typography>
          </Box>

          <QuotaWidget />

          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button
              component={Link}
              href="/analysis"
              variant="contained"
              size="medium"
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              Open the chess coach →
            </Button>
          </Stack>

          <Divider />

          <Box>
            <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: "0.06em" }}>
              Your submissions
            </Typography>

            {listError && (
              <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
                Couldn&apos;t load submissions: {listError}
              </Typography>
            )}

            {!items && !listError && (
              <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                <Skeleton variant="rectangular" height={84} sx={{ borderRadius: 2 }} />
                <Skeleton variant="rectangular" height={84} sx={{ borderRadius: 2 }} />
                <Skeleton variant="rectangular" height={84} sx={{ borderRadius: 2 }} />
              </Stack>
            )}

            {items && items.length === 0 && (
              <Paper
                variant="outlined"
                sx={{ p: 4, mt: 1.5, borderRadius: 2, borderStyle: "dashed" }}
              >
                <Typography variant="body1" sx={{ textAlign: "center", color: "text.secondary" }}>
                  No flags yet. Head to <Link href="/analysis">the coach</Link> and click the 🚩 Flag
                  button on any response that&apos;s wrong, inaccurate, or incomplete.
                </Typography>
              </Paper>
            )}

            {items && items.length > 0 && (
              <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                {items.map((item) => {
                  const cat = CATEGORY_COLOR[item.category];
                  return (
                    <Paper
                      key={item.id}
                      component={Link}
                      href={`/intern/submissions/${item.id}`}
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        textDecoration: "none",
                        color: "inherit",
                        display: "block",
                        transition: "border-color 0.15s, background-color 0.15s",
                        "&:hover": {
                          borderColor: INTERN_THEME_COLOR,
                          backgroundColor: "rgba(10, 77, 168, 0.03)",
                        },
                      }}
                    >
                      <Stack
                        direction="row"
                        spacing={1.5}
                        alignItems="center"
                        sx={{ mb: 1 }}
                      >
                        <Chip
                          label={CATEGORY_LABEL[item.category]}
                          size="small"
                          sx={{
                            backgroundColor: cat.bg,
                            color: cat.fg,
                            fontWeight: 600,
                            fontSize: "0.7rem",
                          }}
                        />
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          {formatRelative(item.flaggedAt)}
                        </Typography>
                        {item.hasGame && (
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>
                            · Game attached
                          </Typography>
                        )}
                      </Stack>
                      <Typography
                        variant="body2"
                        sx={{
                          color: "text.primary",
                          fontFamily: "monospace",
                          fontSize: "0.82rem",
                          opacity: 0.75,
                          mb: 1,
                          whiteSpace: "pre-wrap",
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        Bad: {item.badResponsePreview}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color: "text.primary",
                          fontWeight: 500,
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        Why: {item.whyWrongPreview}
                      </Typography>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Box>
        </Stack>
      </Container>
    </>
  );
}
