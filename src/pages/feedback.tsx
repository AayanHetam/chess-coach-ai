import { Grid, Typography, Box, Button, Paper } from "@mui/material";
import { useRouter } from "next/router";
import { PageTitle } from "@/components/pageTitle";

export default function PlayerFeedback() {
  const router = useRouter();

  return (
    <>
      <PageTitle title="Chess Masti AI - Player Feedback" />
      <Grid
        container
        justifyContent="center"
        alignItems="center"
        sx={{ minHeight: "80vh", p: 3 }}
      >
        <Paper sx={{ p: 6, maxWidth: 600, textAlign: "center" }}>
          <Typography variant="h3" sx={{ mb: 3, fontWeight: 700, color: "primary.main" }}>
            🚀 COMING SOON
          </Typography>
          <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
            Advanced Player Feedback System
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.6 }}>
            We're developing comprehensive player feedback with:
          </Typography>
          
          <Box sx={{ textAlign: "left", mb: 4, maxWidth: 400, mx: "auto" }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              📈 <strong>Performance Analytics</strong> - Detailed game statistics and trends
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              🎯 <strong>Skill Assessment</strong> - Identify strengths and weaknesses
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              📊 <strong>Progress Tracking</strong> - Long-term improvement monitoring
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              🏅 <strong>Achievement System</strong> - Milestones and badges
            </Typography>
            <Typography variant="body2" color="text.secondary">
              🤝 <strong>Comparative Analysis</strong> - Benchmark against similar players
            </Typography>
          </Box>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            In the meantime, try our <strong>Analysis</strong> tab for AI-powered game insights!
          </Typography>

          <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
            <Button
              variant="contained"
              size="large"
              onClick={() => router.push("/analysis")}
              sx={{ px: 4 }}
            >
              Go to Analysis
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={() => router.push("/analysis")}
              sx={{ px: 4 }}
            >
              Talk to AI Coach
            </Button>
          </Box>
        </Paper>
      </Grid>
    </>
  );
}
