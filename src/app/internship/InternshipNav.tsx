"use client";

import { Box, Button, Container, Typography } from "@mui/material";
import { useEffect, useState } from "react";

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
        backgroundColor: scrolled ? "rgba(255,255,255,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,107,53,0.1)" : "1px solid transparent",
        transition: "all 0.3s ease",
      }}
    >
      <Container
        maxWidth="lg"
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
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
          <img src="/logo.svg" width={32} height={32} alt="Chess Masti" />
          <Typography
            variant="h6"
            sx={{
              fontWeight: 800,
              background: "linear-gradient(45deg, #FF6B35 30%, #FF8C42 90%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              fontSize: "1.1rem",
            }}
          >
            Chess Coach AI
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography
            component="a"
            href="/"
            sx={{
              display: { xs: "none", sm: "inline" },
              color: scrolled ? "#555" : "#444",
              textDecoration: "none",
              fontSize: "0.9rem",
              fontWeight: 500,
              "&:hover": { color: "#FF6B35" },
            }}
          >
            ← Home
          </Typography>
          <Button
            variant="contained"
            size="small"
            href="/internship/apply"
            sx={{
              px: 3,
              py: 1,
              fontSize: "0.85rem",
              fontWeight: 700,
              borderRadius: 2.5,
              background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
              boxShadow: "0 4px 16px rgba(255,107,53,0.3)",
              textTransform: "none",
              "&:hover": {
                background: "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
                boxShadow: "0 6px 20px rgba(255,107,53,0.4)",
              },
            }}
          >
            Apply Now
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
