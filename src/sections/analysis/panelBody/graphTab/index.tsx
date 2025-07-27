import { Box, Grid, GridProps, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DotProps } from "recharts";
import {
  boardAtom,
  currentPositionAtom,
  gameAtom,
  gameEvalAtom,
} from "../../states";
import { useCallback, useMemo } from "react";
import type { ReactElement } from "react";
import CustomTooltip from "./tooltip";
import { ChartItemData } from "./types";
import { PositionEval } from "@/types/eval";
import { CLASSIFICATION_COLORS } from "@/constants";
import CustomDot from "./dot";
import { MoveClassification } from "@/types/enums";
import { useChessActions } from "@/hooks/useChessActions";
import { useTheme } from "@mui/material/styles";

export default function GraphTab(props: GridProps) {
  const gameEval = useAtomValue(gameEvalAtom);
  const currentPosition = useAtomValue(currentPositionAtom);
  const { goToMove } = useChessActions(boardAtom);
  const game = useAtomValue(gameAtom);
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";

  const chartData: ChartItemData[] = useMemo(
    () => gameEval?.positions.map(formatEvalToChartData) ?? [],
    [gameEval]
  );

  console.log('GraphTab Debug:', {
    gameEval: !!gameEval,
    positions: gameEval?.positions?.length,
    chartData: chartData.length,
    gameEvalData: gameEval,
    positionsData: gameEval?.positions?.map((pos, idx) => ({
      index: idx,
      hasLines: pos.lines?.length > 0,
      linesLength: pos.lines?.length,
      firstLine: pos.lines?.[0]
    }))
  });

  const bestDotIndices = useMemo(() => {
    const bestItems = chartData.filter(
      (item) => item.moveClassification === MoveClassification.Best
    );
    const count = Math.ceil(bestItems.length * 0.15);
    const indices = bestItems.map((item) => item.moveNb);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return new Set(indices.slice(0, count));
  }, [chartData]);

  const boardMoveColor = currentPosition.eval?.moveClassification
    ? CLASSIFICATION_COLORS[currentPosition.eval.moveClassification]
    : "grey";

  // Render a dot only on selected classifications (always returns an element)
  const renderDot = useCallback(
    (
      props: DotProps & { payload?: ChartItemData }
    ): ReactElement<SVGElement> => {
      const payload = props.payload;
      const moveClass = payload?.moveClassification;
      if (!moveClass) return <svg key={props.key} />;

      if (
        [
          MoveClassification.Brilliant,
          MoveClassification.Excellent,
          MoveClassification.Blunder,
          MoveClassification.Mistake,
        ].includes(moveClass) ||
        (moveClass === MoveClassification.Best &&
          bestDotIndices.has(payload.moveNb))
      ) {
        return <CustomDot {...props} key={props.key} payload={payload} />;
      }

      return <svg key={props.key} />;
    },
    [bestDotIndices]
  );

  if (!gameEval || chartData.length === 0) {
    console.log('GraphTab: No gameEval data or no chart data available', {
      gameEval: !!gameEval,
      chartDataLength: chartData.length
    });
    return (
      <Box
        width="100%"
        height="120px"
        minHeight="100px"
        maxHeight="150px"
        sx={{
          backgroundColor: isDarkMode ? "#2e2e2e" : "#FFF8F5",
          borderRadius: "15px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: isDarkMode ? "none" : "2px solid #FFE4D6",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          No evaluation data available for graph
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      width="100%"
      height="120px"
      minHeight="100px"
      maxHeight="150px"
      sx={{
        backgroundColor: isDarkMode ? "#2e2e2e" : "#FFF8F5", // Light orange-tinted white for light mode
        borderRadius: "15px",
        overflow: "hidden",
        border: isDarkMode ? "none" : "2px solid #FFE4D6", // Orange border for light mode
      }}
    >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            width={500}
            height={400}
            data={chartData}
            margin={{ top: 0, left: 0, right: 0, bottom: 0 }}
            onClick={(e) => {
              const payload = e?.activePayload?.[0]?.payload as
                | ChartItemData
                | undefined;
              if (!payload) return;

              goToMove(payload.moveNb, game);
            }}
            style={{ cursor: "pointer" }}
          >
            <XAxis dataKey="moveNb" hide stroke="red" />
            <YAxis domain={[0, 20]} hide />
            <Tooltip
              content={<CustomTooltip />}
              isAnimationActive={false}
              cursor={{
                stroke: isDarkMode ? "grey" : "#FF6B35", // Orange cursor for light mode
                strokeWidth: 2,
                strokeOpacity: 0.5,
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="none"
              fill={isDarkMode ? "#ffffff" : "#FF6B35"} // Orange fill for light mode
              fillOpacity={isDarkMode ? 1 : 0.8}
              dot={renderDot}
              activeDot={<CustomDot />}
              isAnimationActive={false}
            />
            <ReferenceLine
              y={10}
              stroke={isDarkMode ? "grey" : "#FF8C42"} // Light orange reference line
              strokeWidth={2}
              strokeOpacity={0.6}
            />
            <ReferenceLine
              x={currentPosition.currentMoveIdx}
              stroke={boardMoveColor}
              strokeWidth={4}
              strokeOpacity={0.6}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
  );
}

const formatEvalToChartData = (
  position: PositionEval,
  index: number
): ChartItemData => {
  console.log(`Formatting position ${index}:`, position);
  
  if (!position.lines || position.lines.length === 0) {
    console.warn(`Position ${index} has no lines`);
    return {
      moveNb: index,
      value: 10,
      cp: undefined,
      mate: undefined,
      moveClassification: position.moveClassification,
    };
  }

  const line = position.lines[0];
  console.log(`Position ${index} first line:`, line);

  const chartItem: ChartItemData = {
    moveNb: index,
    value: 10,
    cp: line.cp,
    mate: line.mate,
    moveClassification: position.moveClassification,
  };

  if (line.mate) {
    return {
      ...chartItem,
      value: line.mate > 0 ? 20 : 0,
    };
  }

  if (line.cp) {
    return {
      ...chartItem,
      value: Math.max(Math.min(line.cp / 100, 10), -10) + 10,
    };
  }

  return chartItem;
};
