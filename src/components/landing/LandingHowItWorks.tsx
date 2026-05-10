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
          Engine → Claude → Validator → Targeted Puzzles
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
            title="Engine evaluates first"
            description="Stockfish 17 runs in your browser as a WASM worker, surfaces tactical motifs, candidate gaps, and branch points. The LLM never sees the raw board."
          />
          <StepCard
            number={2}
            title="Claude explains, validator checks"
            description="Claude Sonnet writes the coaching response from the engine's structured output. A hallucination validator cross-checks every claim against chess.js before display."
          />
          <StepCard
            number={3}
            title="Targeted puzzles, inline"
            description="3 puzzles render inside the same chat bubble, retrieved from a 100,000+ position Neo4j graph and re-ranked by 49-dimensional FEN cosine similarity to your mistake."
          />
          <StepCard
            number={4}
            title="Train, then go play"
            description="SM-2 spaced repetition files what you solved. Twin Bot (Maia-2) gives you humanlike practice. Scout dashboard preps you against a specific opponent."
          />
        </Box>
      </Container>
    </Box>
  );
}
