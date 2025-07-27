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
} from "@/sections/analysis/states";
import {
  Box,
  Divider,
  Grid,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import EngineSettingsButton from "@/sections/engineSettings/engineSettingsButton";

import { PageTitle } from "@/components/pageTitle";

export default function GameAnalysis() {
  const theme = useTheme();
  const [tab, setTab] = useState(0);
  const isLgOrGreater = useMediaQuery(theme.breakpoints.up("lg"));

  const { reset: resetBoard } = useChessActions(boardAtom);
  const { reset: resetGame } = useChessActions(gameAtom);
  const [gameEval, setGameEval] = useAtom(gameEvalAtom);
  const game = useAtomValue(gameAtom);
  const board = useAtomValue(boardAtom);
  const setBoardOrientation = useSetAtom(boardOrientationAtom);

  const router = useRouter();
  const { gameId } = router.query;

  useEffect(() => {
    if (!gameId) {
      resetBoard();
      setGameEval(undefined);
      setBoardOrientation(true);
      resetGame({ noHeaders: true });
    }
  }, [gameId, setGameEval, setBoardOrientation, resetBoard, resetGame]);



  return (
    <Grid container gap={1} justifyContent="flex-start" alignItems="start" direction={{ xs: "column", lg: "row" }} sx={{ width: "100%", maxWidth: "100vw" }}>
      <PageTitle title="Chess Masti AI - Game Analysis" />

      <Grid size={{ xs: 12, lg: "auto" }} sx={{ flexShrink: 0, minWidth: { lg: "400px" } }}>
        <Board />
      </Grid>

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
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
          minWidth: { lg: "420px" },
          width: "100%",
          flex: 1,
          ...(gameEval && { overflow: "visible" })
        }}
        padding={2}
        rowGap={2}
        height={{ xs: tab === 1 || tab === 2 ? "40rem" : "auto", lg: "calc(88vh - 60px)" }}
        display="flex"
        flexDirection="column"
        flexWrap="nowrap"
      >
        {isLgOrGreater ? (
          <Box width="100%">
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
          </Box>
        ) : (
          <PanelToolBar key="review-panel-toolbar" />
        )}

        {!isLgOrGreater && !gameEval && <Divider sx={{ marginX: "5%" }} />}
        {!isLgOrGreater && !gameEval && (
          <PanelHeader key="analysis-panel-header" />
        )}

        {!isLgOrGreater && (
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



        <AnalysisTab
          role="tabpanel"
          hidden={tab !== 0}
          id="tabContent0"
        />

        <MovesCoachTab
          role="tabpanel"
          hidden={tab !== 1}
          id="tabContent1"
        />

        <CoachTab
          role="tabpanel"
          hidden={tab !== 2}
          id="tabContent2"
        />

        <Box width="100%">
          <Divider sx={{ marginX: "5%", marginY: 1.5 }} />
          <PanelToolBar key="main-panel-toolbar" />
        </Box>
      </Grid>

      <EngineSettingsButton />
    </Grid>
  );
}
