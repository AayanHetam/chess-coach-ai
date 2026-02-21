import { Box, Container, Typography } from "@mui/material";

function StepCard({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <Box
      sx={{
        flex: { xs: "1 1 100%", md: "1 1 30%" },
        maxWidth: { md: "33%" },
        textAlign: "center",
        p: 3,
      }}
    >
      <Box
        sx={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.5rem",
          fontWeight: 800,
          mx: "auto",
          mb: 2.5,
          boxShadow: "0 6px 20px rgba(255,107,53,0.3)",
        }}
      >
        {number}
      </Box>
      <Typography
        variant="h6"
        sx={{ fontWeight: 700, mb: 1, color: "#1a1a2e" }}
      >
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: "#666", lineHeight: 1.6 }}>
        {description}
      </Typography>
    </Box>
  );
}

export default function LandingHowItWorks() {
  return (
    <Box
      id="how-it-works"
      component="section"
      sx={{
        py: { xs: 8, md: 12 },
        px: { xs: 2, md: 4 },
        backgroundColor: "#FFFFFF",
      }}
    >
      <Container maxWidth="lg">
        <Typography
          variant="overline"
          sx={{
            color: "#FF6B35",
            fontWeight: 700,
            letterSpacing: 3,
            display: "block",
            textAlign: "center",
            mb: 1,
          }}
        >
          HOW IT WORKS
        </Typography>
        <Typography
          variant="h3"
          sx={{
            fontWeight: 800,
            textAlign: "center",
            mb: 8,
            color: "#1a1a2e",
            fontSize: { xs: "1.8rem", md: "2.5rem" },
          }}
        >
          Start Improving in 3 Steps
        </Typography>

        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            justifyContent: "center",
            position: "relative",
          }}
        >
          {/* Connector line (desktop only) */}
          <Box
            sx={{
              display: { xs: "none", md: "block" },
              position: "absolute",
              top: 32,
              left: "22%",
              right: "22%",
              height: 2,
              background:
                "linear-gradient(90deg, rgba(255,107,53,0.1) 0%, rgba(255,107,53,0.3) 50%, rgba(255,107,53,0.1) 100%)",
              zIndex: 0,
            }}
          />

          <StepCard
            number={1}
            title="Load Your Game"
            description="Paste a PGN, import from your database, or play a game against Stockfish right here in the app."
          />
          <StepCard
            number={2}
            title="Get AI Analysis"
            description="Stockfish evaluates every move in-browser. The AI coach reads the evaluation and explains it in human terms."
          />
          <StepCard
            number={3}
            title="Chat & Explore"
            description="Ask the coach anything. Click moves to jump to positions. Explore what-if scenarios. Learn by interacting."
          />
        </Box>
      </Container>
    </Box>
  );
}
