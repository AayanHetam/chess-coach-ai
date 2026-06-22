"use client";

import { Box } from "@mui/material";
import { Sparkles } from "lucide-react";
import { usePaywallDialog } from "@/contexts/PaywallDialogContext";
import { useEntitlement } from "@/hooks/useEntitlement";
import { PRICE_DISPLAY } from "@/lib/billing/config";

/**
 * Reusable orange-gradient "Upgrade" pill that opens the global PaywallDialog.
 * Renders nothing for users who are already premium (or when freemium is off),
 * so it self-hides for paying/comped users and during dark-launch.
 */
export default function UpgradeButton({ label }: { label?: string }) {
  const { openPaywallDialog } = usePaywallDialog();
  const { isPremium, freemiumEnabled } = useEntitlement();

  if (!freemiumEnabled || isPremium) return null;

  return (
    <Box
      component="button"
      type="button"
      onClick={() => openPaywallDialog({ reason: "manual" })}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        cursor: "pointer",
        border: "none",
        outline: "none",
        px: 1.75,
        py: 0.7,
        borderRadius: "999px",
        fontWeight: 700,
        fontSize: "0.82rem",
        color: "#0A0A0A",
        background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
        boxShadow: "0 4px 14px rgba(249,115,22,0.32)",
        transition: "all 180ms ease",
        "&:hover": {
          background: "linear-gradient(135deg, #FB923C 0%, #F97316 100%)",
          transform: "translateY(-1px)",
        },
      }}
    >
      <Sparkles size={14} />
      {label ?? `Upgrade — ${PRICE_DISPLAY.amount}/${PRICE_DISPLAY.cadence}`}
    </Box>
  );
}
