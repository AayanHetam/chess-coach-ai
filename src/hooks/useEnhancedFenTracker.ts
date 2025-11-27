import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import { Chess } from "chess.js";
import { EnhancedFenTracker, PositionData } from "@/lib/enhancedFenTracker";
import {
  EnhancedOpenAIService,
  ChessAnalysisRequest,
  GameReviewRequest,
} from "@/lib/enhancedOpenAIService";
import { PrimitiveAtom } from "jotai";

export interface UseEnhancedFenTrackerOptions {
  enableRealTimeTracking?: boolean;
  enableAIAnalysis?: boolean;
  openAIApiKey?: string;
  analysisInterval?: number; // milliseconds
  maxPositionsToTrack?: number;
}

export interface EnhancedGameState {
  currentPosition: PositionData | null;
  allPositions: PositionData[];
  gameSummary: {
    totalMoves: number;
    totalPositions: number;
    gameResult: string;
    finalPosition: string;
  };
  analysisResults: Array<{
    position: PositionData;
    analysis: any;
    timestamp: number;
  }>;
  isAnalyzing: boolean;
  lastAnalysisTime: number | null;
}

export const useEnhancedFenTracker = (
  chessAtom: PrimitiveAtom<Chess>,
  options: UseEnhancedFenTrackerOptions = {}
) => {
  const [game, setGame] = useAtom(chessAtom);
  const [tracker, setTracker] = useState<EnhancedFenTracker | null>(null);
  const [openAIService, setOpenAIService] =
    useState<EnhancedOpenAIService | null>(null);
  const [gameState, setGameState] = useState<EnhancedGameState>({
    currentPosition: null,
    allPositions: [],
    gameSummary: {
      totalMoves: 0,
      totalPositions: 0,
      gameResult: "ongoing",
      finalPosition: "",
    },
    analysisResults: [],
    isAnalyzing: false,
    lastAnalysisTime: null,
  });

  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const {
    enableRealTimeTracking = true,
    enableAIAnalysis = false,
    openAIApiKey,
    analysisInterval = 5000,
    maxPositionsToTrack = 1000,
  } = options;

  // Initialize tracker when game changes
  useEffect(() => {
    if (!game) return;

    const newTracker = new EnhancedFenTracker(game.fen());

    // Reconstruct positions from game history
    const history = game.history({ verbose: true });
    for (const move of history) {
      newTracker.makeMove(move);
    }

    setTracker(newTracker);
    updateGameState(newTracker);
  }, [game]);

  // Initialize OpenAI service
  useEffect(() => {
    if (enableAIAnalysis && openAIApiKey) {
      const service = new EnhancedOpenAIService(openAIApiKey);
      setOpenAIService(service);
    }
  }, [enableAIAnalysis, openAIApiKey]);

  const updateGameState = useCallback(
    (currentTracker: EnhancedFenTracker) => {
      const positions = currentTracker.getPositions();
      const currentPosition = currentTracker.getCurrentPosition();
      const gameSummary = currentTracker.getGameSummary();

      setGameState((prev) => ({
        ...prev,
        currentPosition,
        allPositions: positions.slice(-maxPositionsToTrack), // Keep only recent positions
        gameSummary,
      }));
    },
    [maxPositionsToTrack]
  );

  const makeMove = useCallback(
    async (move: string | any) => {
      if (!tracker) return null;

      const result = tracker.makeMove(move);
      if (result) {
        updateGameState(tracker);

        // Trigger AI analysis if enabled
        if (enableAIAnalysis && openAIService && result.movePlayed) {
          scheduleAnalysis(result);
        }
      }

      return result;
    },
    [tracker, updateGameState, enableAIAnalysis, openAIService]
  );

  const undoMove = useCallback(() => {
    if (!tracker) return null;

    const result = tracker.undoMove();
    if (result) {
      updateGameState(tracker);
    }

    return result;
  }, [tracker, updateGameState]);

  const scheduleAnalysis = useCallback(
    (position: PositionData) => {
      if (!openAIService) return;

      // Clear existing timeout
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
      }

      // Schedule new analysis
      analysisTimeoutRef.current = setTimeout(async () => {
        if (!openAIService) return;

        setGameState((prev) => ({ ...prev, isAnalyzing: true }));

        try {
          const request: ChessAnalysisRequest = {
            position,
            gameHistory: gameState.allPositions.slice(-10), // Last 10 positions for context
            analysisType: "move_explanation",
            model: "gpt-4o-high",
            responseFormat: "text",
          };

          const analysis = await openAIService.analyzePosition(request);

          setGameState((prev) => ({
            ...prev,
            analysisResults: [
              ...prev.analysisResults,
              {
                position,
                analysis,
                timestamp: Date.now(),
              },
            ].slice(-50), // Keep only last 50 analyses
            isAnalyzing: false,
            lastAnalysisTime: Date.now(),
          }));
        } catch (error) {
          console.error("AI analysis failed:", error);
          setGameState((prev) => ({ ...prev, isAnalyzing: false }));
        }
      }, analysisInterval);
    },
    [openAIService, gameState.allPositions, analysisInterval]
  );

  const analyzeCurrentPosition = useCallback(
    async (
      analysisType: ChessAnalysisRequest["analysisType"] = "move_explanation"
    ) => {
      if (!openAIService || !gameState.currentPosition) return null;

      setGameState((prev) => ({ ...prev, isAnalyzing: true }));

      try {
        const request: ChessAnalysisRequest = {
          position: gameState.currentPosition,
          gameHistory: gameState.allPositions.slice(-10),
          analysisType,
          model: "gpt-4o-high",
          responseFormat: "text",
        };

        const analysis = await openAIService.analyzePosition(request);

        setGameState((prev) => ({
          ...prev,
          analysisResults: [
            ...prev.analysisResults,
            {
              position: gameState.currentPosition!,
              analysis,
              timestamp: Date.now(),
            },
          ].slice(-50),
          isAnalyzing: false,
          lastAnalysisTime: Date.now(),
        }));

        return analysis;
      } catch (error) {
        console.error("AI analysis failed:", error);
        setGameState((prev) => ({ ...prev, isAnalyzing: false }));
        return null;
      }
    },
    [openAIService, gameState.currentPosition, gameState.allPositions]
  );

  const reviewEntireGame = useCallback(
    async (playerColor: "w" | "b" = "w") => {
      if (!openAIService || gameState.allPositions.length === 0) return null;

      setGameState((prev) => ({ ...prev, isAnalyzing: true }));

      try {
        const request: GameReviewRequest = {
          positions: gameState.allPositions,
          playerColor,
          analysisDepth: "detailed",
          model: "gpt-4o-high",
        };

        const review = await openAIService.reviewGame(request);

        setGameState((prev) => ({
          ...prev,
          isAnalyzing: false,
          lastAnalysisTime: Date.now(),
        }));

        return review;
      } catch (error) {
        console.error("Game review failed:", error);
        setGameState((prev) => ({ ...prev, isAnalyzing: false }));
        return null;
      }
    },
    [openAIService, gameState.allPositions]
  );

  const exportTrainingData = useCallback(() => {
    if (!tracker) return null;
    return tracker.exportForTraining();
  }, [tracker]);

  const getPositionAtMove = useCallback(
    (moveNumber: number, halfMove: boolean = false) => {
      if (!tracker) return null;
      return tracker.getPositionAtMove(moveNumber, halfMove);
    },
    [tracker]
  );

  const getMoveSequence = useCallback(() => {
    if (!tracker) return [];
    return tracker.getMoveSequence();
  }, [tracker]);

  const getPositionSequence = useCallback(() => {
    if (!tracker) return [];
    return tracker.getPositionSequence();
  }, [tracker]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
      }
    };
  }, []);

  // Real-time tracking effect
  useEffect(() => {
    if (!enableRealTimeTracking || !tracker) return;

    const interval = setInterval(() => {
      const currentFen = game.fen();
      const trackerFen = tracker.getCurrentPosition()?.fen;

      if (currentFen !== trackerFen) {
        // Game state has changed, update tracker
        const newTracker = new EnhancedFenTracker(currentFen);
        const history = game.history({ verbose: true });
        for (const move of history) {
          newTracker.makeMove(move);
        }
        setTracker(newTracker);
        updateGameState(newTracker);
      }
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [enableRealTimeTracking, tracker, game, updateGameState]);

  return {
    // State
    gameState,

    // Actions
    makeMove,
    undoMove,
    analyzeCurrentPosition,
    reviewEntireGame,

    // Data export
    exportTrainingData,
    getPositionAtMove,
    getMoveSequence,
    getPositionSequence,

    // Utility
    tracker,
    openAIService,
  };
};
