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
import { useRouter } from "next/router";
import { useState, type MouseEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Menu as MenuIcon, Heart, LogOut, User, Settings } from "lucide-react";
import {
  ACCENT,
  LINE,
  MATERIAL,
  MATERIAL_FALLBACK_SX,
  RADIUS,
  TEXT,
} from "@/theme/tokens";
import { AppDrawer, type NavId } from "./AppDrawer";
import { SIGN_IN_PROPS } from "@/components/ads/PartnerSlot";
import { BrandMark } from "./BrandMark";
import { PartnerSlotPages } from "@/components/ads/PartnerSlotPages";
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
  const router = useRouter();
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
            borderRadius: `${RADIUS.card}px`,
            background: MATERIAL.background,
            backdropFilter: MATERIAL.backdropFilter,
            WebkitBackdropFilter: MATERIAL.backdropFilter,
            border: `1px solid ${MATERIAL.border}`,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            ...MATERIAL_FALLBACK_SX,
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
            "&:hover": {
              background: "rgba(255,255,255,0.08)",
              color: TEXT.primary,
            },
          }}
        >
          <MenuIcon size={16} />
        </IconButton>

        <Box
          component={Link}
          href="/"
          aria-label="Chess Masti"
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
          {/* The logo, the same mark as the favicon. The link carries the
              accessible name because the wordmark is hidden on phones. */}
          <BrandMark size={28} />
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
            p: 0.5,
          }}
          onMouseLeave={() => setHovered(null)}
        >
          {NAV_LINKS.map((item) => {
            const isIndicated = indicatorTarget === item.id;
            const isActive = active === item.id;
            return (
              <Box
                key={item.id}
                component={Link}
                href={item.href}
                prefetch={false}
                onMouseEnter={() => setHovered(item.id)}
                sx={{
                  position: "relative",
                  px: 2.25,
                  py: 0.85,
                  fontSize: "0.85rem",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? TEXT.primary : TEXT.secondary,
                  textDecoration: "none",
                  transition: "color 160ms ease-out",
                  borderRadius: "999px",
                  zIndex: 1,
                  "&:hover": { color: TEXT.primary },
                }}
              >
                {isIndicated && (
                  <motion.div
                    layoutId="navIndicator"
                    transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "999px",
                      background: "rgba(255,255,255,0.1)",
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
            background: ACCENT.tint,
            border: "none",
            color: ACCENT.hover,
            fontWeight: 600,
            fontSize: "0.84rem",
            textDecoration: "none",
            transition: "background-color 160ms ease-out",
            "&:hover": { background: ACCENT.tintHover },
            "&:active": { transform: "scale(0.97)" },
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
                    borderRadius: "50%",
                    border: `1px solid ${LINE.strong}`,
                    "&:hover": { borderColor: TEXT.secondary },
                  }}
                >
                  <Avatar
                    src={user.photoURL ?? undefined}
                    sx={{
                      width: 34,
                      height: 34,
                      bgcolor: ACCENT.main,
                      color: TEXT.onAccent,
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
                  slotProps={{ paper: { sx: { minWidth: 220 } } }}
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
                          fontSize: "0.75rem",
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
                      void router.push("/profile");
                    }}
                    sx={{
                      px: 2,
                      py: 1.25,
                      gap: 1.25,
                      color: "rgba(255,255,255,0.85)",
                      fontSize: "0.86rem",
                    }}
                  >
                    <User size={15} />
                    Profile
                  </MenuItem>
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
                // Hidden under the ChessUSA preview prefix. See SIGN_IN_ATTR.
                {...SIGN_IN_PROPS}
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
                  background: ACCENT.main,
                  color: TEXT.onAccent,
                  fontWeight: 600,
                  fontSize: "0.84rem",
                  transition: "background-color 160ms ease-out",
                  "&:hover": { background: ACCENT.hover },
                  "&:active": { transform: "scale(0.97)" },
                }}
              >
                <User size={14} />
                <Box>Sign in</Box>
              </Stack>
            )}
          </Box>
        )}
      </Box>

      {/* ChessUSA partner slot, directly below the nav on every surface that
          renders one — which is both the self-chromed product pages and the
          ones Layout chromes. It lives HERE rather than in Layout because
          SELF_CHROMED_ROUTES (/, /analysis, /play, /practice, /plan, /profile,
          /puzzles, /scout, /courses, /database) mount their own NavPill inside
          the page, so Layout has no hook below the nav for any of them.
          Shows the live placement (LIVE_PLACEMENT in partners.ts), or the
          creative a /partners/<advertiser>/N link names, or nothing. See
          PartnerSlot.tsx. */}
      <PartnerSlotPages />

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
