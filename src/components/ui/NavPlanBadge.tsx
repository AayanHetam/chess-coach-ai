"use client";

import { useState, MouseEvent } from "react";
import { Box, Popover, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useEntitlement } from "@/hooks/useEntitlement";
import { usePaywallDialog } from "@/contexts/PaywallDialogContext";
import { PRICE_DISPLAY } from "@/lib/billing/config";

const orangeGradient = "linear-gradient(135deg, #F97316 0%, #EA580C 100%)";

function fmtDate(ms: number | null): string {
  if (ms === null) return "soon";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type Tone = "premium" | "trial" | "ending" | "free";

const TONE_SX: Record<Tone, Record<string, string>> = {
  premium: {
    background: "rgba(249,115,22,0.14)",
    border: "1px solid rgba(249,115,22,0.4)",
    color: "#FB923C",
  },
  trial: {
    background: "rgba(249,115,22,0.10)",
    border: "1px solid rgba(249,115,22,0.3)",
    color: "#FDBA74",
  },
  ending: {
    background: "rgba(245,158,11,0.12)",
    border: "1px solid rgba(245,158,11,0.4)",
    color: "#FCD34D",
  },
  free: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.7)",
  },
};

/**
 * Compact plan-status pill for the glass nav (NavPill). Reads the live
 * entitlement and shows "Premium" / "Free tier" / "Trial · Nd" / "Premium til
 * {date}" (when a cancellation is scheduled). Clicking opens a short popover
 * that elaborates and offers the relevant action (Upgrade / Manage / Resume).
 *
 * Self-gates: renders nothing unless freemium is enforced AND a user is loaded,
 * so it's invisible during the dark-launch window and for signed-out visitors.
 */
export default function NavPlanBadge() {
  const router = useRouter();
  const {
    entitlement,
    freemiumEnabled,
    isPremium,
    isOnTrial,
    trialDaysRemaining,
    hasStripeSubscription,
    cancelAtPeriodEnd,
  } = useEntitlement();
  const { openPaywallDialog } = usePaywallDialog();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (!freemiumEnabled || !entitlement) return null;

  const close = () => setAnchor(null);
  const goManage = () => {
    close();
    void router.push("/pricing");
  };
  const goUpgrade = () => {
    close();
    openPaywallDialog({ reason: "manual" });
  };

  const endMs = entitlement.currentPeriodEnd ?? entitlement.trialEndsAt;
  const price = `${PRICE_DISPLAY.amount}/${PRICE_DISPLAY.cadence}`;
  const dayWord = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

  let tone: Tone;
  let label: string;
  let title: string;
  let body: string;
  let primary: { label: string; action: () => void } | null = null;

  if (entitlement.comped) {
    tone = "premium";
    label = "Premium";
    title = "Premium — on us";
    body =
      "You have free Premium access through a partner program. Enjoy unlimited coaching.";
  } else if (isPremium && cancelAtPeriodEnd) {
    tone = "ending";
    label = `Premium til ${fmtDate(endMs)}`;
    title = "Premium ending";
    body = `Your Premium is set to cancel on ${fmtDate(endMs)}. You keep full access until then, after which you move to the Free plan.`;
    primary = { label: "Resume / manage", action: goManage };
  } else if (isOnTrial) {
    tone = "trial";
    label = `Trial · ${trialDaysRemaining}d`;
    title = "Premium trial";
    body = hasStripeSubscription
      ? `${dayWord(trialDaysRemaining)} left. Premium continues automatically on ${fmtDate(endMs)} at ${price}.`
      : `${dayWord(trialDaysRemaining)} of full Premium left. Keep it going for ${price}.`;
    primary = hasStripeSubscription
      ? { label: "Manage subscription", action: goManage }
      : { label: `Keep Premium — ${price}`, action: goUpgrade };
  } else if (isPremium) {
    tone = "premium";
    label = "Premium";
    title = "Premium";
    body =
      "Unlimited AI game analysis, follow-up coaching, the puzzle coach, and daily lessons.";
    primary = { label: "Manage subscription", action: goManage };
  } else {
    tone = "free";
    label = "Free tier";
    title = "Free plan";
    body = `A few AI-coach analyses a day, plus play, puzzles, and openings. Go unlimited for ${price}.`;
    primary = { label: `Upgrade — ${price}`, action: goUpgrade };
  }

  return (
    <Box sx={{ display: { xs: "none", sm: "flex" }, alignItems: "center", ml: 0.5 }}>
      <Box
        component="button"
        type="button"
        aria-label={`Plan: ${label}`}
        onClick={(e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)}
        sx={{
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 0.6,
          px: 1.25,
          py: 0.6,
          borderRadius: "999px",
          fontSize: "0.76rem",
          fontWeight: 700,
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
          outline: "none",
          transition: "all 180ms ease",
          ...TONE_SX[tone],
          "&:hover": { filter: "brightness(1.12)" },
        }}
      >
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "currentColor",
            opacity: 0.9,
          }}
        />
        {label}
      </Box>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              p: 2,
              width: 280,
              maxWidth: "90vw",
              background: "rgba(20,22,28,0.94)",
              backdropFilter: "blur(16px) saturate(160%)",
              WebkitBackdropFilter: "blur(16px) saturate(160%)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "14px",
              color: "rgba(255,255,255,0.94)",
            },
          },
        }}
      >
        <Typography sx={{ fontSize: "0.95rem", fontWeight: 800, letterSpacing: "-0.01em" }}>
          {title}
        </Typography>
        <Typography
          sx={{
            mt: 0.75,
            fontSize: "0.82rem",
            lineHeight: 1.5,
            color: "rgba(255,255,255,0.62)",
          }}
        >
          {body}
        </Typography>
        {primary && (
          <Box
            component="button"
            type="button"
            onClick={primary.action}
            sx={{
              mt: 1.75,
              width: "100%",
              cursor: "pointer",
              border: "none",
              outline: "none",
              py: 0.9,
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "0.82rem",
              color: "#0A0A0A",
              background: orangeGradient,
              boxShadow: "0 4px 14px rgba(249,115,22,0.3)",
              transition: "all 160ms ease",
              "&:hover": { transform: "translateY(-1px)" },
            }}
          >
            {primary.label}
          </Box>
        )}
      </Popover>
    </Box>
  );
}
