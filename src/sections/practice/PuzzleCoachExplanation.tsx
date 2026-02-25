import { useState, useEffect, useRef } from "react";
import { Box, Typography, Button, CircularProgress, Collapse } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SchoolIcon from "@mui/icons-material/School";
import { useAtomValue } from "jotai";
import { currentPuzzleAtom, puzzleSolvedStatusAtom } from "./states";
import {
  PUZZLE_EXPLANATION_SYSTEM_PROMPT,
  buildPuzzleExplanationPrompt,
} from "@/lib/prompts/puzzleExplanation";

interface PuzzleCoachExplanationProps {
  puzzleStatus: "loading" | "playing" | "wrong" | "solved";
}

export default function PuzzleCoachExplanation({ puzzleStatus }: PuzzleCoachExplanationProps) {
  const currentPuzzle = useAtomValue(currentPuzzleAtom);
  const solvedStatus = useAtomValue(puzzleSolvedStatusAtom);

  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const lastExplainedPuzzleRef = useRef<string | null>(null);

  // Reset when puzzle changes
  useEffect(() => {
    if (currentPuzzle?.id !== lastExplainedPuzzleRef.current) {
      setExplanation(null);
      setError(null);
      setExpanded(false);
    }
  }, [currentPuzzle?.id]);

  const isSolved = currentPuzzle ? (solvedStatus[currentPuzzle.id] || false) : false;
  const showButton = puzzleStatus === "solved" || puzzleStatus === "wrong" || isSolved;

  const fetchExplanation = async () => {
    if (!currentPuzzle) return;
    if (lastExplainedPuzzleRef.current === currentPuzzle.id && explanation) {
      setExpanded(true);
      return;
    }

    setLoading(true);
    setError(null);
    setExpanded(true);
    lastExplainedPuzzleRef.current = currentPuzzle.id;

    try {
      const prompt = buildPuzzleExplanationPrompt({
        fen: currentPuzzle.fen,
        themes: currentPuzzle.themes || [],
        solutionMoves: currentPuzzle.solution || currentPuzzle.moves || [],
        puzzleRating: currentPuzzle.rating,
        solved: puzzleStatus === "solved" || isSolved,
      });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: PUZZLE_EXPLANATION_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get explanation");
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content
        || data.content
        || data.reply
        || data.message
        || "No explanation available.";
      setExplanation(text);
    } catch (err) {
      console.error("Coach explanation error:", err);
      setError("Could not load coach explanation. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!showButton) return null;

  return (
    <Box sx={{ mt: 1.5 }}>
      {!expanded && (
        <Button
          variant="outlined"
          size="small"
          startIcon={<AutoAwesomeIcon />}
          onClick={fetchExplanation}
          sx={{
            color: "#ffa726",
            borderColor: "rgba(255,167,38,0.4)",
            "&:hover": { borderColor: "#ffa726", bgcolor: "rgba(255,167,38,0.08)" },
            textTransform: "none",
            fontWeight: 600,
          }}
        >
          Coach Explains This Puzzle
        </Button>
      )}

      <Collapse in={expanded}>
        <Box
          sx={{
            mt: 1,
            p: 2,
            borderRadius: 1.5,
            bgcolor: "rgba(255,167,38,0.06)",
            border: "1px solid rgba(255,167,38,0.2)",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <SchoolIcon sx={{ color: "#ffa726", fontSize: 18 }} />
            <Typography variant="caption" sx={{ fontWeight: 700, color: "#ffa726", letterSpacing: 0.5 }}>
              AI COACH
            </Typography>
          </Box>

          {loading && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={16} sx={{ color: "#ffa726" }} />
              <Typography variant="body2" sx={{ color: "grey.400" }}>
                Thinking...
              </Typography>
            </Box>
          )}

          {error && (
            <Typography variant="body2" sx={{ color: "error.light" }}>
              {error}
            </Typography>
          )}

          {explanation && !loading && (
            <Typography
              variant="body2"
              sx={{
                color: "grey.200",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {explanation}
            </Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
