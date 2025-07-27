import { ChessPrinciple, ChessPrincipleViolation } from "@/lib/chessprinciples";

export interface PlayerFeedbackData {
  username: string;
  platform: 'lichess' | 'chesscom';
  totalGames: number;
  analyzedGames: number;
  averageRating: number;
  openings: OpeningAnalysis[];
  principleViolations: PrincipleViolationSummary[];
  improvementAreas: ImprovementArea[];
  gameAnalysis: GameAnalysis[];
  generatedAt: Date | string;
}

export interface OpeningAnalysis {
  name: string;
  frequency: number;
  winRate: number;
  averageRating: number;
  games: GameViolation[]; // Detailed game information
  principleViolations: ChessPrincipleViolation[];
  suggestions: string[];
}

export interface PrincipleViolationSummary {
  principle: ChessPrinciple;
  frequency: number;
  severity: 'minor' | 'moderate' | 'major';
  games: GameViolation[];
  impact: string;
  improvementTip: string;
}

export interface GameViolation {
  gameId: string;
  moveNumber: number;
  move: string;
  position: string; // FEN
  description: string;
  severity: 'minor' | 'moderate' | 'major';
  gameUrl?: string;
  opponent: string;
  result: 'win' | 'loss' | 'draw';
  date: string;
  pgn: string;
  analysisMessage: string; // Message to send to AI coach
}

export interface ImprovementArea {
  category: 'opening' | 'middlegame' | 'endgame' | 'tactics' | 'strategy';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  specificGames: string[];
  exercises: string[];
}

export interface GameAnalysis {
  gameId: string;
  platform: 'lichess' | 'chesscom';
  opponent: string;
  opponentRating: number;
  result: 'win' | 'loss' | 'draw';
  date: Date | string;
  opening: string;
  principleViolations: ChessPrincipleViolation[];
  accuracy: number;
  pgn: string;
}

export interface FeedbackRequest {
  username: string;
  platform: 'lichess' | 'chesscom';
  maxGames?: number;
} 