import { Box, Grid2 as Grid, Typography } from "@mui/material";
import { PrimitiveAtom, atom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { getEvaluationBarValue } from "@/lib/chess";
import { Color } from "@/types/enums";
import { CurrentPosition } from "@/types/eval";
import { Chess } from "chess.js";

interface Props {
  height: number;
  boardOrientation?: Color;
  currentPositionAtom?: PrimitiveAtom<CurrentPosition>;
  boardAtom?: PrimitiveAtom<Chess>;
}

export default function EvaluationBar({
  height,
  boardOrientation,
  currentPositionAtom = atom({}),
  boardAtom,
}: Props) {
  const [evalBar, setEvalBar] = useState({
    whiteBarPercentage: 50,
    label: "0.0",
  });
  const position = useAtomValue(currentPositionAtom);
  const board = boardAtom ? useAtomValue(boardAtom) : null;

  useEffect(() => {
    const bestLine = position?.eval?.lines[0];
    if (!position.eval || !bestLine || bestLine.depth < 6) return;

    if (board && board.isCheckmate()) {
      const result = board.turn() === "w" ? "0-1" : "1-0";
      
      const whiteBarPercentage = board.turn() === "w" ? 0 : 100;
      setEvalBar({
        whiteBarPercentage,
        label: result,
      });
      return;
    }

    const evalBar = getEvaluationBarValue(position.eval);
    
    if (bestLine.mate) {
      const whiteBarPercentage = bestLine.mate > 0 ? 100 : 0;
      setEvalBar({
        whiteBarPercentage,
        label: evalBar.label,
      });
      return;
    }
    
    setEvalBar(evalBar);
  }, [position, board]);

  return (
    <Grid
      container
      justifyContent="center"
      alignItems="center"
      width="2rem"
      height={height}
      border="1px solid black"
      borderRadius="5px"
    >
      <Box
        sx={{
          backgroundColor:
            boardOrientation === Color.White ? "#424242" : "white",
          transition: "height 1s",
        }}
        height={`${
          boardOrientation === Color.White
            ? 100 - evalBar.whiteBarPercentage
            : evalBar.whiteBarPercentage
        }%`}
        width="100%"
        borderRadius={
          evalBar.whiteBarPercentage === 100 ? "5px" : "5px 5px 0 0"
        }
      >
        <Typography
          color={boardOrientation === Color.White ? "white" : "black"}
          textAlign="center"
          width="100%"
          fontSize="0.7rem"
          sx={{ 
            wordBreak: "break-word",
            lineHeight: 1,
            padding: "2px"
          }}
        >
          {(evalBar.whiteBarPercentage < 50 &&
            boardOrientation === Color.White) ||
          (evalBar.whiteBarPercentage >= 50 && boardOrientation === Color.Black)
            ? evalBar.label
            : ""}
        </Typography>
      </Box>

      <Box
        sx={{
          backgroundColor:
            boardOrientation === Color.White ? "white" : "#424242",
          transition: "height 1s",
        }}
        height={`${
          boardOrientation === Color.White
            ? evalBar.whiteBarPercentage
            : 100 - evalBar.whiteBarPercentage
        }%`}
        width={"100%"}
        display="flex"
        alignItems="flex-end"
        borderRadius={
          evalBar.whiteBarPercentage === 100 ? "5px" : "0 0 5px 5px"
        }
      >
        <Typography
          color={boardOrientation === Color.White ? "black" : "white"}
          textAlign="center"
          width="100%"
          fontSize="0.7rem"
          sx={{ 
            wordBreak: "break-word",
            lineHeight: 1,
            padding: "2px"
          }}
        >
          {(evalBar.whiteBarPercentage >= 50 &&
            boardOrientation === Color.White) ||
          (evalBar.whiteBarPercentage < 50 && boardOrientation === Color.Black)
            ? evalBar.label
            : ""}
        </Typography>
      </Box>
    </Grid>
  );
}
