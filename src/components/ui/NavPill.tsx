"use client";

import { Box, IconButton, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Menu, Sparkles } from "lucide-react";
import { AppDrawer, type NavId } from "./AppDrawer";

interface NavPillProps {
  active?: NavId;
  badge?: { label: string };
}

// Five primary nav links across all preview pages. Order tells the user
// flow: play your game → analyze it → practice your weakness → learn
// theory → scout your next opponent.
const NAV_LINKS: { id: NavId; label: string; href: string }[] = [
  { id: "play", label: "Play", href: "/preview/play" },
  { id: "analysis", label: "Analyze", href: "/preview/analysis" },
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
          <Menu size={16} />
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
      </Box>

      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeId={active}
      />
    </>
  );
}
