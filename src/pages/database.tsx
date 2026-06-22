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

// The actual grid + perspective-selection dialog lives in its own chunk
// so /database's First Load doesn't have to ship @mui/x-data-grid (huge)
// before the page renders anything. See src/sections/database/GamesTable.tsx.
const GamesTable = dynamic(
  () => import("@/sections/database/GamesTable"),
  {
    ssr: false,
    loading: () => (
      <Skeleton
        variant="rectangular"
        height={360}
        sx={{
          borderRadius: "1.5rem",
          width: "100%",
          maxWidth: 1100,
          bgcolor: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      />
    ),
  },
);

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

          <Grid maxWidth="100%" minWidth="50px">
            <GamesTable games={games} />
          </Grid>
        </Grid>
      </Box>
    </ThemeProvider>
  );
}
