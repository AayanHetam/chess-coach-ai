import { Grid, Typography, Box, Button, Paper } from "@mui/material";
import { useRouter } from "next/router";
import { PageTitle } from "@/components/pageTitle";

export default function Practice() {
  const router = useRouter();

  return (
    <>
      <PageTitle title="Chess Masti AI - Practice" />
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
            Advanced Practice System
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.6 }}>
            We're building a comprehensive practice system with:
          </Typography>
          
          <Box sx={{ textAlign: "left", mb: 4, maxWidth: 400, mx: "auto" }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              📚 <strong>Course Library</strong> - Structured learning paths with 50 puzzles each
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              🤖 <strong>AI Coach Recommendations</strong> - Personalized course suggestions
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              🎯 <strong>Enhanced Feedback</strong> - Multi-source reasoning for mistakes
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              📊 <strong>Progress Analytics</strong> - Detailed performance tracking
            </Typography>
            <Typography variant="body2" color="text.secondary">
              🏆 <strong>Achievements</strong> - Gamification and social features
            </Typography>
          </Box>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            In the meantime, try our <strong>Analysis</strong> tab for AI-powered game improvement!
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
