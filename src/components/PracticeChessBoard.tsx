import { useMemo, useEffect, useState } from "react";
import { useScreenSize } from "@/hooks/useScreenSize";
import { Color } from "@/types/enums";
import { Chess } from "chess.js";
import { Alert, Snackbar, Box } from "@mui/material";
import { atom, useAtomValue, useSetAtom } from "jotai";
import {
  currentPuzzleAtom,
  puzzleSolvedStatusAtom,
} from "@/sections/practice/states";
import { useChessActions } from "@/hooks/useChessActions";
import { Player } from "@/types/game";

// Simplified board component for practice mode
export default function PracticeChessBoard() {
  const screenSize = useScreenSize();
  const currentPuzzle = useAtomValue(currentPuzzleAtom);
  const [game, setGame] = useState(() => new Chess());
  const gameAtom = atom(game);
  const { reset: resetGame } = useChessActions(gameAtom);
  const setSolvedStatus = useSetAtom(puzzleSolvedStatusAtom);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showWrongMoveMessage, setShowWrongMoveMessage] = useState(false);

  const boardSize = useMemo(() => {
    const width = screenSize.width;
    const height = screenSize.height;

    if (!width || !height || width <= 0 || height <= 0) {
      return 400;
    }

    if (typeof window !== "undefined" && window.innerWidth < 1200) {
      return Math.max(Math.min(width - 15, height - 200), 300);
    }

    return Math.max(Math.min(width - 500, height * 0.85, 700), 500);
  }, [screenSize]);

  // Create practice game atom
  const [practiceGame, setPracticeGame] = useState(() => new Chess());

  // Load puzzle position when puzzle changes
  useEffect(() => {
    if (currentPuzzle) {
      const newGame = new Chess(currentPuzzle.fen);
      setGame(newGame);
      setShowSuccessMessage(false);
      setShowWrongMoveMessage(false);
    } else {
      resetGame();
    }
  }, [currentPuzzle, resetGame]);

  // Validate moves against solution
  useEffect(() => {
    if (!currentPuzzle || !game) return;

    const solutionMoves = currentPuzzle.solution || currentPuzzle.moves || [];
    const gameHistory = game.history();
    const initialFen = currentPuzzle.fen;

    // Check if we've made any moves
    if (gameHistory.length === 0) return;

    // Create a test game from initial position to validate solution
    const testGame = new Chess(initialFen);
    let allMovesMatch = true;

    // Play through solution moves to get UCI format
    const solutionUciMoves: string[] = [];
    for (const move of solutionMoves) {
      const moveObj = testGame.move(move, { strict: false });
      if (moveObj) {
        solutionUciMoves.push(moveObj.from + moveObj.to + (moveObj.promotion || ""));
      } else {
        // If move is already in UCI format
        if (move.length >= 4) {
          solutionUciMoves.push(move);
        }
      }
    }

    // Reset test game
    testGame.load(initialFen);

    // Compare user moves with solution
    for (let i = 0; i < gameHistory.length && i < solutionUciMoves.length; i++) {
      const userMoveSan = gameHistory[i];
      const userMoveObj = testGame.move(userMoveSan);
      
      if (!userMoveObj) {
        allMovesMatch = false;
        break;
      }

      const userMoveUci = userMoveObj.from + userMoveObj.to + (userMoveObj.promotion || "");
      const solutionMoveUci = solutionUciMoves[i];

      if (userMoveUci !== solutionMoveUci) {
        allMovesMatch = false;
        setShowWrongMoveMessage(true);
        setTimeout(() => setShowWrongMoveMessage(false), 3000);
        break;
      }
    }

    // Check if puzzle is completely solved
    if (allMovesMatch && gameHistory.length === solutionUciMoves.length) {
      if (currentPuzzle.id) {
        setSolvedStatus((prev) => ({
          ...prev,
          [currentPuzzle.id]: true,
        }));
        setShowSuccessMessage(true);
        setTimeout(() => setShowSuccessMessage(false), 5000);
      }
    }
  }, [practiceGame.fen(), currentPuzzle?.id, setSolvedStatus]);

  // Create dummy players for the board
  const whitePlayer: Player = { name: "You", rating: undefined };
  const blackPlayer: Player = { name: "Puzzle", rating: undefined };

  if (!currentPuzzle) {
    return (
      <div
        style={{
          width: boardSize,
          height: boardSize,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
        }}
      >
        <p style={{ color: "#666", fontSize: "18px" }}>
          Select a puzzle to start practicing
        </p>
      </div>
    );
  }

  return (
    <>
      <Box
        sx={{
          width: boardSize,
          height: boardSize,
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Simple chess board representation */}
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "grid",
            gridTemplateColumns: "repeat(8, 1fr)",
            gridTemplateRows: "repeat(8, 1fr)",
            gap: "1px",
            backgroundColor: "#fff",
            border: "2px solid #333",
            borderRadius: "4px",
            aspectRatio: "1",
          }}
        >
          {/* Chess board squares - simplified version */}
          {Array.from({ length: 64 }, (_, index) => {
            const row = Math.floor(index / 8);
            const col = index % 8;
            const isLight = (row + col) % 2 === 0;
            const piece = game.get(String(index) as any);
            
            return (
              <div
                key={index}
                style={{
                  backgroundColor: isLight ? "#f0d9b5" : "#b58863",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: boardSize / 10,
                  cursor: "pointer",
                  position: "relative",
                }}
                onClick={() => {
                  // Handle piece movement (simplified)
                  console.log(`Square clicked: ${index}, piece: ${piece}`);
                }}
              >
                {piece && (
                  <span style={{ fontSize: boardSize / 8 }}>
                    {piece.type === 'p' ? '♟' : 
                     piece.type === 'n' ? '♞' :
                     piece.type === 'b' ? '♝' :
                     piece.type === 'r' ? '♜' :
                     piece.type === 'q' ? '♛' :
                     piece.type === 'k' ? '♚' :
                     piece.color === 'w' ? '♟' : piece.color === 'b' ? '♟' : '?'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Box>

      <Snackbar
        open={showSuccessMessage}
        autoHideDuration={5000}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" sx={{ width: "100%" }}>
          🎉 Puzzle solved correctly! Great job!
        </Alert>
      </Snackbar>
      <Snackbar
        open={showWrongMoveMessage}
        autoHideDuration={3000}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="warning" sx={{ width: "100%" }}>
          That move doesn't match the solution. Try again!
        </Alert>
      </Snackbar>
    </>
  );
}
