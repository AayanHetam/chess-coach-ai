"use client";

import Link from "next/link";
import { Box, Paper, Stack, Typography, Button, Chip } from "@mui/material";
import { useViewer } from "@/hooks/useViewer";
import { INTERN_THEME_COLOR, INTERN_THEME_COLOR_DARK } from "@/constants";

/**
 * Homepage hero replacement for logged-in interns.
 *
 * Renders nothing when the viewer is not an intern (the public hero shows
 * instead). The card frames the visit as "you are an employee here," with
 * direct CTAs into the two intern workflows (dogfooding and authoring).
 *
 * In CMIP-1.A, both CTAs land at /intern (dashboard is a placeholder).
 * In CMIP-1.C, "Author pending submissions" deep-links to
 * /intern/submissions and shows real pending count.
 */
export function InternalHomeCard() {
  const { user, isIntern, loading } = useViewer();
  if (loading || !isIntern || !user) return null;

  const firstName = user.displayName?.split(" ")[0] ?? "team";

  return (
    <Box sx={{ maxWidth: 880, mx: "auto", mt: { xs: 2, md: 4 }, px: 2 }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, md: 4 },
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          background: `linear-gradient(135deg, ${INTERN_THEME_COLOR_DARK} 0%, ${INTERN_THEME_COLOR} 100%)`,
          color: "#FFFFFF",
        }}
      >
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label="EMPLOYEE"
              size="small"
              sx={{
                backgroundColor: "rgba(255,255,255,0.18)",
                color: "#FFFFFF",
                fontWeight: 700,
                letterSpacing: "0.06em",
                fontSize: "0.7rem",
                height: 22,
              }}
            />
            <Typography variant="caption" sx={{ opacity: 0.85, letterSpacing: "0.04em" }}>
              CHESS MASTI · INTERNAL
            </Typography>
          </Stack>

          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Welcome, {firstName}.
            </Typography>
            <Typography variant="body1" sx={{ mt: 1.5, opacity: 0.92, maxWidth: 620 }}>
              You&apos;re viewing chessmasti.com as an employee, not a customer.
              The full feedback loop is live: dogfood the coach, flag any
              response that&apos;s wrong / inaccurate / incomplete, and track
              your weekly progress on your dashboard. Target: 10 submissions
              per week once the program starts on June 30.
            </Typography>
          </Box>

          <Box
            sx={{
              backgroundColor: "rgba(255,255,255,0.10)",
              borderRadius: 1.5,
              p: 2,
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <Typography
              variant="caption"
              sx={{ display: "block", opacity: 0.75, letterSpacing: "0.06em", mb: 1 }}
            >
              HOW IT WORKS
            </Typography>
            <Stack spacing={0.75}>
              <Typography variant="body2">
                <strong>1.</strong> Use the coach normally on <code>/analysis</code> — analyze your games, ask questions.
              </Typography>
              <Typography variant="body2">
                <strong>2.</strong> When you spot a bad response, hit the 🚩 Flag button on that message. Write a short &quot;why it&apos;s wrong&quot; and what the ideal response would have been.
              </Typography>
              <Typography variant="body2">
                <strong>3.</strong> Check <code>/intern</code> any time to see your pacing for the week + every submission you&apos;ve made.
              </Typography>
            </Stack>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button
              component={Link}
              href="/analysis"
              variant="contained"
              size="large"
              sx={{
                backgroundColor: "#FFFFFF",
                color: INTERN_THEME_COLOR_DARK,
                fontWeight: 600,
                textTransform: "none",
                "&:hover": { backgroundColor: "#F5F5F5" },
              }}
            >
              Open the chess coach →
            </Button>
            <Button
              component={Link}
              href="/intern"
              variant="outlined"
              size="large"
              sx={{
                borderColor: "rgba(255,255,255,0.6)",
                color: "#FFFFFF",
                fontWeight: 600,
                textTransform: "none",
                "&:hover": {
                  borderColor: "#FFFFFF",
                  backgroundColor: "rgba(255,255,255,0.08)",
                },
              }}
            >
              Open intern dashboard
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
