import { Grid, Box, Typography, Button, Paper } from "@mui/material";
import { useAtomValue, useSetAtom } from "jotai";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { PageTitle } from "@/components/pageTitle";
import PracticeBoard from "@/sections/practice/PracticeBoard";
import PuzzleList from "@/sections/practice/PuzzleList";
import PuzzleInfo from "@/sections/practice/PuzzleInfo";
import {
  practicePuzzlesAtom,
  currentPuzzleIndexAtom,
  practiceThemeAtom,
} from "@/sections/practice/states";
import { getPuzzlesByTheme, normalizeThemeName } from "@/lib/chessPuzzlesService";
import { TACTICAL_THEMES } from "@/lib/chessPuzzlesService";

export default function Practice() {
  const router = useRouter();
  const puzzles = useAtomValue(practicePuzzlesAtom);
  const currentIndex = useAtomValue(currentPuzzleIndexAtom);
  const theme = useAtomValue(practiceThemeAtom);
  const setPuzzles = useSetAtom(practicePuzzlesAtom);
  const setCurrentIndex = useSetAtom(currentPuzzleIndexAtom);
  const setTheme = useSetAtom(practiceThemeAtom);

  // Load puzzles from URL query if theme is provided
  useEffect(() => {
    const { theme: themeParam } = router.query;
    
    if (themeParam && typeof themeParam === "string" && puzzles.length === 0) {
      const normalizedTheme = normalizeThemeName(themeParam);
      loadPuzzlesForTheme(normalizedTheme);
    }
  }, [router.query]);

  const loadPuzzlesForTheme = async (themeName: string) => {
    try {
      const fetchedPuzzles = await getPuzzlesByTheme([themeName], 20);
      if (fetchedPuzzles.length > 0) {
        // BUG FIX #1: Don't set solved field - solved status is managed by puzzleSolvedStatusAtom
        // The puzzles array stores puzzle data only, solved status is read from the atom
        setPuzzles(fetchedPuzzles);
        setCurrentIndex(0);
        setTheme(themeName);
      }
    } catch (error) {
      console.error("Error loading puzzles:", error);
    }
  };

  const getThemeDisplayName = (themeKey: string | null): string => {
    if (!themeKey) return "Practice";
    const themeInfo = TACTICAL_THEMES[themeKey];
    return themeInfo ? themeInfo.theme : themeKey;
  };

  if (puzzles.length === 0) {
    return (
      <>
        <PageTitle title="Chess Masti AI - Practice" />
        <Grid
          container
          justifyContent="center"
          alignItems="center"
          sx={{ minHeight: "80vh", p: 3 }}
        >
          <Paper sx={{ p: 4, maxWidth: 600, textAlign: "center" }}>
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
              Welcome to Practice Mode
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Start practicing by asking your AI coach to identify areas for
              improvement in your games. The coach will offer practice puzzles
              based on the skills you need to work on.
            </Typography>
            <Button
              variant="contained"
              onClick={() => router.push("/")}
              sx={{ mr: 2 }}
            >
              Go to Analysis
            </Button>
            <Button variant="outlined" onClick={() => router.push("/")}>
              Talk to AI Coach
            </Button>
          </Paper>
        </Grid>
      </>
    );
  }

  return (
    <>
      <PageTitle title={`Chess Masti AI - Practice: ${getThemeDisplayName(theme)}`} />
      <Grid
        container
        gap={2}
        justifyContent="flex-start"
        alignItems="start"
        direction={{ xs: "column", lg: "row" }}
        sx={{ width: "100%", maxWidth: "100vw", p: 2 }}
      >
        {/* Left side - Chessboard */}
        <Grid size={{ xs: 12, lg: "auto" }} sx={{ flexShrink: 0 }}>
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {getThemeDisplayName(theme)} Practice
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {puzzles.length} puzzles available
            </Typography>
          </Box>
          <PracticeBoard />
        </Grid>

        {/* Right side - Puzzle list and info */}
        <Grid
          size={{ xs: 12, lg: "grow" }}
          container
          direction="column"
          gap={2}
          sx={{ minWidth: { lg: "400px" } }}
        >
          <PuzzleInfo />
          <PuzzleList />
        </Grid>
      </Grid>
    </>
  );
}
