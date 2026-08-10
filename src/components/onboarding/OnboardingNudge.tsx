"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Box, Modal, Stack, Typography } from "@mui/material";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasFreshPendingFlush } from "@/components/onboarding/quizStorage";

const DISMISS_KEY = "cm_onboarding_nudge_dismissed";

// Surfaces where the nudge would be redundant or in the way: the quiz itself,
// and /profile (which is exactly where we'd be sending them).
const SUPPRESSED_PREFIXES = ["/onboarding", "/profile"];

const orangeGradient = "linear-gradient(135deg, #F97316 0%, #EA580C 100%)";
const orangeHover = "linear-gradient(135deg, #FB923C 0%, #F97316 100%)";

/**
 * Gentle, one-time welcome nudge for a signed-in user who hasn't completed the
 * personalization quiz. REPLACES the old OnboardingGate, which hard-redirected
 * such users to /onboarding mid-task and yanked them out of whatever they were
 * doing. This never navigates on its own — it just offers a path to /profile,
 * where the "Start personalization test" button lives. Dismissable, and
 * remembered in localStorage so it appears at most once per browser.
 */
export default function OnboardingNudge() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [mounted, setMounted] = useState(false);
  // Assume dismissed until storage is read, so the dialog never flashes on a
  // returning user before we know they already dismissed it.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setMounted(true);
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode / storage disabled — fine, it just won't persist */
    }
  };

  const goToProfile = () => {
    dismiss();
    void router.push("/profile");
  };

  const onSuppressedSurface = SUPPRESSED_PREFIXES.some(
    (p) => router.pathname === p || router.pathname.startsWith(`${p}/`),
  );

  const shouldShow =
    mounted &&
    !loading &&
    !!user &&
    !!profile &&
    !profile.onboardingCompletedAt &&
    !hasFreshPendingFlush() && // a pre-auth quiz is still being persisted
    !dismissed &&
    !onSuppressedSurface;

  return (
    <Modal
      open={shouldShow}
      onClose={dismiss}
      closeAfterTransition
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: "rgba(8,9,12,0.72)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          },
        },
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        outline: "none",
        p: 2,
      }}
    >
      <Box
        role="dialog"
        aria-modal="true"
        aria-label="Personalize your coaching"
        sx={{
          position: "relative",
          width: { xs: "92vw", sm: 420 },
          maxWidth: "92vw",
          p: 3,
          borderRadius: "1.5rem",
          background:
            "linear-gradient(180deg, rgba(20,22,28,0.94), rgba(12,14,20,0.94))",
          backdropFilter: "blur(20px) saturate(150%)",
          WebkitBackdropFilter: "blur(20px) saturate(150%)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow:
            "0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.94)",
          outline: "none",
        }}
      >
        <Box
          onClick={dismiss}
          aria-label="Dismiss"
          sx={{
            position: "absolute",
            top: 14,
            right: 14,
            cursor: "pointer",
            width: 28,
            height: 28,
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.55)",
            transition: "all 180ms ease",
            "&:hover": {
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.92)",
            },
          }}
        >
          <X size={16} />
        </Box>

        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: "12px",
            background: orangeGradient,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow:
              "0 0 24px rgba(249,115,22,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
            mb: 1.75,
          }}
        >
          <Sparkles size={20} color="#0A0A0A" />
        </Box>

        <Typography
          sx={{
            fontSize: "1.15rem",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          Welcome to Chess Masti 🎉
        </Typography>
        <Typography
          sx={{
            mt: 0.75,
            fontSize: "0.88rem",
            lineHeight: 1.5,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          Take a quick personalization quiz so your coach knows your level,
          goals, and weak spots — it tailors your analysis, puzzles, and plan.
          It lives in your Profile, and you can do it whenever you like.
        </Typography>

        <Stack direction="row" spacing={1.25} sx={{ mt: 2.5 }}>
          <Box
            component="button"
            type="button"
            onClick={goToProfile}
            sx={{
              flex: 1,
              cursor: "pointer",
              border: "none",
              outline: "none",
              py: 1.15,
              borderRadius: "12px",
              fontWeight: 700,
              fontSize: "0.9rem",
              color: "#0A0A0A",
              background: orangeGradient,
              boxShadow: "0 6px 18px rgba(249,115,22,0.32)",
              transition: "all 180ms ease",
              "&:hover": {
                background: orangeHover,
                transform: "translateY(-1px)",
                boxShadow: "0 8px 22px rgba(249,115,22,0.42)",
              },
            }}
          >
            Set up my profile
          </Box>
          <Box
            component="button"
            type="button"
            onClick={dismiss}
            sx={{
              cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.1)",
              outline: "none",
              px: 2,
              py: 1.15,
              borderRadius: "12px",
              fontWeight: 700,
              fontSize: "0.9rem",
              color: "rgba(255,255,255,0.7)",
              background: "transparent",
              transition: "all 180ms ease",
              "&:hover": {
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.92)",
              },
            }}
          >
            Maybe later
          </Box>
        </Stack>
      </Box>
    </Modal>
  );
}
