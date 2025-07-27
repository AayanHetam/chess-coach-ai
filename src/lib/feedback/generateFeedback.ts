import { Chess } from "chess.js";
import { getLichessUserRecentGames } from "@/lib/lichess";
import { getChessComUserRecentGames } from "@/lib/chessCom";
import { analyzePosition } from "@/lib/chessprinciples";
import { openings } from "@/data/openings";
import { PlayerFeedbackData, FeedbackRequest, GameAnalysis, OpeningAnalysis, PrincipleViolationSummary, ImprovementArea, GameViolation } from "@/types/feedback";
import { ChessPrincipleViolation } from "@/lib/chessprinciples";

export async function generatePlayerFeedback(request: FeedbackRequest): Promise<PlayerFeedbackData> {
  const { username, platform, maxGames = 25 } = request;

  // Fetch games from the selected platform
  let games;
  try {
    if (platform === "lichess") {
      games = await getLichessUserRecentGames(username);
    } else {
      games = await getChessComUserRecentGames(username);
    }
  } catch (error) {
    throw new Error(`Failed to fetch games from ${platform}. Please check the username and try again.`);
  }

  if (games.length === 0) {
    throw new Error(`No games found for username "${username}" on ${platform}.`);
  }

  // Limit to the requested number of games
  const gamesToAnalyze = games.slice(0, maxGames);
  
  // Analyze each game
  const gameAnalyses: GameAnalysis[] = [];
  const allPrincipleViolations: ChessPrincipleViolation[] = [];
  
  for (const game of gamesToAnalyze) {
    try {
      const analysis = await analyzeSingleGame(game, username, platform);
      gameAnalyses.push(analysis);
      allPrincipleViolations.push(...analysis.principleViolations);
    } catch (error) {
      const gameId = 'id' in game ? game.id : 'uuid' in game ? game.uuid : 'unknown';
      console.error(`Error analyzing game ${gameId}:`, error);
      // Continue with other games even if one fails
    }
  }

  // Calculate overall statistics
  const totalGames = games.length;
  const analyzedGames = gameAnalyses.length;
  const averageRating = calculateAverageRating(gameAnalyses);
  
  // Analyze openings
  const openingAnalyses = analyzeOpenings(gameAnalyses);
  
  // Analyze principle violations
  const principleViolations = analyzePrincipleViolations(allPrincipleViolations, gameAnalyses);
  
  // Generate improvement areas
  const improvementAreas = generateImprovementAreas(principleViolations, gameAnalyses);

  return {
    username,
    platform,
    totalGames,
    analyzedGames,
    averageRating,
    openings: openingAnalyses,
    principleViolations,
    improvementAreas,
    gameAnalysis: gameAnalyses,
    generatedAt: new Date().toISOString(),
  };
}

async function analyzeSingleGame(
  game: any,
  username: string,
  platform: "lichess" | "chesscom"
): Promise<GameAnalysis> {
  const chess = new Chess();
  chess.loadPgn(game.pgn);
  
  const history = chess.history();
  const headers = chess.getHeaders();
  
  // Determine game result and player color
  const isWhite = headers.White?.toLowerCase() === username.toLowerCase();
  const isBlack = headers.Black?.toLowerCase() === username.toLowerCase();
  
  if (!isWhite && !isBlack) {
    throw new Error("Player not found in game");
  }
  
  const playerColor = isWhite ? "w" : "b";
  const opponent = isWhite ? headers.Black : headers.White;
  
  // Handle different API structures for ratings
  let opponentRating = 0;
  if (platform === "chesscom") {
    // Chess.com API structure
    opponentRating = isWhite ? game.black?.rating || 0 : game.white?.rating || 0;
  } else {
    // Lichess API structure
    opponentRating = isWhite ? game.players?.black?.rating || 0 : game.players?.white?.rating || 0;
  }
  
  // Determine result
  let result: "win" | "loss" | "draw";
  if (chess.isCheckmate()) {
    result = chess.turn() === playerColor ? "loss" : "win";
  } else if (chess.isDraw()) {
    result = "draw";
  } else {
    result = "draw"; // Default for incomplete games
  }
  
  // Analyze the game move by move for detailed violations
  const detailedViolations: ChessPrincipleViolation[] = [];
  const chessCopy = new Chess();
  
  // Replay the game and analyze each move
  for (let i = 0; i < history.length; i++) {
    try {
      const move = history[i];
      const moveNumber = i + 1;
      
      // Make the move
      const moveResult = chessCopy.move(move);
      
      // Analyze the position after this move
      const positionAnalysis = analyzePosition(chessCopy, {
        lines: [{ pv: [], depth: 1, multiPv: 1, cp: 0 }],
        bestMove: ""
      }, history.slice(0, i + 1));
      
      // Add violations with move context
      for (const violation of positionAnalysis.violatedPrinciples) {
        detailedViolations.push({
          ...violation,
          description: `${violation.description} (Move ${moveNumber}: ${move})`,
        });
      }
    } catch (error) {
      console.error(`Error analyzing move ${i + 1}:`, error);
    }
  }
  
  const principleViolations = detailedViolations;
  const totalMoves = history.length;
  
  // Calculate accuracy based on game result and principle violations
  let accuracy = 80; // Base accuracy
  
  // Adjust based on result
  if (result === "win") accuracy += 10;
  else if (result === "loss") accuracy -= 10;
  
  // Adjust based on principle violations
  const violationPenalty = Math.min(30, principleViolations.length * 3);
  accuracy = Math.max(0, accuracy - violationPenalty);
  
  // Adjust based on game length (longer games might have more violations)
  if (totalMoves > 30) accuracy = Math.max(0, accuracy - 5);
  
  // Determine opening
  const opening = determineOpening(history);
  
  return {
    gameId: 'id' in game ? game.id : 'uuid' in game ? game.uuid : 'unknown',
    platform,
    opponent: opponent || "Unknown",
    opponentRating: opponentRating || 0,
    result,
    date: new Date(game.lastMoveAt || game.end_time * 1000).toISOString(),
    opening,
    principleViolations,
    accuracy,
    pgn: game.pgn,
  };
}

function determineOpening(moves: string[]): string {
  if (moves.length === 0) return "Unknown";
  
  // Create a position after the first few moves
  const chess = new Chess();
  const openingMoves = moves.slice(0, Math.min(10, moves.length));
  
  // Try to find opening by checking multiple move sequences
  for (let i = Math.min(8, openingMoves.length); i >= 2; i--) {
    const chess = new Chess();
    const movesToCheck = openingMoves.slice(0, i);
    
    try {
      for (const move of movesToCheck) {
        chess.move(move);
      }
      
      // Check against known openings
      const fen = chess.fen().split(" ")[0];
      const opening = openings.find(op => op.fen === fen);
      
      if (opening) {
        return opening.name;
      }
    } catch {
      continue;
    }
  }
  
  // If no specific opening found, try to identify basic opening types
  if (moves.length >= 2) {
    const firstMove = moves[0]?.toLowerCase();
    const secondMove = moves[1]?.toLowerCase();
    
    if (firstMove === "e4") {
      if (secondMove === "e5") return "Open Game";
      if (secondMove === "c5") return "Sicilian Defense";
      if (secondMove === "e6") return "French Defense";
      if (secondMove === "c6") return "Caro-Kann Defense";
      if (secondMove === "d6") return "Pirc Defense";
      if (secondMove === "g6") return "Modern Defense";
      return "King's Pawn Opening";
    }
    
    if (firstMove === "d4") {
      if (secondMove === "d5") return "Closed Game";
      if (secondMove === "nf6") return "Indian Defense";
      if (secondMove === "g6") return "Modern Defense";
      return "Queen's Pawn Opening";
    }
    
    if (firstMove === "c4") return "English Opening";
    if (firstMove === "nf3") return "Reti Opening";
    if (firstMove === "g3") return "King's Indian Attack";
  }
  
  return "Unknown";
}

function calculateAverageRating(gameAnalyses: GameAnalysis[]): number {
  const gamesWithRatings = gameAnalyses.filter(game => game.opponentRating > 0);
  if (gamesWithRatings.length === 0) return 0;
  
  const totalRating = gamesWithRatings.reduce((sum, game) => sum + game.opponentRating, 0);
  return Math.round(totalRating / gamesWithRatings.length);
}

function analyzeOpenings(gameAnalyses: GameAnalysis[]): OpeningAnalysis[] {
  const openingStats = new Map<string, {
    games: GameViolation[];
    wins: number;
    total: number;
    ratings: number[];
  }>();
  
  for (const game of gameAnalyses) {
    const opening = game.opening;
    const stats = openingStats.get(opening) || {
      games: [],
      wins: 0,
      total: 0,
      ratings: [],
    };
    
    // Create detailed game violation for this opening
    const gameViolation: GameViolation = {
      gameId: game.gameId,
      moveNumber: 0, // Will be updated with specific move info
      move: "",
      position: "",
      description: `Played ${opening} against ${game.opponent}`,
      severity: 'minor' as const,
      opponent: game.opponent,
      result: game.result,
      date: typeof game.date === 'string' ? game.date : game.date.toISOString(),
      pgn: game.pgn,
      analysisMessage: `Analyze my ${opening} game against ${game.opponent}. I want to understand how to improve my play in this opening.`
    };
    
    stats.games.push(gameViolation);
    stats.total++;
    if (game.result === "win") stats.wins++;
    if (game.opponentRating > 0) stats.ratings.push(game.opponentRating);
    
    openingStats.set(opening, stats);
  }
  
  return Array.from(openingStats.entries()).map(([name, stats]) => ({
    name,
    frequency: stats.total,
    winRate: (stats.wins / stats.total) * 100,
    averageRating: stats.ratings.length > 0 
      ? Math.round(stats.ratings.reduce((sum, rating) => sum + rating, 0) / stats.ratings.length)
      : 0,
    games: stats.games,
    principleViolations: [], // Will be populated later
    suggestions: generateOpeningSuggestions(name, stats),
  }));
}

function generateOpeningSuggestions(opening: string, stats: any): string[] {
  const suggestions: string[] = [];
  
  if (stats.winRate < 40) {
    suggestions.push("Consider studying this opening more deeply or exploring alternatives");
  }
  
  if (stats.total >= 3 && stats.winRate < 50) {
    suggestions.push("Review your games in this opening to identify common mistakes");
  }
  
  if (opening === "Unknown") {
    suggestions.push("Study basic opening principles to improve your early game");
  }
  
  return suggestions;
}

function analyzePrincipleViolations(
  violations: ChessPrincipleViolation[],
  gameAnalyses: GameAnalysis[]
): PrincipleViolationSummary[] {
  const violationStats = new Map<string, {
    principle: any;
    frequency: number;
    games: GameViolation[];
    severities: ("minor" | "moderate" | "major")[];
  }>();
  
  for (const violation of violations) {
    const key = violation.principle.id;
    const stats = violationStats.get(key) || {
      principle: violation.principle,
      frequency: 0,
      games: [],
      severities: [],
    };
    
    stats.frequency++;
    stats.severities.push(violation.severity);
    
    // Find the game this violation came from and create detailed citation
    for (const game of gameAnalyses) {
      if (game.principleViolations.some(v => v.principle.id === key)) {
        // Extract move information from violation description
        const moveMatch = violation.description.match(/Move (\d+): (.+)/);
        const moveNumber = moveMatch ? parseInt(moveMatch[1]) : 0;
        const move = moveMatch ? moveMatch[2] : "";
        
        const gameViolation: GameViolation = {
          gameId: game.gameId,
          moveNumber,
          move,
          position: "", // Could be calculated from PGN
          description: violation.description,
          severity: violation.severity,
          opponent: game.opponent,
          result: game.result,
          date: typeof game.date === 'string' ? game.date : game.date.toISOString(),
          pgn: game.pgn,
          analysisMessage: `Analyze move ${moveNumber} (${move}) in my game against ${game.opponent}. I violated the principle "${violation.principle.name}". How should I have played this position?`
        };
        
        // Only add if not already present
        if (!stats.games.some(g => g.gameId === game.gameId && g.moveNumber === moveNumber)) {
          stats.games.push(gameViolation);
        }
        break;
      }
    }
    
    violationStats.set(key, stats);
  }
  
  return Array.from(violationStats.values()).map(stats => ({
    principle: stats.principle,
    frequency: stats.frequency,
    severity: getMostSevere(stats.severities),
    games: stats.games,
    impact: generateImpactDescription(stats.principle, stats.frequency),
    improvementTip: generateImprovementTip(stats.principle),
  }));
}

function getMostSevere(severities: ("minor" | "moderate" | "major")[]): "minor" | "moderate" | "major" {
  if (severities.includes("major")) return "major";
  if (severities.includes("moderate")) return "moderate";
  return "minor";
}

function generateImpactDescription(principle: any, frequency: number): string {
  const impactMap: Record<string, string> = {
    "dont-hang-pieces": "Material losses significantly impact your winning chances",
    "control-center-pawns": "Lack of central control limits your strategic options",
    "develop-knights-bishops": "Slow development gives your opponent the initiative",
    "castle-early": "Exposed king makes you vulnerable to attacks",
    "look-for-basic-tactics": "Missing tactical opportunities costs material and position",
    "control-space": "Lack of space control limits piece mobility and attacking chances",
    "assess-pawn-structure": "Poor pawn structure creates long-term weaknesses",
    "maintain-material-balance": "Unnecessary material sacrifices reduce winning chances",
    "avoid-moving-same-piece": "Inefficient piece movement wastes valuable time",
    "develop-all-pieces": "Undeveloped pieces limit your attacking potential",
  };
  
  const baseImpact = impactMap[principle.id] || "This principle violation affects your overall game quality";
  
  // Add frequency context
  if (frequency > 10) {
    return `${baseImpact}. This occurs frequently in your games, indicating a systematic issue.`;
  } else if (frequency > 5) {
    return `${baseImpact}. This happens regularly and should be addressed.`;
  }
  
  return baseImpact;
}

function generateImprovementTip(principle: any): string {
  const tipMap: Record<string, string> = {
    "dont-hang-pieces": "Before every move, check if any of your pieces are under attack",
    "control-center-pawns": "Aim to control central squares with pawns in the opening",
    "develop-knights-bishops": "Develop your minor pieces before moving pawns unnecessarily",
    "castle-early": "Castle within the first 10 moves to ensure king safety",
    "look-for-basic-tactics": "Scan for forks, pins, and discovered attacks before each move",
    "control-space": "Occupy central squares and expand on the side where you have more space",
    "assess-pawn-structure": "Avoid creating isolated, doubled, or backward pawns",
    "maintain-material-balance": "Only sacrifice material for clear tactical or positional gains",
    "avoid-moving-same-piece": "Develop all pieces before moving the same piece multiple times",
    "develop-all-pieces": "Get all your pieces into the game before launching attacks",
  };
  
  return tipMap[principle.id] || "Study this principle and practice it in your games";
}

function generateImprovementAreas(
  principleViolations: PrincipleViolationSummary[],
  gameAnalyses: GameAnalysis[]
): ImprovementArea[] {
  const areas: ImprovementArea[] = [];
  
  // Analyze by category
  const categories = {
    opening: principleViolations.filter(v => v.principle.category === "opening"),
    middlegame: principleViolations.filter(v => v.principle.category === "middlegame"),
    endgame: principleViolations.filter(v => v.principle.category === "endgame"),
    tactics: principleViolations.filter(v => v.principle.id === "look-for-basic-tactics"),
    strategy: principleViolations.filter(v => v.principle.category === "general"),
  };
  
  // Opening improvements
  if (categories.opening.length > 0) {
    areas.push({
      category: "opening",
      title: "Opening Principles",
      description: "Focus on controlling the center, developing pieces, and ensuring king safety",
      priority: categories.opening.some(v => v.severity === "major") ? "high" : "medium",
      specificGames: categories.opening.flatMap(v => v.games.map(g => g.gameId)),
      exercises: [
        "Practice basic opening principles in training games",
        "Study common opening traps and how to avoid them",
        "Review your opening repertoire",
      ],
    });
  }
  
  // Tactical improvements
  if (categories.tactics.length > 0) {
    areas.push({
      category: "tactics",
      title: "Tactical Awareness",
      description: "Improve your ability to spot and calculate tactical opportunities",
      priority: "high",
      specificGames: categories.tactics.flatMap(v => v.games.map(g => g.gameId)),
      exercises: [
        "Solve tactical puzzles daily",
        "Practice pattern recognition",
        "Review tactical themes in your games",
      ],
    });
  }
  
  // Strategic improvements
  if (categories.strategy.length > 0) {
    areas.push({
      category: "strategy",
      title: "Strategic Understanding",
      description: "Develop better understanding of positional play and long-term planning",
      priority: "medium",
      specificGames: categories.strategy.flatMap(v => v.games.map(g => g.gameId)),
      exercises: [
        "Study classic games to understand strategic concepts",
        "Practice evaluating positions",
        "Focus on pawn structure and piece coordination",
      ],
    });
  }
  
  return areas;
} 