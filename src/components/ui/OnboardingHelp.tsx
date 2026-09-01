"use client";

import { Box, IconButton, Stack, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { HelpCircle, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

export interface OnboardingTip {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  iconColor?: string;
  title: string;
  body: string;
  shortcut?: string;
}

interface OnboardingHelpProps {
  storageKey: string;
  title?: string;
  subtitle?: string;
  tips: OnboardingTip[];
}

export function OnboardingHelp({
  storageKey,
  title = "Quick tour",
  subtitle = "Things you might've missed",
  tips,
}: OnboardingHelpProps) {
  const [open, setOpen] = useState(false);
  const [showBadge, setShowBadge] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(storageKey);
    if (!seen) setShowBadge(true);
  }, [storageKey]);

  const handleDismiss = () => {
    setOpen(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, "1");
    }
    setShowBadge(false);
  };

  return (
    <>
      <Box
        component="button"
        onClick={() => setOpen(true)}
        aria-label="Help and tour"
        sx={{
          position: "fixed",
          bottom: { xs: 16, md: 24 },
          right: { xs: 16, md: 24 },
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "rgba(20,22,28,0.7)",
          backdropFilter: "blur(14px) saturate(160%)",
          WebkitBackdropFilter: "blur(14px) saturate(160%)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "rgba(255,255,255,0.85)",
          cursor: "pointer",
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow:
            "0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
          transition: "all 220ms cubic-bezier(0.22, 0.61, 0.36, 1)",
          p: 0,
          "&:hover": {
            background: "rgba(249,115,22,0.18)",
            borderColor: "rgba(249,115,22,0.4)",
            color: "#FB923C",
            transform: "translateY(-2px)",
            boxShadow:
              "0 12px 32px rgba(0,0,0,0.5), 0 0 16px rgba(249,115,22,0.3)",
          },
        }}
      >
        <HelpCircle size={20} />
        {showBadge && (
          <Box
            sx={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#F97316",
              boxShadow: "0 0 8px rgba(249,115,22,0.9)",
              animation: "pulse-badge 2s ease-in-out infinite",
              "@keyframes pulse-badge": {
                "0%, 100%": { opacity: 1, transform: "scale(1)" },
                "50%": { opacity: 0.6, transform: "scale(1.15)" },
              },
            }}
          />
        )}
      </Box>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={handleDismiss}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.65)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                zIndex: 2000,
              }}
            />
            <Box
              sx={{
                position: "fixed",
                inset: 0,
                zIndex: 2001,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 2,
                pointerEvents: "none",
              }}
            >
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.96 }}
                transition={{
                  duration: 0.32,
                  ease: [0.22, 0.61, 0.36, 1],
                }}
                style={{
                  width: "100%",
                  maxWidth: 560,
                  // Cap to the viewport (minus the outer 16px inset padding
                  // on each side) so a long tips list can never push the
                  // header or the footer's dismiss button off-screen the
                  // way an unconstrained, vertically-centered card does —
                  // it used to just overflow equally past both edges with
                  // no way to reach either.
                  maxHeight: "calc(100vh - 32px)",
                  pointerEvents: "auto",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    maxHeight: "100%",
                    borderRadius: "1.5rem",
                    background: "rgba(15,17,23,0.95)",
                    backdropFilter: "blur(20px) saturate(160%)",
                    WebkitBackdropFilter: "blur(20px) saturate(160%)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow:
                      "0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(249,115,22,0.08), inset 0 1px 0 rgba(255,255,255,0.06)",
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      px: 2.75,
                      py: 2,
                      flexShrink: 0,
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                    }}
                  >
                    <Box
                      sx={{
                        width: 30,
                        height: 30,
                        borderRadius: "9px",
                        background:
                          "linear-gradient(135deg, #F97316, #EA580C)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 0 16px rgba(249,115,22,0.4)",
                        flexShrink: 0,
                      }}
                    >
                      <Sparkles size={14} color="#0A0A0A" />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        sx={{
                          fontSize: "0.95rem",
                          fontWeight: 800,
                          color: "rgba(255,255,255,0.96)",
                          lineHeight: 1.15,
                          letterSpacing: "-0.015em",
                        }}
                      >
                        {title}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: "0.74rem",
                          color: "rgba(255,255,255,0.55)",
                          mt: 0.25,
                        }}
                      >
                        {subtitle}
                      </Typography>
                    </Box>
                    <IconButton
                      onClick={handleDismiss}
                      sx={{
                        color: "rgba(255,255,255,0.6)",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "10px",
                        width: 28,
                        height: 28,
                        flexShrink: 0,
                      }}
                    >
                      <X size={13} />
                    </IconButton>
                  </Box>

                  <Box sx={{ p: 2, flex: 1, minHeight: 0, overflowY: "auto" }}>
                    <Stack spacing={1.1}>
                      {tips.map((tip, i) => {
                        const Icon = tip.icon;
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{
                              duration: 0.32,
                              delay: 0.05 + i * 0.06,
                              ease: [0.22, 0.61, 0.36, 1],
                            }}
                          >
                            <Box
                              sx={{
                                px: 1.75,
                                py: 1.35,
                                borderRadius: "12px",
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid rgba(255,255,255,0.06)",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 1.5,
                                transition: "all 180ms ease",
                                "&:hover": {
                                  background: "rgba(255,255,255,0.06)",
                                  borderColor: "rgba(249,115,22,0.2)",
                                },
                              }}
                            >
                              <Box
                                sx={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: "8px",
                                  background: `${tip.iconColor ?? "#F97316"}22`,
                                  border: `1px solid ${tip.iconColor ?? "#F97316"}55`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                <Icon
                                  size={14}
                                  color={tip.iconColor ?? "#F97316"}
                                />
                              </Box>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack
                                  direction="row"
                                  alignItems="center"
                                  spacing={1}
                                >
                                  <Typography
                                    sx={{
                                      fontSize: "0.86rem",
                                      fontWeight: 700,
                                      color: "rgba(255,255,255,0.94)",
                                    }}
                                  >
                                    {tip.title}
                                  </Typography>
                                  {tip.shortcut && (
                                    <Box
                                      sx={{
                                        px: 0.85,
                                        py: 0.2,
                                        borderRadius: "5px",
                                        background: "rgba(255,255,255,0.05)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        fontFamily: "Monaco, Menlo, monospace",
                                        fontSize: "0.68rem",
                                        fontWeight: 600,
                                        color: "rgba(255,255,255,0.55)",
                                      }}
                                    >
                                      {tip.shortcut}
                                    </Box>
                                  )}
                                </Stack>
                                <Typography
                                  sx={{
                                    fontSize: "0.78rem",
                                    color: "rgba(255,255,255,0.58)",
                                    mt: 0.25,
                                    lineHeight: 1.4,
                                  }}
                                >
                                  {tip.body}
                                </Typography>
                              </Box>
                            </Box>
                          </motion.div>
                        );
                      })}
                    </Stack>
                  </Box>

                  <Box
                    sx={{
                      px: 2.75,
                      py: 1.75,
                      flexShrink: 0,
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: "0.72rem",
                        color: "rgba(255,255,255,0.4)",
                        flex: 1,
                      }}
                    >
                      Tap the <Box component="span" sx={{ color: "#FB923C", fontWeight: 700 }}>?</Box> anytime to see this again.
                    </Typography>
                    <Box
                      component="button"
                      onClick={handleDismiss}
                      sx={{
                        px: 2.25,
                        py: 0.75,
                        borderRadius: "999px",
                        background: "linear-gradient(135deg, #F97316, #EA580C)",
                        color: "#0A0A0A",
                        fontWeight: 700,
                        fontSize: "0.82rem",
                        border: "none",
                        cursor: "pointer",
                        transition: "all 180ms ease",
                        boxShadow: "0 8px 24px rgba(249,115,22,0.3)",
                        flexShrink: 0,
                        "&:hover": {
                          background: "linear-gradient(135deg, #FB923C, #F97316)",
                          transform: "translateY(-1px)",
                        },
                      }}
                    >
                      Got it
                    </Box>
                  </Box>
                </Box>
              </motion.div>
            </Box>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
