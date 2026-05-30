import { useEffect, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { Chess } from "chess.js";
import { boardAtom, gameAtom } from "../states";
import { isExplorationModeAtom } from "@/components/board/states";

/**
 * Hook to keep boardAtom and gameAtom synchronized when moves are played
 * This ensures that when users play moves on the board, the game PGN gets updated
 */
export const useBoardGameSync = () => {
  const board = useAtomValue(boardAtom);
  const game = useAtomValue(gameAtom);
  const setGame = useSetAtom(gameAtom);
  const setBoard = useSetAtom(boardAtom);
  const setIsExplorationMode = useSetAtom(isExplorationModeAtom);

  const syncGameWithBoard = useCallback(() => {
    const boardHistory = board.history();
    const gameHistory = game.history();

    // Check if board has more moves than game (user played new moves)
    const boardIsAhead = boardHistory.length > gameHistory.length;

    // Check if board is on a different path than game
    const boardOnDifferentPath =
      gameHistory.length > 0 &&
      boardHistory.length > 0 &&
      !gameHistory
        .slice(0, boardHistory.length)
        .every((move, i) => move === boardHistory[i]);

    // Only sync if board is ahead, not if it's on a different path (allow exploration)
    if (boardIsAhead) {
      void boardOnDifferentPath; // tracked locally for clarity; no log
      try {
        // Try to sync by loading board's PGN into game
        const newGame = new Chess();

        if (boardHistory.length > 0) {
          // Load the board's PGN into the new game
          newGame.loadPgn(board.pgn());
          setGame(newGame);
        } else {
          // If no moves, just reset both to starting position
          setGame(new Chess());
        }
      } catch (error) {
        console.error("[useBoardGameSync] primary sync failed:", error);

        // Fallback: recreate game from board moves manually
        try {
          const newGame = new Chess();
          const boardMoves = board.history({ verbose: true });

          for (const move of boardMoves) {
            newGame.move({
              from: move.from,
              to: move.to,
              promotion: move.promotion,
            });
          }

          setGame(newGame);
        } catch (fallbackError) {
          console.error("[useBoardGameSync] fallback sync failed:", fallbackError);
        }
      }
    }
  }, [board, game, setGame]);

  // Watch for changes in board state and auto-sync when needed
  useEffect(() => {
    const boardHistory = board.history();
    const gameHistory = game.history();

    // Check if board is on the same path as the original game
    const boardOnSamePath =
      gameHistory.length > 0 &&
      boardHistory.length > 0 &&
      gameHistory.slice(0, boardHistory.length).join() === boardHistory.join();

    // Check if board is on a different path than game (exploration mode)
    const boardOnDifferentPath =
      gameHistory.length > 0 && boardHistory.length > 0 && !boardOnSamePath;

    // Set exploration mode if board diverges from game
    setIsExplorationMode(boardOnDifferentPath);

    // Only sync if:
    // 1. Board has more moves than game AND
    // 2. Board is on the same path as the original game (not in exploration mode)
    // This allows exploration to continue without resetting
    if (boardHistory.length > gameHistory.length && boardOnSamePath) {
      syncGameWithBoard();
    }
    // Exploration mode and back-to-original-path branches fall through —
    // the setIsExplorationMode call above is the only side-effect needed.
  }, [board.fen(), syncGameWithBoard, setIsExplorationMode]); // Trigger when board position changes

  const resetToOriginalGame = useCallback(() => {
    const newBoard = new Chess();
    if (game.history().length > 0) {
      newBoard.loadPgn(game.pgn());
    }
    setBoard(newBoard);
    setIsExplorationMode(false);
  }, [game, setBoard, setIsExplorationMode]);

  return {
    syncGameWithBoard,
    resetToOriginalGame,
    isSynced: game.history().join() === board.history().join(),
  };
};
