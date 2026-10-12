"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Box, Modal, Stack, Typography } from "@mui/material";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { Masti, type MastiMood } from "@/components/masti";
import { useAuth } from "@/contexts/AuthContext";
import { NUDGE_DISMISS_KEY } from "@/components/onboarding/OnboardingNudge";
import {
  TOUR_STEP_ORDER,
  initialTourStep,
  surfaceLabelFor,
} from "@/components/onboarding/welcomeTourSteps";
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

export const TOUR_SEEN_KEY = "cm-welcome-tour-v1";

// Only surfaces where a first-time visitor is actually inside the product.
// The marketing homepage, the quiz, and auth flows keep their own funnels.
const PRODUCT_PREFIXES = [
  "/plan",
  "/play",
  "/analysis",
  "/puzzles",
  "/learn",
  "/scout",
];

// The real nav's labels, in the real nav's order (NavPill.NAV_LINKS). The
// miniature below exists to teach that order, so it must never drift from it.
const MINI_NAV = ["Plan", "Play", "Analyze", "Practice", "Learn", "Scout"];

type TourStep = {
  /** Which MINI_NAV label lights up — the lesson is "this lives HERE". */
  navLabel: string;
  title: string;
  body: string;
  /** Masti acts the step out: a hint for puzzles, reading for analysis, a jump for the plan. */
  mood: MastiMood;
};

// Deliberately not nav order: the tour sells the loop — solve now, understand
// your games, then meet the plan that strings the habit together. The order
// itself lives in welcomeTourSteps.ts (with the per-surface opening step), so
// the labels here are read from it rather than repeated.
const [PRACTICE_LABEL, ANALYZE_LABEL, PLAN_LABEL] = TOUR_STEP_ORDER;
const STEPS: TourStep[] = [
  {
    navLabel: PRACTICE_LABEL,
    title: "Solve puzzles, with a coach",
    body: "Practice serves puzzles picked for your level. Miss one and the coach walks through why the right move works, not just what it was.",
    mood: "idea",
  },
  {
    navLabel: ANALYZE_LABEL,
    title: "See where your games turned",
    body: "Import a game from Chess.com or Lichess, or paste any PGN. Analyze finds the turning points and explains them in plain English.",
    mood: "thinking",
  },
  {
    navLabel: PLAN_LABEL,
    title: "Plan ties it together",
    body: "Plan is home base: a short daily set of puzzles, openings and review, tracked toward your rating goal. Start here each day.",
    mood: "excited",
  },
];

const ease = [0.2, 0, 0, 1] as const;

/**
 * One-time "find your way around" tour for first-time visitors, introducing
 * the three core tools: Puzzles (under Practice), Analyze, and Plan.
 *
 * The signature element is a working miniature of the real NavPill with the
 * same sliding ember indicator — each step moves the indicator to where that
 * tool lives, so the tour teaches the navigation by showing it, not by
 * describing it. (On mobile the same labels live in the burger drawer, so the
 * vocabulary transfers even though the pill itself is desktop chrome.)
 *
 * Shown at most once per browser (localStorage), only on product surfaces,
 * and never while the OnboardingNudge is eligible — two stacked modals teach
 * nothing. If the nudge fires first, the tour waits for a later navigation.
 * Self-styled like OnboardingNudge because it mounts outside the themed
 * Layout in _app.tsx.
 */
export default function WelcomeTour() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  // Assume seen until storage is read, so returning users never see a flash.
  const [seen, setSeen] = useState(true);
  const [nudgeUndismissed, setNudgeUndismissed] = useState(false);
  const [step, setStep] = useState(0);

  // Re-read on navigation: dismissing the nudge should let the tour appear on
  // the NEXT page view, not pop a second modal onto the same one.
  useEffect(() => {
    setMounted(true);
    setStep(initialTourStep(router.pathname));
    try {
      setSeen(localStorage.getItem(TOUR_SEEN_KEY) === "1");
      setNudgeUndismissed(localStorage.getItem(NUDGE_DISMISS_KEY) !== "1");
    } catch {
      setSeen(false);
      setNudgeUndismissed(false);
    }
  }, [router.pathname]);

  const finish = () => {
    setSeen(true);
    try {
      localStorage.setItem(TOUR_SEEN_KEY, "1");
    } catch {
      /* private mode / storage disabled — it just won't persist */
    }
  };

  // Finishing never navigates. The tour used to push /plan from wherever it
  // was opened, which on /puzzles meant "Start training" took you AWAY from
  // the puzzle you were about to train on (2026-09-08 QA). The Plan card has
  // already said where Plan lives; the visitor can go there when they want.
  const surfaceLabel = surfaceLabelFor(router.pathname);
  const onPlan = router.pathname === "/plan";
  const finishLabel = onPlan ? "Start training" : "Got it";

  const onProductSurface = PRODUCT_PREFIXES.some(
    (p) => router.pathname === p || router.pathname.startsWith(`${p}/`)
  );

  // The nudge (personalization) outranks the tour on the page it fires on.
  const nudgeEligible =
    !loading &&
    !!user &&
    !!profile &&
    !profile.onboardingCompletedAt &&
    nudgeUndismissed;

  const open = mounted && !seen && onProductSurface && !nudgeEligible;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Modal
      open={open}
      onClose={finish}
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
        aria-label="Quick tour"
        sx={{
          position: "relative",
          width: { xs: "92vw", sm: 460 },
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
          onClick={finish}
          component="button"
          type="button"
          aria-label="Close tour"
          sx={{
            position: "absolute",
            top: 14,
            right: 14,
            cursor: "pointer",
            width: 28,
            height: 28,
            border: "none",
            background: "transparent",
            borderRadius: `${RADIUS.small}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: TEXT.secondary,
            transition: `background-color ${MOTION.hover}, color ${MOTION.hover}, transform ${MOTION.press}`,
            "&:hover": {
              background: "rgba(255,255,255,0.06)",
              color: TEXT.primary,
            },
            "&:active": { transform: MOTION.pressScale },
            "&:focus-visible": {
              outline: `2px solid ${TEXT.primary}`,
              outlineOffset: 2,
            },
          }}
        >
          <X size={16} />
        </Box>

        <Typography sx={{ ...TYPE.h4, color: TEXT.primary, pr: 4 }}>
          Find your way around
        </Typography>

        {/* Miniature of the real nav pill. Same labels, same order, same
            sliding indicator: the indicator IS the lesson. */}
        <Box
          aria-hidden
          sx={{
            mt: 2,
            display: "flex",
            justifyContent: "center",
            background: SURFACE.raisedSecondary,
            borderRadius: `${RADIUS.pill}px`,
            p: 0.5,
          }}
        >
          {MINI_NAV.map((label) => {
            const indicated = label === current.navLabel;
            return (
              <Box
                key={label}
                sx={{
                  position: "relative",
                  px: { xs: 0.9, sm: 1.4 },
                  py: 0.6,
                  fontSize: { xs: "0.68rem", sm: "0.78rem" },
                  fontWeight: indicated ? 600 : 500,
                  color: indicated ? TEXT.primary : TEXT.secondary,
                  transition: `color ${MOTION.hover}`,
                  borderRadius: `${RADIUS.pill}px`,
                  whiteSpace: "nowrap",
                }}
              >
                {indicated && (
                  <motion.div
                    layoutId="welcomeTourIndicator"
                    transition={
                      reduceMotion ? { duration: 0 } : MOTION.springSheet
                    }
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: RADIUS.pill,
                      background: "rgba(255,255,255,0.1)",
                      zIndex: -1,
                    }}
                  />
                )}
                {label}
              </Box>
            );
          })}
        </Box>

        {/* Step content. Fixed-height region so the dialog doesn't resize as
            copy length varies between steps. */}
        <Box sx={{ mt: 2.25, minHeight: { xs: 148, sm: 128 } }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.18, ease }}
            >
              <Masti
                mood={current.mood}
                size={72}
                loops={2}
                replayKey={step}
                decorative
                style={{ marginBottom: 8 }}
              />
              <Typography
                component="h2"
                sx={{ ...TYPE.h5, color: TEXT.primary }}
              >
                {current.title}
              </Typography>
              <Typography
                sx={{ mt: 0.75, ...TYPE.bodySmall, color: TEXT.secondary }}
              >
                {/* The card for the page under the dialog says so, because
                    "Practice serves puzzles…" read as describing some OTHER
                    page to a visitor who was already on the puzzle trainer. */}
                {current.navLabel === surfaceLabel && (
                  <Box
                    component="span"
                    sx={{ color: ACCENT.hover, fontWeight: 600 }}
                  >
                    You&apos;re here.{" "}
                  </Box>
                )}
                {current.body}
              </Typography>
            </motion.div>
          </AnimatePresence>
        </Box>

        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{ mt: 2.5 }}
        >
          {/* Progress dots double as step markers; buttons do the moving. */}
          <Stack direction="row" spacing={0.75} sx={{ flex: 1 }} aria-hidden>
            {STEPS.map((s, i) => (
              <Box
                key={s.navLabel}
                sx={{
                  width: i === step ? 18 : 6,
                  height: 6,
                  borderRadius: "999px",
                  background: i === step ? ACCENT.main : LINE.strong,
                  transition: `width ${MOTION.hover}, background-color ${MOTION.hover}`,
                }}
              />
            ))}
          </Stack>

          {step > 0 && (
            <Box
              component="button"
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              sx={{
                cursor: "pointer",
                border: `1px solid ${LINE.strong}`,
                outline: "none",
                px: 2,
                py: 1.05,
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
              Back
            </Box>
          )}
          <Box
            component="button"
            type="button"
            onClick={isLast ? finish : () => setStep((s) => s + 1)}
            sx={{
              cursor: "pointer",
              border: "none",
              outline: "none",
              px: 2.5,
              py: 1.05,
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
            {isLast ? finishLabel : "Next"}
          </Box>
        </Stack>
      </Box>
    </Modal>
  );
}
