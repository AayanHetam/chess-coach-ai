import { PageTitle } from "@/components/pageTitle";
import LichessLivePlay from "@/sections/play/lichess/LichessLivePlay";
import ChessComPlay from "@/sections/play/chesscom/ChessComPlay";
import { Box, Stack, Tab, Tabs } from "@mui/material";
import { Icon } from "@iconify/react";
import { useState } from "react";

type PlayMode = "lichess" | "chesscom";

export default function Play() {
  const [mode, setMode] = useState<PlayMode>("lichess");

  return (
    <Box sx={{ width: "100%", maxWidth: 1280, mx: "auto", px: { xs: 1, md: 2 } }}>
      <PageTitle title="Chess Masti AI - Play" />

      {/* Tab switcher */}
      <Tabs
        value={mode}
        onChange={(_, v) => setMode(v as PlayMode)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{
          mb: 3,
          borderBottom: 1,
          borderColor: "divider",
          "& .MuiTab-root": {
            textTransform: "none",
            fontWeight: 700,
            fontSize: "0.95rem",
            minHeight: 56,
            px: 2.5,
          },
          "& .Mui-selected": { color: "#FF6B35 !important" },
          "& .MuiTabs-indicator": {
            background: "#FF6B35",
            height: 3,
            borderRadius: 2,
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
  );
}
