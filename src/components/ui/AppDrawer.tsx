"use client";

import { Box, IconButton, Stack, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";
import {
  BookOpen,
  Briefcase,
  CalendarCheck,
  Crosshair,
  Crown,
  Heart,
  Home,
  Puzzle,
  User,
  X,
  Zap,
} from "lucide-react";
import { Logo } from "./Logo";
import ChatHistoryList from "@/components/chat/ChatHistoryList";
import { EmployeePill } from "@/components/intern/EmployeePill";
import { useViewer } from "@/hooks/useViewer";

export type NavId =
  | "launch"
  | "plan"
  | "analysis"
  | "play"
  | "practice"
  | "scout"
  | "profile"
  | "learn"
  | "intern";

interface NavItem {
  id: NavId;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  href: string;
  comingSoon?: boolean;
}

// Post-cutover (2026-08-10): every /preview/* route is a 308 redirect to
// its canonical surface, so the drawer links canonical URLs only.
// Practice points at /puzzles — the canonical Practice surface (PR #130);
// legacy /practice still resolves for old bookmarks but isn't navigated to.
const NAV_ITEMS: NavItem[] = [
  { id: "launch", label: "Home", icon: Home, href: "/" },
  // Plan sits directly under Home: it is the product's centre of gravity,
  // not a side feature. Before 2026-08-10 it appeared in NO navigation at
  // all and was reachable only by typing the URL.
  { id: "plan", label: "Plan", icon: CalendarCheck, href: "/plan" },
  { id: "analysis", label: "Analyze", icon: Zap, href: "/analysis" },
  { id: "play", label: "Play", icon: Crown, href: "/play" },
  { id: "practice", label: "Practice", icon: Puzzle, href: "/puzzles" },
  { id: "scout", label: "Scout", icon: Crosshair, href: "/scout" },
  { id: "profile", label: "Profile", icon: User, href: "/profile" },
  { id: "learn", label: "Learn", icon: BookOpen, href: "/learn" },
];

// Appended for CMIP interns only. Replaces the <InternalNavLinks /> button that
// lived in the deleted legacy NavBar — without this, deleting that bar would
// have left /intern reachable only by typing the URL.
const INTERN_NAV_ITEM: NavItem = {
  id: "intern",
  label: "Intern dashboard",
  icon: Briefcase,
  href: "/intern",
};

interface AppDrawerProps {
  open: boolean;
  onClose: () => void;
  activeId?: NavId;
}

export function AppDrawer({ open, onClose, activeId }: AppDrawerProps) {
  const router = useRouter();
  const currentPath = router.pathname;
  const { isIntern } = useViewer();

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const items = isIntern ? [...NAV_ITEMS, INTERN_NAV_ITEM] : NAV_ITEMS;

  // Auto-resolve active item from current path if not passed explicitly
  const resolvedActiveId =
    activeId ?? items.find((i) => i.href === currentPath)?.id;

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
                <Logo variant="bold" size={20} color="#0A0A0A" />
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
                {/* Interns get the EMPLOYEE badge here. It used to live in the
                    legacy NavBar; this drawer is its home now that there is
                    only one nav surface. */}
                {isIntern ? (
                  <Box sx={{ mt: 0.4 }}>
                    <EmployeePill />
                  </Box>
                ) : (
                  <Typography
                    sx={{
                      fontSize: "0.7rem",
                      color: "rgba(255,255,255,0.5)",
                      mt: 0.25,
                      letterSpacing: "0.12em",
                      fontWeight: 600,
                      textTransform: "uppercase",
                    }}
                  >
                    chessmasti.com
                  </Typography>
                )}
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
                {items.map((item, i) => {
                  const targetHref = item.href;
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

              {/* Donate → Akanksha Education Fund (external, new tab). Not a
                  NAV_ITEMS entry: it has no NavId, no route, and must never
                  read as the "active" surface. This is the only donate
                  affordance on phones — the NavPill's pill is md-and-up. */}
              <Box
                component="a"
                href="https://akankshafund.org/donation/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Donate to the Akanksha Education Fund (opens in a new tab)"
                onClick={onClose}
                sx={{
                  mt: 1.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.5,
                  py: 1.1,
                  borderRadius: "10px",
                  textDecoration: "none",
                  background: "linear-gradient(135deg,#F97316 0%,#EA580C 100%)",
                  color: "#0A0A0A",
                  boxShadow: "0 4px 14px rgba(249,115,22,0.32)",
                  transition: "all 180ms ease",
                  "&:hover": {
                    boxShadow: "0 6px 18px rgba(249,115,22,0.42)",
                    transform: "translateX(2px)",
                  },
                }}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "8px",
                    background: "rgba(0,0,0,0.16)",
                    border: "1px solid rgba(0,0,0,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Heart size={14} />
                </Box>
                <Typography sx={{ fontSize: "0.92rem", fontWeight: 700, flex: 1 }}>
                  Donate
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.62rem",
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                    color: "rgba(10,10,10,0.55)",
                    textTransform: "uppercase",
                  }}
                >
                  Akanksha
                </Typography>
              </Box>

              {/* Saved coach conversations. This list had exactly one mount in
                  the app — the legacy NavMenu drawer — so deleting that bar
                  would have made past chats unreachable. It self-hides when
                  signed out, and only mounts (and fetches) while the drawer is
                  open, since AnimatePresence unmounts the whole aside. */}
              <Box
                sx={{
                  mt: 2,
                  pt: 1,
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <ChatHistoryList onNavigate={onClose} />
              </Box>
            </Box>

          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
