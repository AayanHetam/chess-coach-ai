import { PageTitle } from "@/components/pageTitle";
import LichessLivePlay from "@/sections/play/lichess/LichessLivePlay";
import ChessComPlay from "@/sections/play/chesscom/ChessComPlay";
import { Box, Stack, Tab, Tabs } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import Head from "next/head";
import { Icon } from "@iconify/react";
import { useState } from "react";
import { chessMastiDarkTheme } from "@/theme/chessMasti";
import { NavPill } from "@/components/ui/NavPill";
import { MastiSays } from "@/components/masti";
import { LINE, SURFACE, TEXT } from "@/theme/tokens";

type PlayMode = "lichess" | "chesscom";

export default function Play() {
  const [mode, setMode] = useState<PlayMode>("lichess");

  return (
    <ThemeProvider theme={chessMastiDarkTheme}>
      <PageTitle title="Chess Masti AI - Play" />
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content={SURFACE.page} />
        <style>{`html,body{background-color:${SURFACE.page};color-scheme:dark;margin:0;}::-webkit-scrollbar{width:10px;height:10px;}::-webkit-scrollbar-track{background:${SURFACE.page};}::-webkit-scrollbar-thumb{background:${LINE.strong};border-radius:5px;}`}</style>
      </Head>

      <Box
        sx={{
          minHeight: "100vh",
          color: TEXT.primary,
          pt: 2,
          pb: 4,
          px: { xs: 2, md: 3 },
        }}
      >
        <NavPill active="play" />

        <Box sx={{ width: "100%", maxWidth: 1280, mx: "auto", mt: 2 }}>
          {/* Tab switcher: the theme's tabs. Masti stands at the end of the
              row from sm up; on phones every pixel under the nav belongs to
              the live board, so he sits this one out. The page never sees the
              game phase (that lives in the section's hook), so he greets
              rather than reacts to a result. */}
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              mb: 3,
            }}
          >
            <Tabs
              value={mode}
              onChange={(_, v) => setMode(v as PlayMode)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
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
            <Box sx={{ display: { xs: "none", sm: "block" } }}>
              <MastiSays
                mood="wave"
                size={72}
                side="right"
                align="center"
                maxWidth={380}
                replayKey={mode}
                priority
                data-testid="play-masti"
              >
                {mode === "lichess"
                  ? "Play your game here. When it's over, bring it to my analysis board and we'll find the turning point together."
                  : "Load your Chess.com daily games and I'll show you which ones are waiting on your move."}
              </MastiSays>
            </Box>
          </Box>

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
