import { Box, Grid, Skeleton, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import Head from "next/head";
import dynamic from "next/dynamic";
import LoadGameButton from "@/sections/loadGame/loadGameButton";
import { useGameDatabase } from "@/hooks/useGameDatabase";
import { PageTitle } from "@/components/pageTitle";
import { chessMastiDarkTheme } from "@/theme/chessMasti";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import {
  GAMES_TABLE_MAX_WIDTH,
  GAMES_TABLE_MIN_HEIGHT,
} from "@/sections/database/gamesTableLayout";

// The actual grid + perspective-selection dialog lives in its own chunk
// so /database's First Load doesn't have to ship @mui/x-data-grid (huge)
// before the page renders anything. See src/sections/database/GamesTable.tsx.
const GamesTable = dynamic(() => import("@/sections/database/GamesTable"), {
  ssr: false,
  loading: () => (
    <Skeleton
      variant="rectangular"
      height={GAMES_TABLE_MIN_HEIGHT}
      sx={{
        borderRadius: "1.5rem",
        width: "100%",
        maxWidth: GAMES_TABLE_MAX_WIDTH,
        bgcolor: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    />
  ),
});

export default function GameDatabase() {
  const { games } = useGameDatabase(true);

  return (
    <ThemeProvider theme={chessMastiDarkTheme}>
      <PageTitle title="Chess Masti AI - Game Database" />
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
        <NavPill />

        <Grid
          container
          justifyContent="center"
          alignItems="center"
          gap={4}
          marginTop={6}
        >
          <Grid container justifyContent="center" alignItems="center" size={12}>
            <LoadGameButton />
          </Grid>

          <Grid container justifyContent="center" alignItems="center" size={12}>
            <Typography
              variant="subtitle2"
              sx={{ color: "rgba(255,255,255,0.62)" }}
            >
              You have {games.length} game{games.length !== 1 && "s"} in your
              database
            </Typography>
          </Grid>

          {/* The table region has to be the same box before and after the
              @mui/x-data-grid chunk lands, in BOTH axes.

              It was neither. Vertically the 360px skeleton was replaced by a
              163px empty grid. Horizontally this cell was `minWidth="50px"`
              and shrink-to-fit, so it was 50px wide until the DataGrid's
              column widths defined it and then snapped to the full 358 —
              which is why fixing only the height made the score worse
              rather than better: a stable-height box sliding sideways has a
              bigger impact region than a short one.

              Full-width cell, both children capped at the same 1100 and
              centred, one shared height floor. Nothing left to jump. */}
          <Grid
            size={12}
            sx={{
              display: "flex",
              justifyContent: "center",
              minHeight: GAMES_TABLE_MIN_HEIGHT,
            }}
          >
            <GamesTable games={games} />
          </Grid>
        </Grid>
      </Box>
    </ThemeProvider>
  );
}
