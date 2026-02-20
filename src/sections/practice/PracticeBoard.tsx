import { atom, useAtomValue, useSetAtom } from "jotai";
import { useMemo, useEffect, useState } from "react";
import { useScreenSize } from "@/hooks/useScreenSize";
import { Color } from "@/types/enums";
import Board from "@/components/board";
import { Chess } from "chess.js";
import {
  currentPuzzleAtom,
  puzzleSolvedStatusAtom,
} from "./states";
import { useChessActions } from "@/hooks/useChessActions";
import { Player } from "@/types/game";
import { Alert, Snackbar } from "@mui/material";

// Create a separate game atom for practice board
export const practiceGameAtom = atom(new Chess());

export default function PracticeBoard() {
  const screenSize = useScreenSize();
  const currentPuzzle = useAtomValue(currentPuzzleAtom);
  const practiceGame = useAtomValue(practiceGameAtom);
  const setPracticeGame = useSetAtom(practiceGameAtom);
  const { reset: resetPracticeGame } = useChessActions(practiceGameAtom);
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

  // Load puzzle position when puzzle changes
  useEffect(() => {
    if (currentPuzzle) {
      const game = new Chess(currentPuzzle.fen);
      setPracticeGame(game);
      setShowSuccessMessage(false);
      setShowWrongMoveMessage(false);
    } else {
      resetPracticeGame();
    }
  }, [currentPuzzle, setPracticeGame, resetPracticeGame]);

  // Validate moves against solution
  useEffect(() => {
    if (!currentPuzzle || !practiceGame) return;

    const solutionMoves = currentPuzzle.solution || currentPuzzle.moves || [];
    const gameHistory = practiceGame.history();
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
      <Board
        id="PracticeBoard"
        boardSize={boardSize}
        canPlay={true}
        gameAtom={practiceGameAtom}
        whitePlayer={whitePlayer}
        blackPlayer={blackPlayer}
        boardOrientation={Color.White}
        showEvaluationBar={false}
      />
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
