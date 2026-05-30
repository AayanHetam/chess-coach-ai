"use client";

import {
  Avatar,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useState, MouseEvent } from "react";
import { motion } from "framer-motion";
import { Menu as MenuIcon, Sparkles, LogOut, User, Settings } from "lucide-react";
import { AppDrawer, type NavId } from "./AppDrawer";
import { useAuth } from "@/contexts/AuthContext";
import AuthDialog from "@/components/auth/AuthDialog";
import ProfileDialog from "@/components/auth/ProfileDialog";

interface NavPillProps {
  active?: NavId;
  badge?: { label: string };
}

// Five primary nav links across all preview pages. Order tells the user
// flow: play your game → analyze it → practice your weakness → learn
// theory → scout your next opponent.
const NAV_LINKS: { id: NavId; label: string; href: string }[] = [
  { id: "play", label: "Play", href: "/preview/play" },
  { id: "analysis", label: "Analyze", href: "/analysis" },
  { id: "practice", label: "Practice", href: "/preview/practice" },
  { id: "openings", label: "Learn", href: "/preview/openings" },
  { id: "scout", label: "Scout", href: "/preview/scout" },
];

export function NavPill({ active }: NavPillProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
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
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
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
  const avatarLetter = (user?.displayName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase();

  return (
    <>
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 16,
          zIndex: 50,
          mx: "auto",
          maxWidth: 1680,
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
        }}
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
          href="/preview/launch"
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
            <Sparkles size={14} color="#0A0A0A" />
          </Box>
          <Box sx={{ display: { xs: "none", sm: "block" } }}>Chess Masti</Box>
        </Box>

        <Box sx={{ flex: 1 }} />

        {/* Animated 5-link nav with sliding indicator */}
        <Box
          sx={{
            display: { xs: "none", md: "flex" },
            position: "relative",
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
                  color: isActive
                    ? "#FB923C"
                    : "rgba(255,255,255,0.72)",
                  textDecoration: "none",
                  transition: "color 220ms ease",
                  borderRadius: "999px",
                  zIndex: 1,
                  "&:hover": { color: "#FB923C" },
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
                      background:
                        "linear-gradient(135deg, rgba(249,115,22,0.2), rgba(234,88,12,0.12))",
                      border: "1px solid rgba(249,115,22,0.4)",
                      boxShadow:
                        "0 0 16px rgba(249,115,22,0.18), inset 0 1px 0 rgba(255,255,255,0.06)",
                      zIndex: -1,
                    }}
                  />
                )}
                {item.label}
              </Box>
            );
          })}
        </Box>

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
                      {user.displayName ?? "Signed in"}
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
                onClick={() => setAuthDialogOpen(true)}
                direction="row"
                spacing={0.75}
                alignItems="center"
                sx={{
                  cursor: "pointer",
                  px: 1.75,
                  py: 0.85,
                  borderRadius: "999px",
                  background:
                    "linear-gradient(135deg,#F97316 0%,#EA580C 100%)",
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
      <AuthDialog
        open={authDialogOpen}
        onClose={() => setAuthDialogOpen(false)}
      />
      <ProfileDialog
        open={profileDialogOpen}
        onClose={() => setProfileDialogOpen(false)}
      />
    </>
  );
}
