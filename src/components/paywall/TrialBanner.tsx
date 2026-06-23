"use client";

import { Box, Typography } from "@mui/material";
import { Sparkles } from "lucide-react";
import { useEntitlement } from "@/hooks/useEntitlement";
import { usePaywallDialog } from "@/contexts/PaywallDialogContext";
import { PRICE_DISPLAY } from "@/lib/billing/config";

/**
 * Slim glass banner shown only while a user is inside their free Premium trial
 * AND freemium enforcement is on. Invisible otherwise (incl. the entire
 * dark-launch period), so mounting it is a no-op until go-live.
 */
export default function TrialBanner() {
  const { freemiumEnabled, isOnTrial, trialDaysRemaining, hasStripeSubscription } =
    useEntitlement();
  const { openPaywallDialog } = usePaywallDialog();

  if (!freemiumEnabled || !isOnTrial) return null;

  const daysLabel =
    trialDaysRemaining <= 0
      ? "Your free trial ends today"
      : `${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"} left in your free Premium trial`;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 1.25,
        flexWrap: "wrap",
        px: 2,
        py: 0.85,
        borderRadius: "12px",
        background:
          "linear-gradient(180deg, rgba(249,115,22,0.12), rgba(249,115,22,0.06))",
        border: "1px solid rgba(249,115,22,0.28)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <Sparkles size={15} color="#FB923C" />
      <Typography
        sx={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.9)", fontWeight: 600 }}
      >
        {daysLabel}
      </Typography>
      {hasStripeSubscription ? (
        // Already subscribed (Stripe-backed trial) — Premium will continue
        // automatically, so never re-prompt to pay. Offer management instead.
        <Box
          component="a"
          href="/pricing"
          sx={{
            color: "#FB923C",
            fontWeight: 700,
            fontSize: "0.82rem",
            textDecoration: "underline",
            textUnderlineOffset: "2px",
            "&:hover": { color: "#FDBA74" },
          }}
        >
          Manage subscription
        </Box>
      ) : (
        // Local no-card trial — genuine upsell to convert before it lapses.
        <Box
          component="button"
          type="button"
          onClick={() => openPaywallDialog({ reason: "manual" })}
          sx={{
            cursor: "pointer",
            border: "none",
            background: "transparent",
            color: "#FB923C",
            fontWeight: 700,
            fontSize: "0.82rem",
            textDecoration: "underline",
            textUnderlineOffset: "2px",
            "&:hover": { color: "#FDBA74" },
          }}
        >
          Keep Premium — {PRICE_DISPLAY.amount}/{PRICE_DISPLAY.cadence}
        </Box>
      )}
    </Box>
  );
}
