import { useEffect, useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Chess } from 'chess.js';
import { boardAtom, gameAtom } from '../states';

/**
 * Hook to keep boardAtom and gameAtom synchronized when moves are played
 * This ensures that when users play moves on the board, the game PGN gets updated
 */
export const useBoardGameSync = () => {
  const board = useAtomValue(boardAtom);
  const game = useAtomValue(gameAtom);
  const setGame = useSetAtom(gameAtom);

  const syncGameWithBoard = useCallback(() => {
    const boardHistory = board.history();
    const gameHistory = game.history();
    
    // Check if board has more moves than game (user played new moves)
    const boardIsAhead = boardHistory.length > gameHistory.length;
    
    // Check if board is on a different path than game
    const boardOnDifferentPath = gameHistory.length > 0 && boardHistory.length > 0 &&
      !gameHistory.slice(0, boardHistory.length).every((move, i) => move === boardHistory[i]);
    
    if (boardIsAhead || boardOnDifferentPath) {
      console.log('🔄 Syncing game with board - Board is ahead or on different path');
      
      try {
        // Try to sync by loading board's PGN into game
        const newGame = new Chess();
        
        if (boardHistory.length > 0) {
          // Load the board's PGN into the new game
          newGame.loadPgn(board.pgn());
          setGame(newGame);
          console.log('✅ Game synchronized with board PGN');
        } else {
          // If no moves, just reset both to starting position
          setGame(new Chess());
          console.log('✅ Game reset to starting position');
        }
      } catch (error) {
        console.error('❌ Failed to sync game with board:', error);
        
        // Fallback: recreate game from board moves manually
        try {
          const newGame = new Chess();
          const boardMoves = board.history({ verbose: true });
          
          for (const move of boardMoves) {
            newGame.move({
              from: move.from,
              to: move.to,
              promotion: move.promotion
            });
          }
          
          setGame(newGame);
          console.log('✅ Game recreated from board moves (fallback)');
        } catch (fallbackError) {
          console.error('❌ Fallback sync also failed:', fallbackError);
        }
      }
    }
  }, [board, game, setGame]);

  // Watch for changes in board state and auto-sync when needed
  useEffect(() => {
    syncGameWithBoard();
  }, [board.fen(), syncGameWithBoard]); // Trigger when board position changes

  return {
    syncGameWithBoard,
    isSynced: game.history().join() === board.history().join()
  };
}; 