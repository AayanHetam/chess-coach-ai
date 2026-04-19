import { useChessActions } from "@/hooks/useChessActions";
import Board from "@/sections/analysis/board";
import PanelHeader from "@/sections/analysis/panelHeader";
import PanelToolBar from "@/sections/analysis/panelToolbar";
import AnalysisTab from "@/sections/analysis/panelBody/analysisTab";
import MovesCoachTab from "@/sections/analysis/panelBody/movesCoachTab";
import CoachTab from "@/sections/analysis/panelBody/coachTab";
import {
  boardAtom,
  boardOrientationAtom,
  gameAtom,
  gameEvalAtom,
  panelExpandedAtom,
} from "@/sections/analysis/states";
import {
  Box,
  Divider,
  Grid,
  IconButton,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import EngineSettingsButton from "@/sections/engineSettings/engineSettingsButton";

import { PageTitle } from "@/components/pageTitle";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function GameAnalysis() {
  const theme = useTheme();
  const [tab, setTab] = useState(0);
  const isLgOrGreater = useMediaQuery(theme.breakpoints.up("lg"));
  const [panelExpanded, setPanelExpanded] = useAtom(panelExpandedAtom);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [boardRight, setBoardRight] = useState(0);

  // Measure the board container's right edge so the expanded panel never overlaps it
  const updateBoardRight = useCallback(() => {
    if (boardContainerRef.current) {
      const rect = boardContainerRef.current.getBoundingClientRect();
      setBoardRight(rect.right);
    }
  }, []);

  useEffect(() => {
    updateBoardRight();
    window.addEventListener("resize", updateBoardRight);
    return () => window.removeEventListener("resize", updateBoardRight);
  }, [updateBoardRight]);

  const { reset: resetBoard } = useChessActions(boardAtom);
  const { reset: resetGame } = useChessActions(gameAtom);
  const [gameEval, setGameEval] = useAtom(gameEvalAtom);
  const game = useAtomValue(gameAtom);
  const board = useAtomValue(boardAtom);
  const setBoardOrientation = useSetAtom(boardOrientationAtom);

  const router = useRouter();
  const { gameId, fen } = router.query;

  useEffect(() => {
    if (typeof fen === "string" && fen.trim()) {
      // Load a specific FEN position (e.g., from practice puzzle "Analyze Position")
      const decodedFen = decodeURIComponent(fen);
      resetBoard({ fen: decodedFen });
      resetGame({ fen: decodedFen, noHeaders: true });
      setGameEval(undefined);
      // Determine orientation from FEN (if it's black to move, orient for black)
      const isBlackToMove = decodedFen.includes(" b ");
      setBoardOrientation(!isBlackToMove);
    } else if (!gameId) {
      resetBoard();
      setGameEval(undefined);
      setBoardOrientation(true);
      resetGame({ noHeaders: true });
    }
  }, [gameId, fen, setGameEval, setBoardOrientation, resetBoard, resetGame]);

  return (
    <Grid
      container
      gap={1}
      justifyContent="flex-start"
      alignItems="start"
      direction={{ xs: "column", lg: "row" }}
      sx={{ width: "100%", maxWidth: "100vw" }}
    >
      <PageTitle title="Chess Masti AI - Game Analysis" />

      <Grid
        ref={boardContainerRef}
        size={{ xs: 12, lg: "auto" }}
        sx={{ flexShrink: 0, minWidth: { lg: "400px" } }}
      >
        <ErrorBoundary name="chessboard">
          <Board />
        </ErrorBoundary>
      </Grid>

      {/* Backdrop when panel is expanded */}
      {panelExpanded && (
        <Box
          onClick={() => setPanelExpanded(false)}
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            zIndex: 1200,
            transition: "opacity 0.3s ease",
          }}
        />
      )}

      <Grid
        size={{ xs: 12, lg: "grow" }}
        container
        justifyContent="start"
        alignItems="center"
        borderRadius={2}
        border={1}
        borderColor={"secondary.main"}
        sx={{
          backgroundColor: "secondary.main",
          borderColor: "primary.main",
          borderWidth: 2,
          boxShadow: panelExpanded
            ? "0 4px 30px rgba(0, 0, 0, 0.6)"
            : "0 2px 10px rgba(0, 0, 0, 0.5)",
          minWidth: { lg: "420px" },
          width: "100%",
          flex: 1,
          ...(gameEval && { overflow: "visible" }),
          // Expanded panel styling
          ...(panelExpanded && {
            position: "fixed",
            top: "64px",
            right: 0,
            bottom: 0,
            left: { xs: 0, lg: `${boardRight}px` },
            width: "auto",
            zIndex: 1300,
            borderRadius: { xs: 0, lg: "16px 0 0 0" },
            overflow: "auto",
          }),
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        padding={2}
        rowGap={2}
        height={{
          xs: tab === 1 || tab === 2 ? "40rem" : "auto",
          lg: panelExpanded ? "auto" : "calc(88vh - 60px)",
        }}
        display="flex"
        flexDirection="column"
        flexWrap="nowrap"
      >
        {/* Expanded mode: minimal header with just collapse button */}
        {panelExpanded && (
          <Box
            width="100%"
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              pb: 1,
              borderBottom: 1,
              borderColor: "divider",
              flexShrink: 0,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary" }}>
              {tab === 0 ? "Analysis" : tab === 1 ? "Moves" : "AI Coach"}
            </Typography>
            <Tooltip title="Collapse panel">
              <IconButton
                onClick={() => setPanelExpanded(false)}
                sx={{ color: "primary.main" }}
                size="small"
              >
                <Icon icon="mdi:fullscreen-exit" height={22} />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {/* Normal mode: full header, tabs, expand button */}
        {!panelExpanded && isLgOrGreater && (
          <Box width="100%" sx={{ position: "relative" }}>
            <PanelHeader key="analysis-panel-header" />
            <Divider sx={{ marginX: "5%", marginTop: 2.5 }} />
            <Box
              width="95%"
              sx={{
                borderBottom: 1,
                borderColor: "divider",
                marginX: "5%",
                marginTop: 2,
              }}
            >
              <Tabs
                value={tab}
                onChange={(_, newValue) => setTab(newValue)}
                aria-label="basic tabs example"
                variant="fullWidth"
                sx={{ minHeight: 0 }}
              >
                <Tab
                  label="Analysis"
                  id="tab0"
                  icon={<Icon icon="mdi:magnify" height={15} />}
                  iconPosition="start"
                  sx={{
                    textTransform: "none",
                    minHeight: 15,
                    padding: "5px 0em 12px",
                  }}
                  disableFocusRipple
                />

                <Tab
                  label="Moves"
                  id="tab1"
                  icon={<Icon icon="mdi:format-list-bulleted" height={15} />}
                  iconPosition="start"
                  sx={{
                    textTransform: "none",
                    minHeight: 15,
                    padding: "5px 0em 12px",
                  }}
                  disableFocusRipple
                />

                <Tab
                  label="Coach"
                  id="tab2"
                  icon={<Icon icon="mdi:account-tie" height={15} />}
                  iconPosition="start"
                  sx={{
                    textTransform: "none",
                    minHeight: 15,
                    padding: "5px 0em 12px",
                  }}
                  disableFocusRipple
                />
              </Tabs>
            </Box>
            {/* Expand toggle */}
            <Tooltip title="Expand panel">
              <IconButton
                onClick={() => setPanelExpanded(true)}
                sx={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  color: "primary.main",
                  zIndex: 1,
                }}
                size="small"
              >
                <Icon icon="mdi:fullscreen" height={22} />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {!panelExpanded && !isLgOrGreater && (
          <PanelToolBar key="review-panel-toolbar" />
        )}

        {!panelExpanded && !isLgOrGreater && !gameEval && <Divider sx={{ marginX: "5%" }} />}
        {!panelExpanded && !isLgOrGreater && !gameEval && (
          <PanelHeader key="analysis-panel-header" />
        )}

        {!panelExpanded && !isLgOrGreater && (
          <Box
            width="95%"
            sx={{
              borderBottom: 1,
              borderColor: "divider",
              marginX: { sm: "5%", xs: undefined },
            }}
          >
            <Tabs
              value={tab}
              onChange={(_, newValue) => setTab(newValue)}
              aria-label="basic tabs example"
              variant="fullWidth"
              sx={{ minHeight: 0 }}
            >
              <Tab
                label="Analysis"
                id="tab0"
                icon={<Icon icon="mdi:magnify" height={15} />}
                iconPosition="start"
                sx={{
                  textTransform: "none",
                  minHeight: 15,
                  padding: "5px 0em 12px",
                }}
                disableFocusRipple
              />

              <Tab
                label="Moves"
                id="tab1"
                icon={<Icon icon="mdi:format-list-bulleted" height={15} />}
                iconPosition="start"
                sx={{
                  textTransform: "none",
                  minHeight: 15,
                  padding: "5px 0em 12px",
                }}
                disableFocusRipple
              />

              <Tab
                label="Coach"
                id="tab2"
                icon={<Icon icon="mdi:account-tie" height={15} />}
                iconPosition="start"
                sx={{
                  textTransform: "none",
                  minHeight: 15,
                  padding: "5px 0em 12px",
                }}
                disableFocusRipple
              />
            </Tabs>
          </Box>
        )}

        <ErrorBoundary name="analysis-tab">
          <AnalysisTab role="tabpanel" hidden={tab !== 0} id="tabContent0" />
        </ErrorBoundary>

        <ErrorBoundary name="moves-coach-tab">
          <MovesCoachTab role="tabpanel" hidden={tab !== 1} id="tabContent1" />
        </ErrorBoundary>

        <ErrorBoundary name="ai-coach-tab">
          <CoachTab role="tabpanel" hidden={tab !== 2} id="tabContent2" />
        </ErrorBoundary>

        {/* Hide bottom toolbar in expanded mode */}
        {!panelExpanded && (
          <Box width="100%">
            <Divider sx={{ marginX: "5%", marginY: 1.5 }} />
            <PanelToolBar key="main-panel-toolbar" />
          </Box>
        )}
      </Grid>

      <EngineSettingsButton />
    </Grid>
  );
}
