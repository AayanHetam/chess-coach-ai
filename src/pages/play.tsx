import { PageTitle } from "@/components/pageTitle";
import LichessLivePlay from "@/sections/play/lichess/LichessLivePlay";
import ChessComPlay from "@/sections/play/chesscom/ChessComPlay";
import { Box, Stack, Tab, Tabs } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import Head from "next/head";
import { Icon } from "@iconify/react";
import { useState } from "react";
import { chessMastiDarkTheme } from "@/theme/chessMasti";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";

type PlayMode = "lichess" | "chesscom";

export default function Play() {
  const [mode, setMode] = useState<PlayMode>("lichess");

  return (
    <ThemeProvider theme={chessMastiDarkTheme}>
      <PageTitle title="Chess Masti AI - Play" />
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#08090C" />
        <style>{`html,body{background-color:#08090C;color-scheme:dark;margin:0;}::-webkit-scrollbar{width:10px;height:10px;}::-webkit-scrollbar-track{background:#08090C;}::-webkit-scrollbar-thumb{background:rgba(249,115,22,0.18);border-radius:5px;}`}</style>
      </Head>

      <GradientBackdrop />

      <Box
        sx={{
          minHeight: "100vh",
          color: "rgba(255,255,255,0.94)",
          pt: 2,
          pb: 4,
          px: { xs: 2, md: 3 },
        }}
      >
        <NavPill active="play" />

        <Box sx={{ width: "100%", maxWidth: 1280, mx: "auto", mt: 2 }}>
          {/* Tab switcher — glass segmented track; ember-tinted active pill
              (orange demoted from fill to accent per the design OS). */}
          <Tabs
            value={mode}
            onChange={(_, v) => setMode(v as PlayMode)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              mb: 3,
              minHeight: 0,
              "& .MuiTabs-flexContainer": {
                gap: 0.5,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "999px",
                p: 0.5,
                width: "fit-content",
              },
              "& .MuiTab-root": {
                textTransform: "none",
                fontWeight: 700,
                fontSize: "0.92rem",
                minHeight: 0,
                py: 0.85,
                px: 2.25,
                borderRadius: "999px",
                color: "rgba(255,255,255,0.62)",
                transition: "color 180ms ease",
                zIndex: 1,
                "&:hover": { color: "rgba(255,255,255,0.92)" },
              },
              "& .Mui-selected": { color: "#FB923C !important" },
              "& .MuiTabs-indicator": {
                height: "100%",
                borderRadius: "999px",
                background: "rgba(249,115,22,0.16)",
                border: "1px solid rgba(249,115,22,0.4)",
                boxShadow: "0 0 0 1px rgba(249,115,22,0.18)",
                zIndex: 0,
              },
            }}
          >
            <Tab
              value="lichess"
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Icon icon="simple-icons:lichess" width={18} />
                  <span>Play on Lichess</span>
                </Stack>
              }
            />
            <Tab
              value="chesscom"
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Icon icon="simple-icons:chessdotcom" width={18} />
                  <span>Chess.com games</span>
                </Stack>
              }
            />
          </Tabs>

          {mode === "lichess" && (
            <Box sx={{ maxWidth: 1100, mx: "auto" }}>
              <LichessLivePlay />
            </Box>
          )}
          {mode === "chesscom" && (
            <Box sx={{ maxWidth: 1100, mx: "auto" }}>
              <ChessComPlay />
            </Box>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
