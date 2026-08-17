import { Box, Container, Typography } from "@mui/material";
import { Icon } from "@iconify/react";

export default function LandingAbout() {
  return (
    <Box
      id="about"
      component="section"
      sx={{
        py: { xs: 8, md: 12 },
        px: { xs: 2, md: 4 },
        background: "linear-gradient(180deg, #FFFFFF 0%, #FFF8F5 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle accent */}
      <Box
        sx={{
          position: "absolute",
          top: -60,
          left: -60,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,107,53,0.06) 0%, transparent 70%)",
        }}
      />

      <Container maxWidth="md" sx={{ position: "relative", zIndex: 1 }}>
        {/* Section label */}
        <Box sx={{ textAlign: "center", mb: 2 }}>
          <Typography
            variant="overline"
            sx={{
              color: "#FF6B35",
              fontWeight: 700,
              letterSpacing: 2,
              fontSize: "0.8rem",
            }}
          >
            About Us
          </Typography>
        </Box>

        {/* Heading */}
        <Typography
          variant="h3"
          sx={{
            fontWeight: 800,
            textAlign: "center",
            mb: 5,
            fontSize: { xs: "1.8rem", md: "2.5rem" },
            color: "#1a1a2e",
          }}
        >
          The Team Behind{" "}
          <Box
            component="span"
            sx={{
              background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            ChessMasti
          </Box>
        </Typography>

        {/* Founder card */}
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: "center",
            gap: { xs: 3, sm: 5 },
            mb: 6,
            p: { xs: 3, md: 5 },
            borderRadius: 4,
            background: "#FFFFFF",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
            border: "1px solid rgba(255,107,53,0.1)",
          }}
        >
          {/* Avatar / Icon */}
          <Box
            sx={{
              flexShrink: 0,
              width: 100,
              height: 100,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 6px 20px rgba(255,107,53,0.3)",
            }}
          >
            <Icon icon="mdi:chess-king" width={48} color="#FFFFFF" />
          </Box>

          {/* Info */}
          <Box>
            <Typography
              variant="h5"
              sx={{ fontWeight: 700, color: "#1a1a2e", mb: 0.5 }}
            >
              Aayan Hetamsaria
            </Typography>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                color: "#FF6B35",
                mb: 1.5,
                fontSize: "0.95rem",
              }}
            >
              Founder, ChessMasti
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: "#555",
                lineHeight: 1.7,
                fontSize: "0.95rem",
              }}
            >
              Building the future of chess education — one move at a time.
            </Typography>
          </Box>
        </Box>

        {/* Mission / Values */}
        <Box
          sx={{
            textAlign: "center",
            p: { xs: 3, md: 5 },
            borderRadius: 4,
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          }}
        >
          <Icon icon="mdi:hand-heart" width={36} color="#FF8C42" />
          <Typography
            variant="h5"
            sx={{ fontWeight: 700, color: "#FFFFFF", mt: 2, mb: 2 }}
          >
            Our Mission
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: "rgba(255,255,255,0.8)",
              lineHeight: 1.8,
              fontSize: { xs: "0.95rem", md: "1.05rem" },
              maxWidth: 600,
              mx: "auto",
            }}
          >
            ChessMasti was founded on a simple belief: world-class chess coaching
            should be free and accessible to every player on the planet. We combine
            cutting-edge AI with deep chess knowledge to deliver elite-level analysis,
            personalized training, and grandmaster-quality insights — without
            feature limits or barriers. Whether you are a beginner learning
            your first opening or an advanced player preparing for a tournament,
            ChessMasti is your coach.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
