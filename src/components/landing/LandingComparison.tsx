import { Box, Container, Typography } from "@mui/material";
import { MAIN_THEME_COLOR } from "@/constants";

function ComparisonRow({
  label,
  others,
  ours,
}: {
  label: string;
  others: string;
  ours: string;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        borderBottom: "1px solid #f0f0f0",
        "&:last-child": { borderBottom: "none" },
      }}
    >
      <Box
        sx={{
          flex: "1 1 33%",
          p: 2.5,
          fontWeight: 600,
          color: "#333",
          fontSize: { xs: "0.8rem", sm: "0.95rem" },
        }}
      >
        {label}
      </Box>
      <Box
        sx={{
          flex: "1 1 33%",
          p: 2.5,
          color: "#999",
          textAlign: "center",
          fontSize: { xs: "0.8rem", sm: "0.9rem" },
        }}
      >
        {others}
      </Box>
      <Box
        sx={{
          flex: "1 1 33%",
          p: 2.5,
          color: MAIN_THEME_COLOR,
          fontWeight: 600,
          textAlign: "center",
          fontSize: { xs: "0.8rem", sm: "0.9rem" },
        }}
      >
        {ours}
      </Box>
    </Box>
  );
}

const comparisons = [
  {
    label: "AI Coaching",
    others: "Basic engine output",
    ours: "LLM explains in human language",
  },
  {
    label: "Move Interaction",
    others: "Static text",
    ours: "Clickable moves jump to board",
  },
  {
    label: "What-If Analysis",
    others: "Not available",
    ours: "Explore alternative lines from chat",
  },
  {
    label: "Opening Theory",
    others: "Criticizes all deviations",
    ours: "Respects book moves & theory",
  },
  {
    label: "Engine",
    others: "Server-side, usage limits",
    ours: "In-browser Stockfish, unlimited",
  },
  {
    label: "Privacy",
    others: "Data sent to servers",
    ours: "100% client-side, nothing leaves",
  },
  {
    label: "Cost",
    others: "$2\u2013$30/hour",
    ours: "Completely free",
  },
];

export default function LandingComparison() {
  return (
    <Box
      id="comparison"
      component="section"
      sx={{
        py: { xs: 8, md: 12 },
        px: { xs: 2, md: 4 },
        backgroundColor: "#FAFAFA",
      }}
    >
      <Container maxWidth="md">
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
          WHY US
        </Typography>
        <Typography
          variant="h3"
          sx={{
            fontWeight: 800,
            textAlign: "center",
            mb: 6,
            color: "#1a1a2e",
            fontSize: { xs: "1.8rem", md: "2.5rem" },
          }}
        >
          Chess Coach AI vs The Rest
        </Typography>

        <Box
          sx={{
            borderRadius: 4,
            overflow: "hidden",
            backgroundColor: "#FFFFFF",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
            border: "1px solid #f0f0f0",
          }}
        >
          {/* Header */}
          <Box
            sx={{
              display: "flex",
              borderBottom: "2px solid #f0f0f0",
              backgroundColor: "#FAFAFA",
            }}
          >
            <Box sx={{ flex: "1 1 33%", p: 2.5, fontWeight: 700, color: "#333" }} />
            <Box
              sx={{
                flex: "1 1 33%",
                p: 2.5,
                fontWeight: 700,
                color: "#999",
                textAlign: "center",
                fontSize: { xs: "0.85rem", sm: "1rem" },
              }}
            >
              Other Tools
            </Box>
            <Box
              sx={{
                flex: "1 1 33%",
                p: 2.5,
                fontWeight: 700,
                color: MAIN_THEME_COLOR,
                textAlign: "center",
                fontSize: { xs: "0.85rem", sm: "1rem" },
              }}
            >
              Chess Coach AI
            </Box>
          </Box>

          {comparisons.map((c) => (
            <ComparisonRow key={c.label} {...c} />
          ))}
        </Box>
      </Container>
    </Box>
  );
}
