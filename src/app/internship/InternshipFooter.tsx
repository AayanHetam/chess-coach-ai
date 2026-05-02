"use client";

import { Box, Container, Typography } from "@mui/material";

export default function InternshipFooter() {
  return (
    <Box
      component="footer"
      sx={{
        py: 5,
        px: { xs: 2, md: 4 },
        backgroundColor: "#0d0d1a",
        borderTop: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 3,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <img src="/logo.svg" width={28} height={28} alt="Chess Masti" />
            <Typography
              variant="body1"
              sx={{
                fontWeight: 700,
                background: "linear-gradient(45deg, #FF6B35 30%, #FF8C42 90%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Chess Coach AI
            </Typography>
          </Box>

          <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            <Typography
              component="a"
              href="/"
              sx={{
                color: "rgba(255,255,255,0.5)",
                textDecoration: "none",
                fontSize: "0.85rem",
                "&:hover": { color: "#FF6B35" },
              }}
            >
              Home
            </Typography>
            <Typography
              component="a"
              href="/internship"
              sx={{
                color: "rgba(255,255,255,0.5)",
                textDecoration: "none",
                fontSize: "0.85rem",
                "&:hover": { color: "#FF6B35" },
              }}
            >
              Internship
            </Typography>
            <Typography
              component="a"
              href="/internship/apply"
              sx={{
                color: "rgba(255,255,255,0.5)",
                textDecoration: "none",
                fontSize: "0.85rem",
                "&:hover": { color: "#FF6B35" },
              }}
            >
              Apply
            </Typography>
          </Box>

          <Typography
            variant="caption"
            sx={{ color: "rgba(255,255,255,0.3)", width: { xs: "100%", md: "auto" } }}
          >
            &copy; {new Date().getFullYear()} Chess Coach AI. Free forever.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
