import { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import {
  Box,
  Container,
  Paper,
  Stack,
  Typography,
  Chip,
  Button,
  CircularProgress,
} from "@mui/material";
import Link from "next/link";
import { useViewer } from "@/hooks/useViewer";
import { INTERN_THEME_COLOR, INTERN_THEME_COLOR_DARK } from "@/constants";

/**
 * Intern dashboard placeholder (CMIP-1.A).
 *
 * Real content lands in CMIP-1.C:
 *   - Pending / Submitted submission lists
 *   - Quota widget ("6 of 10 this week, streak: 3 weeks")
 *   - Per-submission authoring view at /intern/submissions/[id]
 *
 * For v1.A this page exists to:
 *   1. Verify intern routing + auth-gating end-to-end
 *   2. Give the EmployeePill / InternalNavLinks somewhere coherent to link to
 *
 * Gating: client-side check. Non-interns get redirected to / after the auth
 * fetch resolves. Server-side gating (getServerSideProps reading the session
 * cookie) is a CMIP-1.C tightening when real data ships.
 */
export default function InternHome() {
  const router = useRouter();
  const { user, isIntern, loading } = useViewer();

  useEffect(() => {
    if (loading) return;
    if (!user || !isIntern) {
      router.replace("/");
    }
  }, [loading, user, isIntern, router]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user || !isIntern) {
    // useEffect will redirect; render nothing meanwhile.
    return null;
  }

  const firstName = user.displayName?.split(" ")[0] ?? "team";

  return (
    <>
      <Head>
        <title>Intern dashboard · Chess Masti</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
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
            <Typography variant="h3" sx={{ fontWeight: 700, color: INTERN_THEME_COLOR_DARK }}>
              Welcome, {firstName}.
            </Typography>
            <Typography variant="body1" sx={{ mt: 1.5, color: "text.secondary", maxWidth: 620 }}>
              This is your CMIP intern dashboard. The flag-response capture (CMIP-1.B)
              and submissions authoring + weekly quota (CMIP-1.C) ship next.
            </Typography>
          </Box>

          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              backgroundColor: "background.paper",
            }}
          >
            <Stack spacing={2}>
              <Typography variant="overline" sx={{ color: "text.secondary" }}>
                Coming next
              </Typography>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  CMIP-1.B — Flag-response capture
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
                  A 🚩 button appears on every coach message during normal use.
                  One click captures the full session for later authoring.
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  CMIP-1.C — Submissions + quota
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
                  Pending vs. submitted tabs. Author the ideal response on your own
                  time. 10 ideal responses per week = the goal.
                </Typography>
              </Box>
            </Stack>
          </Paper>

          <Box>
            <Button
              component={Link}
              href="/analysis"
              variant="contained"
              size="large"
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              Open the chess coach →
            </Button>
          </Box>
        </Stack>
      </Container>
    </>
  );
}
