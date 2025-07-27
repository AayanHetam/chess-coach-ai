import { Grid, Typography, Box, CircularProgress, Alert } from "@mui/material";
import { useState } from "react";
import { useRouter } from "next/router";
import { PageTitle } from "@/components/pageTitle";
import PlayerFeedbackForm from "@/sections/feedback/PlayerFeedbackForm";
import PlayerFeedbackResults from "@/sections/feedback/PlayerFeedbackResults";
import { PlayerFeedbackData } from "@/types/feedback";

export default function PlayerFeedback() {
  const router = useRouter();
  const [feedbackData, setFeedbackData] = useState<PlayerFeedbackData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFeedbackGenerated = (data: PlayerFeedbackData) => {
    setFeedbackData(data);
    setError(null);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setFeedbackData(null);
  };

  const handleLoading = (loading: boolean) => {
    setIsLoading(loading);
  };

  const handleAnalyzeWithAI = (message: string, pgn?: string) => {
    // Navigate to the analysis page with the game and message
    const params = new URLSearchParams();
    if (pgn) {
      params.set('pgn', pgn);
    }
    params.set('message', message);
    router.push(`/?${params.toString()}`);
  };

  return (
    <Grid
      container
      justifyContent="center"
      alignItems="center"
      gap={4}
      marginTop={6}
    >
      <PageTitle title="Chess Masti AI - Player Feedback" />

      <Grid container justifyContent="center" alignItems="center" size={12}>
        <Typography variant="h6" textAlign="center" gutterBottom>
          Analyze Your Last 25 Games
        </Typography>
        <Typography variant="body1" textAlign="center" color="text.secondary" sx={{ maxWidth: 600 }}>
          Get personalized feedback on your openings, common principle violations, and improvement areas
          based on your recent games from Lichess or Chess.com.
        </Typography>
      </Grid>

      {error && (
        <Grid container justifyContent="center" size={12}>
          <Alert severity="error" sx={{ maxWidth: 600 }}>
            {error}
          </Alert>
        </Grid>
      )}

      {isLoading && (
        <Grid container justifyContent="center" alignItems="center" size={12}>
          <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">
              Analyzing your games...
            </Typography>
          </Box>
        </Grid>
      )}

      {!feedbackData && !isLoading && (
        <Grid container justifyContent="center" size={12}>
          <PlayerFeedbackForm
            onFeedbackGenerated={handleFeedbackGenerated}
            onError={handleError}
            onLoading={handleLoading}
          />
        </Grid>
      )}

      {feedbackData && (
        <Grid container justifyContent="center" size={12}>
          <PlayerFeedbackResults
            data={feedbackData}
            onReset={() => {
              try {
                setFeedbackData(null);
                setError(null);
              } catch (error) {
                console.error('Error in onReset:', error);
                // Fallback: reload the page
                window.location.reload();
              }
            }}
            onAnalyzeWithAI={handleAnalyzeWithAI}
          />
        </Grid>
      )}
    </Grid>
  );
} 