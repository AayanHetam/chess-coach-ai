import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Chip,
  IconButton,
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

  if (puzzles.length === 0) {
    return (
      <Box
        sx={{
          p: 3,
          textAlign: "center",
          color: "text.secondary",
        }}
      >
        <Typography variant="body1">
          No puzzles available. Start practicing by asking your AI coach to
          identify areas for improvement!
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Practice Puzzles ({puzzles.length})
      </Typography>
      <List sx={{ maxHeight: "60vh", overflowY: "auto" }}>
        {puzzles.map((puzzle: PracticePuzzle, index: number) => {
          const isSolved = solvedStatus[puzzle.id] || false;
          const isSelected = index === currentIndex;
          const primaryTheme = puzzle.themes?.[0] || "tactics";

          return (
            <ListItem
              key={puzzle.id}
              disablePadding
              sx={{
                mb: 1,
                border: isSelected ? 2 : 1,
                borderColor: isSelected ? "primary.main" : "divider",
                borderRadius: 1,
                backgroundColor: isSelected ? "action.selected" : "background.paper",
              }}
            >
              <ListItemButton onClick={() => handlePuzzleClick(index)}>
                <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
                  <IconButton
                    onClick={(e) => toggleSolvedStatus(e, puzzle.id)}
                    sx={{ mr: 1 }}
                    size="small"
                  >
                    {isSolved ? (
                      <CheckCircleIcon color="success" />
                    ) : (
                      <RadioButtonUncheckedIcon />
                    )}
                  </IconButton>
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="body1" fontWeight={isSelected ? 600 : 400}>
                          Puzzle {index + 1}
                        </Typography>
                        <Chip
                          label={getThemeDisplayName(primaryTheme)}
                          size="small"
                          variant="outlined"
                        />
                      </Box>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        Rating: {puzzle.rating} • {puzzle.themes?.length || 0} theme(s)
                      </Typography>
                    }
                  />
                </Box>
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
}
