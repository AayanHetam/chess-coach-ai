"use client";

import Link from "next/link";
import { Box, Paper, Stack, Typography, Button, Chip } from "@mui/material";
import { useViewer } from "@/hooks/useViewer";
import { INTERN_THEME_COLOR_LIGHT } from "@/constants";
import { LINE, RADIUS, SURFACE, TEXT, TYPE } from "@/theme/tokens";

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
          borderRadius: `${RADIUS.card}px`,
          border: `1px solid ${LINE.hairline}`,
          background: SURFACE.raised,
          color: TEXT.primary,
        }}
      >
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label="Employee"
              size="small"
              sx={{
                backgroundColor: `${INTERN_THEME_COLOR_LIGHT}24`,
                color: INTERN_THEME_COLOR_LIGHT,
                height: 22,
              }}
            />
            <Typography variant="caption" sx={{ color: TEXT.secondary }}>
              Chess Masti, internal
            </Typography>
          </Stack>

          <Box>
            <Typography variant="h4">Welcome, {firstName}.</Typography>
            <Typography
              variant="body1"
              sx={{ mt: 1.5, color: TEXT.secondary, maxWidth: 620 }}
            >
              You&apos;re viewing chessmasti.com as an employee, not a customer.
              The full feedback loop is live: dogfood the coach, flag any
              response that&apos;s wrong, inaccurate or incomplete, and track
              your weekly progress on your dashboard. Target: 10 submissions per
              week once the program starts on June 30.
            </Typography>
          </Box>

          <Box
            sx={{
              backgroundColor: SURFACE.raisedSecondary,
              borderRadius: `${RADIUS.control}px`,
              p: 2,
              border: `1px solid ${LINE.hairline}`,
            }}
          >
            <Typography
              sx={{
                display: "block",
                ...TYPE.label,
                color: TEXT.secondary,
                mb: 1,
              }}
            >
              How it works
            </Typography>
            <Stack spacing={0.75}>
              <Typography variant="body2">
                <strong>1.</strong> Use the coach normally on{" "}
                <code>/analysis</code>: analyze your games, ask questions.
              </Typography>
              <Typography variant="body2">
                <strong>2.</strong> When you spot a bad response, hit the Flag
                button on that message. Write a short &quot;why it&apos;s
                wrong&quot; and what the ideal response would have been.
              </Typography>
              <Typography variant="body2">
                <strong>3.</strong> Check <code>/intern</code> any time to see
                your pacing for the week and every submission you&apos;ve made.
              </Typography>
            </Stack>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button
              component={Link}
              href="/analysis"
              variant="contained"
              size="large"
            >
              Open the chess coach
            </Button>
            <Button
              component={Link}
              href="/intern"
              variant="outlined"
              size="large"
            >
              Open intern dashboard
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
