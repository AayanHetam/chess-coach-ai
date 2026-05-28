import LoadGameButton from "../../loadGame/loadGameButton";
import { useCallback, useEffect } from "react";
import { useChessActions } from "@/hooks/useChessActions";
import {
  boardAtom,
  boardOrientationAtom,
  evaluationProgressAtom,
  gameAtom,
  gameEvalAtom,
  userPlayerInfoAtom,
} from "../states";
import { useGameDatabase } from "@/hooks/useGameDatabase";
import { useAtomValue, useSetAtom } from "jotai";
import { Chess } from "chess.js";
import { useRouter } from "next/router";
import { extractImportedGameInfo, detectUserColor } from "@/lib/smartColorDetection";

export default function LoadGame() {
  const router = useRouter();
  const game = useAtomValue(gameAtom);
  const { setPgn: setGamePgn } = useChessActions(gameAtom);
  const { setPgn: setBoardPgn } = useChessActions(boardAtom);
  const { gameFromUrl } = useGameDatabase();
  const setEval = useSetAtom(gameEvalAtom);
  const setBoardOrientation = useSetAtom(boardOrientationAtom);
  const setUserPlayerInfo = useSetAtom(userPlayerInfoAtom);
  const evaluationProgress = useAtomValue(evaluationProgressAtom);

  const resetAndSetGamePgn = useCallback(
    (pgn: string) => {
      setEval(undefined);
      // Load the game into both gameAtom and boardAtom so they stay in sync
      setGamePgn(pgn);
      setBoardPgn(pgn);
    },
    [setGamePgn, setBoardPgn, setEval]
  );

  useEffect(() => {
    const loadGame = async () => {
      if (!gameFromUrl) return;

      const gamefromDbChess = new Chess();
      gamefromDbChess.loadPgn(gameFromUrl.pgn);
      
      // Compare games - only skip if it's the exact same game
      // Use a combination of headers and move count to identify unique games
      const currentHeaders = game.getHeaders();
      const newHeaders = gamefromDbChess.getHeaders();
      const currentMoveCount = game.history().length;
      const newMoveCount = gamefromDbChess.history().length;
      
      // Check if this is the same game by comparing key identifiers
      const isSameGame = 
        currentHeaders.White === newHeaders.White &&
        currentHeaders.Black === newHeaders.Black &&
        currentHeaders.Date === newHeaders.Date &&
        currentHeaders.Site === newHeaders.Site &&
        currentMoveCount === newMoveCount &&
        currentMoveCount > 0 && // Only skip if there are moves (not a new empty game)
        game.history().join() === gamefromDbChess.history().join();
      
      // Only skip loading if it's clearly the same game
      if (isSameGame) return;

      // Try to get username from localStorage (set when loading from Lichess/Chess.com)
      const lastSearchUsername = localStorage.getItem("last-search-username");
      const lastGameOrigin = localStorage.getItem("last-game-origin");
      
      // Extract player information and determine user's color
      if (lastSearchUsername) {
        const importedGameInfo = extractImportedGameInfo(
          gamefromDbChess,
          lastGameOrigin || undefined,
          lastSearchUsername
        );
        
        if (importedGameInfo) {
          const colorDetection = detectUserColor(
            gamefromDbChess,
            importedGameInfo,
            gameFromUrl.black.name === "You" &&
              gameFromUrl.site === "ChessMasti.com"
              ? false
              : true
          );
          
          // Store username and player color in atom for AI coach
          setUserPlayerInfo({
            username: lastSearchUsername,
            playerColor: colorDetection.userColor,
          });
        }
      }

      resetAndSetGamePgn(gameFromUrl.pgn);
      setEval(gameFromUrl.eval);
      setBoardOrientation(
        gameFromUrl.black.name === "You" &&
          gameFromUrl.site === "ChessMasti.com"
          ? false
          : true
      );
    };

    loadGame();
  }, [gameFromUrl, game, resetAndSetGamePgn, setEval, setBoardOrientation, setUserPlayerInfo]);

  const isGameLoaded =
    gameFromUrl !== undefined ||
    (!!game.getHeaders().White && game.getHeaders().White !== "?") ||
    game.history().length > 0;

  if (evaluationProgress) return null;

  return (
    <LoadGameButton
      label={isGameLoaded ? "Load another game" : "Load game"}
      size="small"
      setGame={async (game) => {
        // Stay within /legacy/analysis when loading from inside the
        // legacy page; route to /analysis (new page) otherwise.
        const target =
          router.pathname.startsWith("/legacy") ? "/legacy/analysis" : "/analysis";
        await router.push(target);
        resetAndSetGamePgn(game.pgn());
      }}
    />
  );
}
