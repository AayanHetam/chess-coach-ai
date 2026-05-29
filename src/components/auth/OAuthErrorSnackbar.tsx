"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Snackbar, Alert } from "@mui/material";

// Map the server's machine codes (errorRedirect in
// src/app/api/auth/google/callback/route.ts) to a one-liner the user
// can act on. Unknown codes fall through to a generic message.
const ERROR_MESSAGES: Record<string, string> = {
  state_mismatch:
    "Sign-in session expired. Please try signing in again.",
  missing_params: "Sign-in didn't return cleanly. Try again.",
  token_exchange_failed:
    "Couldn't reach Google. Check your connection and retry.",
  no_id_token: "Google didn't return an ID token. Try again.",
  verify_failed: "Couldn't verify your Google credentials.",
  missing_claims: "Google didn't return enough profile info.",
  email_unverified:
    "Your Google email isn't verified. Verify it with Google, then retry.",
  admin_unavailable:
    "Sign-in service is temporarily unavailable. Try again shortly.",
  access_denied: "You cancelled the sign-in.",
  unknown: "Something went wrong during sign-in.",
};

/**
 * Global Snackbar that surfaces `?oauth_error=...` query params left
 * behind by the OAuth callback when something fails. Previously these
 * landed silently in the URL — the user just saw the landing page
 * with no indication of what went wrong. Now they get a toast and the
 * dirty query param is cleaned up on dismiss.
 *
 * Mounted from AuthProvider so it's globally available without
 * leaking into every page that wants the surface.
 */
export default function OAuthErrorSnackbar() {
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query.oauth_error;
    const code = typeof raw === "string" ? raw : null;
    if (code) {
      setErrorCode(code);
    }
  }, [router.isReady, router.query.oauth_error]);

  const handleClose = () => {
    setErrorCode(null);
    // Strip the dirty query param without a navigation (replace, no scroll)
    // so the user stays on the same page they landed on.
    if (router.query.oauth_error) {
      const { oauth_error, ...rest } = router.query;
      void oauth_error;
      router.replace(
        { pathname: router.pathname, query: rest },
        undefined,
        { shallow: true, scroll: false }
      );
    }
  };

  const message = errorCode
    ? ERROR_MESSAGES[errorCode] ?? `Sign-in failed (${errorCode}).`
    : "";

  return (
    <Snackbar
      open={errorCode !== null}
      autoHideDuration={7000}
      onClose={handleClose}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
    >
      <Alert
        severity="error"
        onClose={handleClose}
        variant="filled"
        sx={{ minWidth: 320 }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
