"use client";

import { Box, Button, Container, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/ui/BrandMark";
import { MOTION, TYPE } from "@/theme/tokens";

export default function InternshipNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <Box
      component="nav"
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1100,
        py: scrolled ? 1.5 : 2.5,
        // Opaque once content scrolls under it: the App Router pages are the
        // light theme, so the dark nav material does not apply here.
        bgcolor: scrolled ? "background.default" : "transparent",
        borderBottom: "1px solid",
        borderColor: scrolled ? "divider" : "transparent",
        transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}`,
      }}
    >
      <Container
        maxWidth="lg"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box
          component="a"
          href="/"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            textDecoration: "none",
          }}
        >
          <BrandMark size={32} />
          <Typography
            variant="h6"
            component="span"
            sx={{ fontWeight: 600, color: "text.primary" }}
          >
            Chess Masti
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography
            component="a"
            href="/"
            sx={{
              display: { xs: "none", sm: "inline" },
              color: "text.secondary",
              textDecoration: "none",
              fontSize: TYPE.bodySmall.fontSize,
              fontWeight: 500,
              transition: `color ${MOTION.hover}`,
              "&:hover": { color: "text.primary" },
            }}
          >
            Home
          </Typography>
          {/* Outlined: each page's own primary is the one solid ember. The
              inherited colour keeps the label at text.primary on white. */}
          <Button variant="outlined" color="inherit" href="/internship/apply">
            Apply now
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
