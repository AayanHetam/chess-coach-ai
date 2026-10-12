"use client";

import { Box, IconButton, Stack, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { HelpCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  MATERIAL,
  MATERIAL_FALLBACK_SX,
  MOTION,
  RADIUS,
  SHADOW,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

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
          // Floating chrome the page scrolls under: the one place a
          // material is allowed.
          background: MATERIAL.background,
          backdropFilter: MATERIAL.backdropFilter,
          WebkitBackdropFilter: MATERIAL.backdropFilter,
          border: `1px solid ${MATERIAL.border}`,
          ...MATERIAL_FALLBACK_SX,
          color: TEXT.primary,
          cursor: "pointer",
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: SHADOW.floating,
          transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}, color ${MOTION.hover}, transform ${MOTION.press}`,
          p: 0,
          "&:hover": { borderColor: LINE.strong },
          "&:active": { transform: MOTION.pressScale },
          "&:focus-visible": {
            outline: `2px solid ${TEXT.primary}`,
            outlineOffset: 2,
          },
        }}
      >
        <HelpCircle size={20} strokeWidth={1.75} />
        {showBadge && (
          <Box
            sx={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: ACCENT.main,
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
                background: MATERIAL.scrim,
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
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{
                  duration: 0.18,
                  ease: [0.2, 0, 0, 1],
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
                    borderRadius: `${RADIUS.sheet}px`,
                    background: SURFACE.overlay,
                    border: `1px solid ${LINE.hairline}`,
                    boxShadow: SHADOW.modal,
                    color: TEXT.primary,
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      px: 2.75,
                      py: 2,
                      flexShrink: 0,
                      borderBottom: `1px solid ${LINE.hairline}`,
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        component="h2"
                        sx={{ ...TYPE.h4, color: TEXT.primary }}
                      >
                        {title}
                      </Typography>
                      <Typography
                        sx={{
                          ...TYPE.bodySmall,
                          color: TEXT.secondary,
                          mt: 0.25,
                        }}
                      >
                        {subtitle}
                      </Typography>
                    </Box>
                    <IconButton
                      onClick={handleDismiss}
                      aria-label="Close"
                      sx={{
                        color: TEXT.secondary,
                        width: 28,
                        height: 28,
                        flexShrink: 0,
                      }}
                    >
                      <X size={16} />
                    </IconButton>
                  </Box>

                  <Box sx={{ p: 2, flex: 1, minHeight: 0, overflowY: "auto" }}>
                    <Stack spacing={1.1}>
                      {tips.map((tip, i) => {
                        const Icon = tip.icon;
                        return (
                          <Box
                            key={i}
                            sx={{
                              px: 1.75,
                              py: 1.35,
                              borderRadius: `${RADIUS.control}px`,
                              background: SURFACE.raisedSecondary,
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 1.5,
                            }}
                          >
                            <Icon
                              size={18}
                              strokeWidth={1.75}
                              color={tip.iconColor ?? TEXT.secondary}
                              style={{ flexShrink: 0, marginTop: 2 }}
                            />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Stack
                                direction="row"
                                alignItems="center"
                                spacing={1}
                              >
                                <Typography
                                  sx={{
                                    ...TYPE.bodySmall,
                                    fontWeight: 600,
                                    color: TEXT.primary,
                                  }}
                                >
                                  {tip.title}
                                </Typography>
                                {tip.shortcut && (
                                  <Box
                                    sx={{
                                      px: 0.85,
                                      py: 0.2,
                                      borderRadius: `${RADIUS.small}px`,
                                      background: "rgba(255,255,255,0.06)",
                                      border: `1px solid ${LINE.hairline}`,
                                      fontFamily: FONT_MONO,
                                      fontSize: "0.68rem",
                                      fontWeight: 600,
                                      color: TEXT.secondary,
                                    }}
                                  >
                                    {tip.shortcut}
                                  </Box>
                                )}
                              </Stack>
                              <Typography
                                sx={{
                                  ...TYPE.caption,
                                  color: TEXT.secondary,
                                  mt: 0.25,
                                }}
                              >
                                {tip.body}
                              </Typography>
                            </Box>
                          </Box>
                        );
                      })}
                    </Stack>
                  </Box>

                  <Box
                    sx={{
                      px: 2.75,
                      py: 1.75,
                      flexShrink: 0,
                      borderTop: `1px solid ${LINE.hairline}`,
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <Typography
                      sx={{ ...TYPE.caption, color: TEXT.secondary, flex: 1 }}
                    >
                      Tap the{" "}
                      <Box
                        component="span"
                        sx={{ color: ACCENT.hover, fontWeight: 600 }}
                      >
                        ?
                      </Box>{" "}
                      anytime to see this again.
                    </Typography>
                    <Box
                      component="button"
                      onClick={handleDismiss}
                      sx={{
                        px: 2.25,
                        py: 0.75,
                        borderRadius: `${RADIUS.pill}px`,
                        background: ACCENT.main,
                        color: TEXT.onAccent,
                        fontWeight: 600,
                        fontSize: TYPE.bodySmall.fontSize,
                        border: "none",
                        cursor: "pointer",
                        transition: `background-color ${MOTION.hover}, transform ${MOTION.press}`,
                        flexShrink: 0,
                        "&:hover": { background: ACCENT.hover },
                        "&:active": { transform: MOTION.pressScale },
                        "&:focus-visible": {
                          outline: `2px solid ${TEXT.primary}`,
                          outlineOffset: 2,
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
