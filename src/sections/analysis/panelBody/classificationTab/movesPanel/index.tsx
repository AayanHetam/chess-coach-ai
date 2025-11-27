import { Grid, Stack } from "@mui/material";
import MovesLine from "./movesLine";
import MoveTypeFilter from "./moveTypeFilter";
import { useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { boardAtom, gameAtom, gameEvalAtom } from "../../../states";
import { MoveClassification } from "@/types/enums";

export default function MovesPanel() {
  const game = useAtomValue(gameAtom);
  const board = useAtomValue(boardAtom);
  const gameEval = useAtomValue(gameEvalAtom);
  const [selectedMoveTypes, setSelectedMoveTypes] = useState<
    MoveClassification[]
  >([
    MoveClassification.Brilliant,
    MoveClassification.Great,
    MoveClassification.Best,
    MoveClassification.Excellent,
    MoveClassification.Good,
    MoveClassification.Okay,
    MoveClassification.Opening,
    MoveClassification.Inaccuracy,
    MoveClassification.Mistake,
    MoveClassification.Blunder,
    MoveClassification.Miss,
    MoveClassification.Forced,
  ]);

  const gameMoves = useMemo(() => {
    const gameHistory = game.history();
    const boardHistory = board.history();
    const history = gameHistory.length ? gameHistory : boardHistory;

    if (!history.length) return undefined;

    const moves: { san: string; moveClassification?: MoveClassification }[][] =
      [];

    for (let i = 0; i < history.length; i += 2) {
      const items = [
        {
          san: history[i],
          moveClassification: gameHistory.length
            ? gameEval?.positions[i + 1]?.moveClassification
            : undefined,
        },
      ];

      if (history[i + 1]) {
        items.push({
          san: history[i + 1],
          moveClassification: gameHistory.length
            ? gameEval?.positions[i + 2]?.moveClassification
            : undefined,
        });
      }

      moves.push(items);
    }

    return moves;
  }, [game, board, gameEval]);

  // Filter moves based on selected move types
  const filteredMoves = useMemo(() => {
    if (!gameMoves) return undefined;

    return gameMoves.filter((moveLine) =>
      moveLine.some(
        (move) =>
          !move.moveClassification ||
          selectedMoveTypes.includes(move.moveClassification)
      )
    );
  }, [gameMoves, selectedMoveTypes]);

  if (!gameMoves?.length) return null;

  return (
    <Grid
      container
      justifyContent="center"
      alignItems="start"
      gap={0.5}
      paddingY={1}
      sx={{ scrollbarWidth: "thin", overflowY: "auto" }}
      height="100%"
      maxHeight="22rem"
      size={6}
      id="moves-panel"
    >
      {/* Compact filter at the top */}
      <Grid container size={12} sx={{ mb: 1 }}>
        <MoveTypeFilter onFilterChange={setSelectedMoveTypes} />
      </Grid>

      {/* Original moves display */}
      {filteredMoves?.map((moves, idx) => (
        <MovesLine
          key={`${moves.map(({ san }) => san).join()}-${idx}`}
          moves={moves}
          moveNb={idx + 1}
        />
      ))}
    </Grid>
  );
}
