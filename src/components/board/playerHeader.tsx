import { Color } from "@/types/enums";
import { Player } from "@/types/game";
import {
  Avatar,
  Grid,
  Stack,
  Typography,
  Box,
  IconButton,
} from "@mui/material";
import CapturedPieces from "./capturedPieces";
import { PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import { Chess } from "chess.js";
import { useMemo } from "react";
import { getPaddedNumber } from "@/lib/helpers";
import { Icon } from "@iconify/react";
import { isExplorationModeAtom, showNextMoveSuggestionAtom } from "./states";

export interface Props {
  player: Player;
  color: Color;
  gameAtom: PrimitiveAtom<Chess>;
  boardAtom?: PrimitiveAtom<Chess>;
  showControls?: boolean;
}

export default function PlayerHeader({
  color,
  player,
  gameAtom,
  boardAtom,
  showControls = false,
}: Props) {
  const game = useAtomValue(gameAtom);
  const isExplorationMode = useAtomValue(isExplorationModeAtom);
  const showNextMoveSuggestion = useAtomValue(showNextMoveSuggestionAtom);
  const setIsExplorationMode = useSetAtom(isExplorationModeAtom);
  const setShowNextMoveSuggestion = useSetAtom(showNextMoveSuggestionAtom);
  const setBoard = boardAtom ? useSetAtom(boardAtom) : null;

  const gameFen = game.fen();

  const clock = useMemo(() => {
    const turn = game.turn();

    if (turn === color) {
      const history = game.history({ verbose: true });
      const previousFen = history.at(-1)?.before;

      const comment = game
        .getComments()
        .find(({ fen }) => fen === previousFen)?.comment;

      return getClock(comment);
    }

    const comment = game.getComment();
    return getClock(comment);
  }, [game, color]);

  return (
    <Grid
      container
      justifyContent="space-between"
      alignItems="center"
      size={12}
    >
      <Stack direction="row">
        <Avatar
          src={player.avatarUrl}
          alt={player.name}
          variant="circular"
          sx={{
            width: 40,
            height: 40,
            backgroundColor: color === Color.White ? "white" : "black",
            color: color === Color.White ? "black" : "white",
            border: "1px solid black",
          }}
        >
          {player.name[0].toUpperCase()}
        </Avatar>

        <Stack marginLeft={1}>
          <Stack direction="row">
            <Typography fontSize="0.9rem">{player.name}</Typography>

            {player.rating && (
              <Typography marginLeft={0.5} fontSize="0.9rem" fontWeight="200">
                ({player.rating})
              </Typography>
            )}
          </Stack>

          <CapturedPieces fen={gameFen} color={color} />
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center">
        {/* Only show controls if showControls is true */}
        {showControls && (
          <>
            {/* Exploration mode indicator */}
            {isExplorationMode && (
              <Box
                sx={{
                  backgroundColor: "rgba(255, 165, 0, 0.8)",
                  color: "white",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <span>EXPLORING</span>
                <IconButton
                  size="small"
                  onClick={() => {
                    // Reset to original game position
                    if (setBoard) {
                      const newBoard = new Chess();
                      if (game.history().length > 0) {
                        newBoard.loadPgn(game.pgn());
                      }
                      setBoard(newBoard);
                      setIsExplorationMode(false);
                    }
                  }}
                  sx={{
                    color: "white",
                    padding: "2px",
                    "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.2)" },
                  }}
                >
                  <Icon icon="ri:home-line" fontSize={14} />
                </IconButton>
              </Box>
            )}

            {/* Next move suggestion toggle */}
            <Box
              sx={{
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                color: "white",
                padding: "4px 8px",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                gap: 1,
                cursor: "pointer",
                transition: "opacity 0.2s ease-in-out",
                "&:hover": {
                  opacity: 0.8,
                },
              }}
              onClick={() => {
                setShowNextMoveSuggestion(!showNextMoveSuggestion);
              }}
              title={
                showNextMoveSuggestion
                  ? "Hide next move suggestions"
                  : "Show next move suggestions"
              }
            >
              <Icon
                icon={
                  showNextMoveSuggestion ? "ri:eye-line" : "ri:eye-off-line"
                }
                fontSize={14}
              />
              <span>
                {showNextMoveSuggestion ? "HIDE" : "SHOW"} SUGGESTIONS
              </span>
            </Box>
          </>
        )}

        {clock && (
          <Typography
            align="center"
            sx={{
              backgroundColor: color === Color.White ? "white" : "black",
              color: color === Color.White ? "black" : "white",
            }}
            borderRadius="5px"
            padding={0.8}
            border="1px solid #424242"
            width="5rem"
            textAlign="right"
          >
            {clock.hours ? `${clock.hours}:` : ""}
            {getPaddedNumber(clock.minutes)}:{getPaddedNumber(clock.seconds)}
            {clock.hours || clock.minutes || clock.seconds > 20
              ? ""
              : `.${clock.tenths}`}
          </Typography>
        )}
      </Stack>
    </Grid>
  );
}

const getClock = (comment: string | undefined) => {
  if (!comment) return undefined;

  const match = comment.match(/\[%clk (\d+):(\d+):(\d+)(?:\.(\d*))?\]/);
  if (!match) return undefined;

  return {
    hours: parseInt(match[1]),
    minutes: parseInt(match[2]),
    seconds: parseInt(match[3]),
    tenths: match[4] ? parseInt(match[4]) : 0,
  };
};
