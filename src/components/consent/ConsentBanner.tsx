"use client";

import { useEffect, useState } from "react";
import { Box, Paper, Stack, Typography, Button } from "@mui/material";
import NextLink from "next/link";
import {
  getClientConsent,
  setClientConsent,
  gpcEnabled,
} from "@/lib/tracking/consent";
import { track } from "@/lib/tracking/client";

/**
 * Cookie-consent banner (TRK-6). Shows on first visit until "I agree" is
 * chosen; "Read more" opens the privacy policy (cookie section) without
 * dismissing the banner.
 *
 * - Global Privacy Control is honored silently: if the browser signals GPC we
 *   record "rejected" and never show the banner (no nagging an opt-out user).
 * - Strictly-necessary cookies (the auth session) are always on; this gates the
 *   analytics/AI-conversation tier only. Not agreeing means no consent cookie,
 *   and the client SDK + server both treat absent consent as "no" — so there is
 *   no explicit reject button; ignoring the banner is a de-facto opt-out.
 *
 * Styling follows the Chess Masti design OS: smoked glass surface, 1px
 * white-alpha edge, ember accent reserved for the primary action.
 */
export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (gpcEnabled()) {
      setClientConsent("rejected");
      return;
    }
    if (getClientConsent() === null) setVisible(true);
  }, []);

  if (!visible) return null;

  const agree = () => {
    setClientConsent("accepted");
    setVisible(false);
    track("consent.accepted");
  };

  return (
    <Paper
      role="dialog"
      aria-label="Cookie consent"
      elevation={0}
      sx={{
        position: "fixed",
        zIndex: (t) => t.zIndex.snackbar,
        left: { xs: 12, sm: 16 },
        right: { xs: 12, sm: 16 },
        bottom: { xs: 12, sm: 16 },
        mx: "auto",
        maxWidth: 720,
        p: { xs: 2, sm: 2.5 },
        borderRadius: "1.25rem",
        border: "1px solid rgba(255,255,255,0.08)",
        backgroundColor: "rgba(20,20,22,0.72)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        color: "rgba(255,255,255,0.92)",
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ sm: "center" }}
        justifyContent="space-between"
      >
        <Box sx={{ fontSize: 14, lineHeight: 1.5 }}>
          <Typography variant="body2" sx={{ color: "inherit" }}>
            We use cookies for analytics and to improve the AI coach. Essential
            cookies (keeping you signed in) are always on.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button
            component={NextLink}
            href="/privacy"
            variant="text"
            sx={{
              color: "rgba(255,255,255,0.7)",
              whiteSpace: "nowrap",
              textTransform: "none",
            }}
          >
            Read more
          </Button>
          <Button
            onClick={agree}
            variant="contained"
            sx={{
              whiteSpace: "nowrap",
              textTransform: "none",
              backgroundColor: "#ff7a1a",
              "&:hover": { backgroundColor: "#e96a0c" },
            }}
          >
            I agree
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
