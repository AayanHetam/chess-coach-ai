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
import type { ChessPuzzle } from "@/lib/chessPuzzlesService";
import { getAuthHeader } from "@/lib/auth/getAuthHeader";

interface PuzzleCoachExplanationProps {
  puzzleStatus: "loading" | "playing" | "wrong" | "solved";
}

/**
 * Generate a fallback explanation when API is unavailable.
 * Uses puzzle metadata (themes, rating) to provide basic tactical insight.
 */
function generateFallbackExplanation(puzzle: ChessPuzzle): string {
  const themes = puzzle.themes || [];
  const rating = puzzle.rating || 1500;

  let explanation = "## Puzzle Explanation (Offline Mode)\n\n";

  // Theme-based explanation
  if (themes.length > 0) {
    const primaryTheme = themes[0].replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    explanation += `**Key Tactical Theme**: ${primaryTheme}\n\n`;

    // Common tactical patterns
    const themeExplanations: Record<string, string> = {
      "fork": "A fork attacks two or more pieces simultaneously, forcing the opponent to lose material.",
      "pin": "A pin restricts a piece from moving because it would expose a more valuable piece behind it.",
      "skewer": "A skewer attacks a valuable piece, forcing it to move and exposing a less valuable piece behind it.",
      "back-rank-mate": "The opponent's king is trapped on the back rank with no escape squares.",
      "discovered-attack": "Moving one piece reveals an attack from another piece behind it.",
      "sacrifice": "Giving up material to achieve a tactical advantage or checkmate.",
      "mate-in-1": "Find the move that delivers checkmate in one move.",
      "mate-in-2": "Find the forcing sequence that leads to checkmate in two moves.",
      "exposed-king": "The opponent's king lacks pawn protection or has weak squares nearby.",
      "hanging-piece": "A piece is undefended and can be captured for free.",
    };

    const themeKey = themes[0].toLowerCase();
    if (themeExplanations[themeKey]) {
      explanation += `${themeExplanations[themeKey]}\n\n`;
    }
  }

  // Rating-based difficulty
  if (rating < 1200) {
    explanation += "**Difficulty**: Beginner — Focus on finding the key tactical blow.\n\n";
  } else if (rating < 1800) {
    explanation += "**Difficulty**: Intermediate — Look for forcing moves (checks, captures, threats).\n\n";
  } else {
    explanation += "**Difficulty**: Advanced — Requires deep calculation and precise move order.\n\n";
  }

  // Solution hint
  if (puzzle.solution && puzzle.solution.length > 0) {
    const firstMove = puzzle.solution[0];
    explanation += `**First Move**: The solution starts with \`${firstMove}\`\n\n`;
  }

  explanation += "*Coach explanation unavailable. Restart the dev server to enable AI-powered explanations.*";

  return explanation;
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

      // /api/chat's Zod schema (chatSchema, AUDIT-PHASE-1.4) restricts
      // role to "user" | "assistant" — sending role:"system" makes the
      // schema parse fail with a 400, dropping us into the offline
      // fallback every time. Concatenate the system prompt into the
      // user message instead so the live coach actually fires. Mirrors
      // the InlinePuzzleCoach shipped in PR #107.
      const combined = `${PUZZLE_EXPLANATION_SYSTEM_PROMPT}\n\n${prompt}`;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({
          messages: [{ role: "user", content: combined }],
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API error response:", response.status, errorText);

        // Provide fallback explanation if API fails
        if (response.status === 404) {
          setError("Coach explanation service is currently unavailable.");
          setExplanation(generateFallbackExplanation(currentPuzzle));
          return;
        }

        throw new Error(`Failed to get explanation: ${response.status} ${response.statusText}`);
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

      // Provide fallback explanation on any error
      setExplanation(generateFallbackExplanation(currentPuzzle));
      setError("Using offline explanation (API unavailable)");
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
