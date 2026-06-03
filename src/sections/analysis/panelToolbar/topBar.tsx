import {
  Box,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { Icon } from "@iconify/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Chess } from "chess.js";
import { LoadingButton } from "@mui/lab";

import {
  boardAtom,
  boardOrientationAtom,
  engineDepthAtom,
  engineMultiPvAtom,
  engineNameAtom,
  engineWorkersNbAtom,
  evaluationProgressAtom,
  gameAtom,
  gameEvalAtom,
  panelExpandedAtom,
  savedEvalsAtom,
  userPlayerInfoAtom,
} from "../states";
import { useChessActions } from "@/hooks/useChessActions";
import { useGameDatabase } from "@/hooks/useGameDatabase";
import { useEngine } from "@/hooks/useEngine";
import { usePlayersData } from "@/hooks/usePlayersData";
import { getEvaluateGameParams } from "@/lib/chess";
import { logAnalyticsEvent } from "@/lib/firebase";
import { SavedEvals } from "@/types/eval";
import {
  detectUserColor,
  extractImportedGameInfo,
} from "@/lib/smartColorDetection";
import LoadGameDialog from "../../loadGame/loadGameDialog";
import SectionToggleBar from "./sectionToggleBar";
import { useCurrentPosition } from "../hooks/useCurrentPosition";
import ShareGameDialog from "@/components/ShareGameDialog";
import type { GameShareCreateRequest } from "@/types/gameShare";

export default function TopBar() {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const router = useRouter();

  // Load-game wiring
  const game = useAtomValue(gameAtom);
  const { setPgn: setGamePgn } = useChessActions(gameAtom);
  const { setPgn: setBoardPgn } = useChessActions(boardAtom);
  const { gameFromUrl, setGameEval: persistGameEval } = useGameDatabase();
  const [gameEval, setEval] = useAtom(gameEvalAtom);
  const setBoardOrientation = useSetAtom(boardOrientationAtom);
  const setUserPlayerInfo = useSetAtom(userPlayerInfoAtom);

  // Analyze wiring
  const engineName = useAtomValue(engineNameAtom);
  const engine = useEngine(engineName);
  useCurrentPosition(engine);
  const engineWorkersNb = useAtomValue(engineWorkersNbAtom);
  const [evaluationProgress, setEvaluationProgress] = useAtom(
    evaluationProgressAtom
  );
  const engineDepth = useAtomValue(engineDepthAtom);
  const engineMultiPv = useAtomValue(engineMultiPvAtom);
  const setSavedEvals = useSetAtom(savedEvalsAtom);
  const { white, black } = usePlayersData(gameAtom);

  // Panel expand
  const [panelExpanded, setPanelExpanded] = useAtom(panelExpandedAtom);

  const [openLoadDialog, setOpenLoadDialog] = useState(false);
  const [openShareDialog, setOpenShareDialog] = useState(false);
  const [sharePayload, setSharePayload] = useState<GameShareCreateRequest | null>(null);

  const resetAndSetGamePgn = useCallback(
    (pgn: string) => {
      setEval(undefined);
      setGamePgn(pgn);
      setBoardPgn(pgn);
    },
    [setGamePgn, setBoardPgn, setEval]
  );

  // Keep the auto-load-from-URL behavior that previously lived in LoadGame
  useEffect(() => {
    const loadGame = async () => {
      if (!gameFromUrl) return;

      const gamefromDbChess = new Chess();
      gamefromDbChess.loadPgn(gameFromUrl.pgn);

      const currentHeaders = game.getHeaders();
      const newHeaders = gamefromDbChess.getHeaders();
      const currentMoveCount = game.history().length;
      const newMoveCount = gamefromDbChess.history().length;

      const isSameGame =
        currentHeaders.White === newHeaders.White &&
        currentHeaders.Black === newHeaders.Black &&
        currentHeaders.Date === newHeaders.Date &&
        currentHeaders.Site === newHeaders.Site &&
        currentMoveCount === newMoveCount &&
        currentMoveCount > 0 &&
        game.history().join() === gamefromDbChess.history().join();

      if (isSameGame) return;

      const lastSearchUsername = localStorage.getItem("last-search-username");
      const lastGameOrigin = localStorage.getItem("last-game-origin");

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
  }, [
    gameFromUrl,
    game,
    resetAndSetGamePgn,
    setEval,
    setBoardOrientation,
    setUserPlayerInfo,
  ]);

  const isGameLoaded =
    gameFromUrl !== undefined ||
    (!!game.getHeaders().White && game.getHeaders().White !== "?") ||
    game.history().length > 0;

  const readyToAnalyse =
    engine?.getIsReady() && game.history().length > 0 && !evaluationProgress;

  const handleAnalyze = useCallback(async () => {
    const params = getEvaluateGameParams(game);
    if (
      !engine?.getIsReady() ||
      params.fens.length === 0 ||
      evaluationProgress
    ) {
      return;
    }

    const newGameEval = await engine.evaluateGame({
      ...params,
      depth: engineDepth,
      multiPv: engineMultiPv,
      setEvaluationProgress,
      playersRatings: {
        white: white?.rating,
        black: black?.rating,
      },
      workersNb: engineWorkersNb,
    });

    setEval(newGameEval);
    setEvaluationProgress(0);

    if (gameFromUrl) {
      persistGameEval(gameFromUrl.id, newGameEval);
    }

    const gameSavedEvals: SavedEvals = params.fens.reduce((acc, fen, idx) => {
      acc[fen] = { ...newGameEval.positions[idx], engine: engineName };
      return acc;
    }, {} as SavedEvals);
    setSavedEvals((prev) => ({ ...prev, ...gameSavedEvals }));

    logAnalyticsEvent("analyze_game", {
      engine: engineName,
      depth: engineDepth,
      multiPv: engineMultiPv,
      nbPositions: params.fens.length,
    });
  }, [
    engine,
    engineName,
    engineWorkersNb,
    game,
    engineDepth,
    engineMultiPv,
    evaluationProgress,
    setEvaluationProgress,
    setEval,
    gameFromUrl,
    persistGameEval,
    setSavedEvals,
    white.rating,
    black.rating,
  ]);

  useEffect(() => {
    setEvaluationProgress(0);
  }, [engine, setEvaluationProgress]);

  useEffect(() => {
    if (!gameEval && readyToAnalyse) {
      handleAnalyze();
    }
  }, [gameEval, readyToAnalyse, handleAnalyze]);

  const handleLoadClick = () => setOpenLoadDialog(true);

  const handleShareClick = useCallback(() => {
    if (!isGameLoaded) return;
    const headers = game.getHeaders();
    const payload: GameShareCreateRequest = {
      pgn: game.pgn(),
      white: headers.White && headers.White !== "?" ? headers.White : (white?.name ?? null),
      black: headers.Black && headers.Black !== "?" ? headers.Black : (black?.name ?? null),
      result: headers.Result && headers.Result !== "*" ? headers.Result : null,
      date: headers.Date && headers.Date !== "?" ? headers.Date : null,
      event: headers.Event && headers.Event !== "?" ? headers.Event : null,
      site: headers.Site && headers.Site !== "?" ? headers.Site : null,
      timeControl: headers.TimeControl ?? null,
      termination: headers.Termination ?? null,
      evalData: gameEval ?? null,
      coachTranscript: null, // Live transcript lives inside AICoachChat; integrating that is a follow-up.
      note: null, // The dialog's note input handles this on POST.
    };
    setSharePayload(payload);
    setOpenShareDialog(true);
    logAnalyticsEvent("share_game_dialog_opened", { has_eval: !!gameEval });
  }, [game, isGameLoaded, gameEval, white?.name, black?.name]);

  return (
    <Box
      width="100%"
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        flexWrap: "wrap",
        rowGap: 0.5,
      }}
    >
      {/* Left: action buttons */}
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Tooltip title={isGameLoaded ? "Load another game" : "Load game"}>
          <IconButton
            size="small"
            onClick={handleLoadClick}
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              border: "1.5px solid",
              borderColor: "primary.main",
              color: "primary.main",
              "&:hover": {
                backgroundColor: isDarkMode
                  ? "rgba(255,107,53,0.12)"
                  : "rgba(255,107,53,0.08)",
              },
            }}
          >
            <Icon icon="mdi:upload" height={18} />
          </IconButton>
        </Tooltip>

        {!evaluationProgress && (
          <Tooltip title={gameEval ? "Analyze again" : "Analyze game"}>
            <span>
              <LoadingButton
                size="small"
                variant="outlined"
                onClick={handleAnalyze}
                disabled={!readyToAnalyse}
                sx={{
                  minWidth: 0,
                  height: 32,
                  px: 1.25,
                  borderWidth: 1.5,
                  textTransform: "none",
                }}
                startIcon={
                  <Icon icon="streamline:magnifying-glass-solid" height={12} />
                }
              >
                <Typography
                  fontSize="0.8rem"
                  fontWeight={500}
                  lineHeight="1em"
                >
                  {gameEval ? "Re-analyze" : "Analyze"}
                </Typography>
              </LoadingButton>
            </span>
          </Tooltip>
        )}

        {!!evaluationProgress && (
          <Box sx={{ minWidth: 120, mx: 1 }}>
            <Typography fontSize="0.7rem" color="text.secondary" noWrap>
              Analyzing... {evaluationProgress}%
            </Typography>
            <LinearProgress
              variant="determinate"
              value={evaluationProgress}
              sx={{ height: 4, borderRadius: 2 }}
            />
          </Box>
        )}

        <Tooltip title={isGameLoaded ? "Share this game" : "Load a game to share"}>
          <span>
            <IconButton
              size="small"
              onClick={handleShareClick}
              disabled={!isGameLoaded}
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1,
                border: "1.5px solid",
                borderColor: isGameLoaded ? "primary.main" : "divider",
                color: isGameLoaded ? "primary.main" : "text.disabled",
                "&:hover": isGameLoaded
                  ? {
                      backgroundColor: isDarkMode
                        ? "rgba(255,107,53,0.12)"
                        : "rgba(255,107,53,0.08)",
                    }
                  : undefined,
              }}
            >
              <Icon icon="mdi:share-variant" height={18} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {/* Right: section toggles + expand */}
      <Stack direction="row" spacing={0.75} alignItems="center">
        <SectionToggleBar />

        <Box
          sx={{
            width: "1px",
            height: 22,
            mx: 0.5,
            backgroundColor: isDarkMode
              ? "rgba(255,255,255,0.15)"
              : "rgba(0,0,0,0.15)",
          }}
        />

        <Tooltip title={panelExpanded ? "Collapse panel" : "Expand panel"}>
          <IconButton
            size="small"
            onClick={() => setPanelExpanded(!panelExpanded)}
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              color: "primary.main",
            }}
          >
            <Icon
              icon={panelExpanded ? "mdi:fullscreen-exit" : "mdi:fullscreen"}
              height={20}
            />
          </IconButton>
        </Tooltip>
      </Stack>

      <LoadGameDialog
        open={openLoadDialog}
        onClose={() => setOpenLoadDialog(false)}
        setGame={async (loadedGame) => {
          await router.push("/analysis");
          resetAndSetGamePgn(loadedGame.pgn());
        }}
      />

      <ShareGameDialog
        open={openShareDialog}
        onClose={() => setOpenShareDialog(false)}
        payload={sharePayload}
      />
    </Box>
  );
}
