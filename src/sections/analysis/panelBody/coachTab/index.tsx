import React from "react";
import { Grid, GridProps, Tabs, Tab, Box } from "@mui/material";
import { useAtomValue } from "jotai";
import { boardAtom, gameAtom, boardOrientationAtom } from "../../states";
import { useMemo } from "react";
import { useBoardGameSync } from "../../hooks/useBoardGameSync";
import dynamic from "next/dynamic";
import CoachPersonalitySelector from "@/components/coach/CoachPersonalitySelector";

// Dynamically import AICoachChat with no SSR
const AICoachChat = dynamic(() => import("@/components/AICoachChat"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: "16px", textAlign: "center" }}>
      Loading chess coach...
    </div>
  ),
});

export default function CoachTab(props: GridProps) {
  const board = useAtomValue(boardAtom);
  const game = useAtomValue(gameAtom);
  const boardOrientation = useAtomValue(boardOrientationAtom);

  // Use the board-game sync hook to keep them synchronized
  const { isSynced } = useBoardGameSync();

  // Create a unified game state that intelligently chooses the best data source
  const unifiedGameData = useMemo(() => {
    const boardHistory = board.history();
    const gameHistory = game.history();

    // Check if board is ahead of game (user played new moves)
    const boardIsAhead = boardHistory.length > gameHistory.length;

    // Check if board is on a different path than game
    const boardOnDifferentPath =
      gameHistory.length > 0 &&
      boardHistory.length > 0 &&
      !gameHistory
        .slice(0, boardHistory.length)
        .every((move, i) => move === boardHistory[i]);

    if (boardIsAhead || boardOnDifferentPath) {
      // Board has new moves or different path - use board as source of truth
      return {
        position: board.fen(),
        game: board, // Use board Chess object directly
        dataSource: "board",
        reason: boardIsAhead
          ? "Board has new moves"
          : "Board on different path",
      };
    } else {
      // Use game as source of truth
      return {
        position: board.fen(),
        game: game, // Use game Chess object directly
        dataSource: "game",
        reason: "Board and game are synchronized",
      };
    }
  }, [board, game]);

  console.log("🔍 Coach Tab Data:", {
    boardMoves: board.history().length,
    gameMoves: game.history().length,
    dataSource: unifiedGameData.dataSource,
    reason: unifiedGameData.reason,
    isSynced: isSynced,
    position: unifiedGameData.position,
    pgn: unifiedGameData.game.pgn(),
  });

  return (
    <Grid
      container
      justifyContent="center"
      alignItems="start"
      size={12}
      flexGrow={1}
      {...props}
      sx={
        props.hidden ? { display: "none" } : { overflow: "hidden", ...props.sx }
      }
    >
      <Grid size={12} sx={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Box sx={{ px: 2, pt: 1, pb: 0.5, flexShrink: 0 }}>
          <CoachPersonalitySelector />
        </Box>
        <Box sx={{ flex: 1, overflow: "hidden" }}>
          <AICoachChat
            position={unifiedGameData.position}
            game={game}
            boardOrientation={boardOrientation}
          />
        </Box>
      </Grid>
    </Grid>
  );
}
