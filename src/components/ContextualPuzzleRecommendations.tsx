"use client";

import React, { useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Chip,
  Alert,
  Button,
} from "@mui/material";
import { Loader } from "@/components/ui/Loader";
import { styled } from "@mui/material/styles";
import { useRouter } from "next/router";
import { useSetAtom } from "jotai";
import {
  practicePuzzlesAtom,
  currentPuzzleIndexAtom,
  practiceThemeAtom,
} from "@/sections/practice/states";
import { ChessPuzzle } from "@/lib/chessPuzzlesService";
import { createTrainingSet } from "@/lib/repetitTraining";

interface ContextualPuzzleRecommendationsProps {
  fen: string;
  movePlayed: string;
  correctMove: string;
  evalBefore: number;
  evalAfter: number;
  tacticalMotifs: string[];
  userRating?: number;
  mistakeDescription?: string;
}

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2.5),
  marginTop: theme.spacing(2),
  background: "linear-gradient(145deg, rgba(76, 175, 80, 0.08) 0%, rgba(46, 125, 50, 0.12) 100%)",
  border: "1px solid rgba(76, 175, 80, 0.3)",
  borderRadius: "12px",
  boxShadow: "0 4px 12px rgba(76, 175, 80, 0.15)",
}));

const PuzzleCard = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1.5),
  marginTop: theme.spacing(1),
  background: "rgba(255, 255, 255, 0.05)",
  borderRadius: "8px",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  transition: "all 0.2s ease",
  "&:hover": {
    background: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(76, 175, 80, 0.4)",
  },
}));

/**
 * Contextual Puzzle Recommendations Component
 *
 * Shows targeted puzzle recommendations based on a specific mistake.
 * This is the killer feature: personalized practice that addresses
 * the exact tactical pattern the player missed.
 */
export const ContextualPuzzleRecommendations: React.FC<
  ContextualPuzzleRecommendationsProps
> = ({
  fen,
  movePlayed,
  correctMove,
  evalBefore,
  evalAfter,
  tacticalMotifs,
  userRating = 1500,
  mistakeDescription,
}) => {
  const [puzzles, setPuzzles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  const router = useRouter();
  const setPracticePuzzles = useSetAtom(practicePuzzlesAtom);
  const setCurrentPuzzleIndex = useSetAtom(currentPuzzleIndexAtom);
  const setPracticeTheme = useSetAtom(practiceThemeAtom);

  // Load puzzles when component mounts
  React.useEffect(() => {
    if (!loaded) {
      loadTargetedPuzzles();
      setLoaded(true);
    }
  }, [loaded]);

  const loadTargetedPuzzles = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/mistake-puzzles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen,
          movePlayed,
          correctMove,
          evalBefore,
          evalAfter,
          tacticalMotifs,
          userRating,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to load puzzle recommendations");
      }

      const data = await response.json();
      setPuzzles(data.puzzles || []);
      setExplanation(data.explanation || "");
    } catch (err) {
      console.error("Error loading targeted puzzles:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load puzzle recommendations"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStartPractice = async () => {
    if (puzzles.length === 0) return;

    // Convert to ChessPuzzle format
    const mapped: ChessPuzzle[] = puzzles.map((p: any) => ({
      id: p.puzzleId,
      fen: p.fen,
      moves: typeof p.moves === "string" ? p.moves.split(" ") : p.moves,
      rating: p.rating,
      themes: p.themes || [],
      solution: typeof p.moves === "string" ? p.moves.split(" ") : p.moves,
    }));

    // Create a training set for spaced repetition
    const conceptName = mistakeDescription || `Mistake from ${fen.slice(0, 20)}...`;
    const trainingSet = createTrainingSet({
      conceptName,
      theme: tacticalMotifs[0]?.toLowerCase() || "tactical",
      puzzles: mapped,
      userId: "current-user", // TODO: Get from auth
    });

    // Navigate to practice page
    setPracticePuzzles(mapped);
    setCurrentPuzzleIndex(0);
    setPracticeTheme(tacticalMotifs[0]?.toLowerCase() || "tactical");
    router.push({
      pathname: "/practice",
      query: {
        theme: tacticalMotifs[0]?.toLowerCase() || "tactical",
        setId: trainingSet.id,
        source: "mistake-analysis",
      },
    });
  };

  if (loading) {
    return (
      <StyledPaper>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Loader size={28} showLabel={false} />
          <Typography variant="body2" color="text.secondary">
            Finding puzzles that address this specific pattern...
          </Typography>
        </Box>
      </StyledPaper>
    );
  }

  if (error) {
    return (
      <StyledPaper>
        <Alert severity="warning" sx={{ mb: 1 }}>
          {error}
        </Alert>
        <Button size="small" onClick={loadTargetedPuzzles}>
          Try Again
        </Button>
      </StyledPaper>
    );
  }

  if (puzzles.length === 0) {
    return null; // Don't show anything if no puzzles found
  }

  return (
    <StyledPaper elevation={3}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            background: "linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          🎯 Practice This Pattern
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {explanation}
      </Typography>

      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary" gutterBottom>
          Recommended practice:
        </Typography>
        {puzzles.slice(0, 3).map((puzzle, idx) => (
          <PuzzleCard key={puzzle.puzzleId}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Puzzle {idx + 1}: Rating {puzzle.rating}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>
                  {puzzle.themes?.slice(0, 3).map((theme: string) => (
                    <Chip
                      key={theme}
                      label={theme}
                      size="small"
                      sx={{
                        height: "20px",
                        fontSize: "0.7rem",
                        background: "rgba(76, 175, 80, 0.2)",
                        border: "1px solid rgba(76, 175, 80, 0.3)",
                      }}
                    />
                  ))}
                </Box>
              </Box>
            </Box>
          </PuzzleCard>
        ))}
      </Box>

      <Button
        variant="contained"
        fullWidth
        onClick={handleStartPractice}
        sx={{
          background: "linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)",
          color: "#fff",
          fontWeight: 700,
          py: 1.5,
          borderRadius: "8px",
          boxShadow: "0 4px 12px rgba(76, 175, 80, 0.3)",
          "&:hover": {
            background: "linear-gradient(135deg, #43A047 0%, #1B5E20 100%)",
            boxShadow: "0 6px 16px rgba(76, 175, 80, 0.4)",
          },
        }}
      >
        🧩 Start Practice ({puzzles.length} Puzzles)
      </Button>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: "block", textAlign: "center" }}>
        These puzzles are specifically chosen to help you recognize this pattern in future games
      </Typography>
    </StyledPaper>
  );
};

export default ContextualPuzzleRecommendations;
