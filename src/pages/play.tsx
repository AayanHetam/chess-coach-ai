import { PageTitle } from "@/components/pageTitle";
import StockfishPlay from "@/sections/play/StockfishPlay";
import LichessLivePlay from "@/sections/play/lichess/LichessLivePlay";
import ChessComPlay from "@/sections/play/chesscom/ChessComPlay";
import { Box, Chip, Stack, Tab, Tabs } from "@mui/material";
import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";

type PlayMode = "stockfish" | "lichess" | "chesscom";

export default function Play() {
  const [mode, setMode] = useState<PlayMode>("stockfish");

  // If we came back from the Lichess OAuth callback (?lichess=connected)
  // auto-switch to the Lichess tab so the user sees their newly-connected
  // account immediately. Same treatment for the error query so they see the
  // banner without having to switch manually.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URL(window.location.href).searchParams.get("lichess");
    if (q) setMode("lichess");
  }, []);

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
          value="stockfish"
          label={
            <Stack direction="row" spacing={1} alignItems="center">
              <Icon icon="mdi:robot" width={18} />
              <span>vs Stockfish</span>
            </Stack>
          }
        />
        <Tab
          value="lichess"
          label={
            <Stack direction="row" spacing={1} alignItems="center">
              <Icon icon="simple-icons:lichess" width={18} />
              <span>Live on Lichess</span>
              <Chip
                label="NEW"
                size="small"
                sx={{
                  height: 16,
                  fontSize: "0.58rem",
                  fontWeight: 800,
                  letterSpacing: 1,
                  bgcolor: "rgba(255,107,53,0.15)",
                  color: "#FF6B35",
                }}
              />
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

      {mode === "stockfish" && <StockfishPlay />}
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
