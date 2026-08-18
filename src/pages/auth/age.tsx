import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Alert, Box, Button, Paper, Typography } from "@mui/material";
import { PageTitle } from "@/components/pageTitle";
import AgeGate from "@/components/consent/AgeGate";
import { isAgeGateBlocked } from "@/lib/tracking/ageGateLock";

/**
 * COPPA interstitial for brand-new Google accounts (see
 * /api/auth/google/callback). The verified Google profile is parked in the
 * signed cm_pending_google cookie; no account exists yet. Confirming the 13+
 * affirmation checkbox POSTs /api/auth/google/complete to create the account
 * + session. Without the affirmation no account is ever created — the pending
 * cookie simply expires (10-minute TTL). Devices locked by the retired DOB
 * gate still see the blocked notice.
 *
 * Plain utility styling on purpose — auth utility pages (reset-password
 * et al.) are outside the dark-glass chrome rollout.
 */

type Phase = "gate" | "submitting" | "blocked" | "expired";

function sanitizeReturnTo(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export default function AgeInterstitialPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("gate");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAgeGateBlocked()) setPhase("blocked");
  }, []);

  const complete = async () => {
    setError(null);
    setPhase("submitting");
    try {
      const res = await fetch("/api/auth/google/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ageAffirmed: true }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          code?: string;
          error?: string;
        };
        if (data.code === "expired") {
          setPhase("expired");
        } else {
          setPhase("gate");
          setError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }
      // Full navigation (not router.push) so AuthProvider re-reads
      // /api/auth/me with the fresh session cookie.
      window.location.assign(sanitizeReturnTo(router.query.returnTo));
    } catch {
      setPhase("gate");
      setError("Network error. Please try again.");
    }
  };

  return (
    <>
      <PageTitle title="One quick check" />
      <Box sx={{ display: "flex", justifyContent: "center", py: 8, px: 2 }}>
        <Paper sx={{ p: 4, maxWidth: 440, width: "100%", borderRadius: 4 }}>
          {phase === "blocked" ? (
            <>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>
                We can&apos;t create an account for you right now.
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: "text.secondary", mb: 2 }}
              >
                No account was created and nothing you entered was stored. A
                parent or guardian can get in touch through the contact details
                on our Privacy page.
              </Typography>
              <Button href="/" variant="outlined" size="small">
                Back to Chess Masti
              </Button>
            </>
          ) : phase === "expired" ? (
            <>
              <Alert severity="warning" sx={{ mb: 2 }}>
                This sign-in session expired. Please start again.
              </Alert>
              <Button href="/" variant="contained" size="small">
                Back to Chess Masti
              </Button>
            </>
          ) : (
            <>
              <Typography sx={{ fontWeight: 700, mb: 0.5 }}>
                One quick check before we finish setting up your account
              </Typography>
              {error && (
                <Alert severity="error" sx={{ my: 1.5 }}>
                  {error}
                </Alert>
              )}
              <Box sx={{ mt: 1.5, opacity: phase === "submitting" ? 0.6 : 1 }}>
                <AgeGate
                  onConfirmed={() => {
                    if (phase === "submitting") return;
                    void complete();
                  }}
                />
              </Box>
            </>
          )}
        </Paper>
      </Box>
    </>
  );
}
