// ─────────────────────────────────────────────────────────────────────────────
// StockfishPlay
//
// Extracted wrapper around the existing Play-vs-Stockfish UI so the parent
// /play page can host it as one of several tabs. Behavior is identical to
// the legacy layout: Board + the settings/recap sidebar.
// ─────────────────────────────────────────────────────────────────────────────

import Board from "@/sections/play/board";
import GameInProgress from "@/sections/play/gameInProgress";
import GameRecap from "@/sections/play/gameRecap";
import GameSettingsButton from "@/sections/play/gameSettings/gameSettingsButton";
import { isGameInProgressAtom } from "@/sections/play/states";
import { Grid } from "@mui/material";
import { useAtomValue } from "jotai";
import { LINE, RADIUS, SURFACE } from "@/theme/tokens";

export default function StockfishPlay() {
  const isGameInProgress = useAtomValue(isGameInProgressAtom);

  return (
    <Grid container gap={4} justifyContent="space-evenly" alignItems="start">
      <Board />

      <Grid
        container
        marginTop={{ xs: 0, md: "2.5em" }}
        justifyContent="center"
        alignItems="center"
        size={{
          xs: 12,
          md: "grow",
        }}
        sx={{
          background: SURFACE.raised,
          border: `1px solid ${LINE.hairline}`,
          borderRadius: `${RADIUS.card}px`,
        }}
        padding={3}
        rowGap={3}
        style={{
          maxWidth: "400px",
        }}
      >
        <GameInProgress />
        {!isGameInProgress && <GameSettingsButton />}
        <GameRecap />
      </Grid>
    </Grid>
  );
}
