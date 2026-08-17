import { useEffect, useRef, useState } from "react";
import { Box, Container, Typography } from "@mui/material";
import { Icon } from "@iconify/react";

function FeatureCard({
  icon,
  title,
  description,
  delay,
}: {
  icon: string;
  title: string;
  description: string;
  delay: number;
}) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <Box
      ref={ref}
      sx={{
        flex: { xs: "1 1 100%", md: "1 1 30%" },
        maxWidth: { md: "33%" },
        p: 4,
        borderRadius: 4,
        backgroundColor: "#FFFFFF",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        border: "1px solid rgba(255,107,53,0.1)",
        transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
        transitionDelay: `${delay}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(30px)",
        "&:hover": {
          transform: "translateY(-6px)",
          boxShadow: "0 12px 40px rgba(255,107,53,0.15)",
          borderColor: "rgba(255,107,53,0.3)",
        },
      }}
    >
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
          mb: 3,
        }}
      >
        <Icon icon={icon} width={28} height={28} color="#FFFFFF" />
      </Box>
      <Typography
        variant="h6"
        sx={{ fontWeight: 700, mb: 1.5, color: "#1a1a2e" }}
      >
        {title}
      </Typography>
      <Typography
        variant="body2"
        sx={{ color: "#555", lineHeight: 1.7, fontSize: "0.95rem" }}
      >
        {description}
      </Typography>
    </Box>
  );
}

const features = [
  {
    icon: "mdi:robot-happy-outline",
    title: "Engine-grounded coaching",
    description:
      "Stockfish 17 produces the position evaluation, candidate moves, and tactical motifs first. Claude Sonnet then translates the engine's verdict into language. The LLM never invents chess facts — it only paraphrases what the engine already said.",
  },
  {
    icon: "mdi:shield-check",
    title: "Hallucination validator",
    description:
      "Every coaching response is parsed and each piece, square, and move reference is checked against the live chess.js board state before display. Claims that don't check out are rewritten or discarded. The trust layer most AI coaches skip.",
  },
  {
    icon: "mdi:magnify",
    title: "Stockfish 17 in your browser",
    description:
      "Stockfish 17 ships as a WebAssembly worker that runs locally — no server round-trip, no rate limit, no analysis quota. Tactical motif detection, candidate-move gap analysis, and branch-point analysis layer on top.",
  },
  {
    icon: "simple-icons:lichess",
    title: "Live play on Lichess",
    description:
      "Lichess OAuth 2.0 PKCE plus dual-SSE streams mirror your live game into the app. Pre-moves, material balance, clocks, then one-click jump straight to analysis.",
  },
  {
    icon: "mdi:puzzle",
    title: "100,000+ puzzles in a Neo4j graph",
    description:
      "A Neo4j Aura graph of 100,000+ quality-filtered Lichess puzzles, structured across 46 tactical themes and 4 difficulty bands. Recommendations come from graph traversal plus 49-dimensional FEN cosine-similarity re-ranking against your actual mistake.",
  },
  {
    icon: "mdi:binoculars",
    title: "Scout your opponents",
    description:
      "Paste a Lichess or Chess.com username for opening trees, repertoire collisions against yours, a \"Stalker Score\" exploitability index, tilt and timeout psychology profiles, and a shareable SVG player card.",
  },
  {
    icon: "mdi:account-circle-outline",
    title: "Twin Bot — humanlike opponent",
    description:
      "Twin Bot runs on Maia-2 (NeurIPS 2024), a neural network trained to predict human moves at a target Elo. Optionally seed it with a public Lichess username and play someone who blunders the way humans blunder.",
  },
  {
    icon: "mdi:currency-usd-off",
    title: "Completely free",
    description:
      "All coaching features are free. Built and maintained by Aayan Hetamsaria, a high-school student. Priority markets are India and Southeast Asia.",
  },
];

export default function LandingFeatures() {
  return (
    <Box
      id="features"
      component="section"
      sx={{
        py: { xs: 8, md: 12 },
        px: { xs: 2, md: 4 },
        backgroundColor: "#FAFAFA",
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
          FEATURES
        </Typography>
        <Typography
          variant="h3"
          sx={{
            fontWeight: 800,
            textAlign: "center",
            mb: 2,
            color: "#1a1a2e",
            fontSize: { xs: "1.8rem", md: "2.5rem" },
          }}
        >
          Everything You Need to Improve
        </Typography>
        <Typography
          variant="body1"
          sx={{
            textAlign: "center",
            color: "#666",
            mb: 8,
            maxWidth: 600,
            mx: "auto",
            fontSize: "1.1rem",
            lineHeight: 1.6,
          }}
        >
          The engine evaluates first. The LLM only translates what the engine
          said. A validator checks every claim against the live board.
          Then training matches your actual mistake.
        </Typography>

        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 3,
            justifyContent: "center",
          }}
        >
          {features.map((f, i) => (
            <FeatureCard key={f.title} {...f} delay={i * 100} />
          ))}
        </Box>
      </Container>
    </Box>
  );
}
