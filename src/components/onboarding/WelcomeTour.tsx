"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Box, Modal, Stack, Typography } from "@mui/material";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarCheck, Puzzle, X, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NUDGE_DISMISS_KEY } from "@/components/onboarding/OnboardingNudge";

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
  icon: LucideIcon;
};

// Deliberately not nav order: the tour sells the loop — solve now, understand
// your games, then meet the plan that strings the habit together.
const STEPS: TourStep[] = [
  {
    navLabel: "Practice",
    title: "Solve puzzles, with a coach",
    body: "Practice serves puzzles picked for your level. Miss one and the coach walks through why the right move works — not just what it was.",
    icon: Puzzle,
  },
  {
    navLabel: "Analyze",
    title: "See where your games turned",
    body: "Import a game from Chess.com or Lichess, or paste any PGN. Analyze finds the turning points and explains them in plain English.",
    icon: Zap,
  },
  {
    navLabel: "Plan",
    title: "Plan ties it together",
    body: "Plan is home base: a short daily set of puzzles, openings and review, tracked toward your rating goal. Start here each day.",
    icon: CalendarCheck,
  },
];

const orangeGradient = "linear-gradient(135deg, #F97316 0%, #EA580C 100%)";
const orangeHover = "linear-gradient(135deg, #FB923C 0%, #F97316 100%)";
const ease = [0.22, 0.61, 0.36, 1] as const;

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

  const startTraining = () => {
    finish();
    if (router.pathname !== "/plan") void router.push("/plan");
  };

  const onProductSurface = PRODUCT_PREFIXES.some(
    (p) => router.pathname === p || router.pathname.startsWith(`${p}/`),
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
  const Icon = current.icon;

  return (
    <Modal
      open={open}
      onClose={finish}
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
        aria-label="Quick tour"
        sx={{
          position: "relative",
          width: { xs: "92vw", sm: 460 },
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

        <Typography
          sx={{
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
          }}
        >
          Quick tour
        </Typography>
        <Typography
          sx={{
            mt: 0.5,
            fontSize: "1.2rem",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          Find your way around
        </Typography>

        {/* Miniature of the real nav pill. Same labels, same order, same
            sliding ember indicator — the indicator IS the lesson. */}
        <Box
          aria-hidden
          sx={{
            mt: 2,
            display: "flex",
            justifyContent: "center",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "999px",
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
                  fontWeight: indicated ? 700 : 500,
                  color: indicated ? "#FB923C" : "rgba(255,255,255,0.45)",
                  transition: "color 220ms ease",
                  borderRadius: "999px",
                  whiteSpace: "nowrap",
                }}
              >
                {indicated && (
                  <motion.div
                    layoutId="welcomeTourIndicator"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 380, damping: 32, mass: 0.8 }
                    }
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "999px",
                      background:
                        "linear-gradient(135deg, rgba(249,115,22,0.2), rgba(234,88,12,0.12))",
                      border: "1px solid rgba(249,115,22,0.4)",
                      boxShadow:
                        "0 0 16px rgba(249,115,22,0.18), inset 0 1px 0 rgba(255,255,255,0.06)",
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
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease }}
            >
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
                  mb: 1.5,
                }}
              >
                <Icon size={20} color="#0A0A0A" />
              </Box>
              <Typography
                component="h2"
                sx={{
                  fontSize: "1.05rem",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.25,
                }}
              >
                {current.title}
              </Typography>
              <Typography
                sx={{
                  mt: 0.75,
                  fontSize: "0.88rem",
                  lineHeight: 1.5,
                  color: "rgba(255,255,255,0.6)",
                }}
              >
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
                  background:
                    i === step ? "#F97316" : "rgba(255,255,255,0.18)",
                  transition: "all 220ms ease",
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
                border: "1px solid rgba(255,255,255,0.1)",
                outline: "none",
                px: 2,
                py: 1.05,
                borderRadius: "12px",
                fontWeight: 700,
                fontSize: "0.88rem",
                color: "rgba(255,255,255,0.7)",
                background: "transparent",
                transition: "all 180ms ease",
                "&:hover": {
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.92)",
                },
              }}
            >
              Back
            </Box>
          )}
          <Box
            component="button"
            type="button"
            onClick={
              isLast ? startTraining : () => setStep((s) => s + 1)
            }
            sx={{
              cursor: "pointer",
              border: "none",
              outline: "none",
              px: 2.5,
              py: 1.05,
              borderRadius: "12px",
              fontWeight: 700,
              fontSize: "0.88rem",
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
            {isLast ? "Start training" : "Next"}
          </Box>
        </Stack>
      </Box>
    </Modal>
  );
}
