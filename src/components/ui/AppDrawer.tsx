"use client";

import { Box, IconButton, Stack, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";
import {
  BookOpen,
  Crosshair,
  Crown,
  Home,
  Puzzle,
  Sparkles,
  User,
  X,
  Zap,
} from "lucide-react";

export type NavId =
  | "launch"
  | "analysis"
  | "play"
  | "practice"
  | "scout"
  | "profile"
  | "openings";

interface NavItem {
  id: NavId;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  preview: string;
  production: string;
  comingSoon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: "launch", label: "Home", icon: Home, preview: "/preview/launch", production: "/" },
  { id: "analysis", label: "Analyze", icon: Zap, preview: "/preview/analysis", production: "/analysis" },
  { id: "play", label: "Play", icon: Crown, preview: "/preview/play", production: "/play" },
  { id: "practice", label: "Practice", icon: Puzzle, preview: "/preview/practice", production: "/practice" },
  { id: "scout", label: "Scout", icon: Crosshair, preview: "/preview/scout", production: "/scout" },
  { id: "profile", label: "Profile", icon: User, preview: "/preview/profile", production: "/profile" },
  { id: "openings", label: "Learn", icon: BookOpen, preview: "/preview/openings", production: "/openings" },
];

interface AppDrawerProps {
  open: boolean;
  onClose: () => void;
  activeId?: NavId;
}

export function AppDrawer({ open, onClose, activeId }: AppDrawerProps) {
  const router = useRouter();
  const currentPath = router.pathname;
  const isPreview = currentPath.startsWith("/preview");

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Auto-resolve active item from current path if not passed explicitly
  const resolvedActiveId =
    activeId ??
    NAV_ITEMS.find(
      (i) => i.preview === currentPath || i.production === currentPath
    )?.id;
  const activeItem = NAV_ITEMS.find((i) => i.id === resolvedActiveId);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              zIndex: 2000,
            }}
          />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              width: "100%",
              maxWidth: 340,
              background: "rgba(12,14,20,0.96)",
              backdropFilter: "blur(20px) saturate(160%)",
              WebkitBackdropFilter: "blur(20px) saturate(160%)",
              borderRight: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 0 60px rgba(0,0,0,0.6), inset -1px 0 0 rgba(255,255,255,0.04)",
              zIndex: 2001,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <Box
              sx={{
                px: 3,
                py: 2.5,
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                gap: 1.5,
              }}
            >
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #F97316, #EA580C)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 16px rgba(249,115,22,0.4)",
                }}
              >
                <Sparkles size={16} color="#0A0A0A" />
              </Box>
              <Box>
                <Typography
                  sx={{
                    fontWeight: 800,
                    color: "rgba(255,255,255,0.94)",
                    lineHeight: 1.1,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Chess Masti
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.7rem",
                    color: isPreview ? "#FB923C" : "rgba(255,255,255,0.5)",
                    mt: 0.25,
                    letterSpacing: "0.12em",
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  {isPreview ? "Preview" : "Production"}
                </Typography>
              </Box>
              <Box sx={{ flex: 1 }} />
              <IconButton
                onClick={onClose}
                sx={{
                  color: "rgba(255,255,255,0.7)",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "10px",
                  width: 34,
                  height: 34,
                  "&:hover": {
                    background: "rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,1)",
                  },
                }}
              >
                <X size={16} />
              </IconButton>
            </Box>

            {/* Nav list */}
            <Box sx={{ flex: 1, overflowY: "auto", py: 2, px: 1.5 }}>
              <Typography
                sx={{
                  px: 1.5,
                  pb: 1,
                  fontSize: "0.66rem",
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  color: "rgba(255,255,255,0.38)",
                  textTransform: "uppercase",
                }}
              >
                Navigation
              </Typography>
              <Stack spacing={0.5}>
                {NAV_ITEMS.map((item, i) => {
                  const targetHref = isPreview ? item.preview : item.production;
                  const active = resolvedActiveId === item.id;
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.3,
                        delay: 0.05 + i * 0.04,
                        ease: [0.22, 0.61, 0.36, 1],
                      }}
                    >
                      <Box
                        component={Link}
                        href={targetHref}
                        onClick={onClose}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1.5,
                          px: 1.5,
                          py: 1.1,
                          borderRadius: "10px",
                          textDecoration: "none",
                          background: active
                            ? "linear-gradient(135deg, rgba(249,115,22,0.16), rgba(234,88,12,0.08))"
                            : "transparent",
                          border: active
                            ? "1px solid rgba(249,115,22,0.32)"
                            : "1px solid transparent",
                          color: active
                            ? "#FB923C"
                            : "rgba(255,255,255,0.78)",
                          transition: "all 180ms ease",
                          "&:hover": {
                            background: active
                              ? "linear-gradient(135deg, rgba(249,115,22,0.22), rgba(234,88,12,0.12))"
                              : "rgba(255,255,255,0.04)",
                            color: active ? "#FB923C" : "rgba(255,255,255,0.95)",
                            transform: "translateX(2px)",
                          },
                        }}
                      >
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: "8px",
                            background: active
                              ? "rgba(249,115,22,0.2)"
                              : "rgba(255,255,255,0.04)",
                            border: active
                              ? "1px solid rgba(249,115,22,0.35)"
                              : "1px solid rgba(255,255,255,0.06)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Icon size={14} />
                        </Box>
                        <Typography
                          sx={{
                            fontSize: "0.92rem",
                            fontWeight: active ? 700 : 500,
                            flex: 1,
                          }}
                        >
                          {item.label}
                        </Typography>
                        {item.comingSoon && (
                          <Typography
                            sx={{
                              fontSize: "0.62rem",
                              fontWeight: 700,
                              letterSpacing: "0.14em",
                              color: "rgba(255,255,255,0.35)",
                              textTransform: "uppercase",
                            }}
                          >
                            Soon
                          </Typography>
                        )}
                        {active && (
                          <Box
                            sx={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#F97316",
                              boxShadow: "0 0 8px rgba(249,115,22,0.7)",
                            }}
                          />
                        )}
                      </Box>
                    </motion.div>
                  );
                })}
              </Stack>
            </Box>

            {/* Side toggle */}
            <Box sx={{ p: 2, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <Typography
                sx={{
                  px: 0.5,
                  pb: 1,
                  fontSize: "0.66rem",
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  color: "rgba(255,255,255,0.38)",
                  textTransform: "uppercase",
                }}
              >
                Switch view
              </Typography>
              <Box
                sx={{
                  p: 0.5,
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 0.5,
                }}
              >
                <Box
                  component={Link}
                  href={activeItem?.preview ?? "/preview/launch"}
                  onClick={onClose}
                  sx={{
                    px: 1.5,
                    py: 1,
                    borderRadius: "8px",
                    textDecoration: "none",
                    background: isPreview
                      ? "linear-gradient(135deg, rgba(249,115,22,0.22), rgba(234,88,12,0.12))"
                      : "transparent",
                    border: isPreview
                      ? "1px solid rgba(249,115,22,0.4)"
                      : "1px solid transparent",
                    color: isPreview ? "#FB923C" : "rgba(255,255,255,0.55)",
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    transition: "all 180ms ease",
                  }}
                >
                  Preview
                </Box>
                <Box
                  component={Link}
                  href={activeItem?.production ?? "/"}
                  onClick={onClose}
                  sx={{
                    px: 1.5,
                    py: 1,
                    borderRadius: "8px",
                    textDecoration: "none",
                    background: !isPreview
                      ? "linear-gradient(135deg, rgba(249,115,22,0.22), rgba(234,88,12,0.12))"
                      : "transparent",
                    border: !isPreview
                      ? "1px solid rgba(249,115,22,0.4)"
                      : "1px solid transparent",
                    color: !isPreview ? "#FB923C" : "rgba(255,255,255,0.55)",
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    transition: "all 180ms ease",
                  }}
                >
                  Production
                </Box>
              </Box>
              <Typography
                sx={{
                  fontSize: "0.68rem",
                  color: "rgba(255,255,255,0.4)",
                  mt: 1.25,
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                Preview = dark glass redesign
                <br />
                Production = chessmasti.com
              </Typography>
            </Box>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
