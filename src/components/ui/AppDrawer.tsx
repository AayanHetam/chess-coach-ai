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
  LogOut,
  Puzzle,
  User,
  X,
  Zap,
} from "lucide-react";
import {
  ACCENT,
  LINE,
  MATERIAL,
  MATERIAL_FALLBACK_SX,
  MOTION,
  SHADOW,
  TEXT,
} from "@/theme/tokens";
import { SIGN_IN_PROPS } from "@/components/ads/PartnerSlot";
import { BrandMark } from "./BrandMark";
import ChatHistoryList from "@/components/chat/ChatHistoryList";
import { EmployeePill } from "@/components/intern/EmployeePill";
import { useViewer } from "@/hooks/useViewer";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthDialog } from "@/contexts/AuthDialogContext";

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
// Practice points at /practice, the mode hub (Puzzles / Puzzle Rush /
// Pattern Training) — see NavPill's matching comment for why.
//
// Order matches NavPill's desktop NAV_LINKS (Plan → Play → Analyze →
// Practice → Learn → Scout) with Home prepended — a returning user
// shouldn't have to relearn the order between the two surfaces. Profile
// and Sign in/out live in their own account section below, next to Donate,
// mirroring the avatar/sign-in control NavPill renders on desktop instead
// of mixing account state into the primary nav list.
const NAV_ITEMS: NavItem[] = [
  { id: "launch", label: "Home", icon: Home, href: "/" },
  // Plan sits directly under Home: it is the product's centre of gravity,
  // not a side feature. Before 2026-08-10 it appeared in NO navigation at
  // all and was reachable only by typing the URL.
  { id: "plan", label: "Plan", icon: CalendarCheck, href: "/plan" },
  { id: "play", label: "Play", icon: Crown, href: "/play" },
  { id: "analysis", label: "Analyze", icon: Zap, href: "/analysis" },
  { id: "practice", label: "Practice", icon: Puzzle, href: "/practice" },
  { id: "learn", label: "Learn", icon: BookOpen, href: "/learn" },
  { id: "scout", label: "Scout", icon: Crosshair, href: "/scout" },
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
  const { user, signOut, loading: authLoading } = useAuth();
  const { openAuthDialog } = useAuthDialog();

  const handleSignIn = () => {
    onClose();
    openAuthDialog();
  };
  const handleSignOut = async () => {
    onClose();
    try {
      await signOut();
    } catch (err) {
      console.error("Sign-out failed:", err);
    }
  };

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
              background: MATERIAL.scrim,
              zIndex: 2000,
            }}
          />
          {/* A sheet: it arrives and leaves along the same path, on a
              critically damped spring, as a heavier material than the nav
              because it is a structural region, and goes solid for anyone
              who asked for reduced transparency. */}
          <Box
            component={motion.aside}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={MOTION.springSheet}
            sx={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              width: "100%",
              maxWidth: 340,
              background: "rgba(28,28,30,0.9)",
              backdropFilter: "saturate(180%) blur(24px)",
              WebkitBackdropFilter: "saturate(180%) blur(24px)",
              borderRight: `1px solid ${LINE.hairline}`,
              boxShadow: SHADOW.modal,
              zIndex: 2001,
              display: "flex",
              flexDirection: "column",
              ...MATERIAL_FALLBACK_SX,
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
              <BrandMark size={36} />
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
                      fontSize: "0.8rem",
                      color: TEXT.secondary,
                      mt: 0.25,
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
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: TEXT.secondary,
                }}
              >
                Navigation
              </Typography>
              <Stack spacing={0.5}>
                {items.map((item) => {
                  const targetHref = item.href;
                  const active = resolvedActiveId === item.id;
                  const Icon = item.icon;
                  return (
                    <Box key={item.id}>
                      <Box
                        component={Link}
                        href={targetHref}
                        prefetch={false}
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
                            ? "rgba(255,255,255,0.1)"
                            : "transparent",
                          color: active ? TEXT.primary : TEXT.secondary,
                          transition:
                            "background-color 160ms ease-out, color 160ms ease-out",
                          "&:hover": {
                            background: active
                              ? "rgba(255,255,255,0.12)"
                              : "rgba(255,255,255,0.06)",
                            color: TEXT.primary,
                          },
                          "&:active": { transform: "scale(0.98)" },
                        }}
                      >
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Icon size={18} strokeWidth={1.75} />
                        </Box>
                        <Typography
                          sx={{
                            fontSize: "1rem",
                            fontWeight: active ? 600 : 500,
                            flex: 1,
                          }}
                        >
                          {item.label}
                        </Typography>
                        {item.comingSoon && (
                          <Typography
                            sx={{
                              fontSize: "0.8125rem",
                              color: TEXT.tertiary,
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
                              background: TEXT.primary,
                            }}
                          />
                        )}
                      </Box>
                    </Box>
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
                  background: ACCENT.tint,
                  color: ACCENT.hover,
                  transition: "background-color 160ms ease-out",
                  "&:hover": { background: "rgba(249,115,22,0.22)" },
                  "&:active": { transform: "scale(0.98)" },
                }}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Heart size={18} strokeWidth={1.75} />
                </Box>
                <Typography sx={{ fontSize: "1rem", fontWeight: 600, flex: 1 }}>
                  Donate
                </Typography>
                <Typography sx={{ fontSize: "0.8125rem", opacity: 0.75 }}>
                  Akanksha
                </Typography>
              </Box>

              {/* Account: signed-out → Sign in row, signed-in → Profile +
                  Sign out. This was previously missing entirely — the only
                  way to sign in on a phone was to close the drawer first and
                  tap the header's Sign In pill, which the drawer's own
                  backdrop sits on top of and swallows the tap for. Hidden
                  during the auth-resolving flash, matching NavPill. */}
              {!authLoading && (
                <Stack spacing={0.5} sx={{ mt: 1.5 }}>
                  {user ? (
                    <>
                      <Box
                        component={Link}
                        href="/profile"
                        prefetch={false}
                        onClick={onClose}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1.5,
                          px: 1.5,
                          py: 1.1,
                          borderRadius: "10px",
                          textDecoration: "none",
                          background:
                            resolvedActiveId === "profile"
                              ? "rgba(255,255,255,0.1)"
                              : "transparent",
                          color:
                            resolvedActiveId === "profile"
                              ? TEXT.primary
                              : TEXT.secondary,
                          transition:
                            "background-color 160ms ease-out, color 160ms ease-out",
                          "&:hover": {
                            background: "rgba(255,255,255,0.06)",
                            color: TEXT.primary,
                          },
                        }}
                      >
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <User size={18} strokeWidth={1.75} />
                        </Box>
                        <Typography
                          sx={{ fontSize: "1rem", fontWeight: 500, flex: 1 }}
                        >
                          Profile
                        </Typography>
                      </Box>
                      <Box
                        component="button"
                        type="button"
                        onClick={handleSignOut}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1.5,
                          px: 1.5,
                          py: 1.1,
                          borderRadius: "10px",
                          border: "1px solid transparent",
                          background: "transparent",
                          color: "rgba(255,255,255,0.78)",
                          font: "inherit",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "all 180ms ease",
                          "&:hover": {
                            background: "rgba(255,255,255,0.04)",
                            color: "rgba(255,255,255,0.95)",
                          },
                        }}
                      >
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <LogOut size={18} strokeWidth={1.75} />
                        </Box>
                        <Typography
                          sx={{ fontSize: "1rem", fontWeight: 500, flex: 1 }}
                        >
                          Sign out
                        </Typography>
                      </Box>
                    </>
                  ) : (
                    <Box
                      component="button"
                      type="button"
                      onClick={handleSignIn}
                      // Hidden under the ChessUSA preview prefix. See SIGN_IN_ATTR.
                      {...SIGN_IN_PROPS}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        px: 1.5,
                        py: 1.1,
                        borderRadius: "10px",
                        border: "none",
                        background: ACCENT.tint,
                        color: ACCENT.hover,
                        font: "inherit",
                        fontWeight: 600,
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                        transition: "background-color 160ms ease-out",
                        "&:hover": { background: "rgba(249,115,22,0.22)" },
                        "&:active": { transform: "scale(0.98)" },
                      }}
                    >
                      <Box
                        sx={{
                          width: 28,
                          height: 28,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <User size={18} strokeWidth={1.75} />
                      </Box>
                      <Typography
                        sx={{ fontSize: "1rem", fontWeight: 600, flex: 1 }}
                      >
                        Sign in
                      </Typography>
                    </Box>
                  )}
                </Stack>
              )}

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
          </Box>
        </>
      )}
    </AnimatePresence>
  );
}
