import {
  Grid,
  GridProps,
  Stack,
  Typography,
  Box,
} from "@mui/material";
import { useAtomValue } from "jotai";
import { boardAtom, gameAtom, gameEvalAtom } from "../../states";
import PlayersMetric from "./playersMetric";
import MoveInfo from "./moveInfo";
import Opening from "./opening";
import EngineLines from "./engineLines";
import GraphTab from "../graphTab";

export default function AnalysisTab(props: GridProps) {
  const gameEval = useAtomValue(gameEvalAtom);
  const game = useAtomValue(gameAtom);
  const board = useAtomValue(boardAtom);

  const boardHistory = board.history();
  const gameHistory = game.history();

  const isGameOver =
    boardHistory.length > 0 &&
    (board.isCheckmate() ||
      board.isDraw() ||
      boardHistory.join() === gameHistory.join());

  const getGameResult = () => {
    if (!isGameOver) return null;
    
    if (board.isCheckmate()) {
      // If it's white's turn and checkmate, black won
      // If it's black's turn and checkmate, white won
      const result = board.turn() === "w" ? "0-1" : "1-0";
      const winner = board.turn() === "w" ? "Black" : "White";
      return `${result} - ${winner} wins by checkmate`;
    }
    
    if (board.isStalemate()) {
      return "1/2-1/2 - Draw by stalemate";
    }
    
    if (board.isInsufficientMaterial()) {
      return "1/2-1/2 - Draw by insufficient material";
    }
    
    if (board.isThreefoldRepetition()) {
      return "1/2-1/2 - Draw by threefold repetition";
    }
    
    if (board.isDraw()) {
      return "1/2-1/2 - Draw";
    }
    
    // If game history matches board history (game finished)
    if (boardHistory.join() === gameHistory.join()) {
      // Check game headers for result
      const gameHeaders = game.getHeaders();
      if (gameHeaders.Result && gameHeaders.Result !== "*") {
        return `${gameHeaders.Result} - Game finished`;
      }
      return "Game finished";
    }
    
    return "Game over";
  };

  return (
    <Stack
      width="100%"
      spacing={2}
      alignItems="center"
      {...props}
      sx={props.hidden ? { display: "none" } : props.sx}
    >
      <Stack
        justifyContent="center"
        alignItems="center"
        rowGap={1}
        minWidth={gameEval ? "min(25rem, 95vw)" : undefined}
      >
        {gameEval && (
          <PlayersMetric
            title="Accuracy"
            whiteValue={`${gameEval.accuracy.white.toFixed(1)} %`}
            blackValue={`${gameEval.accuracy.black.toFixed(1)} %`}
          />
        )}

        {gameEval?.estimatedElo && (
          <PlayersMetric
            title="Game Rating"
            whiteValue={Math.round(gameEval.estimatedElo.white)}
            blackValue={Math.round(gameEval.estimatedElo.black)}
          />
        )}

        <MoveInfo />

        <Opening />

        {isGameOver && (
          <Typography align="center" fontSize="0.9rem" noWrap>
            {getGameResult()}
          </Typography>
        )}
      </Stack>

      <EngineLines size={{ lg: gameEval ? undefined : 12 }} />
      
      {gameEval && (
        <Box width="100%" sx={{ marginY: 2 }}>
          <GraphTab />
        </Box>
      )}
    </Stack>
  );
}
