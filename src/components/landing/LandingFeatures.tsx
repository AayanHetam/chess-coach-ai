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
    title: "AI Coach That Understands Chess",
    description:
      "Not just an engine wrapper. Our LLM-powered coach understands strategic themes, explains why moves are good or bad, respects opening theory, and gives grandmaster-level feedback in plain language.",
  },
  {
    icon: "mdi:cursor-default-click",
    title: "Interactive Move Exploration",
    description:
      "Every move the coach mentions is clickable. Jump to any position, explore \"what-if\" alternatives, and watch tactical sequences play out on the board — all from the chat.",
  },
  {
    icon: "mdi:magnify",
    title: "Deep Stockfish Analysis",
    description:
      "Multiple Stockfish versions run directly in your browser. Get real-time evaluation bars, engine lines, and move classifications — no server required, completely private.",
  },
  {
    icon: "simple-icons:lichess",
    title: "Play on Lichess",
    description:
      "Play real opponents on Lichess right from ChessMasti. Pre-moves, material balance, and live clocks — then instantly analyze your game with the AI coach.",
  },
  {
    icon: "mdi:puzzle",
    title: "Practice with Puzzles",
    description:
      "Sharpen your tactics with 9,000+ curated puzzles across 46 themes and 4 difficulty levels. Filter by forks, pins, skewers, checkmates, and more — then solve them interactively on the board.",
  },
  {
    icon: "mdi:binoculars",
    title: "Scout Your Opponents",
    description:
      "Enter any Chess.com or Lichess username and we\u2019ll build a full opening tree from their games. See win/draw/loss rates per line, find weaknesses, and get Stockfish-backed prep recommendations.",
  },
  {
    icon: "mdi:book-open-page-variant-outline",
    title: "Opening Theory Awareness",
    description:
      "The coach never criticizes established book moves. It understands opening theory, explains the ideas behind your chosen lines, and suggests modern alternatives when appropriate.",
  },
  {
    icon: "mdi:shield-check-outline",
    title: "100% Free",
    description:
      "No subscriptions, no paywalls. Stockfish analysis runs directly in your browser, keeping your games and analysis completely private.",
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
          A complete chess coaching platform powered by AI that actually
          understands the game — not just the numbers.
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
