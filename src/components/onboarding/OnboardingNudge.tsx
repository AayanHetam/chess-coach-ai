"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Box, Modal, Stack, Typography } from "@mui/material";
import { X } from "lucide-react";
import { Masti } from "@/components/masti";
import { useAuth } from "@/contexts/AuthContext";
import { hasFreshPendingFlush } from "@/components/onboarding/quizStorage";
import {
  ACCENT,
  FONT_SANS,
  LINE,
  MATERIAL,
  MOTION,
  RADIUS,
  SHADOW,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

// Exported so WelcomeTour can defer to this dialog instead of stacking on it.
export const NUDGE_DISMISS_KEY = "cm_onboarding_nudge_dismissed";
const DISMISS_KEY = NUDGE_DISMISS_KEY;

// Surfaces where the nudge would be redundant or in the way: the quiz itself,
// and /profile (which is exactly where we'd be sending them).
const SUPPRESSED_PREFIXES = ["/onboarding", "/profile"];

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
    (p) => router.pathname === p || router.pathname.startsWith(`${p}/`)
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
        backdrop: { sx: { backgroundColor: MATERIAL.scrim } },
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
          borderRadius: `${RADIUS.sheet}px`,
          background: SURFACE.overlay,
          border: `1px solid ${LINE.hairline}`,
          boxShadow: SHADOW.modal,
          color: TEXT.primary,
          fontFamily: FONT_SANS,
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
            borderRadius: `${RADIUS.small}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: TEXT.secondary,
            transition: `background-color ${MOTION.hover}, color ${MOTION.hover}`,
            "&:hover": {
              background: "rgba(255,255,255,0.06)",
              color: TEXT.primary,
            },
          }}
        >
          <X size={16} />
        </Box>

        <Masti
          mood="wave"
          size={72}
          loops={3}
          decorative
          style={{ marginBottom: 12 }}
        />

        <Typography component="h2" sx={{ ...TYPE.h4, color: TEXT.primary }}>
          Welcome to Chess Masti
        </Typography>
        <Typography sx={{ mt: 0.75, ...TYPE.bodySmall, color: TEXT.secondary }}>
          Take a quick personalization quiz so your coach knows your level,
          goals and weak spots. It tailors your analysis, puzzles and plan. It
          lives in your profile, and you can do it whenever you like.
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
              borderRadius: `${RADIUS.pill}px`,
              fontWeight: 600,
              fontSize: TYPE.bodySmall.fontSize,
              fontFamily: "inherit",
              color: TEXT.onAccent,
              background: ACCENT.main,
              transition: `background-color ${MOTION.hover}, transform ${MOTION.press}`,
              "&:hover": { background: ACCENT.hover },
              "&:active": { transform: MOTION.pressScale },
              "&:focus-visible": {
                outline: `2px solid ${TEXT.primary}`,
                outlineOffset: 2,
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
              border: `1px solid ${LINE.strong}`,
              outline: "none",
              px: 2,
              py: 1.15,
              borderRadius: `${RADIUS.pill}px`,
              fontWeight: 600,
              fontSize: TYPE.bodySmall.fontSize,
              fontFamily: "inherit",
              color: TEXT.primary,
              background: "transparent",
              transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}, transform ${MOTION.press}`,
              "&:hover": {
                background: "rgba(255,255,255,0.06)",
                borderColor: TEXT.secondary,
              },
              "&:active": { transform: MOTION.pressScale },
              "&:focus-visible": {
                outline: `2px solid ${TEXT.primary}`,
                outlineOffset: 2,
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
