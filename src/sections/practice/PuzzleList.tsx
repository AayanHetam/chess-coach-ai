import { useState, useMemo } from "react";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Chip,
  IconButton,
  Collapse,
} from "@mui/material";
import { useAtomValue, useSetAtom } from "jotai";
import {
  practicePuzzlesAtom,
  currentPuzzleIndexAtom,
  puzzleSolvedStatusAtom,
  PracticePuzzle,
} from "./states";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { TACTICAL_THEMES } from "@/lib/chessPuzzlesService";

interface PuzzleListProps {
  onPuzzleSelect?: (index: number) => void;
}

export default function PuzzleList({ onPuzzleSelect }: PuzzleListProps) {
  const puzzles = useAtomValue(practicePuzzlesAtom);
  const currentIndex = useAtomValue(currentPuzzleIndexAtom);
  const solvedStatus = useAtomValue(puzzleSolvedStatusAtom);
  const setCurrentIndex = useSetAtom(currentPuzzleIndexAtom);
  const setSolvedStatus = useSetAtom(puzzleSolvedStatusAtom);
  const [showSolved, setShowSolved] = useState(false);

  // Split puzzles into unsolved and solved groups
  const { unsolved, solved } = useMemo(() => {
    const unsolvedList: { puzzle: PracticePuzzle; originalIndex: number }[] = [];
    const solvedList: { puzzle: PracticePuzzle; originalIndex: number }[] = [];
    puzzles.forEach((puzzle, index) => {
      if (solvedStatus[puzzle.id]) {
        solvedList.push({ puzzle, originalIndex: index });
      } else {
        unsolvedList.push({ puzzle, originalIndex: index });
      }
    });
    return { unsolved: unsolvedList, solved: solvedList };
  }, [puzzles, solvedStatus]);

  const handlePuzzleClick = (index: number) => {
    setCurrentIndex(index);
    if (onPuzzleSelect) {
      onPuzzleSelect(index);
    }
  };

  const toggleSolvedStatus = (e: React.MouseEvent, puzzleId: string) => {
    e.stopPropagation();
    setSolvedStatus((prev) => ({
      ...prev,
      [puzzleId]: !prev[puzzleId],
    }));
  };

  const getThemeDisplayName = (theme: string): string => {
    const themeInfo = TACTICAL_THEMES[theme];
    return themeInfo ? themeInfo.theme : theme;
  };

  const renderPuzzleItem = (
    puzzle: PracticePuzzle,
    originalIndex: number,
    displayNum: number,
    isSolved: boolean
  ) => {
    const isSelected = originalIndex === currentIndex;
    const primaryTheme = puzzle.themes?.[0] || "tactics";

    return (
      <ListItem
        key={puzzle.id}
        disablePadding
        sx={{
          mb: 0.5,
          borderRadius: 1,
          overflow: "hidden",
          border: isSelected ? "1px solid" : "1px solid transparent",
          borderColor: isSelected ? "primary.dark" : "transparent",
          bgcolor: isSelected ? "rgba(25,118,210,0.12)" : "transparent",
          opacity: isSolved && !isSelected ? 0.55 : 1,
        }}
      >
        <ListItemButton
          onClick={() => handlePuzzleClick(originalIndex)}
          sx={{
            py: 0.75,
            px: 1.5,
            "&:hover": { bgcolor: "grey.800" },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
            <IconButton
              onClick={(e) => toggleSolvedStatus(e, puzzle.id)}
              sx={{ mr: 1, color: isSolved ? "success.main" : "grey.600" }}
              size="small"
            >
              {isSolved ? (
                <CheckCircleIcon fontSize="small" />
              ) : (
                <RadioButtonUncheckedIcon fontSize="small" />
              )}
            </IconButton>
            <ListItemText
              primary={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? "grey.100" : isSolved ? "grey.500" : "grey.300",
                    }}
                  >
                    Puzzle {displayNum}
                  </Typography>
                  <Chip
                    label={getThemeDisplayName(primaryTheme)}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: "0.68rem",
                      bgcolor: "grey.800",
                      color: "grey.400",
                    }}
                  />
                </Box>
              }
              secondary={
                <Typography variant="caption" sx={{ color: "grey.500" }}>
                  Rating: {puzzle.rating} &bull; {puzzle.themes?.length || 0} theme(s)
                </Typography>
              }
            />
          </Box>
        </ListItemButton>
      </ListItem>
    );
  };

  if (puzzles.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center", color: "grey.500" }}>
        <Typography variant="body1">No puzzles available.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 1.5 }}>
      <Typography variant="subtitle2" sx={{ mb: 1, px: 1, fontWeight: 600, color: "grey.400" }}>
        Puzzles ({unsolved.length} remaining)
      </Typography>
      <List disablePadding>
        {unsolved.map(({ puzzle, originalIndex }, i) =>
          renderPuzzleItem(puzzle, originalIndex, i + 1, false)
        )}
      </List>

      {solved.length > 0 && (
        <>
          <Box
            onClick={() => setShowSolved(!showSolved)}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: 1,
              py: 0.75,
              mt: 1.5,
              mb: 0.5,
              cursor: "pointer",
              borderRadius: 1,
              "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: "grey.500", fontSize: "0.75rem" }}>
              Previously Solved ({solved.length})
            </Typography>
            {showSolved ? (
              <ExpandLessIcon sx={{ color: "grey.500", fontSize: 18 }} />
            ) : (
              <ExpandMoreIcon sx={{ color: "grey.500", fontSize: 18 }} />
            )}
          </Box>
          <Collapse in={showSolved}>
            <List disablePadding>
              {solved.map(({ puzzle, originalIndex }, i) =>
                renderPuzzleItem(puzzle, originalIndex, unsolved.length + i + 1, true)
              )}
            </List>
          </Collapse>
        </>
      )}
    </Box>
  );
}
