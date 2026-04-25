import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Alert,
} from "@mui/material";
import { useState } from "react";
import { PlayerFeedbackData, FeedbackRequest } from "@/types/feedback";
import { getAuthHeader } from "@/lib/auth/getAuthHeader";

interface Props {
  onFeedbackGenerated: (data: PlayerFeedbackData) => void;
  onError: (error: string) => void;
  onLoading: (loading: boolean) => void;
}

export default function PlayerFeedbackForm({
  onFeedbackGenerated,
  onError,
  onLoading,
}: Props) {
  const [username, setUsername] = useState("");
  const [platform, setPlatform] = useState<"lichess" | "chesscom">("lichess");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      onError("Please enter a username");
      return;
    }

    setIsSubmitting(true);
    onLoading(true);

    try {
      const request: FeedbackRequest = {
        username: username.trim(),
        platform,
        maxGames: 25,
      };

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeader()),
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate feedback");
      }

      const feedbackData = await response.json();
      onFeedbackGenerated(feedbackData);
    } catch (error) {
      console.error("Error generating feedback:", error);
      onError(
        error instanceof Error
          ? error.message
          : "Failed to generate feedback. Please try again."
      );
    } finally {
      setIsSubmitting(false);
      onLoading(false);
    }
  };

  return (
    <Card sx={{ maxWidth: 500, width: "100%" }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Enter Your Details
        </Typography>

        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
          <TextField
            fullWidth
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            margin="normal"
            required
            placeholder={
              platform === "lichess" ? "e.g., DrNykterstein" : "e.g., Hikaru"
            }
            disabled={isSubmitting}
          />

          <FormControl fullWidth margin="normal" required>
            <InputLabel>Platform</InputLabel>
            <Select
              value={platform}
              label="Platform"
              onChange={(e) =>
                setPlatform(e.target.value as "lichess" | "chesscom")
              }
              disabled={isSubmitting}
            >
              <MenuItem value="lichess">Lichess</MenuItem>
              <MenuItem value="chesscom">Chess.com</MenuItem>
            </Select>
          </FormControl>

          <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
            <Typography variant="body2">
              This will analyze your last 25 games from{" "}
              {platform === "lichess" ? "Lichess" : "Chess.com"}. The analysis
              may take a few minutes.
            </Typography>
          </Alert>

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={isSubmitting || !username.trim()}
            sx={{ mt: 2 }}
          >
            {isSubmitting ? "Analyzing..." : "Generate Feedback"}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
