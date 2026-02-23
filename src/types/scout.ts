export type Platform = 'chess.com' | 'lichess';

export interface ScoutGame {
  id: string;
  platform: Platform;
  pgn: string;
  whiteUsername: string;
  blackUsername: string;
  whiteRating?: number;
  blackRating?: number;
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  timeControl?: string;
  date: number;
}

export interface OpeningTreeNode {
  move: string;
  fen: string;
  totalGames: number;
  wins: number;
  draws: number;
  losses: number;
  children: OpeningTreeNode[];
}

export interface ScoutResult {
  username: string;
  platform: Platform;
  games: ScoutGame[];
  totalGames: number;
  dateRange: { from: number; to: number };
}

export interface PrepLine {
  moves: string[];
  fen: string;
  opponentScore: number;
  totalGames: number;
  wins: number;
  draws: number;
  losses: number;
  stockfishEval?: { cp?: number; mate?: number };
  recommendation: string;
}
