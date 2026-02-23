import { useState } from "react";
import { Box, Typography, Button, Chip, Paper, IconButton, Tooltip, Divider } from "@mui/material";
import { useAtomValue, useSetAtom } from "jotai";
import {
  currentPuzzleAtom,
  currentPuzzleIndexAtom,
  practicePuzzlesAtom,
  puzzleSolvedStatusAtom,
  practiceSolvedCountAtom,
} from "./states";
import { TACTICAL_THEMES } from "@/lib/chessPuzzlesService";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useRouter } from "next/router";

export default function PuzzleInfo() {
  const router = useRouter();
  const currentPuzzle = useAtomValue(currentPuzzleAtom);
  const currentIndex = useAtomValue(currentPuzzleIndexAtom);
  const puzzles = useAtomValue(practicePuzzlesAtom);
  const solvedStatus = useAtomValue(puzzleSolvedStatusAtom);
  const setCurrentIndex = useSetAtom(currentPuzzleIndexAtom);
  const setSolvedStatus = useSetAtom(puzzleSolvedStatusAtom);

  const [showSolution, setShowSolution] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const handleFirst = () => setCurrentIndex(0);
  const handlePrevious = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };
  const handleNext = () => {
    if (currentIndex < puzzles.length - 1) setCurrentIndex(currentIndex + 1);
  };
  const handleLast = () => setCurrentIndex(puzzles.length - 1);

  // Reset show states when puzzle changes
  const puzzleId = currentPuzzle?.id;
  const [lastPuzzleId, setLastPuzzleId] = useState<string | undefined>();
  if (puzzleId !== lastPuzzleId) {
    setShowSolution(false);
    setShowHint(false);
    setLastPuzzleId(puzzleId);
  }

  const handleShowSolution = () => {
    setShowSolution(true);
    if (currentPuzzle) {
      setSolvedStatus((prev) => ({
        ...prev,
        [currentPuzzle.id]: true,
      }));
    }
  };

  const handleShowHint = () => {
    setShowHint(true);
  };

  const handleAnalyzePosition = () => {
    if (currentPuzzle?.fen) {
      router.push(`/analysis?fen=${encodeURIComponent(currentPuzzle.fen)}`);
    }
  };

  const getThemeDisplayName = (theme: string): string => {
    const themeInfo = TACTICAL_THEMES[theme];
    return themeInfo ? themeInfo.theme : theme;
  };

  if (!currentPuzzle) {
    return (
      <Paper
        sx={{
          p: 3,
          textAlign: "center",
          bgcolor: "grey.900",
          color: "grey.400",
        }}
      >
        <Typography variant="body1">
          Select a puzzle to view details
        </Typography>
      </Paper>
    );
  }

  const isSolved = solvedStatus[currentPuzzle.id] || false;
  const solutionMoves = currentPuzzle.solution || currentPuzzle.moves || [];

  // Generate hint: show the first user move's target piece/square
  const hintText = (() => {
    if (solutionMoves.length < 2) return "Look for the best move.";
    const userMove = solutionMoves[1]; // second move is user's first response
    const to = userMove?.slice(2, 4);
    return `Look at the square ${to?.toUpperCase() || "..."}.`;
  })();

  return (
    <Paper
      sx={{
        bgcolor: "grey.900",
        color: "grey.100",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      {/* Navigation bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.5,
          px: 2,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "grey.800",
        }}
      >
        <Tooltip title="First puzzle">
          <span>
            <IconButton
              onClick={handleFirst}
              disabled={currentIndex === 0}
              size="small"
              sx={{ color: "grey.400" }}
            >
              <SkipPreviousIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Previous puzzle">
          <span>
            <IconButton
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              size="small"
              sx={{ color: "grey.400" }}
            >
              <NavigateBeforeIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="body2" sx={{ mx: 2, fontWeight: 600, color: "grey.300" }}>
          {currentIndex + 1} / {puzzles.length}
        </Typography>
        <Tooltip title="Next puzzle">
          <span>
            <IconButton
              onClick={handleNext}
              disabled={currentIndex === puzzles.length - 1}
              size="small"
              sx={{ color: "grey.400" }}
            >
              <NavigateNextIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Last puzzle">
          <span>
            <IconButton
              onClick={handleLast}
              disabled={currentIndex === puzzles.length - 1}
              size="small"
              sx={{ color: "grey.400" }}
            >
              <SkipNextIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Puzzle details */}
      <Box sx={{ p: 2.5 }}>
        {/* Rating and status */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
          <Typography variant="body2" sx={{ color: "grey.400" }}>
            Rating: <strong style={{ color: "#e0e0e0" }}>{currentPuzzle.rating}</strong>
          </Typography>
          {isSolved && (
            <Chip
              label="Solved"
              color="success"
              size="small"
              sx={{ height: 22, fontSize: "0.7rem" }}
            />
          )}
        </Box>

        {/* Themes */}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 2 }}>
          {currentPuzzle.themes?.map((theme) => (
            <Chip
              key={theme}
              label={getThemeDisplayName(theme)}
              size="small"
              sx={{
                bgcolor: "grey.800",
                color: "grey.300",
                fontSize: "0.72rem",
                height: 24,
              }}
            />
          ))}
        </Box>

        {/* Hint */}
        {showHint && !showSolution && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: "rgba(255,193,7,0.1)", borderRadius: 1, border: "1px solid rgba(255,193,7,0.3)" }}>
            <Typography variant="body2" sx={{ color: "warning.light" }}>
              {hintText}
            </Typography>
          </Box>
        )}

        {/* Solution */}
        {showSolution && solutionMoves.length > 0 && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: "rgba(76,175,80,0.1)", borderRadius: 1, border: "1px solid rgba(76,175,80,0.3)" }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: "success.light", display: "block", mb: 0.5 }}>
              Solution:
            </Typography>
            <Typography variant="body2" fontFamily="monospace" sx={{ color: "grey.200" }}>
              {solutionMoves.join(" \u2192 ")}
            </Typography>
          </Box>
        )}

        {/* Action buttons */}
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<MenuBookIcon />}
            onClick={handleShowSolution}
            disabled={showSolution}
            sx={{
              color: "grey.300",
              borderColor: "grey.700",
              "&:hover": { borderColor: "grey.500", bgcolor: "grey.800" },
              textTransform: "none",
            }}
          >
            Solution
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<LightbulbIcon />}
            onClick={handleShowHint}
            disabled={showHint || showSolution}
            sx={{
              color: "grey.300",
              borderColor: "grey.700",
              "&:hover": { borderColor: "grey.500", bgcolor: "grey.800" },
              textTransform: "none",
            }}
          >
            Hint
          </Button>
        </Box>

        <Divider sx={{ borderColor: "grey.800", my: 1.5 }} />

        {/* Analyze position link */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="body2" sx={{ color: "grey.500" }}>
            Want to explore?
          </Typography>
          <Button
            variant="outlined"
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            onClick={handleAnalyzePosition}
            sx={{
              color: "primary.light",
              borderColor: "primary.dark",
              "&:hover": { borderColor: "primary.main", bgcolor: "rgba(25,118,210,0.08)" },
              textTransform: "none",
              fontSize: "0.8rem",
            }}
          >
            Analyze Position
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}
