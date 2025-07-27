import { Chess } from 'chess.js';
import { Game } from '@/types/game';

export interface ColorDetectionResult {
  userColor: 'white' | 'black';
  confidence: 'high' | 'medium' | 'low';
  method: 'username_match' | 'board_orientation' | 'default';
  explanation: string;
}

export interface ImportedGameInfo {
  source: 'chesscom' | 'lichess' | 'database' | 'pgn';
  username?: string;
  whitePlayer: string;
  blackPlayer: string;
  site?: string;
}

/**
 * Smart color detection that prioritizes username matching for imported games
 */
export function detectUserColor(
  chess: Chess,
  importedGameInfo?: ImportedGameInfo,
  currentBoardOrientation?: boolean
): ColorDetectionResult {
  
  // Method 1: Username matching for imported games (highest priority)
  if (importedGameInfo?.username) {
    const username = importedGameInfo.username.toLowerCase();
    const whitePlayer = importedGameInfo.whitePlayer.toLowerCase();
    const blackPlayer = importedGameInfo.blackPlayer.toLowerCase();
    
    if (username === whitePlayer) {
      return {
        userColor: 'white',
        confidence: 'high',
        method: 'username_match',
        explanation: `Username "${importedGameInfo.username}" matches White player "${importedGameInfo.whitePlayer}"`
      };
    }
    
    if (username === blackPlayer) {
      return {
        userColor: 'black',
        confidence: 'high',
        method: 'username_match',
        explanation: `Username "${importedGameInfo.username}" matches Black player "${importedGameInfo.blackPlayer}"`
      };
    }
  }
  
  // Method 2: Board orientation (if available)
  if (currentBoardOrientation !== undefined) {
    const userColor = currentBoardOrientation ? 'white' : 'black';
    return {
      userColor,
      confidence: 'medium',
      method: 'board_orientation',
      explanation: `Based on current board orientation (${userColor} at bottom)`
    };
  }
  
  // Method 3: Default to white
  return {
    userColor: 'white',
    confidence: 'low',
    method: 'default',
    explanation: 'Default color (no specific information available)'
  };
}

/**
 * Extract game information from Chess.com or Lichess import
 */
export function extractImportedGameInfo(
  chess: Chess,
  gameOrigin?: string,
  searchUsername?: string
): ImportedGameInfo | undefined {
  const headers = chess.getHeaders();
  const site = headers.Site || '';
  
  // Determine source
  let source: 'chesscom' | 'lichess' | 'database' | 'pgn' = 'pgn';
  if (site.toLowerCase().includes('chess.com')) {
    source = 'chesscom';
  } else if (site.toLowerCase().includes('lichess.org')) {
    source = 'lichess';
  } else if (gameOrigin === 'chesscom' || gameOrigin === 'lichess') {
    source = gameOrigin;
  }
  
  // Extract player names
  const whitePlayer = headers.White || 'White';
  const blackPlayer = headers.Black || 'Black';
  
  // Use search username if available
  const username = searchUsername || undefined;
  
  return {
    source,
    username,
    whitePlayer,
    blackPlayer,
    site
  };
}

/**
 * Get the most likely user color for analysis
 */
export function getAnalysisUserColor(
  chess: Chess,
  gameOrigin?: string,
  searchUsername?: string,
  currentBoardOrientation?: boolean
): 'white' | 'black' {
  const importedGameInfo = extractImportedGameInfo(chess, gameOrigin, searchUsername);
  const detection = detectUserColor(chess, importedGameInfo, currentBoardOrientation);
  
  return detection.userColor;
}

/**
 * Generate explanation for color detection
 */
export function getColorDetectionExplanation(
  chess: Chess,
  gameOrigin?: string,
  searchUsername?: string,
  currentBoardOrientation?: boolean
): string {
  const importedGameInfo = extractImportedGameInfo(chess, gameOrigin, searchUsername);
  const detection = detectUserColor(chess, importedGameInfo, currentBoardOrientation);
  
  let explanation = `Color Detection: ${detection.explanation}`;
  
  if (detection.confidence === 'high') {
    explanation += `\n✅ High confidence - this should be correct for imported games.`;
  } else if (detection.confidence === 'medium') {
    explanation += `\n⚠️ Medium confidence - based on board orientation.`;
  } else {
    explanation += `\n❓ Low confidence - using default. You can override this by saying "I played White" or "I played Black".`;
  }
  
  if (importedGameInfo?.source === 'chesscom' || importedGameInfo?.source === 'lichess') {
    explanation += `\n📊 Game imported from ${importedGameInfo.source === 'chesscom' ? 'Chess.com' : 'Lichess'}`;
    if (importedGameInfo.username) {
      explanation += ` with username "${importedGameInfo.username}"`;
    }
  }
  
  return explanation;
}

/**
 * Check if the detected color should be trusted for imported games
 */
export function shouldTrustDetectedColor(
  chess: Chess,
  gameOrigin?: string,
  searchUsername?: string
): boolean {
  const importedGameInfo = extractImportedGameInfo(chess, gameOrigin, searchUsername);
  
  // High trust for imported games with username
  if (importedGameInfo?.username && 
      (importedGameInfo.source === 'chesscom' || importedGameInfo.source === 'lichess')) {
    return true;
  }
  
  // Medium trust for imported games without username
  if (importedGameInfo?.source === 'chesscom' || importedGameInfo?.source === 'lichess') {
    return true;
  }
  
  // Low trust for PGN imports
  return false;
} 