import { Box, Typography, Button, Chip, Paper } from "@mui/material";
import { useAtomValue, useSetAtom } from "jotai";
import {
  currentPuzzleAtom,
  currentPuzzleIndexAtom,
  practicePuzzlesAtom,
  puzzleSolvedStatusAtom,
  practiceSolvedCountAtom,
} from "./states";
import { TACTICAL_THEMES } from "@/lib/chessPuzzlesService";
import VisibilityIcon from "@mui/icons-material/Visibility";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";

export default function PuzzleInfo() {
  const currentPuzzle = useAtomValue(currentPuzzleAtom);
  const currentIndex = useAtomValue(currentPuzzleIndexAtom);
  const puzzles = useAtomValue(practicePuzzlesAtom);
  const solvedStatus = useAtomValue(puzzleSolvedStatusAtom);
  const solvedCount = useAtomValue(practiceSolvedCountAtom);
  const setCurrentIndex = useSetAtom(currentPuzzleIndexAtom);
  const setSolvedStatus = useSetAtom(puzzleSolvedStatusAtom);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < puzzles.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleShowSolution = () => {
    if (currentPuzzle) {
      // Mark as solved when showing solution
      setSolvedStatus((prev) => ({
        ...prev,
        [currentPuzzle.id]: true,
      }));
    }
  };

  const getThemeDisplayName = (theme: string): string => {
    const themeInfo = TACTICAL_THEMES[theme];
    return themeInfo ? themeInfo.theme : theme;
  };

  if (!currentPuzzle) {
    return (
      <Paper sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body1" color="text.secondary">
          Select a puzzle to view details
        </Typography>
      </Paper>
    );
  }

  const isSolved = solvedStatus[currentPuzzle.id] || false;
  const solutionMoves = currentPuzzle.solution || currentPuzzle.moves || [];

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
          Puzzle {currentIndex + 1} of {puzzles.length}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Progress: {solvedCount} / {puzzles.length} solved
        </Typography>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
          {currentPuzzle.themes?.map((theme) => (
            <Chip
              key={theme}
              label={getThemeDisplayName(theme)}
              size="small"
              color="primary"
              variant="outlined"
            />
          ))}
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Rating: <strong>{currentPuzzle.rating}</strong>
          </Typography>
          {isSolved && (
            <Chip
              label="Solved"
              color="success"
              size="small"
              sx={{ mt: 1 }}
            />
          )}
        </Box>

        {isSolved && solutionMoves.length > 0 && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
            <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
              Solution:
            </Typography>
            <Typography variant="body2" fontFamily="monospace">
              {solutionMoves.join(" → ")}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            startIcon={<NavigateBeforeIcon />}
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            size="small"
          >
            Previous
          </Button>
          <Button
            variant="outlined"
            startIcon={<VisibilityIcon />}
            onClick={handleShowSolution}
            size="small"
          >
            Show Solution
          </Button>
          <Button
            variant="outlined"
            endIcon={<NavigateNextIcon />}
            onClick={handleNext}
            disabled={currentIndex === puzzles.length - 1}
            size="small"
          >
            Next
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}
