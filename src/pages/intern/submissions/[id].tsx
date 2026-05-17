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
import type { SubmissionDetail } from "@/app/api/intern/submissions/[id]/route";

/**
 * Per-submission detail viewer. Read-only in CMIP-1.C — interns review
 * what they submitted but can't edit (yet). Edit-in-place is a CMIP-1.C.1
 * follow-up if interns want it.
 */

const CATEGORY_LABEL: Record<SubmissionDetail["category"], string> = {
  bad: "Bad",
  inaccurate: "Inaccurate",
  incomplete: "Incomplete",
};

const CATEGORY_COLOR: Record<SubmissionDetail["category"], { bg: string; fg: string }> = {
  bad: { bg: "#FBE9E7", fg: "#C62828" },
  inaccurate: { bg: "#FFF8E1", fg: "#9A6300" },
  incomplete: { bg: "#E8EAF6", fg: "#3949AB" },
};

export default function SubmissionDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, isIntern, loading: viewerLoading } = useViewer();

  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (viewerLoading) return;
    if (!user || !isIntern) {
      router.replace("/");
    }
  }, [viewerLoading, user, isIntern, router]);

  useEffect(() => {
    if (viewerLoading || !isIntern || typeof id !== "string") return;
    let cancelled = false;
    fetch(`/api/intern/submissions/${id}`, { credentials: "include" })
      .then(async (res) => {
        if (res.status === 404) throw new Error("Submission not found.");
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Failed (${res.status})`);
        }
        return res.json() as Promise<SubmissionDetail>;
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
  }, [viewerLoading, isIntern, id]);

  if (viewerLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user || !isIntern) return null;

  return (
    <>
      <Head>
        <title>Submission · Chess Masti intern</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
        <Button
          component={Link}
          href="/intern"
          size="small"
          sx={{ textTransform: "none", mb: 2 }}
        >
          ← Back to all submissions
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
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <Chip
                  label={CATEGORY_LABEL[detail.category]}
                  size="small"
                  sx={{
                    backgroundColor: CATEGORY_COLOR[detail.category].bg,
                    color: CATEGORY_COLOR[detail.category].fg,
                    fontWeight: 600,
                  }}
                />
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Flagged {new Date(detail.flaggedAt).toLocaleString()}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  · Prompt v{detail.promptVersion}
                </Typography>
              </Stack>
              <Typography variant="h5" sx={{ fontWeight: 700, color: INTERN_THEME_COLOR_DARK }}>
                Submission detail
              </Typography>
            </Box>

            {detail.gamePgn && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="overline" sx={{ color: "text.secondary" }}>
                  Game
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: "monospace",
                    fontSize: "0.82rem",
                    mt: 0.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {detail.gamePgn}
                </Typography>
                {detail.fenAtFlag && (
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      mt: 1,
                      fontFamily: "monospace",
                      color: "text.secondary",
                    }}
                  >
                    FEN at flag: {detail.fenAtFlag}
                  </Typography>
                )}
              </Paper>
            )}

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, borderColor: "#FFAB91" }}>
              <Typography variant="overline" sx={{ color: "#C62828" }}>
                What the coach said (bad)
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  mt: 0.5,
                  fontFamily: "monospace",
                  fontSize: "0.85rem",
                  whiteSpace: "pre-wrap",
                  backgroundColor: "rgba(244, 67, 54, 0.04)",
                  p: 1.5,
                  borderRadius: 1,
                }}
              >
                {detail.badResponse}
              </Typography>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="overline" sx={{ color: "text.secondary" }}>
                Why it&apos;s wrong
              </Typography>
              <Typography variant="body1" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                {detail.whyWrong}
              </Typography>
            </Paper>

            <Paper
              variant="outlined"
              sx={{ p: 2, borderRadius: 2, borderColor: "#A5D6A7" }}
            >
              <Typography variant="overline" sx={{ color: "#2E7D32" }}>
                Ideal response
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  mt: 0.5,
                  whiteSpace: "pre-wrap",
                  backgroundColor: "rgba(76, 175, 80, 0.04)",
                  p: 1.5,
                  borderRadius: 1,
                }}
              >
                {detail.idealResponse}
              </Typography>
            </Paper>

            <Divider />

            <Box>
              <Typography variant="overline" sx={{ color: "text.secondary" }}>
                Full chat history at flag time
              </Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {detail.chatHistory.map((msg, idx) => {
                  const isFlagged = idx === detail.flaggedMessageIndex;
                  const isAssistant = msg.role === "assistant";
                  return (
                    <Paper
                      key={idx}
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        borderRadius: 1.5,
                        borderColor: isFlagged ? "#FFAB91" : "divider",
                        backgroundColor: isFlagged
                          ? "rgba(244, 67, 54, 0.04)"
                          : isAssistant
                            ? "rgba(10, 77, 168, 0.03)"
                            : "transparent",
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 600,
                          color: isFlagged
                            ? "#C62828"
                            : isAssistant
                              ? INTERN_THEME_COLOR
                              : "text.secondary",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {isFlagged
                          ? `${msg.role.toUpperCase()} · FLAGGED`
                          : msg.role.toUpperCase()}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ mt: 0.5, whiteSpace: "pre-wrap", fontSize: "0.88rem" }}
                      >
                        {msg.content}
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
