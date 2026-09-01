"use client";

import { addressAs, avatarInitial } from "@/lib/auth/displayIdentity";
import {
  Avatar,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Typography,
  type SxProps,
  type Theme,
} from "@mui/material";
import Link from "next/link";
import { useState, type MouseEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Menu as MenuIcon, Heart, LogOut, User, Settings } from "lucide-react";
import { Logo } from "./Logo";
import { surfaceAccent } from "./accents";
import { AppDrawer, type NavId } from "./AppDrawer";
import { useAuth } from "@/contexts/AuthContext";
import ProfileDialog from "@/components/auth/ProfileDialog";
import { useAuthDialog } from "@/contexts/AuthDialogContext";

interface NavPillProps {
  active?: NavId;
  /**
   * Page-supplied context rendered inline, immediately after the wordmark —
   * e.g. /analysis puts the loaded game's player names + opening here so the
   * page needs only ONE bar instead of a nav pill stacked on a game header.
   * Given `flex: 1` and `minWidth: 0`, so the slot owns its own truncation.
   */
  contextSlot?: ReactNode;
  /**
   * Page-supplied controls rendered just before the nav links (e.g. the
   * /analysis engine-depth / Load / Save buttons).
   */
  actionsSlot?: ReactNode;
  /**
   * Style overrides for the pill itself. /analysis drops the sticky
   * positioning because the pill is a flex row of a viewport-height column
   * there, not a floating header over a scrolling page.
   */
  sx?: SxProps<Theme>;
}

// Five primary nav links across the production surfaces. Order tells the
// user flow: play your game → analyze it → practice your weakness → learn
// theory → scout your next opponent. Post-cutover (2026-08-10) every
// /preview/* route is a 308 redirect to its canonical surface.
//
// Practice points at /practice, the mode hub (Puzzles / Puzzle Rush /
// Pattern Training). Puzzles itself — the adaptive, AI-coached experience
// shipped in PR #130 — stays reachable one click in via the hub's "Open
// Puzzles" card; Rush and Pattern Training were otherwise dead-end URLs
// nothing in the nav pointed at.
//
// 2026-08-10 (program-first restructure): Plan leads. The product is a
// learning programme that happens to contain a coach, not a coach that
// happens to have a plan — and until now /plan was in NO navigation
// anywhere, reachable only by typing the URL. Everything after it is a
// tool you reach for; Plan is the thing you come back to.
const NAV_LINKS: { id: NavId; label: string; href: string }[] = [
  { id: "plan", label: "Plan", href: "/plan" },
  { id: "play", label: "Play", href: "/play" },
  { id: "analysis", label: "Analyze", href: "/analysis" },
  { id: "practice", label: "Practice", href: "/practice" },
  // "Learn" is the repertoire builder and the courses under it. /openings, the
  // old Vienna-only drill surface, redirects here — it competed with this one
  // and was easier to find, which is how a shipped trainer looks unshipped.
  { id: "learn", label: "Learn", href: "/learn" },
  { id: "scout", label: "Scout", href: "/scout" },
];

// Chess Masti's proceeds cause: the Akanksha Education Fund (501(c)(3)),
// which funds the Akanksha Foundation's schools for under-resourced kids in
// Mumbai, Pune, Nagpur and Navi Mumbai. Deliberately NOT in NAV_LINKS — it
// is an external CTA, not a product surface, so it gets no NavId, no sliding
// indicator, and no mirror in the WelcomeTour's MINI_NAV.
const DONATE_URL = "https://akankshafund.org/donation/";

export function NavPill({
  active,
  contextSlot,
  actionsSlot,
  sx,
}: NavPillProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // With page context in the pill there isn't room for everything at once.
  // The wordmark yields first (the logo mark still links home, and the
  // burger drawer names the app); the link row only yields on genuinely
  // narrow viewports, where it is likewise in the drawer.
  const hasSlots = Boolean(contextSlot || actionsSlot);
  // Hover state lets the indicator preview-slide to the hovered item;
  // snaps back to the truly active item on mouse-leave.
  const [hovered, setHovered] = useState<NavId | null>(null);
  const indicatorTarget = hovered ?? active;

  // ─── Account affordance ───
  // The legacy NavBar (src/sections/layout/NavBar.tsx) used to provide
  // the only sign-in surface on the site. Now that preview routes drop
  // the legacy chrome, we mount a compact account control here: "Sign in"
  // pill when signed out, avatar dropdown when signed in.
  const { user, signOut, loading } = useAuth();
  const { openAuthDialog } = useAuthDialog();
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const handleAvatarClick = (e: MouseEvent<HTMLElement>) =>
    setMenuAnchor(e.currentTarget);
  const handleMenuClose = () => setMenuAnchor(null);
  const handleSignOut = async () => {
    handleMenuClose();
    try {
      await signOut();
    } catch (err) {
      console.error("Sign-out failed:", err);
    }
  };
  // The chip every glassed route shows. It is the surface a handle is MOST
  // visible on, and it was the one my first pass missed — a truncated grep
  // hid it behind UserMenu and PuzzleSessionRail.
  const avatarLetter = avatarInitial(user);

  return (
    <>
      <Box
        component="header"
        sx={[
          {
            position: "sticky",
            top: 16,
            zIndex: 50,
            mx: "auto",
            maxWidth: 1680,
            width: "100%",
            px: { xs: 1.5, md: 2 },
            py: 1,
            mb: 3,
            borderRadius: "999px",
            background: "rgba(12,14,20,0.6)",
            backdropFilter: "blur(16px) saturate(160%)",
            WebkitBackdropFilter: "blur(16px) saturate(160%)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        <IconButton
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          sx={{
            width: 38,
            height: 38,
            borderRadius: "10px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.85)",
            transition: "all 180ms ease",
            "&:hover": {
              background: "rgba(249,115,22,0.12)",
              borderColor: "rgba(249,115,22,0.35)",
              color: "#FB923C",
            },
          }}
        >
          <MenuIcon size={16} />
        </IconButton>

        <Box
          component={Link}
          href="/"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            fontWeight: 800,
            color: "rgba(255,255,255,0.94)",
            letterSpacing: "-0.02em",
            textDecoration: "none",
            fontSize: "1rem",
            pr: { xs: 0, md: 1 },
          }}
        >
          <Box
            sx={{
              width: 26,
              height: 26,
              borderRadius: "8px",
              background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 16px rgba(249,115,22,0.4)",
              flexShrink: 0,
            }}
          >
            <Logo variant="bold" size={16} color="#0A0A0A" />
          </Box>
          <Box
            sx={{
              display: hasSlots
                ? { xs: "none", xl: "block" }
                : { xs: "none", sm: "block" },
            }}
          >
            Chess Masti
          </Box>
        </Box>

        {contextSlot ? (
          <Box
            sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}
          >
            {contextSlot}
          </Box>
        ) : (
          <Box sx={{ flex: 1 }} />
        )}

        {actionsSlot}

        {/* Animated 5-link nav with sliding indicator */}
        <Box
          sx={{
            display: hasSlots
              ? { xs: "none", lg: "flex" }
              : { xs: "none", md: "flex" },
            position: "relative",
            flexShrink: 0,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "999px",
            p: 0.5,
          }}
          onMouseLeave={() => setHovered(null)}
        >
          {NAV_LINKS.map((item) => {
            const isIndicated = indicatorTarget === item.id;
            const isActive = active === item.id;
            // Each surface wears its own identity colour (see SURFACE_ACCENTS)
            // so the nav itself teaches the site's colour language: the
            // indicator previews the hovered surface's colour before you go.
            const a = surfaceAccent(item.id);
            return (
              <Box
                key={item.id}
                component={Link}
                href={item.href}
                onMouseEnter={() => setHovered(item.id)}
                sx={{
                  position: "relative",
                  px: 2.25,
                  py: 0.85,
                  fontSize: "0.85rem",
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? a.bright : "rgba(255,255,255,0.72)",
                  textDecoration: "none",
                  transition: "color 220ms ease",
                  borderRadius: "999px",
                  zIndex: 1,
                  "&:hover": { color: a.bright },
                }}
              >
                {isIndicated && (
                  <motion.div
                    layoutId="navIndicator"
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 32,
                      mass: 0.8,
                    }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "999px",
                      background: `linear-gradient(135deg, ${a.soft}, ${a.tint})`,
                      border: `1px solid ${a.border}`,
                      boxShadow: `0 0 16px ${a.tint}, inset 0 1px 0 rgba(255,255,255,0.06)`,
                      zIndex: -1,
                    }}
                  />
                )}
                {item.label}
              </Box>
            );
          })}
        </Box>

        {/* Donate → Akanksha Education Fund. Follows the nav row's
            breakpoints so slotted pages (/analysis) don't overflow. */}
        <Stack
          component="a"
          href={DONATE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Donate to the Akanksha Education Fund (opens in a new tab)"
          direction="row"
          spacing={0.75}
          alignItems="center"
          sx={{
            display: hasSlots
              ? { xs: "none", lg: "flex" }
              : { xs: "none", md: "flex" },
            flexShrink: 0,
            px: 1.75,
            py: 0.85,
            borderRadius: "999px",
            background: "linear-gradient(135deg,#F97316 0%,#EA580C 100%)",
            border: "none",
            color: "#0A0A0A",
            fontWeight: 700,
            fontSize: "0.84rem",
            letterSpacing: "0.01em",
            textDecoration: "none",
            boxShadow: "0 4px 14px rgba(249,115,22,0.32)",
            transition: "transform 180ms ease, box-shadow 180ms ease",
            "&:hover": {
              transform: "translateY(-1px)",
              boxShadow: "0 6px 18px rgba(249,115,22,0.42)",
            },
          }}
        >
          <Heart size={14} />
          <Box>Donate</Box>
        </Stack>

        {/* Account: signed-out → Sign in pill, signed-in → avatar menu.
            Hidden during the auth-resolving flash to avoid the UI flicker
            between Sign-in → Avatar that useAuth() always does on hard
            reload. */}
        {!loading && (
          <Box sx={{ ml: 1.25 }}>
            {user ? (
              <>
                <IconButton
                  onClick={handleAvatarClick}
                  aria-label="Account menu"
                  sx={{
                    p: 0,
                    border: "1px solid rgba(249,115,22,0.45)",
                    boxShadow: "0 0 12px rgba(249,115,22,0.25)",
                    "&:hover": {
                      borderColor: "rgba(249,115,22,0.75)",
                    },
                  }}
                >
                  <Avatar
                    src={user.photoURL ?? undefined}
                    sx={{
                      width: 34,
                      height: 34,
                      bgcolor:
                        "linear-gradient(135deg,#F97316 0%,#EA580C 100%)",
                      background:
                        "linear-gradient(135deg,#F97316 0%,#EA580C 100%)",
                      color: "#0A0A0A",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                    }}
                  >
                    {avatarLetter}
                  </Avatar>
                </IconButton>
                <Menu
                  anchorEl={menuAnchor}
                  open={Boolean(menuAnchor)}
                  onClose={handleMenuClose}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                  slotProps={{
                    paper: {
                      sx: {
                        mt: 1,
                        background: "rgba(20,22,28,0.92)",
                        backdropFilter: "blur(16px) saturate(160%)",
                        WebkitBackdropFilter: "blur(16px) saturate(160%)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "12px",
                        minWidth: 220,
                      },
                    },
                  }}
                  MenuListProps={{ sx: { py: 0.5 } }}
                >
                  <Box
                    sx={{
                      px: 2,
                      py: 1,
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <Typography
                      sx={{
                        color: "rgba(255,255,255,0.94)",
                        fontWeight: 600,
                        fontSize: "0.88rem",
                        lineHeight: 1.2,
                      }}
                    >
                      {addressAs(user, "Signed in")}
                    </Typography>
                    {user.email && (
                      <Typography
                        sx={{
                          color: "rgba(255,255,255,0.55)",
                          fontSize: "0.74rem",
                          mt: 0.25,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 200,
                        }}
                      >
                        {user.email}
                      </Typography>
                    )}
                  </Box>
                  <MenuItem
                    onClick={() => {
                      handleMenuClose();
                      setProfileDialogOpen(true);
                    }}
                    sx={{
                      px: 2,
                      py: 1.25,
                      gap: 1.25,
                      color: "rgba(255,255,255,0.85)",
                      fontSize: "0.86rem",
                      "&:hover": {
                        background: "rgba(249,115,22,0.1)",
                        color: "#FB923C",
                      },
                    }}
                  >
                    <Settings size={15} />
                    Settings
                  </MenuItem>
                  <MenuItem
                    onClick={handleSignOut}
                    sx={{
                      px: 2,
                      py: 1.25,
                      gap: 1.25,
                      color: "rgba(255,255,255,0.85)",
                      fontSize: "0.86rem",
                      "&:hover": {
                        background: "rgba(249,115,22,0.1)",
                        color: "#FB923C",
                      },
                    }}
                  >
                    <LogOut size={15} />
                    Sign out
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <Stack
                // Semantic button (a11y): this was a plain styled Box —
                // no role, unreachable by keyboard/screen readers. Found by
                // the 2026-08-10 stranger-crawl audit.
                component="button"
                type="button"
                aria-label="Sign in"
                onClick={() => openAuthDialog()}
                direction="row"
                spacing={0.75}
                alignItems="center"
                sx={{
                  cursor: "pointer",
                  border: "none",
                  font: "inherit",
                  px: 1.75,
                  py: 0.85,
                  borderRadius: "999px",
                  background: "linear-gradient(135deg,#F97316 0%,#EA580C 100%)",
                  color: "#0A0A0A",
                  fontWeight: 700,
                  fontSize: "0.84rem",
                  letterSpacing: "0.01em",
                  boxShadow: "0 4px 14px rgba(249,115,22,0.32)",
                  transition: "transform 180ms ease, box-shadow 180ms ease",
                  "&:hover": {
                    transform: "translateY(-1px)",
                    boxShadow: "0 6px 18px rgba(249,115,22,0.42)",
                  },
                }}
              >
                <User size={14} />
                <Box>Sign in</Box>
              </Stack>
            )}
          </Box>
        )}
      </Box>

      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeId={active}
      />
      <ProfileDialog
        open={profileDialogOpen}
        onClose={() => setProfileDialogOpen(false)}
      />
    </>
  );
}
