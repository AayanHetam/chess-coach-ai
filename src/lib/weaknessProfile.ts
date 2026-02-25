/**
 * Weakness Profile — Aggregates analysis across multiple games to identify
 * recurring player mistakes and provide personalized coaching.
 * Uses localStorage for persistence.
 */

export interface WeaknessProfile {
  lastUpdated: number;
  gamesAnalyzed: number;
  patterns: MistakePattern[];
  phaseAccuracy: PhaseAccuracy;
  topWeaknesses: string[];
  recommendedPuzzleThemes: string[];
}

export interface MistakePattern {
  category: string;
  count: number;
  totalGames: number;
  frequency: number; // count / totalGames
  examples: MistakeExample[];
  severity: "critical" | "frequent" | "occasional";
}

export interface MistakeExample {
  gameDate?: string;
  moveNumber: number;
  movePlayed: string;
  bestMove: string;
  evalDrop: number;
  fen: string;
}

export interface PhaseAccuracy {
  opening: { totalMoves: number; mistakes: number; accuracy: number };
  middlegame: { totalMoves: number; mistakes: number; accuracy: number };
  endgame: { totalMoves: number; mistakes: number; accuracy: number };
}

export interface GameAnalysisData {
  date?: string;
  playerColor: "w" | "b";
  mistakes: Array<{
    moveNumber: number;
    movePlayed: string;
    bestMove: string;
    evalDrop: number;
    fen: string;
    category: string;
    gamePhase: "opening" | "middlegame" | "endgame";
  }>;
  totalMoves: number;
  openingMoves: number;
  middlegameMoves: number;
  endgameMoves: number;
}

const STORAGE_KEY = "chess_masti_weakness_profile";
const MAX_EXAMPLES_PER_PATTERN = 5;

// Mistake categories for classification
const MISTAKE_CATEGORIES: Record<string, string[]> = {
  "Hanging Pieces": ["hang", "unprotected", "undefended", "left"],
  "Missed Tactics": ["fork", "pin", "skewer", "discovered", "tactic"],
  "King Safety": ["king", "castle", "check", "mate", "back rank"],
  "Pawn Structure": ["pawn", "doubled", "isolated", "passed", "structure"],
  "Piece Activity": ["passive", "trapped", "undeveloped", "inactive"],
  "Endgame Technique": ["endgame", "opposition", "zugzwang", "promotion"],
  "Time Management": ["premature", "hasty", "slow"],
  "Positional Errors": ["outpost", "control", "space", "weakness"],
};

/**
 * Load the current weakness profile from localStorage.
 */
export function loadWeaknessProfile(): WeaknessProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WeaknessProfile;
  } catch {
    return null;
  }
}

/**
 * Save the weakness profile to localStorage.
 */
function saveWeaknessProfile(profile: WeaknessProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.warn("Failed to save weakness profile:", e);
  }
}

/**
 * Update the weakness profile with data from a newly analyzed game.
 */
export function updateWeaknessProfile(gameData: GameAnalysisData): WeaknessProfile {
  const existing = loadWeaknessProfile() || createEmptyProfile();

  existing.gamesAnalyzed++;
  existing.lastUpdated = Date.now();

  // Classify and aggregate mistakes
  for (const mistake of gameData.mistakes) {
    const category = mistake.category || classifyMistake(mistake.movePlayed, mistake.bestMove, mistake.evalDrop);
    let pattern = existing.patterns.find(p => p.category === category);

    if (!pattern) {
      pattern = {
        category,
        count: 0,
        totalGames: 0,
        frequency: 0,
        examples: [],
        severity: "occasional",
      };
      existing.patterns.push(pattern);
    }

    pattern.count++;
    pattern.totalGames = existing.gamesAnalyzed;
    pattern.frequency = pattern.count / pattern.totalGames;

    // Add example (keep most recent)
    if (pattern.examples.length < MAX_EXAMPLES_PER_PATTERN) {
      pattern.examples.push({
        gameDate: gameData.date,
        moveNumber: mistake.moveNumber,
        movePlayed: mistake.movePlayed,
        bestMove: mistake.bestMove,
        evalDrop: mistake.evalDrop,
        fen: mistake.fen,
      });
    } else {
      // Replace oldest example
      pattern.examples.shift();
      pattern.examples.push({
        gameDate: gameData.date,
        moveNumber: mistake.moveNumber,
        movePlayed: mistake.movePlayed,
        bestMove: mistake.bestMove,
        evalDrop: mistake.evalDrop,
        fen: mistake.fen,
      });
    }

    // Update severity
    if (pattern.frequency >= 0.5) pattern.severity = "critical";
    else if (pattern.frequency >= 0.25) pattern.severity = "frequent";
    else pattern.severity = "occasional";
  }

  // Update phase accuracy
  updatePhaseAccuracy(existing.phaseAccuracy, gameData);

  // Recompute top weaknesses
  existing.patterns.sort((a, b) => b.frequency - a.frequency);
  existing.topWeaknesses = existing.patterns
    .filter(p => p.severity !== "occasional")
    .slice(0, 5)
    .map(p => p.category);

  // Map weaknesses to puzzle themes
  existing.recommendedPuzzleThemes = mapWeaknessesToPuzzleThemes(existing.topWeaknesses);

  saveWeaknessProfile(existing);
  return existing;
}

/**
 * Get a prompt-injectable summary of the player's weakness profile.
 */
export function getWeaknessPromptContext(profile: WeaknessProfile | null): string {
  if (!profile || profile.gamesAnalyzed < 2) return "";

  let context = "\n\n=== PLAYER WEAKNESS PROFILE ===\n";
  context += `Based on analysis of ${profile.gamesAnalyzed} games:\n\n`;

  if (profile.topWeaknesses.length > 0) {
    context += "TOP RECURRING WEAKNESSES:\n";
    for (const weakness of profile.topWeaknesses) {
      const pattern = profile.patterns.find(p => p.category === weakness);
      if (pattern) {
        context += `- ${pattern.category}: Occurred in ${(pattern.frequency * 100).toFixed(0)}% of games (${pattern.count} times) [${pattern.severity}]\n`;
      }
    }
    context += "\n";
  }

  // Phase accuracy
  const pa = profile.phaseAccuracy;
  context += "GAME PHASE ACCURACY:\n";
  context += `- Opening: ${pa.opening.accuracy.toFixed(1)}% (${pa.opening.mistakes} mistakes in ${pa.opening.totalMoves} moves)\n`;
  context += `- Middlegame: ${pa.middlegame.accuracy.toFixed(1)}% (${pa.middlegame.mistakes} mistakes in ${pa.middlegame.totalMoves} moves)\n`;
  context += `- Endgame: ${pa.endgame.accuracy.toFixed(1)}% (${pa.endgame.mistakes} mistakes in ${pa.endgame.totalMoves} moves)\n\n`;

  // Coaching directives
  context += "COACHING DIRECTIVES:\n";
  context += "- When you detect mistakes matching the player's known weaknesses, explicitly connect them: 'This is a pattern I've seen in your games before...'\n";
  context += "- Prioritize explaining these weakness areas in more depth\n";
  context += "- Suggest specific practice for recurring issues\n";

  if (profile.recommendedPuzzleThemes.length > 0) {
    context += `- Recommended puzzle themes for this player: ${profile.recommendedPuzzleThemes.join(", ")}\n`;
  }

  return context;
}

/**
 * Classify a mistake into a category based on context.
 */
function classifyMistake(movePlayed: string, bestMove: string, evalDrop: number): string {
  // Large eval drops with captures often indicate hanging pieces
  if (evalDrop >= 300) {
    return "Hanging Pieces";
  }

  // Check if the best move involves tactical patterns (captures, checks)
  if (bestMove.includes("+") || bestMove.includes("#")) {
    return "Missed Tactics";
  }
  if (bestMove.includes("x") && evalDrop >= 150) {
    return "Missed Tactics";
  }

  // Moderate drops often indicate positional errors
  if (evalDrop >= 100) {
    return "Positional Errors";
  }

  return "Positional Errors";
}

function updatePhaseAccuracy(phaseAcc: PhaseAccuracy, gameData: GameAnalysisData): void {
  phaseAcc.opening.totalMoves += gameData.openingMoves;
  phaseAcc.middlegame.totalMoves += gameData.middlegameMoves;
  phaseAcc.endgame.totalMoves += gameData.endgameMoves;

  for (const mistake of gameData.mistakes) {
    if (mistake.gamePhase === "opening") phaseAcc.opening.mistakes++;
    else if (mistake.gamePhase === "middlegame") phaseAcc.middlegame.mistakes++;
    else if (mistake.gamePhase === "endgame") phaseAcc.endgame.mistakes++;
  }

  // Recalculate accuracy percentages
  phaseAcc.opening.accuracy = phaseAcc.opening.totalMoves > 0
    ? ((phaseAcc.opening.totalMoves - phaseAcc.opening.mistakes) / phaseAcc.opening.totalMoves) * 100
    : 100;
  phaseAcc.middlegame.accuracy = phaseAcc.middlegame.totalMoves > 0
    ? ((phaseAcc.middlegame.totalMoves - phaseAcc.middlegame.mistakes) / phaseAcc.middlegame.totalMoves) * 100
    : 100;
  phaseAcc.endgame.accuracy = phaseAcc.endgame.totalMoves > 0
    ? ((phaseAcc.endgame.totalMoves - phaseAcc.endgame.mistakes) / phaseAcc.endgame.totalMoves) * 100
    : 100;
}

function mapWeaknessesToPuzzleThemes(weaknesses: string[]): string[] {
  const themeMap: Record<string, string[]> = {
    "Hanging Pieces": ["hangingPiece", "trappedPiece"],
    "Missed Tactics": ["fork", "pin", "skewer", "discoveredAttack"],
    "King Safety": ["backRankMate", "kingsideAttack", "sacrifice"],
    "Pawn Structure": ["advancedPawn", "promotion"],
    "Piece Activity": ["deflection", "attraction"],
    "Endgame Technique": ["endgame", "pawnEndgame", "rookEndgame"],
    "Positional Errors": ["quietMove", "defensiveMove"],
  };

  const themes: string[] = [];
  for (const weakness of weaknesses) {
    const mapped = themeMap[weakness];
    if (mapped) {
      themes.push(...mapped);
    }
  }

  // Deduplicate
  return Array.from(new Set(themes));
}

function createEmptyProfile(): WeaknessProfile {
  return {
    lastUpdated: Date.now(),
    gamesAnalyzed: 0,
    patterns: [],
    phaseAccuracy: {
      opening: { totalMoves: 0, mistakes: 0, accuracy: 100 },
      middlegame: { totalMoves: 0, mistakes: 0, accuracy: 100 },
      endgame: { totalMoves: 0, mistakes: 0, accuracy: 100 },
    },
    topWeaknesses: [],
    recommendedPuzzleThemes: [],
  };
}

/**
 * Clear the weakness profile (for testing or reset).
 */
export function clearWeaknessProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
