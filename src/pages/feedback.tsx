import { Grid, Typography, Box, Button, Paper } from "@mui/material";
import { useRouter } from "next/router";
import { PageTitle } from "@/components/pageTitle";
import { MastiSays } from "@/components/masti";
import { RADIUS } from "@/theme/tokens";

const PLANNED = [
  { title: "Performance analytics", detail: "game statistics and trends" },
  { title: "Skill assessment", detail: "your strengths and weaknesses" },
  { title: "Progress tracking", detail: "improvement over the long term" },
  { title: "Achievements", detail: "milestones and badges" },
  { title: "Comparisons", detail: "how you measure against similar players" },
];

export default function PlayerFeedback() {
  const router = useRouter();

  return (
    <>
      <PageTitle title="Player feedback · Chess Masti AI" />
      <Grid
        container
        justifyContent="center"
        alignItems="center"
        sx={{ minHeight: "80vh", p: 3 }}
      >
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 3, md: 6 },
            maxWidth: 600,
            textAlign: "center",
            borderRadius: `${RADIUS.card}px`,
          }}
        >
          {/* Masti fronts the page. Left-aligned inside the centered card so
              the bubble reads as speech, not a caption. */}
          <Box sx={{ display: "flex", justifyContent: "center", mb: 3 }}>
            <MastiSays
              mood="wave"
              size={96}
              maxWidth={340}
              priority
              style={{ textAlign: "left" }}
              data-testid="feedback-masti"
            >
              This one is still in my workshop. Until it lands, bring me a game
              and I&apos;ll show you where it turned.
            </MastiSays>
          </Box>
          <Typography variant="h3" sx={{ mb: 1 }}>
            Coming soon
          </Typography>
          <Typography variant="h5" sx={{ mb: 3, color: "text.secondary" }}>
            Player feedback
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Here is what we are building:
          </Typography>

          <Box sx={{ textAlign: "left", mb: 4, maxWidth: 400, mx: "auto" }}>
            {PLANNED.map((item) => (
              <Typography
                key={item.title}
                variant="body2"
                color="text.secondary"
                sx={{ mb: 1 }}
              >
                <strong>{item.title}</strong>: {item.detail}
              </Typography>
            ))}
          </Box>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            In the meantime, open <strong>Analysis</strong> to review your
            games.
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
              onClick={() => router.push("/analysis")}
            >
              Analyze a game
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={() => router.push("/analysis")}
            >
              Talk to Masti
            </Button>
          </Box>
        </Paper>
      </Grid>
    </>
  );
}
