import { useAtomValue } from "jotai";
import {
  engineEloAtom,
  gameAtom,
  playerColorAtom,
  isGameInProgressAtom,
  gameDataAtom,
  enginePlayNameAtom,
} from "./states";
import { useChessActions } from "@/hooks/useChessActions";
import { useEffect, useMemo } from "react";
import { useScreenSize } from "@/hooks/useScreenSize";
import { useEngine } from "@/hooks/useEngine";
import { uciMoveParams } from "@/lib/chess";
import Board from "@/components/board";
import { useGameData } from "@/hooks/useGameData";
import { usePlayersData } from "@/hooks/usePlayersData";
import { sleep } from "@/lib/helpers";

export default function BoardContainer() {
  const screenSize = useScreenSize();
  const engineName = useAtomValue(enginePlayNameAtom);
  const engine = useEngine(engineName);
  const game = useAtomValue(gameAtom);
  const { white, black } = usePlayersData(gameAtom);
  const playerColor = useAtomValue(playerColorAtom);
  const { playMove } = useChessActions(gameAtom);
  const engineElo = useAtomValue(engineEloAtom);
  const isGameInProgress = useAtomValue(isGameInProgressAtom);

  const gameFen = game.fen();
  const isGameFinished = game.isGameOver();

  useEffect(() => {
    const playEngineMove = async () => {
      if (
        !engine?.getIsReady() ||
        game.turn() === playerColor ||
        isGameFinished ||
        !isGameInProgress
      ) {
        return;
      }

      const timePromise = sleep(1000);
      let move: string | undefined;
      try {
        move = await engine.getEngineNextMove(gameFen, engineElo);
      } catch (err) {
        // WorkerSupersededError fires when the user makes a new move
        // mid-think and the cleanup useEffect calls stopAllCurrentJobs.
        // Swallow that case; surface unexpected errors. Either way, skip
        // playing a move on this tick — the next render will retry if
        // the engine still needs to move.
        if (err instanceof Error && err.name === "WorkerSupersededError") {
          return;
        }
        console.warn("[play/board] engine getEngineNextMove failed:", err);
        return;
      }
      await timePromise;

      if (move) playMove(uciMoveParams(move));
    };
    playEngineMove();

    return () => {
      engine?.stopAllCurrentJobs();
    };
  }, [gameFen, isGameInProgress]); // eslint-disable-line react-hooks/exhaustive-deps

  const boardSize = useMemo(() => {
    const width = screenSize.width;
    const height = screenSize.height;

    // 900 is the md layout breakpoint
    if (window?.innerWidth < 900) {
      return Math.min(width, height - 150);
    }

    return Math.min(width - 300, height * 0.83);
  }, [screenSize]);

  useGameData(gameAtom, gameDataAtom);

  return (
    <Board
      id="PlayBoard"
      canPlay={isGameInProgress ? playerColor : false}
      gameAtom={gameAtom}
      boardSize={boardSize}
      whitePlayer={white}
      blackPlayer={black}
      boardOrientation={playerColor}
      currentPositionAtom={gameDataAtom}
    />
  );
}
