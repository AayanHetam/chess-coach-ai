import { Box, Button, Container, Typography } from "@mui/material";
import { Icon } from "@iconify/react";

const tracks: Array<{ icon: string; label: string }> = [
  { icon: "mdi:code-braces", label: "Engineering" },
  { icon: "mdi:chess-knight", label: "Content & Coaching" },
  { icon: "mdi:account-group", label: "Growth & Community" },
  { icon: "mdi:flask-outline", label: "Research" },
];

export default function LandingInternship() {
  return (
    <Box
      id="internship"
      component="section"
      sx={{
        py: { xs: 8, md: 12 },
        px: { xs: 2, md: 4 },
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative accent */}
      <Box
        sx={{
          position: "absolute",
          top: -100,
          right: -100,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,107,53,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          bottom: -80,
          left: -80,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,140,66,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <Container maxWidth="lg" sx={{ position: "relative", zIndex: 1 }}>
        <Box sx={{ textAlign: "center", mb: 5 }}>
          <Typography
            variant="overline"
            sx={{
              color: "#FF8C42",
              fontWeight: 700,
              letterSpacing: 2,
              fontSize: "0.8rem",
            }}
          >
            Now Hiring — CMIP
          </Typography>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
              mt: 1,
              mb: 2,
              fontSize: { xs: "1.9rem", md: "2.6rem" },
              color: "#FFFFFF",
            }}
          >
            Chess Masti{" "}
            <Box
              component="span"
              sx={{
                background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Internship Program
            </Box>
          </Typography>
          <Typography
            sx={{
              color: "rgba(255,255,255,0.75)",
              maxWidth: 640,
              mx: "auto",
              fontSize: { xs: "1rem", md: "1.1rem" },
              lineHeight: 1.6,
            }}
          >
            Join us in building the future of AI-powered chess education. Real product, real users,
            real ownership — across engineering, content, growth, and research.
          </Typography>
        </Box>

        {/* Tracks pills */}
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 1.5,
            mb: 5,
          }}
        >
          {tracks.map((t) => (
            <Box
              key={t.label}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
                px: 2.25,
                py: 1,
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,140,66,0.25)",
              }}
            >
              <Icon icon={t.icon} width={18} color="#FF8C42" />
              <Typography sx={{ color: "#FFFFFF", fontSize: "0.88rem", fontWeight: 600 }}>
                {t.label}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            size="large"
            href="/internship"
            sx={{
              px: 4,
              py: 1.5,
              fontSize: "1rem",
              fontWeight: 700,
              borderRadius: 2.5,
              background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
              boxShadow: "0 8px 24px rgba(255,107,53,0.4)",
              textTransform: "none",
              "&:hover": {
                background: "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
                boxShadow: "0 10px 28px rgba(255,107,53,0.5)",
              },
            }}
          >
            Learn more & apply
          </Button>
          <Button
            variant="outlined"
            size="large"
            href="/internship/apply"
            sx={{
              px: 4,
              py: 1.5,
              fontSize: "1rem",
              fontWeight: 700,
              borderRadius: 2.5,
              borderColor: "rgba(255,255,255,0.4)",
              color: "#FFFFFF",
              textTransform: "none",
              "&:hover": { borderColor: "#FFFFFF", backgroundColor: "rgba(255,255,255,0.05)" },
            }}
          >
            Apply directly
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
