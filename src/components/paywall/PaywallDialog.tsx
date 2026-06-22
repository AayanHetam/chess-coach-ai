"use client";

import React, { useState } from "react";
import { Box, Modal, Stack, Typography } from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Check, AlertTriangle } from "lucide-react";
import { useEntitlement } from "@/hooks/useEntitlement";
import { PRICE_DISPLAY } from "@/lib/billing/config";
import type { OpenPaywallOptions } from "@/contexts/PaywallDialogContext";

// MUI Modal calls cloneElement(child, { ref }); AnimatePresence is fragment-
// shaped, so we give Modal a real DOM node to attach to (same fix as AuthDialog).
const ModalChild = React.forwardRef<
  HTMLDivElement,
  { children: React.ReactNode }
>(function ModalChild({ children }, ref) {
  return <div ref={ref}>{children}</div>;
});

interface PaywallDialogProps {
  open: boolean;
  onClose: () => void;
  context: OpenPaywallOptions | null;
}

const PREMIUM_BENEFITS = [
  "Unlimited AI coach game analysis",
  "Unlimited follow-up coaching chat",
  "Interactive puzzle coach on every puzzle",
  "Daily concept micro-lessons",
  "Fact-grounded Mastermind analysis",
];

const orangeGradient = "linear-gradient(135deg, #F97316 0%, #EA580C 100%)";
const orangeHover = "linear-gradient(135deg, #FB923C 0%, #F97316 100%)";

export default function PaywallDialog({
  open,
  onClose,
  context,
}: PaywallDialogProps) {
  const { isOnTrial, trialDaysRemaining } = useEntitlement();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpgrade = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not start checkout.");
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) throw new Error("No checkout URL returned.");
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  };

  const subtitle = isOnTrial
    ? `You're on a free trial${
        trialDaysRemaining > 0
          ? ` — ${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"} left`
          : ""
      }. Keep unlimited coaching for ${PRICE_DISPLAY.amount}/${PRICE_DISPLAY.cadence}.`
    : context?.feature
      ? `You've used today's free ${context.feature}. Go unlimited for ${PRICE_DISPLAY.amount}/${PRICE_DISPLAY.cadence}.`
      : `Unlock unlimited AI coaching for ${PRICE_DISPLAY.amount}/${PRICE_DISPLAY.cadence}.`;

  return (
    <Modal
      open={open}
      onClose={onClose}
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
      }}
    >
      <ModalChild>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                outline: "none",
              }}
            >
              <Box
                role="dialog"
                aria-modal="true"
                aria-label="Upgrade to Premium"
                sx={{
                  width: { xs: "92vw", sm: 440 },
                  maxWidth: "92vw",
                  maxHeight: "84vh",
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: "1.5rem",
                  background:
                    "linear-gradient(180deg, rgba(20,22,28,0.92), rgba(12,14,20,0.92))",
                  backdropFilter: "blur(20px) saturate(150%)",
                  WebkitBackdropFilter: "blur(20px) saturate(150%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow:
                    "0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.94)",
                  overflow: "hidden",
                }}
              >
                {/* Header */}
                <Box
                  sx={{
                    position: "relative",
                    px: 3,
                    pt: 3,
                    pb: 2.25,
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <Box
                    onClick={onClose}
                    aria-label="Close"
                    sx={{
                      position: "absolute",
                      top: 16,
                      right: 16,
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
                      mb: 1.5,
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
                      color: "rgba(255,255,255,0.96)",
                    }}
                  >
                    Unlock Chess Masti Premium
                  </Typography>
                  <Typography
                    sx={{
                      mt: 0.4,
                      fontSize: "0.82rem",
                      color: "rgba(255,255,255,0.55)",
                    }}
                  >
                    {subtitle}
                  </Typography>
                </Box>

                {/* Body */}
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    px: 3,
                    py: 2.5,
                    "&::-webkit-scrollbar": { width: 6 },
                    "&::-webkit-scrollbar-thumb": {
                      background: "rgba(249,115,22,0.2)",
                      borderRadius: "3px",
                    },
                  }}
                >
                  <Stack spacing={1.25}>
                    {PREMIUM_BENEFITS.map((b) => (
                      <Stack
                        key={b}
                        direction="row"
                        spacing={1.1}
                        alignItems="flex-start"
                      >
                        <Box
                          sx={{
                            mt: "1px",
                            width: 18,
                            height: 18,
                            borderRadius: "6px",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(249,115,22,0.14)",
                            border: "1px solid rgba(249,115,22,0.3)",
                          }}
                        >
                          <Check size={12} color="#FB923C" />
                        </Box>
                        <Typography
                          sx={{
                            fontSize: "0.88rem",
                            color: "rgba(255,255,255,0.86)",
                            lineHeight: 1.4,
                          }}
                        >
                          {b}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>

                  {/* Price chip */}
                  <Box
                    sx={{
                      mt: 2.5,
                      display: "flex",
                      alignItems: "baseline",
                      gap: 0.75,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: "1.6rem",
                        fontWeight: 800,
                        color: "rgba(255,255,255,0.96)",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {PRICE_DISPLAY.amount}
                    </Typography>
                    <Typography
                      sx={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)" }}
                    >
                      / {PRICE_DISPLAY.cadence}
                    </Typography>
                  </Box>

                  {error && (
                    <Box
                      sx={{
                        mt: 2,
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 1,
                        p: 1.25,
                        borderRadius: "10px",
                        background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.25)",
                      }}
                    >
                      <AlertTriangle
                        size={14}
                        color="#fca5a5"
                        style={{ marginTop: 2, flexShrink: 0 }}
                      />
                      <Typography
                        sx={{ fontSize: "0.82rem", color: "#fca5a5", lineHeight: 1.4 }}
                      >
                        {error}
                      </Typography>
                    </Box>
                  )}

                  <Box
                    component="button"
                    type="button"
                    onClick={handleUpgrade}
                    disabled={submitting}
                    sx={{
                      mt: 2.5,
                      width: "100%",
                      cursor: submitting ? "not-allowed" : "pointer",
                      opacity: submitting ? 0.7 : 1,
                      border: "none",
                      outline: "none",
                      py: 1.25,
                      borderRadius: "12px",
                      fontWeight: 700,
                      fontSize: "0.92rem",
                      color: "#0A0A0A",
                      background: orangeGradient,
                      boxShadow: "0 6px 18px rgba(249,115,22,0.32)",
                      transition: "all 180ms ease",
                      "&:hover": submitting
                        ? {}
                        : {
                            background: orangeHover,
                            transform: "translateY(-1px)",
                            boxShadow: "0 8px 22px rgba(249,115,22,0.42)",
                          },
                    }}
                  >
                    {submitting
                      ? "Starting checkout…"
                      : `Upgrade — ${PRICE_DISPLAY.amount}/${PRICE_DISPLAY.cadence}`}
                  </Box>

                  <Typography
                    sx={{
                      mt: 1.5,
                      fontSize: "0.7rem",
                      color: "rgba(255,255,255,0.42)",
                      textAlign: "center",
                      lineHeight: 1.5,
                    }}
                  >
                    Auto-renews at {PRICE_DISPLAY.amount}/{PRICE_DISPLAY.cadence}{" "}
                    until you cancel. You&apos;ll see the exact amount due today
                    at checkout. By continuing you agree to our{" "}
                    <Box
                      component="a"
                      href="/terms"
                      sx={{ color: "#FB923C", textDecoration: "none" }}
                    >
                      Terms
                    </Box>{" "}
                    and{" "}
                    <Box
                      component="a"
                      href="/privacy"
                      sx={{ color: "#FB923C", textDecoration: "none" }}
                    >
                      Privacy Policy
                    </Box>
                    .
                  </Typography>

                  <Typography
                    component="a"
                    href="/pricing#redeem"
                    sx={{
                      display: "block",
                      textAlign: "center",
                      mt: 1.75,
                      fontSize: "0.8rem",
                      color: "#FB923C",
                      textDecoration: "none",
                      "&:hover": { color: "#FDBA74" },
                    }}
                  >
                    Have a promo code?
                  </Typography>
                </Box>
              </Box>
            </motion.div>
          )}
        </AnimatePresence>
      </ModalChild>
    </Modal>
  );
}
