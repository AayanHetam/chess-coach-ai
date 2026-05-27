"use client";

import { Box, IconButton, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useState } from "react";
import { Menu, Sparkles, Zap } from "lucide-react";
import { AppDrawer, type NavId } from "./AppDrawer";

interface NavPillProps {
  active?: NavId;
  badge?: { label: string };
}

export function NavPill({ active, badge }: NavPillProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

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
          px: { xs: 2, md: 3 },
          py: 1.25,
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
            }}
          >
            <Sparkles size={14} color="#0A0A0A" />
          </Box>
          Chess Masti
        </Box>

        <Box sx={{ flex: 1 }} />

        <Stack
          direction="row"
          spacing={3}
          sx={{ display: { xs: "none", md: "flex" } }}
        >
          {[
            { id: "play" as NavId, label: "Play", href: "/preview/play" },
            { id: "practice" as NavId, label: "Practice", href: "/preview/practice" },
            { id: "scout" as NavId, label: "Scout", href: "/preview/scout" },
          ].map((item) => (
            <Typography
              key={item.id}
              component={Link}
              href={item.href}
              sx={{
                fontSize: "0.88rem",
                fontWeight: active === item.id ? 700 : 500,
                color:
                  active === item.id
                    ? "#FB923C"
                    : "rgba(255,255,255,0.7)",
                textDecoration: "none",
                transition: "color 180ms ease",
                "&:hover": { color: "rgba(255,255,255,1)" },
              }}
            >
              {item.label}
            </Typography>
          ))}
        </Stack>

        {badge && (
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.75,
              px: 1.5,
              py: 0.5,
              borderRadius: "999px",
              background: "rgba(249,115,22,0.12)",
              border: "1px solid rgba(249,115,22,0.3)",
            }}
          >
            <Zap size={12} color="#F97316" />
            <Typography
              sx={{
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: "0.14em",
                color: "#FB923C",
                textTransform: "uppercase",
              }}
            >
              {badge.label}
            </Typography>
          </Box>
        )}
      </Box>

      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeId={active}
      />
    </>
  );
}
