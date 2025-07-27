import {
  boardAtom,
  currentPositionAtom,
  engineDepthAtom,
  engineMultiPvAtom,
  gameAtom,
  gameEvalAtom,
  savedEvalsAtom,
} from "@/sections/analysis/states";
import { CurrentPosition, PositionEval } from "@/types/eval";
import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { getEvaluateGameParams } from "@/lib/chess";
import { getMovesClassification } from "@/lib/engine/helpers/moveClassification";
import { openings } from "@/data/openings";
import { UciEngine } from "@/lib/engine/uciEngine";

export const useCurrentPosition = (engine: UciEngine | null) => {
  const [currentPosition, setCurrentPosition] = useAtom(currentPositionAtom);
  const gameEval = useAtomValue(gameEvalAtom);
  const game = useAtomValue(gameAtom);
  const board = useAtomValue(boardAtom);
  const depth = useAtomValue(engineDepthAtom);
  const multiPv = useAtomValue(engineMultiPvAtom);
  const [savedEvals, setSavedEvals] = useAtom(savedEvalsAtom);

  useEffect(() => {
    const boardHistory = board.history({ verbose: true });
    const position: CurrentPosition = {
      lastMove: boardHistory.at(-1),
    };

    const gameHistory = game.history();

    if (
      boardHistory.length <= gameHistory.length &&
      gameHistory.slice(0, boardHistory.length).join() ===
        boardHistory.map((m) => m.san).join()
    ) {
      position.currentMoveIdx = boardHistory.length;

      if (gameEval && gameEval.positions) {
        const evalIndex = boardHistory.length;
        const currentEval = gameEval.positions[evalIndex];
        const prevEval = evalIndex > 0 ? gameEval.positions[evalIndex - 1] : null;

        // Safely assign current evaluation if it exists
        if (currentEval && currentEval.lines) {
          position.eval = {
            ...currentEval,
            lines: currentEval.lines.slice(0, multiPv),
          };
        }

        // Safely assign previous evaluation if it exists
        if (prevEval && prevEval.lines) {
          position.lastEval = {
            ...prevEval,
            lines: prevEval.lines.slice(0, multiPv),
          };
        }
      }
    }

    if (!position.eval?.opening) {
      for (const move of boardHistory.slice().reverse()) {
        const moveFen = move.after.split(" ")[0];
        const opening = openings.find((opening) => opening.fen === moveFen);
        if (opening) {
          position.opening = opening.name;
          break;
        }
      }
    }

    setCurrentPosition(position);

    if (
      !position.eval &&
      engine?.getIsReady() &&
      engine.name &&
      !board.isCheckmate() &&
      !board.isStalemate()
    ) {
      const getFenEngineEval = async (
        fen: string,
        setPartialEval?: (positionEval: PositionEval) => void
      ) => {
        // Double-check engine readiness with graceful handling
        if (!engine || !engine.getIsReady()) {
          console.warn('Engine not ready for evaluation, skipping...');
          // Return a basic evaluation structure
          return {
            lines: [
              {
                pv: [],
                depth: 0,
                multiPv: 1,
                cp: 0,
              },
            ],
          };
        }
        
        // Create deterministic cache key
        const cacheKey = `${fen}|${engine.name}|d${depth}|pv${multiPv}`;
        const savedEval = savedEvals[cacheKey] || savedEvals[fen]; // Fallback to old key format
        
        if (
          savedEval &&
          savedEval.engine === engine.name &&
          (savedEval.lines?.length ?? 0) >= multiPv &&
          savedEval.lines &&
          savedEval.lines.length > 0 &&
          (savedEval.lines[0]?.depth ?? 0) >= depth
        ) {
          const positionEval: PositionEval = {
            ...savedEval,
            lines: savedEval.lines.slice(0, multiPv),
          };
          setPartialEval?.(positionEval);
          return positionEval;
        }

        try {
          const rawPositionEval = await engine.evaluatePositionWithUpdate({
            fen,
            depth,
            multiPv,
            setPartialEval,
          });

          // Cache with deterministic key
          setSavedEvals((prev) => ({
            ...prev,
            [cacheKey]: { ...rawPositionEval, engine: engine.name },
          }));

          return rawPositionEval;
        } catch (error) {
          console.warn('Engine evaluation failed:', error);
          // Return a basic evaluation structure on error
          return {
            lines: [
              {
                pv: [],
                depth: 0,
                multiPv: 1,
                cp: 0,
              },
            ],
          };
        }
      };

      const getPositionEval = async () => {
        try {
          const setPartialEval = (positionEval: PositionEval) => {
            setCurrentPosition({ ...position, eval: positionEval });
          };
          const rawPositionEval = await getFenEngineEval(
            board.fen(),
            setPartialEval
          );

        if (boardHistory.length === 0) return;

        const params = getEvaluateGameParams(board);
        const fens = params.fens.slice(board.turn() === "w" ? -3 : -4);
        const uciMoves = params.uciMoves.slice(board.turn() === "w" ? -2 : -3);

        const fenSlice = fens.slice(-2);
        const lastRawEval = fenSlice.length > 0 
          ? await getFenEngineEval(fenSlice[0])
          : {
              lines: [
                {
                  pv: [],
                  depth: 0,
                  multiPv: 1,
                  cp: 0,
                },
              ],
            };
        const rawPositions: PositionEval[] = fens.map((_, idx) => {
          if (idx === fens.length - 2) return lastRawEval;
          if (idx === fens.length - 1) return rawPositionEval;
          return {
            lines: [
              {
                pv: [],
                depth: 0,
                multiPv: 1,
                cp: 1,
              },
            ],
          };
        });

        const positionsWithMoveClassification = getMovesClassification(
          rawPositions,
          uciMoves,
          fens
        );

        setCurrentPosition({
          ...position,
          eval: positionsWithMoveClassification.slice(-1)[0],
          lastEval: positionsWithMoveClassification.slice(-2)[0],
        });
        } catch (error) {
          console.warn('Position evaluation failed:', error);
          // Set position without evaluation on error
          setCurrentPosition(position);
        }
      };

      getPositionEval();
    }

    return () => {
      if (engine?.getIsReady()) {
        engine?.stopAllCurrentJobs();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameEval, board, game, engine, depth, multiPv]);

  return currentPosition;
};
