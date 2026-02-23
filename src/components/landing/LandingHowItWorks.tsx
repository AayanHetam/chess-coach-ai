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
        flex: { xs: "1 1 100%", md: "1 1 22%" },
        maxWidth: { md: "25%" },
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
          Your Complete Chess Improvement Loop
        </Typography>

        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 3,
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
              left: "10%",
              right: "10%",
              height: 2,
              background:
                "linear-gradient(90deg, rgba(255,107,53,0.1) 0%, rgba(255,107,53,0.3) 50%, rgba(255,107,53,0.1) 100%)",
              zIndex: 0,
            }}
          />

          <StepCard
            number={1}
            title="Analyze Your Games"
            description="Load a PGN or play vs Stockfish. The AI coach explains every move in plain language — not just engine numbers."
          />
          <StepCard
            number={2}
            title="Practice Tactics"
            description="Solve 9,000+ curated puzzles across 46 themes. Filter by forks, pins, checkmates — sharpen the patterns that win games."
          />
          <StepCard
            number={3}
            title="Scout Your Opponents"
            description="Enter any Chess.com or Lichess username. We build their opening tree, show win rates per line, and find exploitable weaknesses."
          />
          <StepCard
            number={4}
            title="Prepare & Win"
            description="Combine Stockfish analysis with opponent data to build a targeted prep repertoire. Go into your next game with a plan."
          />
        </Box>
      </Container>
    </Box>
  );
}
