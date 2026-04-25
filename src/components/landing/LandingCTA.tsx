import { useState } from "react";
import { Box, Button, Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { Icon } from "@iconify/react";
import { useAuth } from "@/contexts/AuthContext";
import AuthDialog from "@/components/auth/AuthDialog";

export default function LandingCTA() {
  const router = useRouter();
  const { user } = useAuth();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  return (
    <Box
      component="section"
      sx={{
        py: { xs: 8, md: 12 },
        px: { xs: 2, md: 4 },
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background accent */}
      <Box
        sx={{
          position: "absolute",
          top: -100,
          right: -100,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,107,53,0.15) 0%, transparent 70%)",
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
          background: "radial-gradient(circle, rgba(255,140,66,0.1) 0%, transparent 70%)",
        }}
      />

      <Container maxWidth="md" sx={{ position: "relative", zIndex: 1, textAlign: "center" }}>
        <Typography
          variant="h3"
          sx={{
            fontWeight: 800,
            color: "#FFFFFF",
            mb: 2,
            fontSize: { xs: "1.8rem", md: "2.8rem" },
          }}
        >
          Ready to Improve Your Chess?
        </Typography>
        <Typography
          variant="h6"
          sx={{
            color: "rgba(255,255,255,0.7)",
            mb: 5,
            fontWeight: 400,
            fontSize: { xs: "1rem", md: "1.2rem" },
            lineHeight: 1.6,
            maxWidth: 550,
            mx: "auto",
          }}
        >
          Analyze games, solve puzzles, scout opponents, and chat with your AI coach. Free forever.
        </Typography>

        <Box
          sx={{
            display: "flex",
            gap: 2,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Button
            variant="contained"
            size="large"
            onClick={() => user ? router.push("/analysis") : setAuthDialogOpen(true)}
            startIcon={<Icon icon="mdi:magnify" />}
            sx={{
              px: 5,
              py: 1.8,
              fontSize: "1.05rem",
              fontWeight: 700,
              borderRadius: 3,
              background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
              boxShadow: "0 8px 30px rgba(255,107,53,0.4)",
              textTransform: "none",
              "&:hover": {
                background: "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
                boxShadow: "0 12px 40px rgba(255,107,53,0.5)",
                transform: "translateY(-2px)",
              },
              transition: "all 0.3s ease",
            }}
          >
            Start Analyzing
          </Button>
          <Button
            variant="outlined"
            size="large"
            onClick={() => router.push("/play")}
            startIcon={<Icon icon="simple-icons:lichess" />}
            sx={{
              px: 5,
              py: 1.8,
              fontSize: "1.05rem",
              fontWeight: 700,
              borderRadius: 3,
              color: "#FFFFFF",
              borderColor: "rgba(255,255,255,0.3)",
              textTransform: "none",
              "&:hover": {
                borderColor: "#FF6B35",
                backgroundColor: "rgba(255,107,53,0.1)",
                transform: "translateY(-2px)",
              },
              transition: "all 0.3s ease",
            }}
          >
            Play on Lichess
          </Button>
          <Button
            variant="outlined"
            size="large"
            onClick={() => router.push("/practice")}
            startIcon={<Icon icon="mdi:puzzle" />}
            sx={{
              px: 5,
              py: 1.8,
              fontSize: "1.05rem",
              fontWeight: 700,
              borderRadius: 3,
              color: "#FFFFFF",
              borderColor: "rgba(255,255,255,0.3)",
              textTransform: "none",
              "&:hover": {
                borderColor: "#FF6B35",
                backgroundColor: "rgba(255,107,53,0.1)",
                transform: "translateY(-2px)",
              },
              transition: "all 0.3s ease",
            }}
          >
            Practice Puzzles
          </Button>
          <Button
            variant="outlined"
            size="large"
            onClick={() => router.push("/scout")}
            startIcon={<Icon icon="mdi:binoculars" />}
            sx={{
              px: 5,
              py: 1.8,
              fontSize: "1.05rem",
              fontWeight: 700,
              borderRadius: 3,
              color: "#FFFFFF",
              borderColor: "rgba(255,255,255,0.3)",
              textTransform: "none",
              "&:hover": {
                borderColor: "#FF6B35",
                backgroundColor: "rgba(255,107,53,0.1)",
                transform: "translateY(-2px)",
              },
              transition: "all 0.3s ease",
            }}
          >
            Scout Opponents
          </Button>
        </Box>
      </Container>
      <AuthDialog open={authDialogOpen} onClose={() => setAuthDialogOpen(false)} />
    </Box>
  );
}
