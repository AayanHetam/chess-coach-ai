import { useCallback, useEffect, useState } from "react";
import {
  Typography,
  Box,
  Button,
  Paper,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Divider,
  Tabs,
  Tab,
} from "@mui/material";
import BoltIcon from "@mui/icons-material/Bolt";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import VisibilityIcon from "@mui/icons-material/Visibility";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { useRouter } from "next/router";
import { useAtom, useAtomValue } from "jotai";
import { PageTitle } from "@/components/pageTitle";
import PuzzleList from "@/sections/practice/PuzzleList";
import PuzzleInfo from "@/sections/practice/PuzzleInfo";
import PracticeBoard from "@/sections/practice/PracticeBoard";
import {
  practicePuzzlesAtom,
  currentPuzzleIndexAtom,
  practiceThemeAtom,
  practiceSolvedCountAtom,
  puzzleSolvedStatusAtom,
} from "@/sections/practice/states";
import { TACTICAL_THEMES, type ChessPuzzle } from "@/lib/chessPuzzlesService";
import type { DifficultyBand } from "@/types/puzzles";
import PuzzleRush from "@/sections/practice/PuzzleRush";
import PuzzleStats from "@/sections/practice/PuzzleStats";
import PatternTraining from "@/sections/practice/PatternTraining";
import { blindModeAtom } from "@/sections/practice/states";
import PsychologyIcon from "@mui/icons-material/Psychology";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const THEME_CATEGORIES: Record<string, { label: string; themes: string[] }> = {
  tactics: {
    label: "Core Tactics",
    themes: ["fork", "pin", "skewer", "discoveredAttack", "doubleCheck", "xRayAttack"],
  },
  mating: {
    label: "Mating Patterns",
    themes: ["backRankMate", "smotheredMate", "mate", "mateIn1", "mateIn2", "mateIn3", "mateIn4"],
  },
  material: {
    label: "Material",
    themes: ["sacrifice", "hangingPiece", "trappedPiece", "promotion", "underPromotion"],
  },
  positional: {
    label: "Positional",
    themes: ["quietMove", "defensiveMove", "intermezzo", "clearance", "deflection", "attraction", "interference"],
  },
  attack: {
    label: "Attack",
    themes: ["exposedKing", "kingsideAttack", "queensideAttack", "attackingF2F7", "castling"],
  },
  endgame: {
    label: "Endgames",
    themes: ["endgame", "rookEndgame", "bishopEndgame", "knightEndgame", "queenEndgame", "pawnEndgame"],
  },
};

const DIFFICULTY_OPTIONS: { value: DifficultyBand | "all"; label: string; ratingRange: string }[] = [
  { value: "all", label: "All Levels", ratingRange: "" },
  { value: "beginner", label: "Beginner", ratingRange: "0-1200" },
  { value: "intermediate", label: "Intermediate", ratingRange: "1201-1600" },
  { value: "advanced", label: "Advanced", ratingRange: "1601-2000" },
  { value: "expert", label: "Expert", ratingRange: "2001+" },
];

function getThemeDisplayName(theme: string): string {
  const info = TACTICAL_THEMES[theme];
  if (info) return info.theme;
  // Convert camelCase to title case
  return theme.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
}

export default function Practice() {
  const router = useRouter();
  const [practiceMode, setPracticeMode] = useState<"standard" | "rush" | "pattern">("standard");
  const [blindMode, setBlindMode] = useAtom(blindModeAtom);

  const [puzzles, setPuzzles] = useAtom(practicePuzzlesAtom);
  const [currentIndex, setCurrentIndex] = useAtom(currentPuzzleIndexAtom);
  const [practiceTheme, setPracticeTheme] = useAtom(practiceThemeAtom);
  const solvedCount = useAtomValue(practiceSolvedCountAtom);
  const solvedStatus = useAtomValue(puzzleSolvedStatusAtom);

  const [selectedTheme, setSelectedTheme] = useState<string>("");
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyBand | "all">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for theme from URL query (when redirected from AI Coach)
  useEffect(() => {
    const { theme: queryTheme, difficulty: queryDifficulty } = router.query;
    if (queryTheme && typeof queryTheme === "string") {
      setSelectedTheme(queryTheme);
    }
    if (queryDifficulty && typeof queryDifficulty === "string") {
      setSelectedDifficulty(queryDifficulty as DifficultyBand | "all");
    }
  }, [router.query]);

  const fetchPuzzles = useCallback(async () => {
    if (!selectedTheme) return;

    setLoading(true);
    setError(null);

    try {
      // Collect solved puzzle IDs to exclude from results
      const solvedIds = Object.keys(solvedStatus).filter((id) => solvedStatus[id]);

      const body: Record<string, unknown> = {
        command: "by_theme",
        themes: [selectedTheme],
        limit: 30, // Request extra to compensate for any filtering
        excludeIds: solvedIds.length > 0 ? solvedIds : undefined,
      };
      if (selectedDifficulty !== "all") {
        body.difficulty = selectedDifficulty;
      }

      const response = await fetch("/api/chess-puzzles-dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.puzzles && data.puzzles.length > 0) {
        const mapped: ChessPuzzle[] = data.puzzles.map((p: Record<string, unknown>) => ({
          id: (p.id as string) || String(Math.random()),
          fen: p.fen as string,
          moves: (p.moves as string[]) || [],
          rating: (p.rating as number) || 1500,
          themes: (p.themes as string[]) || [],
          solution: (p.solution as string[]) || (p.moves as string[]) || [],
        }));
        setPuzzles(mapped);
        setCurrentIndex(0);
        setPracticeTheme(selectedTheme);
      } else {
        setError("No puzzles found for this theme/difficulty combination. Try a different selection.");
        setPuzzles([]);
      }
    } catch (err) {
      console.error("Error fetching puzzles:", err);
      setError("Failed to load puzzles. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [selectedTheme, selectedDifficulty, solvedStatus, setPuzzles, setCurrentIndex, setPracticeTheme]);

  // If we already have puzzles loaded (e.g., from AI Coach redirect), show them
  const hasPuzzles = puzzles.length > 0;

  // If in Puzzle Rush mode
  if (practiceMode === "rush") {
    return (
      <>
        <PageTitle title="Chess Masti AI - Puzzle Rush" />
        <Box sx={{ width: "100%", maxWidth: "100vw", p: { xs: 1, md: 2 } }}>
          <ErrorBoundary name="puzzle-rush">
            <PuzzleRush onBack={() => setPracticeMode("standard")} />
          </ErrorBoundary>
        </Box>
      </>
    );
  }

  // If in Pattern Training mode
  if (practiceMode === "pattern") {
    return (
      <>
        <PageTitle title="Chess Masti AI - Pattern Training" />
        <Box sx={{ width: "100%", maxWidth: "100vw", p: { xs: 1, md: 2 } }}>
          <ErrorBoundary name="pattern-training">
            <PatternTraining onBack={() => setPracticeMode("standard")} />
          </ErrorBoundary>
        </Box>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Chess Masti AI - Practice Puzzles" />
      <Box sx={{ width: "100%", maxWidth: "100vw", p: { xs: 1, md: 2 } }}>
        {/* Mode tabs + Stats shown when no puzzles loaded */}
        {!hasPuzzles && (
          <Paper sx={{ p: 3, mb: 2, maxWidth: 900, mx: "auto" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, flexWrap: "wrap", gap: 1 }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Practice
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  variant="outlined"
                  startIcon={<BoltIcon />}
                  onClick={() => setPracticeMode("rush")}
                  sx={{ textTransform: "none", fontWeight: 600 }}
                >
                  Puzzle Rush
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<PsychologyIcon />}
                  onClick={() => setPracticeMode("pattern")}
                  sx={{ textTransform: "none", fontWeight: 600 }}
                >
                  Pattern Training
                </Button>
              </Box>
            </Box>
            <PuzzleStats compact />
          </Paper>
        )}

        {/* Theme & Difficulty Selector */}
        {!hasPuzzles && (
          <Paper sx={{ p: 3, mb: 2, maxWidth: 900, mx: "auto" }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              Standard Puzzles
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Choose a tactical theme and difficulty level to start solving puzzles from the Lichess database.
            </Typography>

            {/* Difficulty selector */}
            <FormControl size="small" sx={{ mb: 3, minWidth: 200 }}>
              <InputLabel>Difficulty</InputLabel>
              <Select
                value={selectedDifficulty}
                label="Difficulty"
                onChange={(e) => setSelectedDifficulty(e.target.value as DifficultyBand | "all")}
              >
                {DIFFICULTY_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label} {opt.ratingRange && <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>({opt.ratingRange})</Typography>}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Theme categories */}
            {Object.entries(THEME_CATEGORIES).map(([catKey, cat]) => (
              <Box key={catKey} sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
                  {cat.label}
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {cat.themes.map((t) => (
                    <Chip
                      key={t}
                      label={getThemeDisplayName(t)}
                      onClick={() => setSelectedTheme(t)}
                      color={selectedTheme === t ? "primary" : "default"}
                      variant={selectedTheme === t ? "filled" : "outlined"}
                      sx={{ cursor: "pointer" }}
                    />
                  ))}
                </Box>
              </Box>
            ))}

            {/* Extra themes */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
                Other
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {["advancedPawn", "zugzwang", "middlegame", "opening", "short", "long", "oneMove"].map((t) => (
                  <Chip
                    key={t}
                    label={getThemeDisplayName(t)}
                    onClick={() => setSelectedTheme(t)}
                    color={selectedTheme === t ? "primary" : "default"}
                    variant={selectedTheme === t ? "filled" : "outlined"}
                    sx={{ cursor: "pointer" }}
                  />
                ))}
              </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Button
                variant="contained"
                size="large"
                onClick={fetchPuzzles}
                disabled={!selectedTheme || loading}
                sx={{ px: 4 }}
              >
                {loading ? <CircularProgress size={24} /> : "Load Puzzles"}
              </Button>
              {selectedTheme && (
                <Typography variant="body2" color="text.secondary">
                  Selected: <strong>{getThemeDisplayName(selectedTheme)}</strong>
                  {selectedDifficulty !== "all" && ` (${selectedDifficulty})`}
                </Typography>
              )}
            </Box>

            {error && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </Paper>
        )}

        {/* Puzzle solving UI */}
        {hasPuzzles && (
          <Box sx={{ maxWidth: 1200, mx: "auto" }}>
            {/* Header bar */}
            <Paper
              sx={{
                px: 2,
                py: 1.5,
                mb: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 1,
                bgcolor: "grey.900",
                color: "grey.100",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {practiceTheme ? getThemeDisplayName(practiceTheme) : "Practice"} Puzzles
                </Typography>
                <Chip
                  label={`${solvedCount} / ${puzzles.length} solved`}
                  color={solvedCount === puzzles.length ? "success" : "default"}
                  size="small"
                  sx={solvedCount < puzzles.length ? { bgcolor: "grey.800", color: "grey.300" } : {}}
                />
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Tooltip title={blindMode ? "Show pieces" : "Blind mode (hide pieces)"}>
                  <IconButton
                    onClick={() => setBlindMode(!blindMode)}
                    size="small"
                    sx={{
                      color: blindMode ? "warning.main" : "grey.500",
                      border: "1px solid",
                      borderColor: blindMode ? "warning.dark" : "grey.700",
                      bgcolor: blindMode ? "rgba(255,167,38,0.08)" : "transparent",
                    }}
                  >
                    {blindMode ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    setPuzzles([]);
                    setCurrentIndex(-1);
                    setPracticeTheme(null);
                    setSelectedTheme("");
                  }}
                  sx={{
                    color: "grey.300",
                    borderColor: "grey.700",
                    "&:hover": { borderColor: "grey.500", bgcolor: "grey.800" },
                    textTransform: "none",
                  }}
                >
                  Choose Different Theme
                </Button>
              </Box>
            </Paper>

            {/* Main content: board left, panel right */}
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", lg: "row" },
                gap: 2,
                alignItems: "flex-start",
              }}
            >
              {/* Board */}
              <Box sx={{ flexShrink: 0 }}>
                <ErrorBoundary name="practice-board">
                  <PracticeBoard />
                </ErrorBoundary>
              </Box>

              {/* Right side: info panel + puzzle list */}
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  width: { xs: "100%", lg: "auto" },
                }}
              >
                <PuzzleInfo />

                {/* Puzzle list */}
                <Paper
                  sx={{
                    bgcolor: "grey.900",
                    maxHeight: { lg: "40vh" },
                    overflowY: "auto",
                    borderRadius: 2,
                  }}
                >
                  <PuzzleList />
                </Paper>
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </>
  );
}
