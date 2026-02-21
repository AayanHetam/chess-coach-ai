import { Box, Container, Typography } from "@mui/material";
import { Icon } from "@iconify/react";

function TestimonialCard({
  quote,
  name,
  role,
}: {
  quote: string;
  name: string;
  role: string;
}) {
  return (
    <Box
      sx={{
        flex: { xs: "1 1 100%", md: "1 1 45%" },
        maxWidth: { md: "48%" },
        p: 4,
        borderRadius: 4,
        backgroundColor: "#FFFFFF",
        boxShadow: "0 2px 16px rgba(0,0,0,0.05)",
        border: "1px solid #f0f0f0",
        position: "relative",
      }}
    >
      <Icon
        icon="mdi:format-quote-open"
        width={32}
        height={32}
        color="rgba(255,107,53,0.2)"
        style={{ position: "absolute", top: 16, left: 16 }}
      />
      <Typography
        variant="body2"
        sx={{
          color: "#555",
          lineHeight: 1.7,
          fontStyle: "italic",
          mb: 3,
          mt: 2,
          fontSize: "0.95rem",
        }}
      >
        &ldquo;{quote}&rdquo;
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: "1rem",
          }}
        >
          {name[0]}
        </Box>
        <Box>
          <Typography
            variant="body2"
            sx={{ fontWeight: 700, color: "#1a1a2e" }}
          >
            {name}
          </Typography>
          <Typography variant="caption" sx={{ color: "#999" }}>
            {role}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

const testimonials = [
  {
    quote:
      "The clickable moves in the chat are a game-changer. I ask the coach about a position and can instantly jump to any move it mentions. No other tool does this.",
    name: "Alex",
    role: "Club Player, 1400 ELO",
  },
  {
    quote:
      "I love that it doesn't just say 'this move is bad' \u2014 it explains WHY in terms I can actually understand. The what-if exploration helped me see lines I never would have considered.",
    name: "Priya",
    role: "Intermediate Player",
  },
  {
    quote:
      "Having Stockfish run in my browser means I can analyze games on the train without internet. Plus the AI coach makes the engine output actually readable.",
    name: "Marcus",
    role: "Online Player, 1650 ELO",
  },
  {
    quote:
      "Other tools criticize my Sicilian moves because the engine prefers something else. This coach actually knows it's a book move and explains the theory. Finally!",
    name: "Sofia",
    role: "Tournament Player, 1800 ELO",
  },
];

export default function LandingTestimonials() {
  return (
    <Box
      id="testimonials"
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
          TESTIMONIALS
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
          What Players Are Saying
        </Typography>
        <Typography
          variant="body1"
          sx={{
            textAlign: "center",
            color: "#666",
            mb: 8,
            maxWidth: 500,
            mx: "auto",
          }}
        >
          Join players who are improving their game with AI-powered coaching.
        </Typography>

        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 3,
            justifyContent: "center",
          }}
        >
          {testimonials.map((t) => (
            <TestimonialCard key={t.name} {...t} />
          ))}
        </Box>
      </Container>
    </Box>
  );
}
