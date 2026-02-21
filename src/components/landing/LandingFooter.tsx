import { Box, Container, Typography } from "@mui/material";
import { Icon } from "@iconify/react";

export default function LandingFooter() {
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
          {/* Logo & tagline */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <img
              src="/android-chrome-192x192.png"
              width={28}
              height={28}
              alt="Chess Coach AI"
              style={{ borderRadius: 6 }}
            />
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

          {/* Links */}
          <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            <Typography
              component="a"
              href="#features"
              sx={{
                color: "rgba(255,255,255,0.5)",
                textDecoration: "none",
                fontSize: "0.85rem",
                "&:hover": { color: "#FF6B35" },
                transition: "color 0.2s",
              }}
            >
              Features
            </Typography>
            <Typography
              component="a"
              href="#how-it-works"
              sx={{
                color: "rgba(255,255,255,0.5)",
                textDecoration: "none",
                fontSize: "0.85rem",
                "&:hover": { color: "#FF6B35" },
                transition: "color 0.2s",
              }}
            >
              How It Works
            </Typography>
            <Typography
              component="a"
              href="#comparison"
              sx={{
                color: "rgba(255,255,255,0.5)",
                textDecoration: "none",
                fontSize: "0.85rem",
                "&:hover": { color: "#FF6B35" },
                transition: "color 0.2s",
              }}
            >
              Compare
            </Typography>
            <Typography
              component="a"
              href="https://github.com/AayanHetam/chess-coach-ai"
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                color: "rgba(255,255,255,0.5)",
                textDecoration: "none",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                "&:hover": { color: "#FF6B35" },
                transition: "color 0.2s",
              }}
            >
              <Icon icon="mdi:github" width={16} />
              GitHub
            </Typography>
          </Box>

          {/* Copyright */}
          <Typography
            variant="caption"
            sx={{ color: "rgba(255,255,255,0.3)", width: { xs: "100%", md: "auto" } }}
          >
            &copy; {new Date().getFullYear()} Chess Coach AI. Open source & free forever.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
